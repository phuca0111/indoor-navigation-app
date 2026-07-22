const crypto = require('crypto');
const sessions = require('../repositories/sessionRepository');
const { runIdentityCommand } = require('../application/identity/runIdentityCommand');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
}

function newRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function sessionMetadata(req) {
  const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, 500);
  const deviceName = String(req?.body?.device_name || req?.headers?.['x-device-name'] || '').slice(0, 120);
  return {
    ip_address: String(req?.ip || '').slice(0, 64),
    user_agent: userAgent,
    device_name: deviceName
  };
}

async function createRefreshSession({
  RefreshToken,
  userId,
  req,
  familyId,
  parentHash,
  now = new Date(),
  session = null
}) {
  const rawToken = newRefreshToken();
  const tokenHash = hashToken(rawToken);
  const ttlDays = Math.max(1, Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7));
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  const family = familyId || crypto.randomUUID();
  const input = {
    user_id: userId,
    token_hash: tokenHash,
    family_id: family,
    parent_token_hash: parentHash || null,
    expires_at: expiresAt,
    last_used_at: now,
    ...sessionMetadata(req)
  };
  if (RefreshToken) await RefreshToken.create(input);
  else await sessions.createSession(input, { session });
  return { rawToken, tokenHash, familyId: family, expiresAt };
}

async function rotateRefreshToken({
  RefreshToken,
  rawToken,
  req,
  now = new Date(),
  session: callerSession = null
}) {
  const tokenHash = hashToken(rawToken);
  return runIdentityCommand(async (session) => {
  const record = RefreshToken
    ? await RefreshToken.findOne({ token_hash: tokenHash })
    : await sessions.findByTokenHash(tokenHash, { session, includeRotation: true });
  if (!record) return { ok: false, code: 'REFRESH_INVALID' };

  if (record.is_revoked) {
    if (record.replaced_by_hash || record.revoked_reason === 'ROTATED') {
      if (RefreshToken) {
        await RefreshToken.updateMany(
          { family_id: record.family_id, is_revoked: false },
          { $set: { is_revoked: true, revoked_at: now, revoked_reason: 'REUSE_DETECTED' } }
        );
      } else {
        await sessions.revokeFamily(record.family_id, 'REUSE_DETECTED', now, { session });
      }
      return { ok: false, code: 'REFRESH_REUSE_DETECTED', reuseDetected: true };
    }
    return { ok: false, code: 'REFRESH_REVOKED' };
  }

  if (new Date(record.expires_at).getTime() <= now.getTime()) {
    return { ok: false, code: 'REFRESH_EXPIRED' };
  }

  const familyId = record.family_id || `legacy-${String(record._id)}`;
  const next = await createRefreshSession({
    RefreshToken,
    userId: record.user_id,
    req,
    familyId,
    parentHash: tokenHash,
    now,
    session
  });
  const rotated = RefreshToken
    ? Number((await RefreshToken.updateOne(
      { _id: record._id, is_revoked: false },
      {
        $set: {
          is_revoked: true,
          revoked_at: now,
          revoked_reason: 'ROTATED',
          family_id: familyId,
          replaced_by_hash: next.tokenHash,
          last_used_at: now
        }
      }
    )).modifiedCount || 0) === 1
    : await sessions.rotateByCompareAndSet(
      tokenHash,
      { token_hash: next.tokenHash },
      now,
      { session }
    );
  if (!rotated) {
    if (RefreshToken) {
      await RefreshToken.updateMany(
        { family_id: familyId, is_revoked: false },
        { $set: { is_revoked: true, revoked_at: now, revoked_reason: 'REUSE_DETECTED' } }
      );
    } else {
      await sessions.revokeFamily(familyId, 'REUSE_DETECTED', now, { session });
    }
    return { ok: false, code: 'REFRESH_REUSE_DETECTED', reuseDetected: true };
  }
  return { ok: true, record, familyId, refreshToken: next.rawToken, expiresAt: next.expiresAt };
  }, { session: callerSession });
}

module.exports = {
  hashToken,
  newRefreshToken,
  sessionMetadata,
  createRefreshSession,
  rotateRefreshToken
};
