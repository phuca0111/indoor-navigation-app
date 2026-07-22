/**
 * B1 — integration: route nhạy cảm trả 403 PERMISSION_DENIED khi thiếu quyền
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');

function tokenFor(user, roleOverride) {
  return jwt.sign(
    {
      userId: String(user._id),
      role: roleOverride || user.role,
      sv: Number(user.session_version) || 0
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('B1 permission middleware on sensitive routes', () => {
  let superToken;
  let orgToken;
  let financeToken;
  let buildingToken;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } });
    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } });
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser);

    if (orgAdmin) orgToken = tokenFor(orgAdmin);

    let finance = await User.findOne({ role: 'FINANCE_ADMIN', is_active: { $ne: false } });
    if (!finance) {
      finance = await User.create({
        email: `finance_b1_${Date.now()}@test.local`,
        password: 'FinanceB1@12345',
        full_name: 'Finance B1',
        role: 'FINANCE_ADMIN',
        is_active: true
      });
    }
    financeToken = tokenFor(finance);

    let ba = await User.findOne({ role: 'BUILDING_ADMIN', is_active: { $ne: false } });
    if (ba) buildingToken = tokenFor(ba);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('GET /users/me trả permissions[]', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.permissions)).toBe(true);
    expect(res.body.permissions).toContain('*');
  });

  test('ORG_ADMIN → /api/finance/overview = 403 PERMISSION_DENIED', async () => {
    if (!orgToken) return;
    const res = await request(app)
      .get('/api/finance/overview')
      .set('Authorization', `Bearer ${orgToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
    expect(res.body.required).toEqual(expect.arrayContaining(['finance.access']));
  });

  test('FINANCE_ADMIN → /api/finance/overview = 200 hoặc 2xx', async () => {
    const res = await request(app)
      .get('/api/finance/overview')
      .set('Authorization', `Bearer ${financeToken}`);
    expect(res.status).toBeLessThan(400);
  });

  test('FINANCE_ADMIN → /api/website/pages = 403', async () => {
    const res = await request(app)
      .get('/api/website/pages')
      .set('Authorization', `Bearer ${financeToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('SUPER_ADMIN → /api/website/pages = 200', async () => {
    const res = await request(app)
      .get('/api/website/pages')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
  });

  test('ORG_ADMIN → /api/org-registrations = 403', async () => {
    if (!orgToken) return;
    const res = await request(app)
      .get('/api/org-registrations')
      .set('Authorization', `Bearer ${orgToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('BUILDING_ADMIN → /api/contact (admin list) = 403', async () => {
    if (!buildingToken) return;
    const res = await request(app)
      .get('/api/contact')
      .set('Authorization', `Bearer ${buildingToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('auth đồng bộ role từ DB — JWT giả SUPER bị hạ xuống role thật', async () => {
    if (!orgToken) return;
    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } });
    const forged = tokenFor(orgAdmin, 'SUPER_ADMIN');
    const res = await request(app)
      .get('/api/website/pages')
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });
});
