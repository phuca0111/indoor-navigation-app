// Phase 5.8 — Xác minh token + invoice (TPTPpay / legacy mock guard)
const invoiceRepository = require('../repositories/invoiceRepository');
const { getPlanPrice } = require('../config/planPricing');
const { verifyPaymentAccessToken } = require('./paymentAccessToken');

async function assertPaymentAccess(invoiceId, token) {
  const verified = verifyPaymentAccessToken(token, { invoiceId });
  if (!verified.ok) {
    throw Object.assign(new Error(verified.message), { status: 403, code: verified.code });
  }

  const invoice = await invoiceRepository.findById(invoiceId);
  if (!invoice) {
    throw Object.assign(new Error('Không tìm thấy hóa đơn.'), { status: 404 });
  }
  if (invoice.status === 'PAID') {
    throw Object.assign(
      new Error('Hóa đơn đã thanh toán.'),
      { status: 403, code: 'ALREADY_PAID' }
    );
  }
  if (invoice.status !== 'OPEN') {
    throw Object.assign(
      new Error(`Hóa đơn ở trạng thái ${invoice.status}, không thể thanh toán.`),
      { status: 400 }
    );
  }

  const meta = invoice.metadata || {};
  if (!meta.payment_nonce || meta.payment_nonce !== verified.payload.nonce) {
    throw Object.assign(
      new Error('Phiên thanh toán không hợp lệ hoặc đã được sử dụng.'),
      { status: 403, code: 'NONCE_MISMATCH' }
    );
  }
  if (String(invoice.organization_id) !== String(verified.payload.orgId)) {
    throw Object.assign(new Error('Token không khớp tổ chức.'), { status: 403 });
  }

  const expectedAmount = getPlanPrice(invoice.plan);
  if (expectedAmount && Number(invoice.amount) !== Number(expectedAmount)) {
    throw Object.assign(new Error('Số tiền hóa đơn không hợp lệ.'), { status: 400 });
  }

  return { invoice, payload: verified.payload };
}

async function consumePaymentNonce(invoice) {
  if (!invoice) return;
  const meta = { ...(invoice.metadata || {}) };
  delete meta.payment_nonce;
  meta.payment_completed_at = new Date().toISOString();
  return invoiceRepository.updateInvoice(invoice._id, { metadata: meta });
}

module.exports = {
  assertPaymentAccess,
  consumePaymentNonce
};
