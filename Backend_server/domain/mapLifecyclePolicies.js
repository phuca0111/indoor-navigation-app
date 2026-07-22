const crypto = require('crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stable(value[key]);
    return result;
  }, {});
}

function autosaveFingerprint(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(payload)))
    .digest('hex');
}

function draftEtag(revision) {
  return `"draft-${Number(revision) || 0}"`;
}

function parseExpectedRevision(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  const match = normalized.match(/^(?:draft-)?(\d+)$/);
  return match ? Number(match[1]) : NaN;
}

function normalizeIdempotencyKey(value) {
  if (value === undefined || value === null) return null;
  const key = String(value).trim();
  return key ? key.slice(0, 200) : null;
}

function assertFence(lock, expectedFence) {
  if (!lock || Number(lock.fencing_token) !== Number(expectedFence)) {
    throw Object.assign(new Error('Khóa chỉnh sửa đã hết hạn hoặc đổi chủ.'), {
      status: 409,
      code: 'LOCK_FENCE_STALE'
    });
  }
}

module.exports = {
  autosaveFingerprint,
  draftEtag,
  parseExpectedRevision,
  normalizeIdempotencyKey,
  assertFence
};
