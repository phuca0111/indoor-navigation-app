// Phase 5.7 — VNPay checkout URL + verify IPN/return
const crypto = require('crypto');
const querystring = require('querystring');

const VNPAY_VERSION = '2.1.0';
const VNPAY_COMMAND = 'pay';
const VNPAY_CURR = 'VND';
const VNPAY_LOCALE = 'vn';
const VNPAY_ORDER_TYPE = 'other';

function isVnpayConfigured() {
  return Boolean(
    process.env.VNPAY_TMN_CODE &&
    process.env.VNPAY_HASH_SECRET &&
    process.env.VNPAY_PAYMENT_URL
  );
}

function getBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
}

function sortObject(obj) {
  const sorted = {};
  Object.keys(obj).sort().forEach((k) => {
    if (obj[k] != null && obj[k] !== '') sorted[k] = obj[k];
  });
  return sorted;
}

function buildSecureHash(params, secret) {
  const signData = querystring.stringify(sortObject(params), { encode: false }).replace(/%20/g, '+');
  return crypto.createHmac('sha512', secret).update(Buffer.from(signData, 'utf-8')).digest('hex');
}

function verifyVnpayParams(params) {
  const secret = process.env.VNPAY_HASH_SECRET;
  if (!secret) return { ok: false, message: 'VNPay chưa cấu hình.' };
  const input = { ...params };
  const secureHash = input.vnp_SecureHash;
  delete input.vnp_SecureHash;
  delete input.vnp_SecureHashType;
  const expected = buildSecureHash(input, secret);
  if (expected !== secureHash) {
    return { ok: false, message: 'Chữ ký VNPay không hợp lệ.' };
  }
  return { ok: true, params: input };
}

function formatVnpayDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

/**
 * Tạo URL redirect VNPay. vnp_TxnRef = invoice idempotency / invoice_number.
 */
function createVnpayPaymentUrl({ amount, txnRef, orderInfo, ipAddr }) {
  if (!isVnpayConfigured()) {
    throw Object.assign(new Error('VNPay chưa được cấu hình (thiếu env).'), { status: 503 });
  }
  const tmnCode = process.env.VNPAY_TMN_CODE;
  const secret = process.env.VNPAY_HASH_SECRET;
  const paymentUrl = process.env.VNPAY_PAYMENT_URL;
  const returnUrl = process.env.VNPAY_RETURN_URL || `${getBaseUrl()}/api/webhooks/vnpay/return`;

  const params = {
    vnp_Version: VNPAY_VERSION,
    vnp_Command: VNPAY_COMMAND,
    vnp_TmnCode: tmnCode,
    vnp_Amount: Math.round(Number(amount) * 100),
    vnp_CurrCode: VNPAY_CURR,
    vnp_TxnRef: String(txnRef).slice(0, 100),
    vnp_OrderInfo: String(orderInfo || 'Thanh toan goi SaaS').slice(0, 255),
    vnp_OrderType: VNPAY_ORDER_TYPE,
    vnp_Locale: VNPAY_LOCALE,
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_CreateDate: formatVnpayDate()
  };

  params.vnp_SecureHash = buildSecureHash(params, secret);
  return `${paymentUrl}?${querystring.stringify(params, { encode: false })}`;
}

function parseVnpayResponseCode(code) {
  const c = String(code || '');
  return c === '00';
}

module.exports = {
  isVnpayConfigured,
  getBaseUrl,
  createVnpayPaymentUrl,
  verifyVnpayParams,
  parseVnpayResponseCode,
  buildSecureHash
};
