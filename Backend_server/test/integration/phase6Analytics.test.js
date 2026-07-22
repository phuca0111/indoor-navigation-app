/**
 * Phase 6 — Analytics API
 * Chạy: npm run test:phase6
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const { parseRange } = require('../../services/analyticsService');

const API = '/api/analytics';

function tokenFor(userId, role, sessionVersion = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv: Number(sessionVersion) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 6 — Analytics', () => {
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
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN trong DB test');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', superUser.session_version);
    if (orgAdmin) orgAdminToken = tokenFor(orgAdmin._id, 'ORG_ADMIN', orgAdmin.session_version);
    if (buildingAdmin) buildingAdminToken = tokenFor(buildingAdmin._id, 'BUILDING_ADMIN', buildingAdmin.session_version);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-6.1-01 không token → 401', async () => {
    const res = await request(app).get(`${API}/overview`);
    expect(res.status).toBe(401);
  });

  test('TC-6.1-02 BUILDING_ADMIN → 403', async () => {
    if (!buildingAdminToken) return;
    const res = await request(app)
      .get(`${API}/overview`)
      .set('Authorization', `Bearer ${buildingAdminToken}`);
    expect(res.status).toBe(403);
  });

  test('TC-6.1-03 SUPER_ADMIN overview platform + series', async () => {
    const res = await request(app)
      .get(`${API}/overview`)
      .query({ range: '7d' })
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('platform');
    expect(res.body.range).toBe('7d');
    expect(res.body.totals).toEqual(
      expect.objectContaining({
        logins: expect.any(Number),
        publishes: expect.any(Number),
        paid_invoices: expect.any(Number),
        paid_amount: expect.any(Number),
        expense_amount: expect.any(Number),
        profit_amount: expect.any(Number)
      })
    );
    expect(res.body.plan_distribution).toEqual(
      expect.objectContaining({
        FREE: expect.any(Number),
        PRO: expect.any(Number),
        ENTERPRISE: expect.any(Number)
      })
    );
    expect(Array.isArray(res.body.series?.login)).toBe(true);
    expect(res.body.series.login.length).toBe(7);
    expect(res.body.changes).toEqual(expect.objectContaining({
      logins: expect.any(Number),
      publishes: expect.any(Number),
      paid_invoices: expect.any(Number),
      paid_amount: expect.any(Number)
    }));
    expect(Array.isArray(res.body.series?.qr_scan)).toBe(true);
    expect(Array.isArray(res.body.series?.expense)).toBe(true);
    expect(Array.isArray(res.body.growth?.building)).toBe(true);
    expect(Array.isArray(res.body.revenue_by_plan)).toBe(true);
    expect(res.body.subscription).toEqual(expect.objectContaining({
      mrr: expect.any(Number),
      arr: expect.any(Number),
      arpu: expect.any(Number),
      personal_paid_count: expect.any(Number),
      recurring_customer_count: expect.any(Number)
    }));
    expect(res.body.rankings).toEqual(expect.objectContaining({
      organizations: expect.any(Array),
      buildings: expect.any(Array),
      plans: expect.any(Array)
    }));
    expect(Array.isArray(res.body.insights)).toBe(true);
    expect(Array.isArray(res.body.paid_by_month)).toBe(true);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  test('TC-6.1-03b khoảng tùy chọn dùng biên ngày Việt Nam', () => {
    const parsed = parseRange('custom', '2026-07-01', '2026-07-03');
    expect(parsed.days).toBe(3);
    expect(parsed.start.toISOString()).toBe('2026-06-30T17:00:00.000Z');
    expect(parsed.end.toISOString()).toBe('2026-07-03T16:59:59.999Z');
  });

  test('TC-6.1-04 SUPER_ADMIN alerts', async () => {
    const res = await request(app)
      .get(`${API}/alerts`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.alerts)).toBe(true);
    expect(typeof res.body.count).toBe('number');
    expect(res.headers['cache-control']).toContain('no-store');
  });

  test('TC-6.2-01 timeseries login / publish / paid', async () => {
    for (const metric of ['login', 'publish', 'paid']) {
      const res = await request(app)
        .get(`${API}/timeseries`)
        .query({ metric, range: '7d' })
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(200);
      expect(res.body.metric).toBe(metric);
      expect(Array.isArray(res.body.series)).toBe(true);
      expect(res.body.series.length).toBe(7);
    }
  });

  test('TC-6.2-02 ORG_ADMIN overview scoped', async () => {
    if (!orgAdminToken) return;
    const res = await request(app)
      .get(`${API}/overview`)
      .query({ range: '30d' })
      .set('Authorization', `Bearer ${orgAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('organization');
    expect(res.body.organization).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String)
      })
    );
    expect(res.body.series?.login?.length).toBe(30);
  });

  test('TC-6.2-03 ORG_ADMIN alerts scoped', async () => {
    if (!orgAdminToken) return;
    const res = await request(app)
      .get(`${API}/alerts`)
      .set('Authorization', `Bearer ${orgAdminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });

  test('TC-6.3-01 POST telemetry nav_complete → overview series.navigation tăng', async () => {
    const Building = require('../../models/Building');
    const TelemetryEvent = require('../../models/TelemetryEvent');
    const building = await Building.findOne({}).select('_id organization_id').lean();
    expect(building).toBeTruthy();

    const ingest = await request(app)
      .post(`${API}/telemetry`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        events: [
          {
            event_type: 'nav_complete',
            building_id: String(building._id),
            session_id: 'c4-test-' + Date.now()
          },
          {
            event_type: 'session_start',
            building_id: String(building._id),
            session_id: 'c4-test-' + Date.now()
          }
        ]
      });
    expect(ingest.status).toBe(201);
    expect(ingest.body.inserted).toBeGreaterThanOrEqual(2);

    const overview = await request(app)
      .get(`${API}/overview?range=7d`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(overview.status).toBe(200);
    expect(Array.isArray(overview.body.series?.navigation)).toBe(true);
    expect(Number(overview.body.totals?.navigation_requests) || 0).toBeGreaterThanOrEqual(1);

    await TelemetryEvent.deleteMany({ session_id: { $regex: /^c4-test-/ } });
  });

  test('TC-6.3-02 SUPER filter organization_id trên overview', async () => {
    const Organization = require('../../models/Organization');
    const org = await Organization.findOne({}).select('_id').lean();
    if (!org) return;
    const res = await request(app)
      .get(`${API}/overview?range=7d&organization_id=${org._id}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.organization?.id).toBe(String(org._id));
  });
});
