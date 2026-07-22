/**
 * C1 — Finance ledger Expense / Refund
 * npm run test:finance-ledger
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Expense = require('../../models/Expense');
const ExpenseLedger = require('../../models/ExpenseLedger');
const Payment = require('../../models/Payment');

const API = '/api/finance';

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('C1 — Finance ledger Expense / Refund', () => {
  let superToken;
  let superUserId;
  const expenseIds = [];
  const paymentIds = [];

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } });
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superUserId = superUser._id;
    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', Number(superUser.session_version) || 0);
  });

  afterAll(async () => {
    for (const id of expenseIds) {
      await ExpenseLedger.deleteMany({ expense_id: id });
      await Expense.findByIdAndDelete(id);
    }
    for (const id of paymentIds) {
      await Payment.deleteMany({
        $or: [{ _id: id }, { 'metadata.refund_of': String(id) }, { idempotency_key: `refund-${id}` }]
      });
    }
  });

  test('TC-L1 create expense → 1 ledger EXPENSE; create lần 2 idempotent key khác', async () => {
    const res = await request(app)
      .post(`${API}/expenses`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        expense_date: new Date().toISOString().slice(0, 10),
        category: 'DOMAIN',
        vendor: 'Ledger Test',
        amount: 120000,
        note: 'c1-ledger'
      });
    expect(res.status).toBe(201);
    const expenseId = res.body.expense._id;
    expenseIds.push(expenseId);
    expect(res.body.ledger_entry?.entry_type).toBe('EXPENSE');
    expect(Number(res.body.ledger_entry?.amount)).toBe(120000);

    const rows = await ExpenseLedger.find({ expense_id: expenseId }).lean();
    expect(rows.filter((r) => r.entry_type === 'EXPENSE')).toHaveLength(1);
  });

  test('TC-L2 reverse expense → REVERSAL âm + voided; reverse lại idempotent', async () => {
    const create = await request(app)
      .post(`${API}/expenses`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        expense_date: new Date().toISOString().slice(0, 10),
        category: 'OTHER',
        amount: 33000,
        note: 'c1-reverse'
      });
    expect(create.status).toBe(201);
    const expenseId = create.body.expense._id;
    expenseIds.push(expenseId);

    const rev1 = await request(app)
      .post(`${API}/expenses/${expenseId}/reverse`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ note: 'sai số' });
    expect(rev1.status).toBe(200);
    expect(rev1.body.ledger_entry?.entry_type).toBe('REVERSAL');
    expect(Number(rev1.body.ledger_entry?.amount)).toBe(-33000);
    expect(rev1.body.expense?.voided_at).toBeTruthy();

    const rev2 = await request(app)
      .post(`${API}/expenses/${expenseId}/reverse`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ note: 'again' });
    expect(rev2.status).toBe(200);
    expect(rev2.body.duplicated).toBe(true);

    const net = await ExpenseLedger.aggregate([
      { $match: { expense_id: new mongoose.Types.ObjectId(String(expenseId)) } },
      { $group: { _id: null, amount: { $sum: '$amount' } } }
    ]);
    expect(Number(net[0]?.amount) || 0).toBe(0);

    const listActive = await request(app)
      .get(`${API}/expenses`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(listActive.status).toBe(200);
    expect((listActive.body.expenses || []).some((e) => String(e._id) === String(expenseId))).toBe(
      false
    );
  });

  test('TC-L3 refund payment SUCCESS → dòng âm + status REFUNDED; gọi lại idempotent', async () => {
    const pay = await Payment.create({
      organization_id: null,
      amount: 99000,
      currency: 'VND',
      method: 'MANUAL',
      status: 'SUCCESS',
      paid_at: new Date(),
      note: 'c1-refund-src',
      idempotency_key: `c1-pay-${Date.now()}`,
      created_by: superUserId,
      metadata: { scope: 'personal', test: true }
    });
    paymentIds.push(pay._id);

    const r1 = await request(app)
      .post(`${API}/payments/${pay._id}/refund`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ note: 'hoàn test' });
    expect([200, 201]).toContain(r1.status);
    expect(Number(r1.body.refund?.amount)).toBe(-99000);
    expect(r1.body.payment?.status).toBe('REFUNDED');

    const r2 = await request(app)
      .post(`${API}/payments/${pay._id}/refund`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ note: 'hoàn lại' });
    expect(r2.status).toBe(200);
    expect(r2.body.duplicated).toBe(true);

    const refundLines = await Payment.find({
      $or: [
        { idempotency_key: `refund-${pay._id}` },
        { 'metadata.refund_of': String(pay._id) }
      ]
    }).lean();
    expect(refundLines).toHaveLength(1);
  });

  test('TC-L4 list expense-ledger + export CSV ledger', async () => {
    const list = await request(app)
      .get(`${API}/expense-ledger?limit=20`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.ledger)).toBe(true);

    const exp = await request(app)
      .get(`${API}/reports/export?kind=ledger`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(exp.status).toBe(200);
    expect(String(exp.headers['content-type'] || '')).toMatch(/csv|text/i);
    expect(String(exp.text || '')).toMatch(/entry_type/);
  });
});
