/**
 * Backfill sổ thu từ hóa đơn PAID cũ (idempotent).
 * Chạy: node scripts/backfill-payment-ledger.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const { recordPaymentFromInvoice } = require('../services/paymentLedger');

function inferMethod(inv) {
  const meta = inv.metadata || {};
  const raw = String(meta.provider || meta.method || meta.payment_method || inv.external_ref || '').toUpperCase();
  if (raw.includes('VNPAY')) return 'VNPAY';
  if (raw.includes('TPTP')) return 'TPTP';
  if (raw.includes('BANK')) return 'BANK';
  if (raw.includes('MANUAL') || !raw) return 'MANUAL';
  return 'OTHER';
}

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
  await mongoose.connect(uri);
  console.log('Connected:', uri.replace(/\/\/.*@/, '//***@'));

  const paid = await Invoice.find({ status: 'PAID' }).lean();
  console.log('PAID invoices:', paid.length);

  let created = 0;
  let skipped = 0;
  let duplicated = 0;
  let errors = 0;

  for (const inv of paid) {
    const existed = await Payment.findOne({ invoice_id: inv._id }).select('_id').lean();
    if (existed) {
      skipped += 1;
      continue;
    }
    try {
      const result = await recordPaymentFromInvoice(inv, {
        method: inferMethod(inv),
        external_ref: inv.external_ref || '',
        paid_at: inv.paid_at || inv.updatedAt || inv.createdAt,
        note: 'Backfill sổ thu từ hóa đơn PAID',
        metadata: { backfilled: true, source: 'backfill-payment-ledger' }
      });
      if (result?.duplicated) duplicated += 1;
      else created += 1;
    } catch (e) {
      errors += 1;
      console.error('Fail', inv.invoice_number || inv._id, e.message);
    }
  }

  const totalPayments = await Payment.countDocuments();
  console.log(
    JSON.stringify(
      { created, skipped, duplicated, errors, totalPayments, paidInvoices: paid.length },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
