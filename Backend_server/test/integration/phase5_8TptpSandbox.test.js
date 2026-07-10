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
const Invoice = require('../../models/Invoice');
const BankUser = require('../../models/BankUser');
const BankWallet = require('../../models/BankWallet');

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

    const reg = await request(app)
      .post(`${BANK_API}/auth/register`)
      .send({ email: testEmail, password: 'Test1234!', full_name: 'TPTP Tester' });
    expect(reg.status).toBe(201);
    bankToken = reg.body.token;
    bankUserId = reg.body.user.id;
  });

  afterAll(async () => {
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
    expect(resolve.body.amount).toBe(990000);

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
});
