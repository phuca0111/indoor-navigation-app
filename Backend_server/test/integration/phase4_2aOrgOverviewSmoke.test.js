/**
 * Phase 4.2a — Smoke: API dữ liệu cho thẻ tổng quan tổ chức
 * Chạy: npm run test:phase4-2a
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 4.2a — Org overview data smoke', () => {
  let superToken;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(
      superUser._id,
      'SUPER_ADMIN',
      Number(superUser.session_version) || 0
    );
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-4.2a-smoke-01 GET with_counts → 200 + fields cho overview cards', async () => {
    const t0 = Date.now();
    const res = await request(app)
      .get('/api/organizations?with_counts=true')
      .set('Authorization', `Bearer ${superToken}`);
    const ms = Date.now() - t0;

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(ms).toBeLessThan(3000);

    if (res.body.length) {
      const org = res.body[0];
      expect(org).toHaveProperty('name');
      expect(org).toHaveProperty('slug');
      expect(org).toHaveProperty('building_count');
      expect(org).toHaveProperty('user_count');
      expect(org).toHaveProperty('org_admins');
      expect(Array.isArray(org.org_admins)).toBe(true);
      expect(org).toHaveProperty('building_published_count');
      expect(org).toHaveProperty('building_draft_count');
      expect(typeof org.building_count).toBe('number');
      expect(typeof org.user_count).toBe('number');
    }
  });

  test('TC-4.2a-smoke-02 ORG_ADMIN không gọi được list org', async () => {
    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    if (!orgAdmin) return;
    const token = tokenFor(
      orgAdmin._id,
      'ORG_ADMIN',
      Number(orgAdmin.session_version) || 0
    );
    const res = await request(app)
      .get('/api/organizations?with_counts=true')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
