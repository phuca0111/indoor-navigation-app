/**
 * Phase 4.1 — Admin reset password
 * Chạy: npm run test:phase4-1-reset-pwd
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');

function tokenFor(userId, role) {
  return jwt.sign(
    { userId: String(userId), role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 4.1 — Admin reset password', () => {
  let superToken;
  let orgAdminUser;
  let testPassword = 'TestReset123';

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser._id, 'SUPER_ADMIN');

    orgAdminUser = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    if (!orgAdminUser) throw new Error('Thiếu ORG_ADMIN');
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-4.1-reset-01 SUPER_ADMIN reset ORG_ADMIN → 200 + temporary_password', async () => {
    const res = await request(app)
      .put(`/api/users/${orgAdminUser._id}/reset-password`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ newPassword: testPassword });
    expect(res.status).toBe(200);
    expect(res.body.temporary_password).toBe(testPassword);

    const updated = await User.findById(orgAdminUser._id).lean();
    const ok = await bcrypt.compare(testPassword, updated.password);
    expect(ok).toBe(true);
  });

  test('TC-4.1-reset-02 generate random password → 200', async () => {
    const res = await request(app)
      .put(`/api/users/${orgAdminUser._id}/reset-password`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ generate: true });
    expect(res.status).toBe(200);
    expect(res.body.temporary_password).toBeTruthy();
    expect(String(res.body.temporary_password).length).toBeGreaterThanOrEqual(8);
  });
});
