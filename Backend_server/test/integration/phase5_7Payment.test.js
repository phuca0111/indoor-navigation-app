/**
 * Phase 5.7 — Payment checkout + ORG_ADMIN self-service + grace auto
 * Chạy: npm run test:phase5-7
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.TPTP_SANDBOX_ENABLED = 'true';

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const Subscription = require('../../models/Subscription');
const Invoice = require('../../models/Invoice');
const {
  completeCheckoutPayment
} = require('../../services/paymentCheckout');
const {
  refreshSubscriptionStatus,
  markSubscriptionPastDue,
  getCurrentSubscription
} = require('../../services/subscriptionLifecycle');
const { runBillingSchedulerOnce } = require('../../services/billingScheduler');

const BILLING_API = '/api/billing';
const ORG_API = '/api/organizations';

function tokenFor(userId, role, organizationId) {
  const payload = { userId: String(userId), role };
  if (organizationId) payload.organization_id = String(organizationId);
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('Phase 5.7 — Payment + self-service', () => {
  let superToken;
  let orgAdminToken;
  let orgAdminId;
  let testOrgId;
  let snapshot;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    if (!orgAdmin) throw new Error('Thiếu ORG_ADMIN');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN');
    orgAdminId = orgAdmin._id;
    orgAdminToken = tokenFor(orgAdmin._id, 'ORG_ADMIN', orgAdmin.organization_id);

    const org = await Organization.findById(orgAdmin.organization_id);
    if (!org) throw new Error('Thiếu org ORG_ADMIN');
    testOrgId = String(org._id);
    snapshot = {
      plan: org.plan,
      billing_status: org.billing_status,
      plan_started_at: org.plan_started_at,
      plan_expires_at: org.plan_expires_at,
      grace_ends_at: org.grace_ends_at
    };

    await request(app)
      .post(`${ORG_API}/${testOrgId}/subscription/expire`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ note: 'phase57 prep' });
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

  test('TC-5.7-01 ORG_ADMIN GET /billing/me → 200', async () => {
    const res = await request(app)
      .get(`${BILLING_API}/me`)
      .set('Authorization', `Bearer ${orgAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.organization).toBeDefined();
    expect(String(res.body.organization._id)).toBe(testOrgId);
    expect(Array.isArray(res.body.invoices)).toBe(true);
  });

  test('TC-5.7-02 ORG_ADMIN checkout PRO → TPTPpay URL', async () => {
    const res = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'PRO', action: 'upgrade' });
    expect(res.status).toBe(201);
    expect(res.body.checkout_url).toBeDefined();
    expect(res.body.provider).toBe('TPTPPAY');
    expect(res.body.checkout_url).toMatch(/tptp-pay/);
    expect(res.body.invoice.status).toBe('OPEN');
  });

  test('TC-5.7-03 Mock complete payment → PRO active', async () => {
    const checkout = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'PRO', action: 'upgrade' });
    const invoiceId = checkout.body.invoice._id;
    const invoice = await Invoice.findById(invoiceId);
    const result = await completeCheckoutPayment({
      invoice,
      externalRef: 'MOCK-TEST',
      provider: 'MOCK',
      userId: orgAdminId,
      note: 'phase57 mock complete'
    });
    expect(result.subscription).toBeDefined();
    expect(result.subscription.plan).toBe('PRO');
    expect(result.subscription.status).toBe('ACTIVE');
    expect(result.invoice.status).toBe('PAID');

    const org = await Organization.findById(testOrgId);
    expect(org.plan).toBe('PRO');
    expect(org.billing_status).toBe('ACTIVE');
  });

  test('TC-5.7-04 PAYMENT_FAILED → GRACE_PERIOD (không EXPIRED ngay)', async () => {
    const org = await Organization.findById(testOrgId);
    await markSubscriptionPastDue(org, { note: 'phase57 failed test' });
    const refreshed = await Organization.findById(testOrgId);
    expect(refreshed.billing_status).toBe('GRACE_PERIOD');
    expect(refreshed.grace_ends_at).toBeTruthy();
    const sub = await getCurrentSubscription(testOrgId);
    expect(sub.status).toBe('GRACE_PERIOD');
  });

  test('TC-5.7-05 Subscription hết chu kỳ → GRACE_PERIOD auto', async () => {
    const org = await Organization.findById(testOrgId);
    let sub = await getCurrentSubscription(testOrgId);
    sub.status = 'ACTIVE';
    sub.current_period_end = new Date(Date.now() - 60 * 1000);
    await sub.save();
    await refreshSubscriptionStatus(org, sub);
    const after = await Organization.findById(testOrgId);
    expect(after.billing_status).toBe('GRACE_PERIOD');
    sub = await getCurrentSubscription(testOrgId);
    expect(sub.status).toBe('GRACE_PERIOD');
  });

  test('TC-5.7-06 Billing scheduler chạy không lỗi', async () => {
    const stats = await runBillingSchedulerOnce();
    expect(stats.scanned).toBeGreaterThan(0);
  });

  test('TC-5.7-07 SUPER_ADMIN subscription/activate vẫn 403 cho ORG_ADMIN', async () => {
    const res = await request(app)
      .post(`${ORG_API}/${testOrgId}/subscription/activate`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'PRO' });
    expect(res.status).toBe(403);
  });

  test('TC-5.7-08 completeCheckoutPayment idempotent', async () => {
    const checkout = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'ENTERPRISE', action: 'upgrade' });
    expect(checkout.status).toBe(201);
    const invoice = await Invoice.findById(checkout.body.invoice._id);
    const first = await completeCheckoutPayment({
      invoice,
      externalRef: 'TPTP-TEST-1',
      provider: 'TPTPPAY',
      userId: orgAdminId,
      note: 'phase57 idempotent'
    });
    expect(first.subscription).toBeDefined();
    const second = await completeCheckoutPayment({
      invoice: await Invoice.findById(invoice._id),
      externalRef: 'TPTP-TEST-2',
      provider: 'TPTPPAY',
      userId: orgAdminId,
      note: 'phase57 idempotent retry'
    });
    expect(second.duplicated).toBe(true);
  });
});
