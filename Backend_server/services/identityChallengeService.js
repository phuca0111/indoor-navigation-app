const crypto = require('crypto');
const challenges = require('../repositories/identityChallengeRepository');

function challengeSecret() {
  const secret = process.env.IDENTITY_CHALLENGE_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('Thiếu IDENTITY_CHALLENGE_SECRET hoặc JWT_SECRET.');
  return secret;
}

function hashChallenge(challengeId, code) {
  return crypto.createHmac('sha256', challengeSecret())
    .update(`${challengeId}:${String(code || '')}`)
    .digest('hex');
}

function safeEqualHex(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function evaluateChallenge(challenge, code, now = new Date()) {
  if (!challenge || challenge.consumed_at) return { ok: false, code: 'CHALLENGE_INVALID' };
  if (new Date(challenge.expires_at).getTime() <= now.getTime()) {
    return { ok: false, code: 'CHALLENGE_EXPIRED' };
  }
  if (Number(challenge.attempts || 0) >= Number(challenge.max_attempts || 5)) {
    return { ok: false, code: 'CHALLENGE_ATTEMPTS_EXCEEDED' };
  }
  const expected = hashChallenge(challenge._id, code);
  if (!safeEqualHex(challenge.challenge_hash, expected)) {
    return { ok: false, code: 'CHALLENGE_MISMATCH', incrementAttempt: true };
  }
  return { ok: true };
}

async function createChallenge({ userId, purpose, provider, to, ip = '', now = new Date(), session = null }) {
  const recentSince = new Date(now.getTime() - 60 * 1000);
  const recentCount = await challenges.countRecent(userId, purpose, recentSince, { session });
  if (recentCount >= Number(process.env.IDENTITY_CHALLENGE_RATE_PER_MINUTE || 3)) {
    const error = new Error('Vui lòng chờ trước khi yêu cầu mã mới.');
    error.status = 429;
    error.code = 'CHALLENGE_RATE_LIMITED';
    throw error;
  }

  const code = generateOtp();
  const ttlSeconds = Math.max(60, Number(process.env.IDENTITY_CHALLENGE_TTL_SECONDS || 600));
  const challengeId = crypto.randomBytes(12).toString('hex');
  const challenge = await challenges.create({
    _id: challengeId,
    user_id: userId,
    purpose,
    challenge_hash: hashChallenge(challengeId, code),
    expires_at: new Date(now.getTime() + ttlSeconds * 1000),
    max_attempts: Math.max(1, Number(process.env.IDENTITY_CHALLENGE_MAX_ATTEMPTS || 5)),
    requested_ip_hash: ip
      ? crypto.createHmac('sha256', challengeSecret()).update(ip).digest('hex')
      : '',
    delivery_provider: provider.name || 'pending'
  }, { session });
  const delivery = await provider.send({ to, code, purpose, expiresAt: challenge.expires_at });
  return { challenge, delivery };
}

async function consumeChallenge({ challengeId, userId, purpose, code, now = new Date(), session = null }) {
  const challenge = await challenges.findForConsume(
    challengeId,
    userId,
    purpose,
    { session }
  );
  const result = evaluateChallenge(challenge, code, now);
  if (!result.ok) {
    if (challenge && result.incrementAttempt) {
      await challenges.incrementAttemptByCompareAndSet(challenge, { session });
    }
    return result;
  }
  const consumed = await challenges.consumeByCompareAndSet(challenge, now, { session });
  if (!consumed) return { ok: false, code: 'CHALLENGE_ALREADY_CONSUMED' };
  return { ok: true, challenge: { ...challenge, consumed_at: now } };
}

module.exports = {
  hashChallenge,
  generateOtp,
  evaluateChallenge,
  createChallenge,
  consumeChallenge
};
