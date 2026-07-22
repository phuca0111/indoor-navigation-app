const RefreshToken = require('../models/RefreshToken');

function queryOptions(session) {
  return session ? { session } : undefined;
}

function dto(value) {
  return value && (typeof value.toObject === 'function' ? value.toObject() : value);
}

async function createSession(input, { session } = {}) {
  const [created] = await RefreshToken.create([input], queryOptions(session));
  return dto(created);
}

async function findByTokenHash(tokenHash, { session, includeRotation = false } = {}) {
  let query = RefreshToken.findOne({ token_hash: tokenHash });
  if (includeRotation) query = query.select('+parent_token_hash +replaced_by_hash');
  if (session) query = query.session(session);
  return dto(await query.lean());
}

async function hasActiveFamily(userId, familyId, now = new Date(), { session } = {}) {
  let query = RefreshToken.exists({
    user_id: userId,
    family_id: familyId,
    is_revoked: false,
    expires_at: { $gt: now }
  });
  if (session) query = query.session(session);
  return Boolean(await query);
}

async function rotateByCompareAndSet(tokenHash, replacement, now, { session } = {}) {
  const result = await RefreshToken.updateOne(
    {
      token_hash: tokenHash,
      is_revoked: false,
      expires_at: { $gt: now },
      replaced_by_hash: null
    },
    {
      $set: {
        is_revoked: true,
        revoked_at: now,
        revoked_reason: 'ROTATED',
        replaced_by_hash: replacement.token_hash,
        last_used_at: now
      }
    },
    queryOptions(session)
  );
  return Number(result.modifiedCount || 0) === 1;
}

async function revokeFamily(familyId, reason, now = new Date(), { session } = {}) {
  const result = await RefreshToken.updateMany(
    { family_id: familyId, is_revoked: false },
    { $set: { is_revoked: true, revoked_at: now, revoked_reason: reason } },
    queryOptions(session)
  );
  return Number(result.modifiedCount || 0);
}

async function revokeAllForUser(userId, reason, now = new Date(), { session } = {}) {
  const result = await RefreshToken.updateMany(
    { user_id: userId, is_revoked: false },
    { $set: { is_revoked: true, revoked_at: now, revoked_reason: reason } },
    queryOptions(session)
  );
  return Number(result.modifiedCount || 0);
}

async function revokeOneOwned(sessionId, userId, reason, now = new Date(), { session } = {}) {
  const result = await RefreshToken.updateOne(
    { _id: sessionId, user_id: userId, is_revoked: false },
    { $set: { is_revoked: true, revoked_at: now, revoked_reason: reason } },
    queryOptions(session)
  );
  return Number(result.modifiedCount || 0) === 1;
}

async function listActiveForUser(userId, now = new Date(), { session } = {}) {
  let query = RefreshToken.find({
    user_id: userId,
    expires_at: { $gt: now },
    is_revoked: false
  })
    .select('family_id ip_address user_agent device_name last_used_at expires_at createdAt token_hash')
    .sort({ last_used_at: -1 });
  if (session) query = query.session(session);
  return query.lean();
}

module.exports = {
  createSession,
  findByTokenHash,
  hasActiveFamily,
  rotateByCompareAndSet,
  revokeFamily,
  revokeAllForUser,
  revokeOneOwned,
  listActiveForUser
};
