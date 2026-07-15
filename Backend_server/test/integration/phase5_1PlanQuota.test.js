/**
 * Phase 5.1 — enforce quota khi tạo tòa / user
 * Chạy: npm run test:phase5-1
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const Building = require('../../models/Building');
const { PLAN_LIMITS } = require('../../utils/planQuota');

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 5.1 — planQuota enforce', () => {
  let superToken;
  let quotaOrgId;
  const slug = 'phase51-quota-test';
  const createdBuildingIds = [];
  const createdUserIds = [];

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN trong DB');
    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', Number(superUser.session_version) || 0);

    let org = await Organization.findOne({ slug }).lean();
    if (!org) {
      org = await Organization.create({
        name: 'Phase 5.1 Quota Test Org',
        slug,
        plan: 'FREE',
        is_active: true
      });
    } else {
      await Organization.findByIdAndUpdate(org._id, { plan: 'FREE', is_active: true });
    }
    quotaOrgId = org._id;

    // Xóa tòa/user test cũ của org này (chỉ bản __phase51__)
    await Building.deleteMany({ organization_id: quotaOrgId, name: /^__phase51__/ });
    await User.deleteMany({ organization_id: quotaOrgId, email: /^phase51_/ });
  });

  afterAll(async () => {
    if (createdBuildingIds.length) {
      await Building.deleteMany({ _id: { $in: createdBuildingIds } });
    }
    if (createdUserIds.length) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    await Building.deleteMany({ organization_id: quotaOrgId, name: /^__phase51__/ });
    await User.deleteMany({ organization_id: quotaOrgId, email: /^phase51_/ });
    if (quotaOrgId) {
      await Organization.findByIdAndUpdate(quotaOrgId, { plan: 'FREE' });
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-5.1-01 FREE: tạo đủ maxBuildings rồi bị 403', async () => {
    await Organization.findByIdAndUpdate(quotaOrgId, { plan: 'FREE' });
    await Building.deleteMany({ organization_id: quotaOrgId, name: /^__phase51__/ });

    const max = PLAN_LIMITS.FREE.maxBuildings;
    for (let i = 0; i < max; i++) {
      const res = await request(app)
        .post('/api/buildings')
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          name: `__phase51__b_${i}`,
          address: 'quota',
          organization_id: String(quotaOrgId)
        });
      expect(res.status).toBe(201);
      createdBuildingIds.push(res.body.building._id);
    }

    const blocked = await request(app)
      .post('/api/buildings')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: '__phase51__b_overflow',
        address: 'quota',
        organization_id: String(quotaOrgId)
      });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('QUOTA_BUILDINGS');
  });

  test('TC-5.1-02 nâng PRO rồi tạo thêm tòa → 201', async () => {
    await Organization.findByIdAndUpdate(quotaOrgId, { plan: 'PRO' });
    const res = await request(app)
      .post('/api/buildings')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: '__phase51__b_pro',
        address: 'quota',
        organization_id: String(quotaOrgId)
      });
    expect(res.status).toBe(201);
    createdBuildingIds.push(res.body.building._id);
  });

  test('TC-5.1-03 FREE: tạo user đến max rồi 403', async () => {
    await Organization.findByIdAndUpdate(quotaOrgId, { plan: 'FREE' });
    await User.deleteMany({ organization_id: quotaOrgId, email: /^phase51_/ });

    const max = PLAN_LIMITS.FREE.maxUsers;
    const labels = ['Mot', 'Hai', 'Ba', 'Bon', 'Nam', 'Sau', 'Bay', 'Tam', 'Chin', 'Muoi'];
    for (let i = 0; i < max; i++) {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          email: `phase51_u_${i}@quota.test`,
          password: 'password123',
          full_name: `Quota User ${labels[i] || 'Extra'}`,
          role: 'BUILDING_ADMIN',
          organization_id: String(quotaOrgId)
        });
      expect(res.status).toBe(201);
      createdUserIds.push(res.body.user.id);
    }

    const blocked = await request(app)
      .post('/api/auth/register')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        email: 'phase51_u_overflow@quota.test',
        password: 'password123',
        full_name: 'Overflow User',
        role: 'BUILDING_ADMIN',
        organization_id: String(quotaOrgId)
      });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('QUOTA_USERS');
  });
});
