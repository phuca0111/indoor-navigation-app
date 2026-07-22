const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = 10 * 60;

function stateSecret() {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Thiếu OAUTH_STATE_SECRET hoặc JWT_SECRET.');
  return secret;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', stateSecret()).update(value).digest('base64url');
}

function createOAuthState(options = {}) {
  const now = Number(options.now || Date.now());
  const ttlSeconds = Number(options.ttlSeconds || process.env.OAUTH_STATE_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  const payload = {
    v: 1,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttlSeconds,
    nonce: crypto.randomBytes(18).toString('base64url')
  };
  const encoded = encode(payload);
  return `${encoded}.${sign(encoded)}`;
}

function verifyOAuthState(state, options = {}) {
  const parts = String(state || '').split('.');
  if (parts.length !== 2) return { ok: false, code: 'OAUTH_STATE_INVALID' };
  const [encoded, signature] = parts;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, code: 'OAUTH_STATE_INVALID' };
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const nowSeconds = Math.floor(Number(options.now || Date.now()) / 1000);
    if (payload.v !== 1 || !payload.nonce || !payload.exp || payload.exp < nowSeconds) {
      return { ok: false, code: 'OAUTH_STATE_EXPIRED' };
    }
    return { ok: true, payload };
  } catch (_) {
    return { ok: false, code: 'OAUTH_STATE_INVALID' };
  }
}

module.exports = { createOAuthState, verifyOAuthState, DEFAULT_TTL_SECONDS };
