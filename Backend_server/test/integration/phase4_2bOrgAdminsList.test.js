/**
 * Phase 4.2b — GET /api/organizations?with_counts=true trả org_admins[]
 * Chạy: npm run test:phase4-2b
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

describe('Phase 4.2b — org_admins array in list', () => {
  let superToken;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser._id, 'SUPER_ADMIN');
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-4.2b-01 with_counts → org_admins là mảng', async () => {
    const res = await request(app)
      .get(`${API}?with_counts=true`)
      .set('Authorization', `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    res.body.forEach((org) => {
      expect(org).toHaveProperty('org_admins');
      expect(Array.isArray(org.org_admins)).toBe(true);
      if (org.org_admins.length) {
        const a = org.org_admins[0];
        expect(a).toHaveProperty('email');
        expect(a).toHaveProperty('_id');
      }
      if (org.org_admin) {
        expect(org.org_admins[0].email).toBe(org.org_admin.email);
      }
    });
  });

  test('TC-4.2b-02 org thailan có ≥1 ORG_ADMIN trong org_admins', async () => {
    const org = await Organization.findOne({ slug: 'thailan' }).lean();
    if (!org) {
      console.warn('SKIP TC-4.2b-02: không có org thailan');
      return;
    }

    const adminCount = await User.countDocuments({
      organization_id: org._id,
      role: 'ORG_ADMIN'
    });
    if (adminCount < 1) {
      console.warn('SKIP TC-4.2b-02: thailan không có ORG_ADMIN');
      return;
    }

    const res = await request(app)
      .get(`${API}?with_counts=true`)
      .set('Authorization', `Bearer ${superToken}`);

    const row = res.body.find((o) => String(o._id) === String(org._id));
    expect(row).toBeDefined();
    expect(row.org_admins.length).toBeGreaterThanOrEqual(1);
    expect(row.org_admins.length).toBe(adminCount);
  });
});
