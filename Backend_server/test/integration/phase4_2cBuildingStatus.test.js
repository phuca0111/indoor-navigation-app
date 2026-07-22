/**
 * Phase 4.2c — building_published_count / building_draft_count trong list org
 * Chạy: npm run test:phase4-2c
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Building = require('../../models/Building');
const Organization = require('../../models/Organization');

const API = '/api/organizations';

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 4.2c — building status counts in list', () => {
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

  test('TC-4.2c-01 with_counts → có building_published_count & building_draft_count', async () => {
    const res = await request(app)
      .get(`${API}?with_counts=true`)
      .set('Authorization', `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    res.body.forEach((org) => {
      expect(org).toHaveProperty('building_published_count');
      expect(org).toHaveProperty('building_draft_count');
      expect(typeof org.building_published_count).toBe('number');
      expect(typeof org.building_draft_count).toBe('number');
      expect(org.building_published_count + org.building_draft_count).toBeLessThanOrEqual(org.building_count);
    });
  });

  test('TC-4.2c-02 tổng published + draft khớp đếm trực tiếp DB (org có tòa)', async () => {
    const orgWithBuildings = await Building.aggregate([
      { $group: { _id: '$organization_id', count: { $sum: 1 } } },
      { $match: { _id: { $ne: null }, count: { $gt: 0 } } },
      { $limit: 1 }
    ]);
    if (!orgWithBuildings.length) {
      console.warn('SKIP TC-4.2c-02: không có org có tòa nhà');
      return;
    }

    const orgId = orgWithBuildings[0]._id;
    const [pub, draft, total] = await Promise.all([
      Building.countDocuments({ organization_id: orgId, status: 'PUBLISHED' }),
      Building.countDocuments({ organization_id: orgId, status: 'DRAFT' }),
      Building.countDocuments({ organization_id: orgId })
    ]);

    const res = await request(app)
      .get(`${API}?with_counts=true`)
      .set('Authorization', `Bearer ${superToken}`);

    const row = res.body.find((o) => String(o._id) === String(orgId));
    expect(row).toBeDefined();
    expect(row.building_published_count).toBe(pub);
    expect(row.building_draft_count).toBe(draft);
    expect(row.building_count).toBe(total);
  });
});
