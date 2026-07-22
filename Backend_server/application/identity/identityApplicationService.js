const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const identity = require('../../repositories/identityRepository');
const challenges = require('../../repositories/identityChallengeRepository');
const activities = require('../../repositories/activityLogRepository');
const outbox = require('../../repositories/outboxRepository');
const { createChallenge, consumeChallenge } = require('../../services/identityChallengeService');
const { getOtpProvider } = require('../../services/otpProvider');
const { matchesRecoveryCode } = require('../../services/twoFactorService');
const { verifyPassword } = require('./authApplicationService');
const { looksLikeBcryptHash } = require('../../services/passwordAuth');
const {
  revokeAll,
  listSessions,
  revokeOwnedSession
} = require('./sessionApplicationService');
const { runIdentityCommand } = require('./runIdentityCommand');

async function requestChallenge(userId, purpose, context) {
  const user = await identity.findUserById(userId);
  if (!user) throw Object.assign(new Error('Không tìm thấy người dùng.'), { status: 404 });
  if (purpose === 'EMAIL_VERIFY' && user.email_verified_at) return { alreadyDone: true };
  return createChallenge({
    userId,
    purpose,
    provider: getOtpProvider(),
    to: user.email,
    ip: context.ipAddress
  });
}

async function confirmEmail({ challengeId, code, userId = null }, context) {
  const owner = userId
    ? { user_id: userId }
    : await challenges.findOwner(challengeId, 'EMAIL_VERIFY');
  if (!owner) return { ok: false, code: 'CHALLENGE_INVALID' };
  return runIdentityCommand(async (session) => {
    const consumed = await consumeChallenge({
      challengeId,
      userId: owner.user_id,
      purpose: 'EMAIL_VERIFY',
      code,
      session
    });
    if (!consumed.ok) return consumed;
    const user = await identity.updateUserById(owner.user_id, {
      $set: { email_verified_at: new Date() }
    }, { session });
    await activities.recordActivity({
      user_id: owner.user_id,
      action: 'EMAIL_VERIFIED',
      target_type: 'user',
      target_id: String(owner.user_id),
      target: user.email,
      ip_address: context.ipAddress,
      organization_id: user.organization_id || undefined
    }, { session });
    await outbox.append({
      type: 'IdentityEmailVerified',
      event_key: `identity-email-verified:${owner.user_id}`,
      aggregate_type: 'User',
      aggregate_id: owner.user_id,
      organization_id: user.organization_id || null,
      actor_user_id: owner.user_id,
      payload: {}
    }, { session });
    return { ok: true };
  });
}

async function enableTwoFactor({ userId, challengeId, code }, context) {
  const recoveryCodes = Array.from(
    { length: 8 },
    () => crypto.randomBytes(6).toString('base64url')
  );
  const recoveryHashes = await Promise.all(recoveryCodes.map((value) => bcrypt.hash(value, 10)));
  return runIdentityCommand(async (session) => {
    const consumed = await consumeChallenge({
      challengeId,
      userId,
      purpose: 'TWO_FACTOR_LOGIN',
      code,
      session
    });
    if (!consumed.ok) return consumed;
    const user = await identity.updateUserById(userId, {
      $set: {
        'two_factor.enabled': true,
        'two_factor.provider': 'email',
        'two_factor.enabled_at': new Date(),
        'two_factor.recovery_code_hashes': recoveryHashes
      }
    }, { session });
    const revoked = await revokeAll(userId, {
      actorUserId: userId,
      ipAddress: context.ipAddress
    }, 'SESSION_REVOKED', { session });
    await activities.recordActivity({
      user_id: userId,
      action: 'TWO_FACTOR_ENABLED',
      target_type: 'user',
      target_id: String(userId),
      target: user.email,
      details: { session_version: revoked.sessionVersion },
      ip_address: context.ipAddress,
      organization_id: user.organization_id || undefined
    }, { session });
    return { ok: true, recoveryCodes };
  });
}

async function disableTwoFactor({ userId, password, recoveryCode }, context) {
  const user = await identity.findUserById(userId, { includeSecrets: true });
  if (!user) throw Object.assign(new Error('Không tìm thấy người dùng.'), { status: 404 });
  const passwordOk = await verifyPassword(user, String(password || ''));
  const recoveryOk = !passwordOk && await matchesRecoveryCode(
    recoveryCode,
    user.two_factor?.recovery_code_hashes || []
  );
  if (!passwordOk && !recoveryOk) return false;
  await runIdentityCommand(async (session) => {
    const securityUpdate = {
        'two_factor.enabled': false,
        'two_factor.enabled_at': null,
        'two_factor.recovery_code_hashes': []
    };
    if (passwordOk && !looksLikeBcryptHash(user.password)) {
      securityUpdate.password = await bcrypt.hash(String(password), 10);
    }
    const updated = await identity.updateUserById(userId, {
      $set: securityUpdate
    }, { session });
    await revokeAll(userId, {
      actorUserId: userId,
      ipAddress: context.ipAddress
    }, 'SESSION_REVOKED', { session });
    await activities.recordActivity({
      user_id: userId,
      action: 'TWO_FACTOR_DISABLED',
      target_type: 'user',
      target_id: String(userId),
      target: updated.email,
      ip_address: context.ipAddress,
      organization_id: updated.organization_id || undefined
    }, { session });
  });
  return true;
}

module.exports = {
  requestChallenge,
  confirmEmail,
  enableTwoFactor,
  disableTwoFactor,
  listSessions,
  revokeOwnedSession
};
