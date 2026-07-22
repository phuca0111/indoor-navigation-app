const bcrypt = require('bcryptjs');

function allowLegacyPlaintextPassword() {
  return process.env.NODE_ENV !== 'production' &&
    String(process.env.ALLOW_LEGACY_PLAINTEXT_PASSWORD || '').toLowerCase() === 'true';
}

function looksLikeBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
}

async function verifyPasswordAndUpgrade(user, candidate) {
  if (!user || typeof candidate !== 'string' || !user.password) {
    return { ok: false, upgraded: false };
  }

  if (looksLikeBcryptHash(user.password)) {
    return { ok: await bcrypt.compare(candidate, user.password), upgraded: false };
  }

  if (!allowLegacyPlaintextPassword() || user.password !== candidate) {
    return { ok: false, upgraded: false };
  }

  user.password = await bcrypt.hash(candidate, 10);
  await user.save();
  return { ok: true, upgraded: true };
}

module.exports = {
  allowLegacyPlaintextPassword,
  looksLikeBcryptHash,
  verifyPasswordAndUpgrade
};
