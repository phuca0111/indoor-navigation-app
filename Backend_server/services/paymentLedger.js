// Phase 9.5 — Ghi sổ Payment (idempotent)
const Payment = require('../models/Payment');

/**
 * Ghi ledger khi hóa đơn được thanh toán.
 * @param {object} opts
 */
async function recordPaymentFromInvoice(invoice, opts = {}) {
  if (!invoice) return null;
  const invoiceId = invoice._id || invoice.id;
  const idempotencyKey =
    opts.idempotency_key ||
    (invoice.invoice_number ? `inv-pay-${invoice.invoice_number}` : `inv-pay-${invoiceId}`);

  const raw = String(opts.method || opts.provider || 'MANUAL').toUpperCase();
  let method = 'OTHER';
  if (['MANUAL', 'VNPAY', 'TPTP', 'BANK', 'OTHER'].includes(raw)) method = raw;
  else if (raw.includes('VNPAY')) method = 'VNPAY';
  else if (raw.includes('TPTP')) method = 'TPTP';
  else if (raw.includes('BANK')) method = 'BANK';
  else if (raw.includes('MANUAL')) method = 'MANUAL';

  try {
    const amount =
      opts.amount !== undefined && opts.amount !== null
        ? Number(opts.amount) || 0
        : Math.max(
            0,
            (Number(invoice.amount) || 0) -
              (Number(invoice.discount_amount) || 0) +
              (Number(invoice.tax_amount) || 0)
          );

    const doc = await Payment.create({
      organization_id: invoice.organization_id,
      invoice_id: invoiceId,
      amount,
      currency: invoice.currency || 'VND',
      method,
      status: opts.status || 'SUCCESS',
      paid_at: opts.paid_at || invoice.paid_at || new Date(),
      external_ref: opts.external_ref || invoice.external_ref || '',
      note: opts.note || '',
      idempotency_key: idempotencyKey,
      metadata: {
        ...(opts.metadata || {}),
        invoice_number: invoice.invoice_number,
        plan: invoice.plan,
        raw_method: raw
      },
      created_by: opts.created_by || invoice.created_by || null
    });
    return { payment: doc, duplicated: false };
  } catch (err) {
    if (err?.code === 11000) {
      const existed = await Payment.findOne({ idempotency_key: idempotencyKey });
      return { payment: existed, duplicated: true };
    }
    throw err;
  }
}

async function listPayments(filter = {}, limit = 100) {
  const q = {};
  if (filter.organization_id) q.organization_id = filter.organization_id;
  if (filter.status) q.status = String(filter.status).toUpperCase();
  if (filter.method) q.method = String(filter.method).toUpperCase();
  if (filter.invoice_id) q.invoice_id = filter.invoice_id;

  return Payment.find(q)
    .sort({ paid_at: -1, createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .populate('organization_id', 'name slug plan')
    .populate('invoice_id', 'invoice_number status plan amount')
    .lean();
}

module.exports = {
  recordPaymentFromInvoice,
  listPayments
};
