/**
 * Phase 5.3 — soft lock sau hết grace khi hạ PRO→FREE vượt quota
 * Chạy: npm run test:phase5-3
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const Building = require('../../models/Building');
const { PLAN_LIMITS } = require('../../utils/planQuota');

function tokenFor(userId, role, organizationId) {
  const payload = { userId: String(userId), role };
  if (organizationId) payload.organization_id = String(organizationId);
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('Phase 5.3 — over quota soft lock', () => {
  let superToken;
  let orgAdminToken;
  let orgId;
  let buildingIds = [];
  let extraUserIds = [];
  const slug = 'phase53-lock-test';
  const orgAdminEmail = 'phase53_org_admin@quota.test';

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN trong DB');
    superToken = tokenFor(superUser._id, 'SUPER_ADMIN');

    let org = await Organization.findOne({ slug }).lean();
    if (!org) {
      org = await Organization.create({
        name: 'Phase 5.3 Lock Test Org',
        slug,
        plan: 'PRO',
        billing_status: 'ACTIVE',
        is_active: true
      });
    }
    orgId = org._id;

    await Building.deleteMany({ organization_id: orgId, name: /^__phase53__/ });
    await Organization.findByIdAndUpdate(orgId, {
      plan: 'PRO',
      billing_status: 'ACTIVE',
      grace_ends_at: null,
      is_active: true
    });

    buildingIds = [];
    for (let i = 0; i < 4; i++) {
      const b = await Building.create({
        name: `__phase53__b_${i}`,
        address: 'lock test',
        organization_id: orgId,
        status: 'DRAFT',
        is_active: true
      });
      buildingIds.push(String(b._id));
    }

    await User.deleteMany({ email: orgAdminEmail });
    const bcrypt = require('bcryptjs');
    const orgAdmin = await User.create({
      email: orgAdminEmail,
      password: await bcrypt.hash('password123', 10),
      full_name: 'Phase53 Org Admin',
      role: 'ORG_ADMIN',
      organization_id: orgId,
      is_active: true
    });
    orgAdminToken = tokenFor(orgAdmin._id, 'ORG_ADMIN', orgId);

    await User.deleteMany({ organization_id: orgId, email: /^phase53_ba_/ });
    extraUserIds = [];
    for (let i = 0; i < 6; i++) {
      const ba = await User.create({
        email: `phase53_ba_${i}@quota.test`,
        password: await bcrypt.hash('password123', 10),
        full_name: `Phase53 BA ${i}`,
        role: 'BUILDING_ADMIN',
        organization_id: orgId,
        is_active: true
      });
      extraUserIds.push(String(ba._id));
    }
  });

  afterAll(async () => {
    if (buildingIds.length) {
      await Building.deleteMany({ _id: { $in: buildingIds } });
    }
    await Building.deleteMany({ organization_id: orgId, name: /^__phase53__/ });
    await User.deleteMany({ email: orgAdminEmail });
    if (orgId) {
      await Organization.findByIdAndUpdate(orgId, {
        plan: 'PRO',
        billing_status: 'ACTIVE',
        grace_ends_at: null
      });
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-5.3-01 hạ PRO→FREE vượt quota → khóa ngay (ACTIVE, không grace)', async () => {
    const res = await request(app)
      .patch(`/api/organizations/${orgId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ plan: 'FREE' });
    expect(res.status).toBe(200);
    expect(res.body.organization.plan).toBe('FREE');
    expect(res.body.organization.billing_status).toBe('ACTIVE');
    expect(res.body.organization.grace_ends_at).toBeFalsy();
    expect(res.body.quota.enforcement_active).toBe(true);
  });

  test('TC-5.3-02 trong grace: publish tòa thứ 4 vẫn được', async () => {
    const targetId = buildingIds[3];
    const res = await request(app)
      .post(`/api/maps/${targetId}/1/publish`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ map_data: { rooms: [], nodes: [], edges: [] } });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
  });

  test('TC-5.3-03 hết grace (EXPIRED): tòa vượt FREE bị khóa publish', async () => {
    await Organization.findByIdAndUpdate(orgId, {
      plan: 'FREE',
      billing_status: 'EXPIRED',
      grace_ends_at: new Date(Date.now() - 1000)
    });

    const listRes = await request(app)
      .get('/api/buildings')
      .set('Authorization', `Bearer ${superToken}`);
    expect(listRes.status).toBe(200);
    const orgBuildings = listRes.body.filter((b) => String(b.organization_id) === String(orgId));
    const locked = orgBuildings.filter((b) => b.quota_locked);
    const unlocked = orgBuildings.filter((b) => !b.quota_locked && b.is_active !== false);
    expect(unlocked.length).toBe(PLAN_LIMITS.FREE.maxBuildings);
    expect(locked.length).toBe(orgBuildings.filter((b) => b.is_active !== false).length - PLAN_LIMITS.FREE.maxBuildings);

    const lockedId = locked[0]._id;
    const pub = await request(app)
      .post(`/api/maps/${lockedId}/1/publish`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ map_data: { rooms: [], nodes: [], edges: [] } });
    expect(pub.status).toBe(403);
    expect(pub.body.code).toBe('OVER_QUOTA_LOCKED');
  });

  test('TC-5.3-04 nâng lại PRO → mở khóa', async () => {
    const res = await request(app)
      .patch(`/api/organizations/${orgId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ plan: 'PRO' });
    expect(res.status).toBe(200);
    expect(res.body.organization.billing_status).toBe('ACTIVE');

    const listRes = await request(app)
      .get('/api/buildings')
      .set('Authorization', `Bearer ${superToken}`);
    const orgBuildings = listRes.body.filter((b) => String(b.organization_id) === String(orgId));
    expect(orgBuildings.every((b) => !b.quota_locked)).toBe(true);
  });

  test('TC-5.3-05 FREE ACTIVE vượt quota: khóa ngay không cần EXPIRED', async () => {
    await Organization.findByIdAndUpdate(orgId, {
      plan: 'FREE',
      billing_status: 'ACTIVE',
      grace_ends_at: null
    });

    const listRes = await request(app)
      .get('/api/buildings')
      .set('Authorization', `Bearer ${superToken}`);
    const orgBuildings = listRes.body.filter((b) => String(b.organization_id) === String(orgId));
    const locked = orgBuildings.filter((b) => b.quota_locked);
    expect(locked.length).toBeGreaterThan(0);
  });

  test('TC-5.3-06 FREE ACTIVE vượt user quota: user thừa bị khóa', async () => {
    await Organization.findByIdAndUpdate(orgId, {
      plan: 'FREE',
      billing_status: 'ACTIVE',
      grace_ends_at: null
    });

    const usersRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${orgAdminToken}`);
    expect(usersRes.status).toBe(200);
    const lockedUsers = usersRes.body.filter((u) => u.quota_locked);
    expect(lockedUsers.length).toBeGreaterThan(0);

    const lockedBa = lockedUsers.find((u) => u.role === 'BUILDING_ADMIN');
    if (lockedBa) {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: lockedBa.email, password: 'password123' });
      expect(loginRes.status).toBe(403);
      expect(loginRes.body.code).toBe('OVER_QUOTA_USER_LOCKED');
    }
  });
});
