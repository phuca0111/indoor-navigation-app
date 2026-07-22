/**
 * Phase 4.1d — Chặn ORG_ADMIN / BUILDING_ADMIN khi org inactive
 * Chạy: npm run test:phase4-1d
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');

const API_ORG = '/api/organizations';

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 4.1d — Org inactive blocks tenant users', () => {
  let superToken;
  let orgAdmin;
  let orgId;
  let wasOrgActive;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false }, organization_id: { $ne: null } }).lean();
    if (!superUser || !orgAdmin) throw new Error('Thiếu SUPER_ADMIN hoặc ORG_ADMIN');

    superToken = tokenFor(
      superUser._id,
      'SUPER_ADMIN',
      Number(superUser.session_version) || 0
    );
    orgId = String(orgAdmin.organization_id);

    const org = await Organization.findById(orgId).lean();
    wasOrgActive = org.is_active !== false;
  });

  afterAll(async () => {
    if (orgId && wasOrgActive) {
      await Organization.findByIdAndUpdate(orgId, { is_active: true });
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-4.1d-01 ORG inactive → ORG_ADMIN API bị 403', async () => {
    const org = await Organization.findOne({ slug: 'thailan' }).lean()
      || await Organization.findOne({ slug: { $ne: 'legacy' } }).lean();
    if (!org) throw new Error('Thiếu org test');
    const admin = await User.findOne({ organization_id: org._id, role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    if (!admin) {
      console.warn('SKIP TC-4.1d-01: org không có ORG_ADMIN');
      return;
    }

    await request(app)
      .patch(`${API_ORG}/${org._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ is_active: false });

    const token = tokenFor(admin._id, 'ORG_ADMIN', Number(admin.session_version) || 0);
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORG_INACTIVE');

    await request(app)
      .patch(`${API_ORG}/${org._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ is_active: true });
  });

  test('TC-4.1d-02 ORG inactive → login ORG_ADMIN bị 403', async () => {
    const org = await Organization.findOne({ slug: 'thailan' }).lean();
    if (!org) {
      console.warn('SKIP TC-4.1d-02: không có org thailan');
      return;
    }
    const admin = await User.findOne({ email: 'test8@gmail.com', role: 'ORG_ADMIN' }).lean();
    if (!admin) {
      console.warn('SKIP TC-4.1d-02: không có test8@gmail.com');
      return;
    }

    await request(app)
      .patch(`${API_ORG}/${org._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ is_active: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: admin.email, password: 'wrong-or-any' });

    // Nếu password đúng sẽ 403 org; nếu sai vẫn 400 — test với token path thay thế
    if (res.status === 400) {
      const token = tokenFor(admin._id, 'ORG_ADMIN', Number(admin.session_version) || 0);
      const apiRes = await request(app)
        .get('/api/buildings')
        .set('Authorization', `Bearer ${token}`);
      expect(apiRes.status).toBe(403);
      expect(apiRes.body.code).toBe('ORG_INACTIVE');
    } else {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORG_INACTIVE');
    }

    await request(app)
      .patch(`${API_ORG}/${org._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ is_active: true });
  });

  test('TC-4.1d-03 SUPER_ADMIN vẫn truy cập khi org inactive', async () => {
    const org = await Organization.findOne({ slug: { $nin: ['legacy', 'thailan'] } }).lean()
      || await Organization.findOne({ slug: { $ne: 'legacy' } }).lean();
    if (!org) return;

    await request(app)
      .patch(`${API_ORG}/${org._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ is_active: false });

    const res = await request(app)
      .get('/api/organizations?with_counts=true')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);

    await request(app)
      .patch(`${API_ORG}/${org._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ is_active: true });
  });
});
