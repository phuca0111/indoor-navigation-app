/**
 * Phase 5.6 — Subscription lifecycle (source of truth)
 * Chạy: npm run test:phase5-6
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const Subscription = require('../../models/Subscription');
const Invoice = require('../../models/Invoice');

const API = '/api/organizations';

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 5.6 — Subscription lifecycle', () => {
  let superToken;
  let orgAdminToken;
  let testOrgId;
  let snapshot;

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
    });
    if (!org) throw new Error('Thiếu org test');
    testOrgId = String(org._id);
    snapshot = {
      plan: org.plan,
      billing_status: org.billing_status,
      plan_started_at: org.plan_started_at,
      plan_expires_at: org.plan_expires_at,
      grace_ends_at: org.grace_ends_at
    };
  });

  afterAll(async () => {
    if (testOrgId && snapshot) {
      await Organization.findByIdAndUpdate(testOrgId, {
        plan: snapshot.plan,
        billing_status: snapshot.billing_status,
        plan_started_at: snapshot.plan_started_at,
        plan_expires_at: snapshot.plan_expires_at,
        grace_ends_at: snapshot.grace_ends_at
      });
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-5.6-01 ORG_ADMIN activate subscription → 403', async () => {
    if (!orgAdminToken) return;
    const res = await request(app)
      .post(`${API}/${testOrgId}/subscription/activate`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'PRO' });
    expect(res.status).toBe(403);
  });

  test('TC-5.6-02 SUPER_ADMIN activate PRO → 201 + subscription + invoice', async () => {
    const res = await request(app)
      .post(`${API}/${testOrgId}/subscription/activate`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        plan: 'PRO',
        amount: 990000,
        currency: 'VND',
        note: 'Phase 5.6 integration test activate'
      });
    expect(res.status).toBe(201);
    expect(res.body.organization.plan).toBe('PRO');
    expect(res.body.organization.billing_status).toBe('ACTIVE');
    expect(res.body.current_subscription).toBeDefined();
    expect(res.body.current_subscription.plan).toBe('PRO');
    expect(res.body.current_subscription.status).toBe('ACTIVE');
    expect(res.body.current_subscription.is_current).toBe(true);
    expect(res.body.invoice).toBeDefined();
    expect(res.body.invoice.status).toBe('PAID');

    const currentCount = await Subscription.countDocuments({
      organization_id: testOrgId,
      is_current: true
    });
    expect(currentCount).toBe(1);
  });

  test('TC-5.6-03 GET detail có current_subscription + invoices', async () => {
    const res = await request(app)
      .get(`${API}/${testOrgId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.current_subscription).toBeDefined();
    expect(res.body.current_subscription.plan).toBe('PRO');
    expect(Array.isArray(res.body.invoices)).toBe(true);
    expect(res.body.invoices.length).toBeGreaterThan(0);
  });

  test('TC-5.6-04 Billing event PAID tạo subscription sync', async () => {
    const key = `phase56-paid-${Date.now()}`;
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    const res = await request(app)
      .post(`${API}/${testOrgId}/billing-events`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        event_type: 'SUBSCRIPTION_RENEWED',
        payment_status: 'PAID',
        plan: 'ENTERPRISE',
        amount: 4990000,
        period_start_at: start.toISOString(),
        period_end_at: end.toISOString(),
        idempotency_key: key,
        note: 'Phase 5.6 billing→subscription'
      });
    expect(res.status).toBe(201);
    expect(res.body.organization.plan).toBe('ENTERPRISE');
    expect(res.body.current_subscription).toBeDefined();
    expect(res.body.current_subscription.plan).toBe('ENTERPRISE');
    expect(res.body.invoice).toBeDefined();
  });

  test('TC-5.6-05 Expire subscription giữ plan và khóa bằng billing status', async () => {
    const res = await request(app)
      .post(`${API}/${testOrgId}/subscription/expire`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ note: 'Phase 5.6 expire test' });
    expect(res.status).toBe(200);
    expect(res.body.organization.plan).toBe('ENTERPRISE');
    expect(res.body.organization.billing_status).toBe('EXPIRED');
    expect(res.body.current_subscription.status).toBe('EXPIRED');
  });

  test('TC-5.6-06 Cancel subscription sau khi activate lại', async () => {
    await request(app)
      .post(`${API}/${testOrgId}/subscription/activate`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ plan: 'PRO', note: 'prep cancel' });

    const res = await request(app)
      .post(`${API}/${testOrgId}/subscription/cancel`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ immediate: true });
    expect(res.status).toBe(200);
    expect(res.body.organization.plan).toBe('FREE');
    expect(res.body.current_subscription.status).toBe('CANCELED');
  });
});
