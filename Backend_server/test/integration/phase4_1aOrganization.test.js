/**
 * Phase 4.1a — PATCH /api/organizations/:id (Super Admin)
 * Chạy: npm run test:phase4-1a
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const OrganizationBillingEvent = require('../../models/OrganizationBillingEvent');

const API = '/api/organizations';

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 4.1a — PATCH organization', () => {
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

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', Number(superUser.session_version) || 0);
    if (orgAdmin) {
      orgAdminToken = tokenFor(orgAdmin._id, 'ORG_ADMIN', Number(orgAdmin.session_version) || 0);
    }

    const org = await Organization.findOne({
      slug: { $nin: ['legacy', 'thailan'] },
      is_active: { $ne: false }
    }).lean()
      || await Organization.findOne({ slug: { $ne: 'legacy' }, is_active: { $ne: false } }).lean();
    if (!org) throw new Error('Thiếu org test (không phải legacy)');
    testOrgId = String(org._id);
  });

  afterAll(async () => {
    if (testOrgId) {
      await Organization.findByIdAndUpdate(testOrgId, { is_active: true });
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-4.1a-01 ORG_ADMIN PATCH → 403', async () => {
    if (!orgAdminToken) return;
    const res = await request(app)
      .patch(`${API}/${testOrgId}`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'PRO' });
    expect(res.status).toBe(403);
  });

  test('TC-4.1a-02 SUPER_ADMIN đổi plan → 200', async () => {
    const org = await Organization.findById(testOrgId).lean();
    const revert = org.plan || 'FREE';
    const next = revert === 'PRO' ? 'FREE' : 'PRO';

    const res = await request(app)
      .patch(`${API}/${testOrgId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ plan: next });
    expect(res.status).toBe(200);
    expect(res.body.organization.plan).toBe(next);

    await request(app)
      .patch(`${API}/${testOrgId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ plan: revert });
  });

  test('TC-4.1a-03 Chặn sửa name/slug → 400', async () => {
    const res = await request(app)
      .patch(`${API}/${testOrgId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Hacked Org' });
    expect(res.status).toBe(400);
  });

  test('TC-4.1a-04 Deactivate + activate org test → 200', async () => {
    const resOff = await request(app)
      .patch(`${API}/${testOrgId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ is_active: false });
    expect(resOff.status).toBe(200);
    expect(resOff.body.organization.is_active).toBe(false);

    const resOn = await request(app)
      .patch(`${API}/${testOrgId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ is_active: true });
    expect(resOn.status).toBe(200);
    expect(resOn.body.organization.is_active).toBe(true);
  });

  test('TC-4.1a-05 Không deactivate legacy → 400', async () => {
    const legacy = await Organization.findOne({ slug: 'legacy' }).lean();
    if (!legacy) {
      console.warn('SKIP TC-4.1a-05: không có org legacy');
      return;
    }
    const res = await request(app)
      .patch(`${API}/${legacy._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ is_active: false });
    expect(res.status).toBe(400);
  });

  test('TC-4.1a-06 SUPER_ADMIN cập nhật hạn gói → 200', async () => {
    const expireAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .patch(`${API}/${testOrgId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ plan_expires_at: expireAt });
    expect(res.status).toBe(200);
    expect(res.body.organization.plan_expires_at).toBeTruthy();
  });

  test('TC-4.1a-07 SUPER_ADMIN tạo billing event PAID → 201', async () => {
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const key = `test-paid-${Date.now()}`;
    const res = await request(app)
      .post(`${API}/${testOrgId}/billing-events`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        event_type: 'SUBSCRIPTION_RENEWED',
        payment_status: 'PAID',
        plan: 'PRO',
        amount: 990000,
        currency: 'VND',
        period_start_at: startAt.toISOString(),
        period_end_at: endAt.toISOString(),
        idempotency_key: key,
        note: 'Integration test paid event'
      });
    expect(res.status).toBe(201);
    expect(res.body.billing_event).toBeDefined();
    expect(res.body.billing_event.payment_status).toBe('PAID');
    expect(res.body.organization).toBeDefined();
    expect(res.body.organization.plan).toBe('PRO');

    await OrganizationBillingEvent.deleteOne({
      organization_id: testOrgId,
      idempotency_key: key
    });
  });
});
