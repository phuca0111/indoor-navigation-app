/**
 * C3 — JWT blacklist + rate-limit store smoke
 * npm run test:redis-session
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const { clearMemoryForTests, add, has } = require('../../services/tokenBlacklist');
const { HybridRateLimitStore } = require('../../services/rateLimitStore');

function tokenFor(userId, role, sv = 0, jti) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h', jwtid: jti || require('crypto').randomUUID() }
  );
}

describe('C3 — Redis session / blacklist / rate store', () => {
  let superUser;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } });
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
  });

  beforeEach(() => {
    clearMemoryForTests();
  });

  test('TC-C3-01 blacklist memory: add → has', async () => {
    const jti = 'test-jti-' + Date.now();
    await add(jti, 60);
    expect(await has(jti)).toBe(true);
    expect(await has('other-jti')).toBe(false);
  });

  test('TC-C3-02 logout → access JWT bị TOKEN_REVOKED', async () => {
    const jti = 'logout-jti-' + Date.now();
    const token = tokenFor(
      superUser._id,
      'SUPER_ADMIN',
      Number(superUser.session_version) || 0,
      jti
    );

    const me1 = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me1.status).toBe(200);

    const out = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(out.status).toBe(200);

    const me2 = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me2.status).toBe(401);
    expect(me2.body.code).toBe('TOKEN_REVOKED');
  });

  test('TC-C3-03 HybridRateLimitStore increment memory', async () => {
    const store = new HybridRateLimitStore({ prefix: 'rl:test:', windowMs: 60_000 });
    store.init({ windowMs: 60_000 });
    const a = await store.increment('ip:1');
    const b = await store.increment('ip:1');
    expect(a.totalHits).toBe(1);
    expect(b.totalHits).toBe(2);
    expect(b.resetTime).toBeInstanceOf(Date);
    await store.resetKey('ip:1');
    const c = await store.increment('ip:1');
    expect(c.totalHits).toBe(1);
  });
});
