// Phase 5.8 — Cổng thanh toán ảo TPTPpay
const { isVnpayConfigured, getBaseUrl } = require('./vnpayService');

function isTptpSandboxEnabled() {
  if (isVnpayConfigured()) return false;
  const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'production') {
    return process.env.TPTP_SANDBOX_ENABLED === 'true';
  }
  return process.env.TPTP_SANDBOX_ENABLED !== 'false';
}

function getCheckoutProvider() {
  if (isVnpayConfigured()) return 'VNPAY';
  if (isTptpSandboxEnabled()) return 'TPTPPAY';
  return null;
}

function buildTptpPayUrl(invoiceId, token) {
  const base = getBaseUrl();
  return `${base}/tptp-pay/pay/${invoiceId}?token=${encodeURIComponent(token)}`;
}

function buildTptpBankQrPayload(invoiceId, token) {
  // Deep link — điện thoại quét QR không cần biết IP laptop
  return `tptpbank://pay?invoiceId=${encodeURIComponent(invoiceId)}&token=${encodeURIComponent(token)}`;
}

function buildTptpBankLinkUrl(invoiceId, token) {
  const base = getBaseUrl();
  return `${base}/tptp-pay/bank-link?invoiceId=${encodeURIComponent(invoiceId)}&token=${encodeURIComponent(token)}`;
}

function getTptpWebhookSecret() {
  return process.env.TPTP_WEBHOOK_SECRET || process.env.PAYMENT_TOKEN_SECRET || process.env.JWT_SECRET;
}

module.exports = {
  isTptpSandboxEnabled,
  getCheckoutProvider,
  buildTptpPayUrl,
  buildTptpBankQrPayload,
  buildTptpBankLinkUrl,
  getTptpWebhookSecret,
  getBaseUrl
};
