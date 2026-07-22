const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const identity = require('../../repositories/identityRepository');
const sessions = require('../../repositories/sessionRepository');
const activities = require('../../repositories/activityLogRepository');
const outbox = require('../../repositories/outboxRepository');
const { createRefreshSession, rotateRefreshToken, hashToken } = require('../../services/refreshTokenService');
const { add: blacklistAccessToken } = require('../../services/tokenBlacklist');
const { runIdentityCommand } = require('./runIdentityCommand');
const { resolveEffectivePrincipal } = require('./principalApplicationService');

const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '7d';

function accessTokenTtlSeconds(claims) {
  if (claims?.exp) {
    return Math.max(1, Number(claims.exp) - Math.floor(Date.now() / 1000));
  }
  return 7 * 24 * 3600;
}

function accessClaims(user, familyId) {
  return {
    sub: String(user._id),
    userId: String(user._id),
    role: user.role,
    org: user.organization_id ? String(user.organization_id) : null,
    sv: Number(user.session_version) || 0,
    sid: familyId
  };
}

function signAccessToken(user, familyId) {
  return jwt.sign(accessClaims(user, familyId), process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    jwtid: crypto.randomUUID()
  });
}

async function issueAuthSession(user, context, options = {}) {
  return runIdentityCommand(async (session) => {
    const refreshSession = await createRefreshSession({
      userId: user._id,
      req: context.req,
      session
    });
    const now = new Date();
    await identity.recordLogin(user._id, now, { session });
    await activities.recordActivity({
      user_id: user._id,
      action: 'LOGIN',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      ip_address: context.ipAddress || '',
      organization_id: user.organization_id || undefined
    }, { session });
    await outbox.append({
      type: 'IdentitySessionIssued',
      event_key: `identity-session-issued:${refreshSession.familyId}`,
      aggregate_type: 'User',
      aggregate_id: user._id,
      organization_id: user.organization_id || null,
      actor_user_id: user._id,
      payload: { family_id: refreshSession.familyId }
    }, { session });
    return {
      token: signAccessToken(user, refreshSession.familyId),
      refreshToken: refreshSession.rawToken,
      user: { id: user._id, email: user.email, role: user.role }
    };
  }, options);
}

async function refreshSession(rawToken, context) {
  const rotation = await rotateRefreshToken({ rawToken, req: context.req });
  if (!rotation.ok) return rotation;
  const user = await identity.findUserById(rotation.record.user_id);
  if (!user || user.is_active === false) {
    await sessions.revokeFamily(rotation.familyId, 'SESSION_REVOKED');
    return { ok: false, code: 'SESSION_REVOKED' };
  }
  let principal;
  try {
    principal = await resolveEffectivePrincipal({
      userId: user._id,
      sid: rotation.familyId,
      sv: user.session_version
    });
  } catch (error) {
    await sessions.revokeFamily(rotation.familyId, 'SESSION_REVOKED');
    return { ok: false, code: error.code || 'SESSION_REVOKED' };
  }
  const effectiveUser = {
    ...user,
    role: principal.role,
    organization_id: principal.organizationId,
    assigned_buildings: principal.buildingIds
  };
  return {
    ok: true,
    token: signAccessToken(effectiveUser, rotation.familyId),
    refreshToken: rotation.refreshToken
  };
}

async function logout({ rawToken, userId, tokenId, accessClaims = null }, context) {
  const result = await runIdentityCommand(async (session) => {
    let resolvedUserId = userId || null;
    if (rawToken) {
      const record = await sessions.findByTokenHash(hashToken(rawToken), { session });
      if (record) {
        resolvedUserId ||= record.user_id;
        await sessions.revokeOneOwned(record._id, record.user_id, 'LOGOUT', new Date(), { session });
      }
    }
    if (resolvedUserId) {
      const user = await identity.findUserById(resolvedUserId, { session });
      await activities.recordActivity({
        user_id: resolvedUserId,
        action: 'LOGOUT',
        target_type: 'user',
        target_id: String(resolvedUserId),
        target: user?.email || '',
        ip_address: context.ipAddress || '',
        organization_id: user?.organization_id || undefined,
        details: { token_id: tokenId || null }
      }, { session });
      await outbox.append({
        type: 'IdentitySessionRevoked',
        event_key: `identity-session-revoked:${resolvedUserId}:${crypto.randomUUID()}`,
        aggregate_type: 'User',
        aggregate_id: resolvedUserId,
        organization_id: user?.organization_id || null,
        actor_user_id: resolvedUserId,
        payload: { reason: 'LOGOUT' }
      }, { session });
    }
    return { ok: true };
  });
  // Access JWT blacklist nằm ngoài Mongo UoW (Redis/memory TTL).
  if (tokenId) {
    await blacklistAccessToken(tokenId, accessTokenTtlSeconds(accessClaims));
  }
  return result;
}

async function revokeAll(userId, context, reason = 'LOGOUT_ALL', options = {}) {
  return runIdentityCommand(async (session) => {
    const revokedCount = await sessions.revokeAllForUser(userId, reason, new Date(), { session });
    const sessionVersion = await identity.incrementSessionVersion(userId, { session });
    const user = await identity.findUserById(userId, { session });
    await activities.recordActivity({
      user_id: context.actorUserId || userId,
      action: reason === 'LOGOUT_ALL' ? 'LOGOUT_ALL' : 'SESSION_REVOKED',
      target_type: 'user',
      target_id: String(userId),
      target: user?.email || '',
      details: { reason, revoked_count: revokedCount, session_version: sessionVersion },
      ip_address: context.ipAddress || '',
      organization_id: user?.organization_id || undefined
    }, { session });
    await outbox.append({
      type: 'IdentitySessionsRevoked',
      event_key: `identity-sessions-revoked:${userId}:${sessionVersion}`,
      aggregate_type: 'User',
      aggregate_id: userId,
      organization_id: user?.organization_id || null,
      actor_user_id: context.actorUserId || userId,
      payload: { reason, revoked_count: revokedCount, session_version: sessionVersion }
    }, { session });
    return { revokedCount, sessionVersion };
  }, options);
}

async function listSessions(userId, currentRawToken) {
  const currentHash = currentRawToken ? hashToken(currentRawToken) : null;
  const rows = await sessions.listActiveForUser(userId);
  return rows.map((row) => ({
    id: row._id,
    family_id: row.family_id,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    device_name: row.device_name,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    created_at: row.createdAt,
    current: Boolean(currentHash && row.token_hash === currentHash)
  }));
}

async function revokeOwnedSession(userId, sessionId, context) {
  return runIdentityCommand(async (session) => {
    const revoked = await sessions.revokeOneOwned(
      sessionId,
      userId,
      'SESSION_REVOKED',
      new Date(),
      { session }
    );
    if (!revoked) return false;
    await activities.recordActivity({
      user_id: userId,
      action: 'SESSION_REVOKED',
      target_type: 'session',
      target_id: String(sessionId),
      ip_address: context.ipAddress || ''
    }, { session });
    await outbox.append({
      type: 'IdentitySessionRevoked',
      event_key: `identity-session-revoked:${sessionId}`,
      aggregate_type: 'User',
      aggregate_id: userId,
      actor_user_id: userId,
      payload: { session_id: String(sessionId), reason: 'SESSION_REVOKED' }
    }, { session });
    return true;
  });
}

module.exports = {
  accessClaims,
  signAccessToken,
  issueAuthSession,
  refreshSession,
  logout,
  revokeAll,
  listSessions,
  revokeOwnedSession
};
