// Phase 9.5 — Ghi sổ Payment (idempotent)
const paymentRepository = require('../repositories/paymentRepository');

function deterministicPaymentId(idempotencyKey) {
  return paymentRepository.deterministicPaymentId('payment', idempotencyKey);
}

async function postUnifiedPayment(payment, invoiceId, session = null) {
  const { postBusinessEvent } = require('./unifiedLedger');
  await postBusinessEvent('INCOME', payment, {
    source_type: 'PAYMENT',
    posting_key: `payment:${payment._id}`,
    amount: payment.amount,
    metadata: { invoice_id: String(invoiceId), provider: payment.provider },
    deps: session ? { session } : undefined
  });
}

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
    const existed = await paymentRepository.findByIdempotencyKey(
      idempotencyKey,
      { session: opts.session }
    );
    if (existed) {
      await postUnifiedPayment(existed, invoiceId, opts.session);
      return { payment: existed, duplicated: true };
    }

    const amount =
      opts.amount !== undefined && opts.amount !== null
        ? Number(opts.amount) || 0
        : Math.max(
            0,
            (Number(invoice.amount) || 0) -
              (Number(invoice.discount_amount) || 0) +
              (Number(invoice.tax_amount) || 0)
          );

    const doc = await paymentRepository.createPayment({
      // _id tất định bảo đảm chống race ngay cả khi DB cũ chưa có unique index
      // idempotency_key (MongoDB luôn unique trên _id).
      _id: deterministicPaymentId(idempotencyKey),
      organization_id: invoice.organization_id,
      invoice_id: invoiceId,
      amount,
      currency: invoice.currency || 'VND',
      method,
      status: opts.status || 'SUCCESS',
      paid_at: opts.paid_at || invoice.paid_at || new Date(),
      provider: String(opts.provider || raw || '').toUpperCase(),
      provider_ref: opts.provider_ref || opts.external_ref || invoice.external_ref || '',
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
    }, { session: opts.session });
    await postUnifiedPayment(doc, invoiceId, opts.session);
    return { payment: doc, duplicated: false };
  } catch (err) {
    if (err?.code === 11000) {
      const existed = await paymentRepository.findByIdentityOrIdempotency({
        paymentId: deterministicPaymentId(idempotencyKey),
        idempotencyKey,
        session: opts.session
      });
      if (!existed) {
        throw Object.assign(new Error('Provider reference đã được dùng cho giao dịch khác.'), {
          status: 409,
          code: 'PROVIDER_REFERENCE_CONFLICT'
        });
      }
      await postUnifiedPayment(existed, invoiceId, opts.session);
      return { payment: existed, duplicated: true };
    }
    throw err;
  }
}

async function listPayments(filter = {}, limit = 100) {
  return paymentRepository.listPayments({
    organizationId: filter.organization_id,
    status: filter.status,
    method: filter.method,
    invoiceId: filter.invoice_id,
    limit
  });
}

module.exports = {
  recordPaymentFromInvoice,
  listPayments
};
