// Phase 5.7 — Token truy cập thanh toán (signed URL, hết hạn, one-time nonce)
const crypto = require('crypto');

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 phút

function getPaymentSecret() {
  const secret = process.env.PAYMENT_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret || String(secret).length < 32) {
    throw Object.assign(
      new Error('PAYMENT_TOKEN_SECRET (hoặc JWT_SECRET) phải có ít nhất 32 ký tự.'),
      { status: 500 }
    );
  }
  return secret;
}

function generatePaymentNonce() {
  return crypto.randomBytes(24).toString('hex');
}

function signPaymentAccessToken({ invoiceId, orgId, userId, nonce, exp }) {
  const payload = {
    invoiceId: String(invoiceId),
    orgId: String(orgId),
    userId: String(userId),
    nonce: String(nonce),
    exp: Number(exp)
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getPaymentSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyPaymentAccessToken(token, { invoiceId } = {}) {
  if (!token || typeof token !== 'string') {
    return { ok: false, code: 'MISSING_TOKEN', message: 'Thiếu token thanh toán.' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { ok: false, code: 'MALFORMED', message: 'Token thanh toán không hợp lệ.' };
  }
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', getPaymentSecret()).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, code: 'BAD_SIGNATURE', message: 'Chữ ký token không hợp lệ.' };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: 'MALFORMED', message: 'Payload token không hợp lệ.' };
  }
  if (invoiceId && String(payload.invoiceId) !== String(invoiceId)) {
    return { ok: false, code: 'INVOICE_MISMATCH', message: 'Token không khớp hóa đơn.' };
  }
  if (!payload.exp || Date.now() > Number(payload.exp)) {
    return { ok: false, code: 'EXPIRED', message: 'Phiên thanh toán đã hết hạn. Vui lòng tạo lại từ dashboard.' };
  }
  if (!payload.nonce || !payload.orgId || !payload.userId) {
    return { ok: false, code: 'MALFORMED', message: 'Token thiếu thông tin bắt buộc.' };
  }
  return { ok: true, payload };
}

function createPaymentAccessToken(invoiceId, orgId, userId, nonce, ttlMs = DEFAULT_TTL_MS) {
  const exp = Date.now() + ttlMs;
  return {
    token: signPaymentAccessToken({ invoiceId, orgId, userId, nonce, exp }),
    exp,
    nonce
  };
}

function isMockPaymentAllowed() {
  return false;
}

module.exports = {
  DEFAULT_TTL_MS,
  generatePaymentNonce,
  createPaymentAccessToken,
  verifyPaymentAccessToken,
  isMockPaymentAllowed
};
