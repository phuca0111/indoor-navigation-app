/**
 * Phase 4.6 — GET /api/platform/stats
 * Chạy: npm run test:phase4-6
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');

function tokenFor(userId, role) {
  return jwt.sign(
    { userId: String(userId), role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 4.6 — platform stats', () => {
  let superToken;
  let orgAdminToken;
  let buildingAdminToken;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    const buildingAdmin = await User.findOne({ role: 'BUILDING_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN');
    if (orgAdmin) orgAdminToken = tokenFor(orgAdmin._id, 'ORG_ADMIN');
    if (buildingAdmin) buildingAdminToken = tokenFor(buildingAdmin._id, 'BUILDING_ADMIN');
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-4.6-01 không token → 401', async () => {
    const res = await request(app).get('/api/platform/stats');
    expect(res.status).toBe(401);
  });

  test('TC-4.6-02 SUPER_ADMIN → scope platform + counts', async () => {
    const res = await request(app)
      .get('/api/platform/stats')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('platform');
    expect(res.body.organizations).toHaveProperty('total');
    expect(res.body.buildings).toHaveProperty('published');
    expect(res.body.users).toHaveProperty('total');
    expect(res.body.registrations).toHaveProperty('pending');
  });

  test('TC-4.6-03 ORG_ADMIN → scope organization', async () => {
    if (!orgAdminToken) return;
    const res = await request(app)
      .get('/api/platform/stats')
      .set('Authorization', `Bearer ${orgAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('organization');
    expect(res.body.organization).toHaveProperty('name');
    expect(res.body.buildings).toHaveProperty('total_active');
  });

  test('TC-4.6-04 BUILDING_ADMIN → scope assigned', async () => {
    if (!buildingAdminToken) return;
    const res = await request(app)
      .get('/api/platform/stats')
      .set('Authorization', `Bearer ${buildingAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('assigned');
    expect(res.body.buildings).toHaveProperty('assigned');
  });
});
