/**
 * Finance — báo cáo / cấu hình / role quản trị tài chính
 * npm run test:finance-reports
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../../server');
const User = require('../../models/User');
const FinanceSettings = require('../../models/FinanceSettings');
const Expense = require('../../models/Expense');

const API = '/api/finance';

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Finance — báo cáo / cấu hình / FINANCE_ADMIN', () => {
  let superToken;
  let orgToken;
  let financeToken;
  let financeUserId;
  const createdExpenseIds = [];

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } });
    const orgUser = await User.findOne({
      role: 'ORG_ADMIN',
      is_active: { $ne: false },
      organization_id: { $ne: null }
    });
    if (!superUser || !orgUser) throw new Error('Thiếu SUPER/ORG_ADMIN');
    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', Number(superUser.session_version) || 0);
    orgToken = tokenFor(orgUser._id, 'ORG_ADMIN', Number(orgUser.session_version) || 0);

    const email = 'finance_admin_s3@test.local';
    await User.deleteMany({ email });
    const hash = await bcrypt.hash('password123', 10);
    const fin = await User.create({
      email,
      password: hash,
      full_name: 'Finance Admin Test',
      role: 'FINANCE_ADMIN',
      organization_id: null,
      is_active: true
    });
    financeUserId = fin._id;
    financeToken = tokenFor(fin._id, 'FINANCE_ADMIN', Number(fin.session_version) || 0);
  });

  afterAll(async () => {
    for (const id of createdExpenseIds) {
      await Expense.findByIdAndDelete(id);
    }
    if (financeUserId) await User.findByIdAndDelete(financeUserId);
    await FinanceSettings.deleteMany({ key: 'default' });
  });

  test('TC-S3.1 ORG 403 report/settings; FINANCE_ADMIN 200 overview', async () => {
    const denied = await request(app)
      .get(API + '/reports/summary')
      .set('Authorization', `Bearer ${orgToken}`);
    expect(denied.status).toBe(403);

    const ok = await request(app)
      .get(API + '/overview')
      .set('Authorization', `Bearer ${financeToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.kpi).toBeDefined();
  });

  test('TC-S3.2 report summary + profit = thu - chi', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const create = await request(app)
      .post(API + '/expenses')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        expense_date: day,
        category: 'RENDER',
        vendor: 'S3 Test',
        amount: 12000,
        note: 's3'
      });
    expect(create.status).toBe(201);
    createdExpenseIds.push(create.body.expense._id);

    const res = await request(app)
      .get(API + `/reports/summary?from=${day}&to=${day}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    const s = res.body.summary;
    expect(s.profit).toBe(Number(s.revenue) - Number(s.expense));
    expect(Number(s.expense)).toBeGreaterThanOrEqual(12000);
  });

  test('TC-S3.3 export CSV invoices/expenses/payments', async () => {
    for (const kind of ['invoices', 'expenses', 'payments']) {
      const res = await request(app)
        .get(API + '/reports/export?kind=' + kind)
        .set('Authorization', `Bearer ${financeToken}`);
      expect(res.status).toBe(200);
      expect(String(res.headers['content-type'] || '')).toMatch(/csv/i);
      expect(res.text.length).toBeGreaterThan(5);
    }
  });

  test('TC-S3.4 settings get/put', async () => {
    const get = await request(app)
      .get(API + '/settings')
      .set('Authorization', `Bearer ${superToken}`);
    expect(get.status).toBe(200);
    expect(get.body.settings).toBeTruthy();

    const put = await request(app)
      .put(API + '/settings')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        company_name: 'Cong Ty Test S3',
        default_tax_percent: 8,
        invoice_prefix: 'HD'
      });
    expect(put.status).toBe(200);
    expect(put.body.settings.company_name).toBe('Cong Ty Test S3');
    expect(put.body.settings.default_tax_percent).toBe(8);
    expect(put.body.settings.invoice_prefix).toBe('HD');
  });
});
