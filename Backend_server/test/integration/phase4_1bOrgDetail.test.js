/**
 * Phase 4.1b — GET /api/organizations/:id (chi tiết tổ chức)
 * Chạy: npm run test:phase4-1b
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');

const API = '/api/organizations';

function tokenFor(userId, role) {
  return jwt.sign(
    { userId: String(userId), role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 4.1b — GET organization detail', () => {
  let superToken;
  let orgAdminToken;
  let testOrgId;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN trong DB');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN');
    if (orgAdmin) orgAdminToken = tokenFor(orgAdmin._id, 'ORG_ADMIN');

    const org = await Organization.findOne({ slug: { $ne: 'legacy' } }).lean();
    if (!org) throw new Error('Thiếu org test');
    testOrgId = String(org._id);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-4.1b-01 ORG_ADMIN GET detail → 403', async () => {
    if (!orgAdminToken) return;
    const res = await request(app)
      .get(`${API}/${testOrgId}`)
      .set('Authorization', `Bearer ${orgAdminToken}`);
    expect(res.status).toBe(403);
  });

  test('TC-4.1b-02 SUPER_ADMIN GET detail → 200 + cấu trúc', async () => {
    const res = await request(app)
      .get(`${API}/${testOrgId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.organization).toBeDefined();
    expect(res.body.organization._id).toBe(testOrgId);
    expect(typeof res.body.building_count).toBe('number');
    expect(typeof res.body.user_count).toBe('number');
    expect(Array.isArray(res.body.org_admins)).toBe(true);
    expect(Array.isArray(res.body.recent_buildings)).toBe(true);
    expect(Array.isArray(res.body.recent_users)).toBe(true);
    expect(Array.isArray(res.body.recent_logs)).toBe(true);
    expect(res.body.role_counts).toBeDefined();
    expect(res.body.building_status_counts).toBeDefined();
  });

  test('TC-4.1b-03 GET org không tồn tại → 404', async () => {
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await request(app)
      .get(`${API}/${fakeId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(404);
  });
});
