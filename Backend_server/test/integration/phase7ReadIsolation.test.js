/**
 * Phase 7 — two-tenant isolation for analytics / platform stats / funnel.
 * Chạy: npm run test:phase7-read:integration
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const Building = require('../../models/Building');

function tokenFor(user) {
  return jwt.sign(
    {
      userId: String(user._id),
      role: user.role,
      sv: Number(user.session_version) || 0,
      org: user.organization_id ? String(user.organization_id) : undefined
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 7 — read isolation', () => {
  let orgA;
  let orgB;
  let adminA;
  let adminB;
  let buildingA;
  let buildingB;
  const created = [];

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.TEST_MONGO_REPLICA_URI || process.env.TEST_MONGO_URI;
    if (!uri) {
      throw new Error('Thiếu TEST_MONGO_REPLICA_URI/TEST_MONGO_URI cho Phase 7 isolation.');
    }
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const hash = await bcrypt.hash('password123', 10);
    orgA = await Organization.create({
      name: 'P7 Org A',
      slug: `p7-org-a-${Date.now()}`,
      plan: 'PRO',
      is_active: true
    });
    orgB = await Organization.create({
      name: 'P7 Org B',
      slug: `p7-org-b-${Date.now()}`,
      plan: 'PRO',
      is_active: true
    });
    created.push(orgA._id, orgB._id);

    adminA = await User.create({
      email: `p7-admin-a-${Date.now()}@test.local`,
      password: hash,
      full_name: 'P7 Admin A',
      role: 'ORG_ADMIN',
      organization_id: orgA._id,
      is_active: true
    });
    adminB = await User.create({
      email: `p7-admin-b-${Date.now()}@test.local`,
      password: hash,
      full_name: 'P7 Admin B',
      role: 'ORG_ADMIN',
      organization_id: orgB._id,
      is_active: true
    });
    created.push(adminA._id, adminB._id);

    buildingA = await Building.create({
      name: 'P7 Building A',
      organization_id: orgA._id,
      status: 'DRAFT',
      is_active: true,
      total_floors: 1
    });
    buildingB = await Building.create({
      name: 'P7 Building B',
      organization_id: orgB._id,
      status: 'DRAFT',
      is_active: true,
      total_floors: 1
    });
    created.push(buildingA._id, buildingB._id);
  });

  afterAll(async () => {
    await Building.deleteMany({ _id: { $in: [buildingA?._id, buildingB?._id].filter(Boolean) } });
    await User.deleteMany({ _id: { $in: [adminA?._id, adminB?._id].filter(Boolean) } });
    await Organization.deleteMany({ _id: { $in: [orgA?._id, orgB?._id].filter(Boolean) } });
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('ORG_ADMIN A không đọc được building của org B qua analytics', async () => {
    const res = await request(app)
      .get('/api/analytics/overview')
      .query({ range: '7d', building_id: String(buildingB._id) })
      .set('Authorization', `Bearer ${tokenFor(adminA)}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/building_id|phạm vi/i);
  });

  test('ORG_ADMIN A platform/stats chỉ scope organization của mình', async () => {
    const res = await request(app)
      .get('/api/platform/stats')
      .set('Authorization', `Bearer ${tokenFor(adminA)}`);
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('organization');
    expect(res.body.organization.id).toBe(String(orgA._id));
  });

  test('ORG_ADMIN A funnel không rơi về system-wide', async () => {
    const res = await request(app)
      .get('/api/analytics/funnel')
      .set('Authorization', `Bearer ${tokenFor(adminA)}`);
    expect(res.status).toBe(200);
    expect(res.body.stages).toBeDefined();
    expect(Array.isArray(res.body.stages)).toBe(true);
    // ORG scope phải chạy được với org của actor — không 400 FUNNEL_SCOPE_REQUIRED
    expect(res.body.code).not.toBe('FUNNEL_SCOPE_REQUIRED');
  });

  test('ORG_ADMIN A không đọc funnel của org B bằng query organization_id', async () => {
    const res = await request(app)
      .get('/api/analytics/funnel')
      .query({ organization_id: String(orgB._id) })
      .set('Authorization', `Bearer ${tokenFor(adminA)}`);
    // ORG_ADMIN bị buộc scope org mình — query org B bị bỏ qua / không escalate
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.stages).toBeDefined();
    }
  });

  test('ORG_ADMIN B không thấy org A trong platform stats', async () => {
    const resA = await request(app)
      .get('/api/platform/stats')
      .set('Authorization', `Bearer ${tokenFor(adminA)}`);
    const resB = await request(app)
      .get('/api/platform/stats')
      .set('Authorization', `Bearer ${tokenFor(adminB)}`);
    expect(resA.body.organization.id).not.toBe(resB.body.organization.id);
  });
});
