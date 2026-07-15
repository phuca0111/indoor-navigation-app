/**
 * Phase 9 — Finance Dashboard + Expense
 * npm run test:phase9
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Expense = require('../../models/Expense');

const API = '/api/finance';

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 9 — Finance Dashboard + Expense', () => {
  let superToken;
  let orgToken;
  let createdExpenseIds = [];

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
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    if (!orgUser) throw new Error('Thiếu ORG_ADMIN');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', Number(superUser.session_version) || 0);
    orgToken = tokenFor(orgUser._id, 'ORG_ADMIN', Number(orgUser.session_version) || 0);
  });

  afterAll(async () => {
    for (const id of createdExpenseIds) {
      await Expense.findByIdAndDelete(id);
    }
  });

  test('TC-9.1 ORG_ADMIN bị 403 overview / expenses', async () => {
    const ov = await request(app)
      .get(`${API}/overview`)
      .set('Authorization', `Bearer ${orgToken}`);
    expect(ov.status).toBe(403);

    const ex = await request(app)
      .get(`${API}/expenses`)
      .set('Authorization', `Bearer ${orgToken}`);
    expect(ex.status).toBe(403);

    const create = await request(app)
      .post(`${API}/expenses`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ amount: 1000, category: 'RENDER' });
    expect(create.status).toBe(403);
  });

  test('TC-9.2 Super overview có KPI thu/chi/profit/org', async () => {
    const res = await request(app)
      .get(`${API}/overview`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.kpi).toBeDefined();
    expect(res.body.kpi).toHaveProperty('revenue_today');
    expect(res.body.kpi).toHaveProperty('revenue_month');
    expect(res.body.kpi).toHaveProperty('revenue_year');
    expect(res.body.kpi).toHaveProperty('expense_month');
    expect(res.body.kpi).toHaveProperty('profit_month');
    expect(res.body.kpi).toHaveProperty('orgs_total');
    expect(res.body.kpi).toHaveProperty('expense_day');
    expect(res.body.kpi).toHaveProperty('profit_day');
    expect(res.body).toHaveProperty('as_of_date');
    expect(res.body.charts).toHaveProperty('revenue_by_month');
    expect(res.body.charts).toHaveProperty('revenue_by_plan');
  });

  test('TC-9.2b overview?date= trả Thu/Chi/Lãi ngày', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`${API}/overview?date=${day}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.as_of_date).toBe(day);
    expect(typeof res.body.kpi.revenue_day).toBe('number');
    expect(typeof res.body.kpi.expense_day).toBe('number');
    expect(res.body.kpi.profit_day).toBe(
      Number(res.body.kpi.revenue_day) - Number(res.body.kpi.expense_day)
    );
  });

  test('TC-9.3 CRUD expense + profit đổi theo chi', async () => {
    const before = await request(app)
      .get(`${API}/overview`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(before.status).toBe(200);
    const profitBefore = Number(before.body.kpi.profit_month);

    const create = await request(app)
      .post(`${API}/expenses`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        expense_date: new Date().toISOString(),
        category: 'RENDER',
        vendor: 'Render Test P9',
        amount: 50000,
        note: 'phase9 test'
      });
    expect(create.status).toBe(201);
    const expenseId = create.body.expense?._id;
    expect(expenseId).toBeTruthy();
    createdExpenseIds.push(expenseId);

    const after = await request(app)
      .get(`${API}/overview`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(after.status).toBe(200);
    expect(Number(after.body.kpi.expense_month)).toBeGreaterThanOrEqual(
      Number(before.body.kpi.expense_month) + 50000
    );
    expect(Number(after.body.kpi.profit_month)).toBe(profitBefore - 50000);

    const list = await request(app)
      .get(`${API}/expenses`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(list.status).toBe(200);
    expect((list.body.expenses || []).some((e) => String(e._id) === String(expenseId))).toBe(true);

    const patch = await request(app)
      .patch(`${API}/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ amount: 60000, note: 'updated' });
    expect(patch.status).toBe(200);
    expect(patch.body.expense.amount).toBe(60000);

    const del = await request(app)
      .delete(`${API}/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(del.status).toBe(200);
    createdExpenseIds = createdExpenseIds.filter((id) => String(id) !== String(expenseId));
  });

  test('TC-9.4 list orgs billing filter', async () => {
    const res = await request(app)
      .get(`${API}/orgs`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.organizations)).toBe(true);
    expect(res.body.counts).toBeDefined();

    const free = await request(app)
      .get(`${API}/orgs?status=FREE`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(free.status).toBe(200);
    (free.body.organizations || []).forEach((o) => {
      expect(String(o.plan || 'FREE').toUpperCase()).toBe('FREE');
    });
  });
});
