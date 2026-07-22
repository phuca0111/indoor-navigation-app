const bcrypt = require('bcryptjs');

async function matchesRecoveryCode(rawCode, hashes = []) {
  if (!rawCode || !Array.isArray(hashes)) return false;
  for (const hash of hashes) {
    if (await bcrypt.compare(String(rawCode), hash)) return true;
  }
  return false;
}

module.exports = { matchesRecoveryCode };
