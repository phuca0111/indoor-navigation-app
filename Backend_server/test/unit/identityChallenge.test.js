const {
  hashChallenge,
  evaluateChallenge
} = require('../../services/identityChallengeService');
const bcrypt = require('bcryptjs');
const { matchesRecoveryCode } = require('../../services/twoFactorService');

describe('OTP challenge hash, expiry và attempts', () => {
  const previous = process.env.IDENTITY_CHALLENGE_SECRET;

  beforeAll(() => {
    process.env.IDENTITY_CHALLENGE_SECRET = 'unit-test-challenge-secret';
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.IDENTITY_CHALLENGE_SECRET;
    else process.env.IDENTITY_CHALLENGE_SECRET = previous;
  });

  function challenge(overrides = {}) {
    return {
      _id: 'challenge-1',
      challenge_hash: hashChallenge('challenge-1', '123456'),
      expires_at: new Date(Date.now() + 60000),
      attempts: 0,
      max_attempts: 3,
      consumed_at: null,
      ...overrides
    };
  }

  test('không lưu/so sánh raw OTP và chấp nhận mã đúng', () => {
    const item = challenge();
    expect(item.challenge_hash).not.toContain('123456');
    expect(evaluateChallenge(item, '123456').ok).toBe(true);
    expect(evaluateChallenge(item, '654321')).toMatchObject({
      ok: false,
      code: 'CHALLENGE_MISMATCH',
      incrementAttempt: true
    });
  });

  test('từ chối challenge hết hạn, quá attempts và đã consume', () => {
    expect(evaluateChallenge(challenge({ expires_at: new Date(Date.now() - 1) }), '123456').code)
      .toBe('CHALLENGE_EXPIRED');
    expect(evaluateChallenge(challenge({ attempts: 3 }), '123456').code)
      .toBe('CHALLENGE_ATTEMPTS_EXCEEDED');
    expect(evaluateChallenge(challenge({ consumed_at: new Date() }), '123456').code)
      .toBe('CHALLENGE_INVALID');
  });

  test('recovery code chỉ khớp qua bcrypt hash', async () => {
    const hashes = [await bcrypt.hash('recovery-safe-code', 4)];
    expect(await matchesRecoveryCode('recovery-safe-code', hashes)).toBe(true);
    expect(await matchesRecoveryCode('wrong-code', hashes)).toBe(false);
  });
});
