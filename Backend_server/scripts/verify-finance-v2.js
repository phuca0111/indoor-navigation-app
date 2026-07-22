require('dotenv').config();
const mongoose = require('mongoose');
const { requireSafeMigrationUri } = require('./migration-safety');
const LedgerTransaction = require('../models/LedgerTransaction');
const LedgerEntry = require('../models/LedgerEntry');
const Payment = require('../models/Payment');
const ProviderTransaction = require('../models/ProviderTransaction');
const Invoice = require('../models/Invoice');

async function verify() {
  await mongoose.connect(requireSafeMigrationUri());
  const [ledger, duplicateProviderRefs, paidWithoutReceipt, paymentsWithoutProviderTx] = await Promise.all([
    LedgerEntry.aggregate([
      { $group: {
        _id: '$transaction_id',
        debit: { $sum: { $cond: [{ $eq: ['$side', 'DEBIT'] }, '$amount_minor', 0] } },
        credit: { $sum: { $cond: [{ $eq: ['$side', 'CREDIT'] }, '$amount_minor', 0] } },
        lines: { $sum: 1 }
      } },
      { $match: { $expr: { $or: [{ $ne: ['$debit', '$credit'] }, { $lt: ['$lines', 2] }] } } }
    ]),
    ProviderTransaction.aggregate([
      { $group: { _id: { provider: '$provider', ref: '$provider_ref' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]),
    Invoice.countDocuments({ status: 'PAID', captured_at: null }),
    Payment.countDocuments({ provider: { $ne: '' }, provider_ref: { $ne: '' } })
  ]);
  const transactionCount = await LedgerTransaction.countDocuments({});
  return {
    ok: ledger.length === 0 && duplicateProviderRefs.length === 0,
    transaction_count: transactionCount,
    unbalanced_transactions: ledger.length,
    duplicate_provider_refs: duplicateProviderRefs.length,
    paid_without_receipt: paidWithoutReceipt,
    provider_link_inventory: paymentsWithoutProviderTx
  };
}

if (require.main === module) {
  verify()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 2;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { verify };
