// Phase 8 — Google OAuth2 (Admin web) via google-auth-library
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');

function isGoogleEnabled() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getCallbackUrl() {
  return (
    process.env.GOOGLE_CALLBACK_URL ||
    'http://localhost:5000/api/auth/google/callback'
  );
}

function getOAuthClient() {
  if (!isGoogleEnabled()) return null;
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getCallbackUrl()
  );
}

/**
 * @param {string} [state]
 * @returns {string}
 */
function getAuthUrl(state) {
  const client = getOAuthClient();
  if (!client) {
    const err = new Error('Google OAuth chưa được cấu hình.');
    err.status = 503;
    err.code = 'GOOGLE_OAUTH_DISABLED';
    throw err;
  }

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account',
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    state: state || crypto.randomBytes(16).toString('hex')
  });
}

/**
 * @param {string} code
 * @returns {Promise<{ email: string, googleId: string, name: string }>}
 */
async function exchangeCode(code) {
  const client = getOAuthClient();
  if (!client) {
    const err = new Error('Google OAuth chưa được cấu hình.');
    err.status = 503;
    err.code = 'GOOGLE_OAUTH_DISABLED';
    throw err;
  }
  if (!code) {
    const err = new Error('Thiếu authorization code.');
    err.status = 400;
    throw err;
  }

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload() || {};
    const email = String(payload.email || '').toLowerCase().trim();
    const googleId = String(payload.sub || '');
    if (!email || !googleId) {
      const err = new Error('Không lấy được email/Google ID từ token.');
      err.status = 400;
      throw err;
    }
    return {
      email,
      googleId,
      name: String(payload.name || payload.given_name || email.split('@')[0] || '')
    };
  }

  // Fallback: userinfo endpoint
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  if (!res.ok) {
    const err = new Error('Không lấy được thông tin Google user.');
    err.status = 400;
    throw err;
  }
  const data = await res.json();
  const email = String(data.email || '').toLowerCase().trim();
  const googleId = String(data.id || '');
  if (!email || !googleId) {
    const err = new Error('Không lấy được email/Google ID.');
    err.status = 400;
    throw err;
  }
  return {
    email,
    googleId,
    name: String(data.name || data.given_name || email.split('@')[0] || '')
  };
}

module.exports = {
  isGoogleEnabled,
  getCallbackUrl,
  getAuthUrl,
  exchangeCode
};
