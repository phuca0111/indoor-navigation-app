/**
 * Phase 5.7 — Payment checkout + ORG_ADMIN self-service + grace auto
 * Chạy: npm run test:phase5-7
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.TPTP_SANDBOX_ENABLED = 'true';
process.env.VNPAY_HASH_SECRET = process.env.VNPAY_HASH_SECRET || 'phase57-vnpay-test-secret';

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const Subscription = require('../../models/Subscription');
const Invoice = require('../../models/Invoice');
const Payment = require('../../models/Payment');
const OrganizationBillingEvent = require('../../models/OrganizationBillingEvent');
const OrganizationPlanHistory = require('../../models/OrganizationPlanHistory');
const ActivityLog = require('../../models/ActivityLog');
const {
  completeCheckoutPayment
} = require('../../services/paymentCheckout');
const {
  refreshSubscriptionStatus,
  markSubscriptionPastDue,
  getCurrentSubscription,
  expireCurrentSubscription
} = require('../../services/subscriptionLifecycle');
const { runBillingSchedulerOnce } = require('../../services/billingScheduler');
const { buildSecureHash } = require('../../services/vnpayService');
const { setTestTransporter, resetMailServiceCache } = require('../../services/mailService');
const { processPending: processPendingEvents } = require('../../shared/events/eventBus');
const {
  processPending: processPendingNotifications
} = require('../../application/notification/notificationDeliveryApplicationService');

const BILLING_API = '/api/billing';
const ORG_API = '/api/organizations';
const TEST_CONTACT = {
  phone: '0900000000',
  address: 'Địa chỉ kiểm thử Phase 5.7'
};

function tokenFor(userId, role, organizationId, sessionVersion = 0) {
  const payload = {
    userId: String(userId),
    role,
    sv: Number(sessionVersion) || 0
  };
  if (organizationId) payload.organization_id = String(organizationId);
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function drainEvents(ownerPrefix) {
  let total = 0;
  for (let round = 0; round < 20 && total < 400; round += 1) {
    const result = await processPendingEvents(50, `${ownerPrefix}-events-${round}`);
    const processed = Number(result?.processed || 0);
    if (!processed) break;
    total += processed;
  }
  return total;
}

async function drainNotifications(ownerPrefix) {
  let total = 0;
  for (let round = 0; round < 20 && total < 400; round += 1) {
    const result = await processPendingNotifications(50, `${ownerPrefix}-notify-${round}`);
    const processed = Number(result?.processed || 0);
    if (!processed) break;
    total += processed;
  }
  return total;
}

function mailsMatching(slice, needle) {
  const target = String(needle || '').toLowerCase();
  return slice.filter((mail) => String(mail.subject || '').toLowerCase().includes(target));
}

describe('Phase 5.7 — Payment + self-service', () => {
  let orgAdminToken;
  let orgAdminId;
  let testOrgId;
  const sentMail = [];

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    setTestTransporter({
      sendMail: async (message) => {
        sentMail.push(message);
        return { messageId: `phase57-${sentMail.length}` };
      }
    });

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const org = await Organization.create({
      name: `Phase 5.7 Test ${suffix}`,
      slug: `phase57-${suffix}`,
      plan: 'PRO',
      billing_status: 'ACTIVE',
      plan_started_at: new Date(),
      plan_expires_at: new Date(Date.now() + 30 * 86400000),
      contact_phone: '0900000000',
      contact_address: 'Địa chỉ kiểm thử Phase 5.7',
      is_active: true
    });
    const orgAdmin = await User.create({
      email: `phase57-${suffix}@test.local`,
      password: '$2b$10$phase57testhashphase57testhashphase57testhash',
      role: 'ORG_ADMIN',
      organization_id: org._id,
      is_active: true
    });
    await Subscription.create({
      organization_id: org._id,
      plan: 'PRO',
      status: 'ACTIVE',
      current_period_start: org.plan_started_at,
      current_period_end: org.plan_expires_at,
      provider: 'MANUAL',
      is_current: true,
      note: 'Phase 5.7 isolated fixture'
    });

    orgAdminId = orgAdmin._id;
    orgAdminToken = tokenFor(
      orgAdmin._id,
      'ORG_ADMIN',
      orgAdmin.organization_id,
      orgAdmin.session_version
    );
    testOrgId = String(org._id);
  });

  afterAll(async () => {
    resetMailServiceCache();
    if (testOrgId) {
      const invoices = await Invoice.find({ organization_id: testOrgId }).select('_id').lean();
      const invoiceIds = invoices.map((invoice) => invoice._id);
      await Promise.all([
        Payment.deleteMany({
          $or: [
            { organization_id: testOrgId },
            { invoice_id: { $in: invoiceIds } }
          ]
        }),
        Invoice.deleteMany({ organization_id: testOrgId }),
        OrganizationBillingEvent.deleteMany({ organization_id: testOrgId }),
        Subscription.deleteMany({ organization_id: testOrgId }),
        OrganizationPlanHistory.deleteMany({ organization_id: testOrgId }),
        ActivityLog.deleteMany({ organization_id: testOrgId }),
        User.deleteMany({ organization_id: testOrgId })
      ]);
      await Organization.deleteOne({ _id: testOrgId });
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
    expect(res.body.organization).toMatchObject({
      plan: expect.any(String),
      billing_status: expect.any(String)
    });
    expect(res.body).toHaveProperty('quota');
    expect(res.body).toHaveProperty('current_subscription');
    expect(Array.isArray(res.body.invoices)).toBe(true);
  });

  test('TC-5.7-01b UI org billing copy đồng bộ personal (static)', () => {
    const fs = require('fs');
    const path = require('path');
    const js = fs.readFileSync(path.join(__dirname, '../../js/dashboard.js'), 'utf8');
    expect(js).toMatch(/renderMyBillingTabBody/);
    expect(js).toMatch(/Gói hiện tại/);
    expect(js).toMatch(/TPTPbank/);
    expect(js).not.toMatch(/Thanh toán qua VNPay \(production\)/);
  });

  test('TC-5.7-02 ORG_ADMIN checkout PRO → TPTPpay URL', async () => {
    const res = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'PRO', action: 'renew', contact: TEST_CONTACT });
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
      .send({ plan: 'PRO', action: 'renew', contact: TEST_CONTACT });
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
    sub = await Subscription.findByIdAndUpdate(
      sub._id,
      {
        $set: {
          status: 'ACTIVE',
          current_period_end: new Date(Date.now() - 60 * 1000)
        }
      },
      { returnDocument: 'after' }
    ).lean();
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
    await drainEvents('phase57-before-idempotency');
    await drainNotifications('phase57-before-idempotency');
    const mailCountBefore = sentMail.length;
    const checkout = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'ENTERPRISE', action: 'upgrade', contact: TEST_CONTACT });
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
    await drainEvents('phase57-idempotency');
    await drainNotifications('phase57-idempotency');
    expect(mailsMatching(sentMail.slice(mailCountBefore), 'thanh toán thành công')).toHaveLength(1);
  });

  test('TC-5.7-09 cùng VNPay IPN 2 lần chỉ tạo 1 event, 1 subscription và 1 ledger', async () => {
    const checkout = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'ENTERPRISE', action: 'renew', contact: TEST_CONTACT });
    expect(checkout.status).toBe(201);

    const invoiceId = checkout.body.invoice._id;
    const invoiceNumber = checkout.body.invoice.invoice_number;
    const params = {
      vnp_TxnRef: invoiceNumber,
      vnp_TransactionNo: `PHASE57-${Date.now()}`,
      vnp_ResponseCode: '00',
      vnp_Amount: String(Number(checkout.body.invoice.amount) * 100)
    };
    params.vnp_SecureHash = buildSecureHash(params, process.env.VNPAY_HASH_SECRET);

    const first = await request(app).get('/api/webhooks/vnpay/ipn').query(params);
    expect(first.status).toBe(200);
    expect(first.body.RspCode).toBe('00');

    const afterFirst = await Organization.findById(testOrgId).lean();
    const second = await request(app).get('/api/webhooks/vnpay/ipn').query(params);
    expect(second.status).toBe(200);
    expect(second.body.RspCode).toBe('00');
    const afterSecond = await Organization.findById(testOrgId).lean();

    const eventKey = `pay-${invoiceNumber}`;
    const events = await OrganizationBillingEvent.find({
      organization_id: testOrgId,
      idempotency_key: eventKey
    }).lean();
    expect(events).toHaveLength(1);
    expect(events[0].processing_status).toBe('APPLIED');

    const [subscriptionCount, ledgerCount, paidInvoice] = await Promise.all([
      Subscription.countDocuments({ billing_event_id: events[0]._id }),
      Payment.countDocuments({ invoice_id: invoiceId, status: 'SUCCESS' }),
      Invoice.findById(invoiceId).lean()
    ]);
    expect(subscriptionCount).toBe(1);
    expect(ledgerCount).toBe(1);
    expect(paidInvoice.status).toBe('PAID');
    expect(String(paidInvoice.billing_event_id)).toBe(String(events[0]._id));
    expect(afterSecond.plan_expires_at?.getTime()).toBe(afterFirst.plan_expires_at?.getTime());
  });

  test('TC-5.7-10 hết hạn gọi lặp chỉ gửi email 1 lần', async () => {
    await drainEvents('phase57-before-expiry');
    await drainNotifications('phase57-before-expiry');
    const org = await Organization.findById(testOrgId);
    const mailCountBefore = sentMail.length;
    await expireCurrentSubscription(org, { note: 'phase57 expiry mail' });
    await expireCurrentSubscription(await Organization.findById(testOrgId), {
      note: 'phase57 expiry retry'
    });
    await drainEvents('phase57-expiry');
    await drainNotifications('phase57-expiry');
    expect(mailsMatching(sentMail.slice(mailCountBefore), 'hết hạn')).toHaveLength(1);
  });
});
