const { createOAuthState, verifyOAuthState } = require('../../services/oauthState');

describe('signed OAuth state', () => {
  const previous = process.env.OAUTH_STATE_SECRET;

  beforeAll(() => {
    process.env.OAUTH_STATE_SECRET = 'unit-test-state-secret-with-enough-entropy';
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.OAUTH_STATE_SECRET;
    else process.env.OAUTH_STATE_SECRET = previous;
  });

  test('xác minh state hợp lệ trong TTL', () => {
    const now = Date.now();
    const state = createOAuthState({ now, ttlSeconds: 60 });
    expect(verifyOAuthState(state, { now: now + 30000 }).ok).toBe(true);
  });

  test('từ chối state bị sửa và hết hạn', () => {
    const now = Date.now();
    const state = createOAuthState({ now, ttlSeconds: 60 });
    expect(verifyOAuthState(`${state}x`, { now }).ok).toBe(false);
    expect(verifyOAuthState(state, { now: now + 61000 })).toMatchObject({
      ok: false,
      code: 'OAUTH_STATE_EXPIRED'
    });
  });
});
