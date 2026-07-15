/**
 * Finance — gói / hóa đơn / sổ thu tiền
 * npm run test:finance-billing
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const Invoice = require('../../models/Invoice');
const Plan = require('../../models/Plan');
const Payment = require('../../models/Payment');
const { ensureDefaultPlans, getPlanLimits, getPlanPrice } = require('../../services/planCatalog');
const { markInvoicePaid } = require('../../services/subscriptionLifecycle');
const { setTestTransporter, resetMailServiceCache } = require('../../services/mailService');

const API = '/api/finance';

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Finance — billing (gói / hóa đơn / sổ thu)', () => {
  let superToken;
  let orgToken;
  let orgId;
  const createdInvoiceIds = [];
  const createdPlanIds = [];

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
    orgId = String(orgUser.organization_id);

    setTestTransporter({
      sendMail: async () => ({ messageId: 'test-invoice-mail' })
    });
    await ensureDefaultPlans();
  });

  afterAll(async () => {
    for (const id of createdInvoiceIds) {
      await Invoice.findByIdAndDelete(id);
      await Payment.deleteMany({ invoice_id: id });
    }
    for (const id of createdPlanIds) {
      await Plan.findByIdAndDelete(id);
    }
    setTestTransporter(null);
    resetMailServiceCache();
  });

  test('TC-S2.1 ORG bị 403 plans/invoices/payments', async () => {
    for (const path of ['/plans', '/invoices', '/payments']) {
      const res = await request(app)
        .get(API + path)
        .set('Authorization', `Bearer ${orgToken}`);
      expect(res.status).toBe(403);
    }
  });

  test('TC-S2.2 seed plans + quota/price từ catalog', async () => {
    const res = await request(app)
      .get(API + '/plans')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect((res.body.plans || []).length).toBeGreaterThanOrEqual(3);
    const codes = res.body.plans.map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['FREE', 'PRO', 'ENTERPRISE']));

    const limits = getPlanLimits('PRO');
    expect(limits.maxBuildings).toBe(20);
    expect(getPlanPrice('PRO')).toBeGreaterThan(0);
  });

  test('TC-S2.3 update plan price reflects getPlanPrice', async () => {
    const list = await request(app)
      .get(API + '/plans')
      .set('Authorization', `Bearer ${superToken}`);
    const pro = (list.body.plans || []).find((p) => p.code === 'PRO');
    expect(pro).toBeTruthy();
    const prev = pro.price_vnd;

    const patch = await request(app)
      .patch(API + '/plans/' + pro._id)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ price_vnd: prev + 1000 });
    expect(patch.status).toBe(200);
    expect(getPlanPrice('PRO')).toBe(prev + 1000);

    await request(app)
      .patch(API + '/plans/' + pro._id)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ price_vnd: prev });
  });

  test('TC-S2.4 create invoice → edit → void; không void PAID', async () => {
    const create = await request(app)
      .post(API + '/invoices')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        organization_id: orgId,
        plan: 'PRO',
        amount: 123000,
        tax_amount: 1000,
        discount_amount: 500
      });
    expect(create.status).toBe(201);
    const inv = create.body.invoice;
    createdInvoiceIds.push(inv._id);
    expect(inv.status).toBe('OPEN');
    expect(inv.total).toBe(123000 - 500 + 1000);

    const patch = await request(app)
      .patch(API + '/invoices/' + inv._id)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ amount: 200000, note: 'edited' });
    expect(patch.status).toBe(200);
    expect(patch.body.invoice.amount).toBe(200000);

    const pdf = await request(app)
      .get(API + '/invoices/' + inv._id + '/pdf')
      .set('Authorization', `Bearer ${superToken}`);
    expect(pdf.status).toBe(200);
    expect(pdf.text).toMatch(/Hóa đơn/);

    const email = await request(app)
      .post(API + '/invoices/' + inv._id + '/email')
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    // SMTP thật hoặc sandbox skip đều OK
    expect(email.status).toBe(200);
    expect(email.body).toMatchObject({ to: expect.any(String) });

    const voidRes = await request(app)
      .post(API + '/invoices/' + inv._id + '/void')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ reason: 'test' });
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.invoice.status).toBe('VOID');
  });

  test('TC-S2.5 mark paid → payment ledger SUCCESS + filter', async () => {
    const create = await request(app)
      .post(API + '/invoices')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ organization_id: orgId, plan: 'PRO', amount: 555000 });
    expect(create.status).toBe(201);
    const invDoc = await Invoice.findById(create.body.invoice._id);
    createdInvoiceIds.push(invDoc._id);

    await markInvoicePaid(invDoc, {
      externalRef: 'TEST-REF-S2',
      provider: 'TPTP'
    });

    const pay = await request(app)
      .get(API + '/payments?status=SUCCESS')
      .set('Authorization', `Bearer ${superToken}`);
    expect(pay.status).toBe(200);
    const hit = (pay.body.payments || []).find(
      (p) => String(p.invoice_id?._id || p.invoice_id) === String(invDoc._id)
    );
    expect(hit).toBeTruthy();
    expect(hit.method).toBe('TPTP');
    expect(hit.amount).toBe(555000);

    const voidPaid = await request(app)
      .post(API + '/invoices/' + invDoc._id + '/void')
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(voidPaid.status).toBe(400);
  });

  test('TC-S2.6 create custom plan code', async () => {
    const code = 'STARTER';
    await Plan.deleteMany({ code });
    const res = await request(app)
      .post(API + '/plans')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        code,
        name: 'Starter Test',
        price_vnd: 100000,
        max_buildings: 3,
        max_users: 10
      });
    expect(res.status).toBe(201);
    createdPlanIds.push(res.body.plan._id);
    expect(getPlanLimits('STARTER').maxBuildings).toBe(3);
  });

  test('TC-S2.7 ORG 403 trên POST/PATCH plans & invoices mutating', async () => {
    const cases = [
      ['post', '/plans', { code: 'GOVERNMENT', name: 'Gov' }],
      ['patch', '/plans/' + new mongoose.Types.ObjectId(), { price_vnd: 1 }],
      ['post', '/invoices', { organization_id: orgId, plan: 'PRO', amount: 1 }],
      ['patch', '/invoices/' + new mongoose.Types.ObjectId(), { amount: 1 }],
      ['post', '/invoices/' + new mongoose.Types.ObjectId() + '/void', {}],
      ['get', '/invoices/' + new mongoose.Types.ObjectId() + '/pdf', null],
      ['post', '/invoices/' + new mongoose.Types.ObjectId() + '/email', {}]
    ];
    for (const [method, path, body] of cases) {
      let req = request(app)[method](API + path).set('Authorization', `Bearer ${orgToken}`);
      if (body !== null) req = req.send(body);
      const res = await req;
      expect(res.status).toBe(403);
    }
  });

  test('TC-S2.8 plan: thiếu code / trùng code / 404 / deactivate + active filter', async () => {
    const missing = await request(app)
      .post(API + '/plans')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'NoCode' });
    expect(missing.status).toBe(400);

    const dup = await request(app)
      .post(API + '/plans')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ code: 'FREE', name: 'Dup Free', price_vnd: 0 });
    expect(dup.status).toBe(400);
    expect(dup.body.message).toMatch(/đã tồn tại/i);

    const notFound = await request(app)
      .patch(API + '/plans/' + new mongoose.Types.ObjectId())
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'X' });
    expect(notFound.status).toBe(404);

    await Plan.deleteMany({ code: 'GOVERNMENT' });
    const created = await request(app)
      .post(API + '/plans')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        code: 'GOVERNMENT',
        name: 'Gov Test',
        price_vnd: 0,
        max_buildings: null,
        max_users: null
      });
    expect(created.status).toBe(201);
    createdPlanIds.push(created.body.plan._id);

    const off = await request(app)
      .patch(API + '/plans/' + created.body.plan._id)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ is_active: false });
    expect(off.status).toBe(200);
    expect(off.body.plan.is_active).toBe(false);

    const activeOnly = await request(app)
      .get(API + '/plans?active=true')
      .set('Authorization', `Bearer ${superToken}`);
    expect(activeOnly.status).toBe(200);
    const codes = (activeOnly.body.plans || []).map((p) => p.code);
    expect(codes).not.toContain('GOVERNMENT');

    const all = await request(app)
      .get(API + '/plans')
      .set('Authorization', `Bearer ${superToken}`);
    expect((all.body.plans || []).some((p) => p.code === 'GOVERNMENT')).toBe(true);
  });

  test('TC-S2.9 invoice: thiếu org / org ảo / amount âm / lọc / không sửa VOID / void idempotent', async () => {
    const noOrg = await request(app)
      .post(API + '/invoices')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ plan: 'PRO', amount: 1000 });
    expect(noOrg.status).toBe(400);

    const badOrg = await request(app)
      .post(API + '/invoices')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        organization_id: String(new mongoose.Types.ObjectId()),
        plan: 'PRO',
        amount: 1000
      });
    expect(badOrg.status).toBe(404);

    const neg = await request(app)
      .post(API + '/invoices')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ organization_id: orgId, plan: 'PRO', amount: -10 });
    expect(neg.status).toBe(400);

    const create = await request(app)
      .post(API + '/invoices')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ organization_id: orgId, plan: 'PRO', amount: 777000 });
    expect(create.status).toBe(201);
    const invId = create.body.invoice._id;
    createdInvoiceIds.push(invId);

    const byOrg = await request(app)
      .get(API + '/invoices?organization_id=' + orgId + '&status=OPEN')
      .set('Authorization', `Bearer ${superToken}`);
    expect(byOrg.status).toBe(200);
    expect((byOrg.body.invoices || []).some((i) => String(i._id) === String(invId))).toBe(true);

    const void1 = await request(app)
      .post(API + '/invoices/' + invId + '/void')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ reason: 'edge' });
    expect(void1.status).toBe(200);
    expect(void1.body.invoice.status).toBe('VOID');

    const void2 = await request(app)
      .post(API + '/invoices/' + invId + '/void')
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(void2.status).toBe(200);
    expect(void2.body.invoice.status).toBe('VOID');

    const editVoid = await request(app)
      .patch(API + '/invoices/' + invId)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ amount: 1 });
    expect(editVoid.status).toBe(400);
    expect(editVoid.body.code).toBe('INVOICE_NOT_EDITABLE');

    const missingInv = await request(app)
      .get(API + '/invoices/' + new mongoose.Types.ObjectId() + '/pdf')
      .set('Authorization', `Bearer ${superToken}`);
    expect(missingInv.status).toBe(404);
  });

  test('TC-S2.10 payment filter method/org + mark paid idempotent (1 ledger)', async () => {
    const create = await request(app)
      .post(API + '/invoices')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ organization_id: orgId, plan: 'PRO', amount: 888000 });
    expect(create.status).toBe(201);
    const invDoc = await Invoice.findById(create.body.invoice._id);
    createdInvoiceIds.push(invDoc._id);

    await markInvoicePaid(invDoc, { externalRef: 'IDEM-S2', provider: 'VNPAY' });
    await markInvoicePaid(invDoc, { externalRef: 'IDEM-S2', provider: 'VNPAY' });

    const count = await Payment.countDocuments({ invoice_id: invDoc._id });
    expect(count).toBe(1);

    const byMethod = await request(app)
      .get(API + '/payments?method=VNPAY&organization_id=' + orgId)
      .set('Authorization', `Bearer ${superToken}`);
    expect(byMethod.status).toBe(200);
    const hit = (byMethod.body.payments || []).find(
      (p) => String(p.invoice_id?._id || p.invoice_id) === String(invDoc._id)
    );
    expect(hit).toBeTruthy();
    expect(hit.method).toBe('VNPAY');
    expect(hit.status).toBe('SUCCESS');
  });

  test('TC-S2.11 email: SMTP skip khi chưa cấu hình; gửi OK với mock', async () => {
    const create = await request(app)
      .post(API + '/invoices')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ organization_id: orgId, plan: 'PRO', amount: 10000 });
    expect(create.status).toBe(201);
    const invId = create.body.invoice._id;
    createdInvoiceIds.push(invId);

    const saved = {
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS
    };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    setTestTransporter(null);
    resetMailServiceCache();

    const skipped = await request(app)
      .post(API + '/invoices/' + invId + '/email')
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(skipped.status).toBe(200);
    expect(skipped.body.skipped).toBe(true);

    if (saved.SMTP_HOST) process.env.SMTP_HOST = saved.SMTP_HOST;
    if (saved.SMTP_USER) process.env.SMTP_USER = saved.SMTP_USER;
    if (saved.SMTP_PASS) process.env.SMTP_PASS = saved.SMTP_PASS;
    setTestTransporter({
      sendMail: async () => ({ messageId: 'test-invoice-mail-2' })
    });

    const sent = await request(app)
      .post(API + '/invoices/' + invId + '/email')
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(sent.status).toBe(200);
    expect(sent.body.skipped).toBe(false);
    expect(sent.body.to).toBeTruthy();
  });

  test('TC-S2.12 mark-paid OPEN → PAID + ledger; ORG 403; VOID không thu', async () => {
    const create = await request(app)
      .post(API + '/invoices')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ organization_id: orgId, plan: 'PRO', amount: 333000 });
    expect(create.status).toBe(201);
    const invId = create.body.invoice._id;
    createdInvoiceIds.push(invId);

    const denied = await request(app)
      .post(API + '/invoices/' + invId + '/mark-paid')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ method: 'BANK' });
    expect(denied.status).toBe(403);

    const paid = await request(app)
      .post(API + '/invoices/' + invId + '/mark-paid')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ method: 'BANK', external_ref: 'UI-MARK-PAID' });
    expect(paid.status).toBe(200);
    expect(paid.body.invoice.status).toBe('PAID');
    expect(paid.body.already_paid).toBe(false);

    const again = await request(app)
      .post(API + '/invoices/' + invId + '/mark-paid')
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(again.status).toBe(200);
    expect(again.body.already_paid).toBe(true);

    const count = await Payment.countDocuments({ invoice_id: invId });
    expect(count).toBe(1);

    const ledger = await request(app)
      .get(API + '/payments?invoice_id=' + invId)
      .set('Authorization', `Bearer ${superToken}`);
    expect(ledger.status).toBe(200);
    expect((ledger.body.payments || []).some((p) => p.method === 'BANK')).toBe(true);

    const voidCreate = await request(app)
      .post(API + '/invoices')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ organization_id: orgId, plan: 'PRO', amount: 1000 });
    expect(voidCreate.status).toBe(201);
    createdInvoiceIds.push(voidCreate.body.invoice._id);
    await request(app)
      .post(API + '/invoices/' + voidCreate.body.invoice._id + '/void')
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    const collectVoid = await request(app)
      .post(API + '/invoices/' + voidCreate.body.invoice._id + '/mark-paid')
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(collectVoid.status).toBe(400);
    expect(collectVoid.body.code).toBe('INVOICE_NOT_COLLECTIBLE');
  });
});
