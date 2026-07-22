/**
 * Phase 5.8 — TPTPpay + TPTPbank sandbox
 * Chạy: npm run test:phase5-8
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.TPTP_SANDBOX_ENABLED = 'true';
process.env.TPTP_BANK_JWT_SECRET = process.env.TPTP_BANK_JWT_SECRET || 'test_tptp_bank_jwt_secret_32chars!!';

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const Subscription = require('../../models/Subscription');
const Invoice = require('../../models/Invoice');
const BankUser = require('../../models/BankUser');
const BankWallet = require('../../models/BankWallet');
const BankTransaction = require('../../models/BankTransaction');
const Payment = require('../../models/Payment');

const BILLING_API = '/api/billing';
const BANK_API = '/api/tptp-bank';
const PAY_API = '/api/tptp-pay';

function tokenFor(userId, role, organizationId) {
  const payload = { userId: String(userId), role };
  if (organizationId) payload.organization_id = String(organizationId);
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('Phase 5.8 — TPTP Sandbox', () => {
  let orgAdminToken;
  let orgAdminId;
  let testOrgId;
  let bankToken;
  let bankUserId;
  let orgSnapshot;
  let subscriptionSnapshot;
  const testEmail = `tptp-test-${Date.now()}@bank.local`;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    if (!orgAdmin) throw new Error('Thiếu ORG_ADMIN');
    orgAdminId = orgAdmin._id;
    orgAdminToken = tokenFor(orgAdmin._id, 'ORG_ADMIN', orgAdmin.organization_id);
    testOrgId = String(orgAdmin.organization_id);
    const org = await Organization.findById(testOrgId);
    const currentSubscription = await Subscription.findOne({
      organization_id: testOrgId,
      is_current: true
    }).lean();
    subscriptionSnapshot = currentSubscription || null;
    await Subscription.updateMany(
      { organization_id: testOrgId, is_current: true },
      { $set: { is_current: false, status: 'EXPIRED' } }
    );
    orgSnapshot = {
      plan: org.plan,
      billing_status: org.billing_status,
      plan_started_at: org.plan_started_at,
      plan_expires_at: org.plan_expires_at,
      grace_ends_at: org.grace_ends_at,
      contact_phone: org.contact_phone,
      contact_address: org.contact_address
    };
    await Organization.findByIdAndUpdate(testOrgId, {
      plan: 'FREE',
      billing_status: 'EXPIRED',
      plan_started_at: null,
      plan_expires_at: new Date(Date.now() - 60000),
      grace_ends_at: null,
      contact_phone: org.contact_phone || '0900000000',
      contact_address: org.contact_address || 'Địa chỉ kiểm thử TPTP'
    });

    const reg = await request(app)
      .post(`${BANK_API}/auth/register`)
      .send({ email: testEmail, password: 'Test1234!', full_name: 'TPTP Tester' });
    expect(reg.status).toBe(201);
    bankToken = reg.body.token;
    bankUserId = reg.body.user.id;
  });

  afterAll(async () => {
    if (subscriptionSnapshot?._id) {
      await Subscription.updateMany(
        {
          organization_id: testOrgId,
          _id: { $ne: subscriptionSnapshot._id }
        },
        { $set: { is_current: false } }
      );
      await Subscription.findByIdAndUpdate(subscriptionSnapshot._id, {
        plan: subscriptionSnapshot.plan,
        status: subscriptionSnapshot.status,
        current_period_start: subscriptionSnapshot.current_period_start,
        current_period_end: subscriptionSnapshot.current_period_end,
        is_current: subscriptionSnapshot.is_current,
        cancel_at_period_end: subscriptionSnapshot.cancel_at_period_end,
        canceled_at: subscriptionSnapshot.canceled_at
      });
    }
    if (testOrgId && orgSnapshot) {
      await Organization.findByIdAndUpdate(testOrgId, orgSnapshot);
    }
    if (bankUserId) {
      await BankWallet.deleteMany({ bank_user_id: bankUserId });
      await BankUser.deleteOne({ _id: bankUserId });
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-5.8-01 Đăng ký + đăng nhập TPTPbank', async () => {
    const login = await request(app)
      .post(`${BANK_API}/auth/login`)
      .send({ email: testEmail, password: 'Test1234!' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  test('TC-5.8-02 Nạp tiền ví ảo', async () => {
    const topup = await request(app)
      .post(`${BANK_API}/wallet/topup`)
      .set('Authorization', `Bearer ${bankToken}`)
      .send({ amount: 2000000 });
    expect(topup.status).toBe(201);
    expect(topup.body.balance).toBe(2000000);
  });

  test('TC-5.8-03 Checkout → provider TPTPPAY + URL cổng', async () => {
    const res = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'PRO', action: 'upgrade' });
    expect(res.status).toBe(201);
    expect(res.body.provider).toBe('TPTPPAY');
    expect(res.body.checkout_url).toMatch(/tptp-pay\/pay\//);
  });

  test('TC-5.8-04 Quét QR flow → confirm → PRO active', async () => {
    const checkout = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'PRO', action: 'upgrade' });
    const invoiceId = checkout.body.invoice._id;
    const url = new URL(checkout.body.checkout_url);
    const token = url.searchParams.get('token');

    const resolve = await request(app)
      .get(`${BANK_API}/pay/resolve`)
      .query({ invoiceId, token });
    expect(resolve.status).toBe(200);
    expect(resolve.body.amount).toBe(Number(checkout.body.invoice.amount));
    expect(resolve.body.amount).toBeGreaterThan(0);

    const confirm = await request(app)
      .post(`${BANK_API}/pay/confirm`)
      .set('Authorization', `Bearer ${bankToken}`)
      .send({ invoice_id: invoiceId, payment_token: token });
    expect(confirm.status).toBe(200);
    expect(confirm.body.success).toBe(true);
    expect(confirm.body.plan).toBe('PRO');

    const invoice = await Invoice.findById(invoiceId);
    expect(invoice.status).toBe('PAID');

    const org = await Organization.findById(testOrgId);
    expect(org.plan).toBe('PRO');
    expect(org.billing_status).toBe('ACTIVE');
  });

  test('TC-5.8-05 Trang TPTPpay merchant render', async () => {
    const checkout = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'ENTERPRISE', action: 'upgrade' });
    const invoiceId = checkout.body.invoice._id;
    const url = new URL(checkout.body.checkout_url);
    const token = url.searchParams.get('token');

    const page = await request(app).get(`/tptp-pay/pay/${invoiceId}`).query({ token });
    expect(page.status).toBe(200);
    expect(page.text).toMatch(/TPTPpay/);
    expect(page.text).toMatch(/data:image\/png;base64/);
  });

  test('TC-5.8-06 Token đã dùng không confirm lại', async () => {
    const checkout = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'PRO', action: 'renew' });
    const invoiceId = checkout.body.invoice._id;
    const token = new URL(checkout.body.checkout_url).searchParams.get('token');

    await request(app)
      .post(`${BANK_API}/wallet/topup`)
      .set('Authorization', `Bearer ${bankToken}`)
      .send({ amount: 5000000 });

    const first = await request(app)
      .post(`${BANK_API}/pay/confirm`)
      .set('Authorization', `Bearer ${bankToken}`)
      .send({ invoice_id: invoiceId, payment_token: token });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`${BANK_API}/pay/confirm`)
      .set('Authorization', `Bearer ${bankToken}`)
      .send({ invoice_id: invoiceId, payment_token: token });
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  test('TC-5.8-07 Thiếu số dư → không kích hoạt gói', async () => {
    const checkout = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'ENTERPRISE', action: 'upgrade' });
    const invoiceId = checkout.body.invoice._id;
    const token = new URL(checkout.body.checkout_url).searchParams.get('token');

    const wallet = await BankWallet.findOne({ bank_user_id: bankUserId });
    wallet.balance = 0;
    await wallet.save();

    const confirm = await request(app)
      .post(`${BANK_API}/pay/confirm`)
      .set('Authorization', `Bearer ${bankToken}`)
      .send({ invoice_id: invoiceId, payment_token: token });
    expect(confirm.status).toBe(400);
    expect(confirm.body.code).toBe('INSUFFICIENT_BALANCE');

    const invoice = await Invoice.findById(invoiceId);
    expect(invoice.status).toBe('OPEN');
  });

  test('TC-5.8-08 Confirm đồng thời cùng event → chỉ trừ ví và ghi ledger 1 lần', async () => {
    await BankWallet.findOneAndUpdate(
      { bank_user_id: bankUserId },
      { $set: { balance: 5000000 } }
    );

    const checkout = await request(app)
      .post(`${BILLING_API}/checkout`)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ plan: 'PRO', action: 'renew' });
    expect(checkout.status).toBe(201);

    const invoiceId = checkout.body.invoice._id;
    const amount = Number(checkout.body.invoice.amount);
    const token = new URL(checkout.body.checkout_url).searchParams.get('token');
    const balanceBefore = Number(
      (await BankWallet.findOne({ bank_user_id: bankUserId }).lean()).balance
    );

    const sendConfirm = () => request(app)
      .post(`${BANK_API}/pay/confirm`)
      .set('Authorization', `Bearer ${bankToken}`)
      .send({ invoice_id: invoiceId, payment_token: token });

    const [first, second] = await Promise.all([sendConfirm(), sendConfirm()]);
    const statuses = [first.status, second.status];
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status >= 400)).toHaveLength(1);

    const walletAfter = await BankWallet.findOne({ bank_user_id: bankUserId }).lean();
    expect(Number(walletAfter.balance)).toBe(balanceBefore - amount);
    expect(await BankTransaction.countDocuments({
      invoice_id: invoiceId,
      type: 'PAYMENT'
    })).toBe(1);
    expect(await Payment.countDocuments({
      invoice_id: invoiceId,
      status: 'SUCCESS'
    })).toBe(1);
    expect((await Invoice.findById(invoiceId).lean()).status).toBe('PAID');
  });
});
