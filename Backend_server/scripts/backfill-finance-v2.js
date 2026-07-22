require('dotenv').config();
const mongoose = require('mongoose');
const { requireSafeMigrationUri } = require('./migration-safety');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const ExpenseLedger = require('../models/ExpenseLedger');
const MigrationCheckpoint = require('../models/MigrationCheckpoint');
const LedgerTransaction = require('../models/LedgerTransaction');
const Receipt = require('../models/Receipt');
const ProviderTransaction = require('../models/ProviderTransaction');
const { postBusinessEvent } = require('../services/unifiedLedger');
const { captureReceipt } = require('../services/receiptService');
const { recordProviderTransaction } = require('../services/webhookInboxService');

const execute = process.argv.includes('--execute');
const verifyOnly = process.argv.includes('--verify');
const batchSize = Math.min(Number(process.env.MIGRATION_BATCH_SIZE) || 200, 1000);

async function processCollection({ key, Model, filter, handler }) {
  const checkpoint = await MigrationCheckpoint.findOne({ migration_key: key }).lean();
  const query = { ...filter };
  if (checkpoint?.last_id && mongoose.Types.ObjectId.isValid(checkpoint.last_id)) {
    query._id = { $gt: new mongoose.Types.ObjectId(checkpoint.last_id) };
  }
  const rows = await Model.find(query).sort({ _id: 1 }).limit(batchSize);
  let changed = 0;
  for (const row of rows) {
    const changedThis = await handler(row, execute);
    if (changedThis) changed += 1;
    if (execute) {
      await MigrationCheckpoint.findOneAndUpdate(
        { migration_key: key },
        {
          $set: { last_id: String(row._id), completed: false },
          $inc: { processed: 1, changed: changedThis ? 1 : 0 }
        },
        { upsert: true }
      );
    }
  }
  if (execute && rows.length < batchSize) {
    await MigrationCheckpoint.updateOne({ migration_key: key }, { $set: { completed: true } });
  }
  return { scanned: rows.length, would_change: changed, completed_batch: rows.length < batchSize };
}

async function run() {
  const uri = requireSafeMigrationUri();
  await mongoose.connect(uri);
  const inventory = {
    payments: await Payment.countDocuments({ status: { $in: ['SUCCESS', 'REFUNDED'] } }),
    paid_invoices_without_receipt: await Invoice.countDocuments({ status: 'PAID', captured_at: null }),
    expense_entries: await ExpenseLedger.countDocuments({})
  };
  if (verifyOnly) return { mode: 'VERIFY', inventory };

  const ledgerPayments = await processCollection({
    key: 'finance-v2-payment-ledger',
    Model: Payment,
    filter: { status: { $in: ['SUCCESS', 'REFUNDED'] } },
    handler: async (payment, write) => {
      if (!write) return !(await LedgerTransaction.exists({ posting_key: `payment:${payment._id}` }));
      await postBusinessEvent(payment.amount < 0 ? 'REFUND' : 'INCOME', payment, {
        force: true,
        source_type: 'PAYMENT',
        posting_key: `payment:${payment._id}`,
        amount: Math.abs(payment.amount)
      });
      return true;
    }
  });
  const receipts = await processCollection({
    key: 'finance-v2-receipts',
    Model: Invoice,
    filter: { status: 'PAID', captured_at: null },
    handler: async (invoice, write) => {
      if (!write) return !(await Receipt.exists({ invoice_id: invoice._id }));
      if (write) await captureReceipt(invoice, { provider: invoice.metadata?.provider, externalRef: invoice.external_ref });
      return true;
    }
  });
  const providerTransactions = await processCollection({
    key: 'finance-v2-provider-transactions',
    Model: Payment,
    filter: { provider: { $ne: '' }, provider_ref: { $ne: '' } },
    handler: async (payment, write) => {
      if (!write) {
        return !(await ProviderTransaction.exists({
          provider: payment.provider,
          provider_ref: payment.provider_ref
        }));
      }
      if (write) {
        await recordProviderTransaction({
          provider: payment.provider,
          provider_ref: payment.provider_ref,
          merchant_ref: payment.metadata?.invoice_number || String(payment.invoice_id || payment._id),
          status: payment.status,
          amount_minor: Math.abs(Math.round(Number(payment.amount))),
          currency: payment.currency || 'VND',
          occurred_at: payment.paid_at || payment.createdAt,
          invoice_id: payment.invoice_id,
          payment_id: payment._id,
          provider_payload: { source: 'BACKFILL' }
        });
      }
      return true;
    }
  });
  return {
    mode: execute ? 'EXECUTE' : 'DRY_RUN',
    inventory,
    ledgerPayments,
    providerTransactions,
    receipts
  };
}

if (require.main === module) {
  run()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { processCollection, run };
