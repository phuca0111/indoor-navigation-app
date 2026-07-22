/**
 * Phase 7 — Enterprise Security (MVP + bậc B) — happy path + edge cases
 * npm run test:phase7
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = require('../../server');
const User = require('../../models/User');
const RefreshToken = require('../../models/RefreshToken');
const ActivityLog = require('../../models/ActivityLog');
const { hashToken } = require('../../services/passwordReset');
const { setTestTransporter, resetMailServiceCache } = require('../../services/mailService');

const API = '/api';

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 7 — Security MVP + edge cases', () => {
  let testUser;
  let inactiveUser;
  let createdUserIds = [];
  let currentPassword = 'OldPass1!';
  let prevSmtp;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    process.env.AUTH_RESET_TOKEN_IN_RESPONSE = 'true';
    // Isolates sandbox tests khỏi SMTP thật trong .env máy local
    prevSmtp = {
      host: process.env.SMTP_HOST,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      port: process.env.SMTP_PORT,
      from: process.env.SMTP_FROM
    };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    resetMailServiceCache();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN — không chạy Phase 7 test');

    const ts = Date.now();
    testUser = await User.create({
      email: `phase7.reset.${ts}@test.local`,
      password: await bcrypt.hash(currentPassword, 10),
      role: 'SUPER_ADMIN',
      full_name: 'Phase7 Test',
      is_active: true,
      organization_id: null
    });
    createdUserIds.push(testUser._id);

    inactiveUser = await User.create({
      email: `phase7.inactive.${ts}@test.local`,
      password: await bcrypt.hash('Inactive1!', 10),
      role: 'SUPER_ADMIN',
      full_name: 'Phase7 Inactive',
      is_active: false,
      organization_id: null
    });
    createdUserIds.push(inactiveUser._id);
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await RefreshToken.deleteMany({ user_id: id });
      await ActivityLog.deleteMany({ user_id: id });
      await User.findByIdAndDelete(id);
    }
    if (prevSmtp) {
      if (prevSmtp.host != null) process.env.SMTP_HOST = prevSmtp.host;
      if (prevSmtp.user != null) process.env.SMTP_USER = prevSmtp.user;
      if (prevSmtp.pass != null) process.env.SMTP_PASS = prevSmtp.pass;
      if (prevSmtp.port != null) process.env.SMTP_PORT = prevSmtp.port;
      if (prevSmtp.from != null) process.env.SMTP_FROM = prevSmtp.from;
    }
    resetMailServiceCache();
  });

  // —— Happy path ——
  test('TC-7.1 forgot-password email tồn tại → 200 + resetToken (dev)', async () => {
    const res = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: testUser.email });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/email tồn tại|hướng dẫn/i);
    expect(res.body.resetToken).toBeTruthy();
  });

  test('TC-7.2 forgot-password email không tồn tại → 200 generic (không leak)', async () => {
    const res = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: 'no-such-user-phase7@test.local' });
    expect(res.status).toBe(200);
    expect(res.body.resetToken).toBeUndefined();
  });

  test('TC-7.3 reset-password bằng token → đổi MK + revoke refresh cũ', async () => {
    const forgot = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: testUser.email });
    const raw = forgot.body.resetToken;
    expect(raw).toBeTruthy();

    await RefreshToken.create({
      user_id: testUser._id,
      token_hash: hashToken('fake-refresh-phase7'),
      expires_at: new Date(Date.now() + 86400000),
      is_revoked: false
    });

    const reset = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({
        token: raw,
        newPassword: 'NewPass1!',
        confirmPassword: 'NewPass1!'
      });
    expect(reset.status).toBe(200);
    currentPassword = 'NewPass1!';

    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: testUser.email, password: currentPassword });
    expect(login.status).toBe(200);

    const fake = await RefreshToken.findOne({ token_hash: hashToken('fake-refresh-phase7') }).lean();
    expect(fake.is_revoked).toBe(true);
  });

  test('TC-7.4 reset token sai → 400', async () => {
    const res = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({
        token: 'invalid-token-phase7',
        newPassword: 'NewPass1!',
        confirmPassword: 'NewPass1!'
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESET_TOKEN_INVALID');
  });

  test('TC-7.5 logout-all → revoke mọi refresh + LOGOUT_ALL', async () => {
    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: testUser.email, password: currentPassword });
    expect(login.status).toBe(200);

    await RefreshToken.create({
      user_id: testUser._id,
      token_hash: hashToken('second-device-phase7'),
      expires_at: new Date(Date.now() + 86400000),
      is_revoked: false
    });

    const res = await request(app)
      .post(`${API}/auth/logout-all`)
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.revoked_count).toBeGreaterThanOrEqual(1);

    const active = await RefreshToken.countDocuments({
      user_id: testUser._id,
      is_revoked: false
    });
    expect(active).toBe(0);
  });

  test('TC-7.6 logout-all không token → 401', async () => {
    const res = await request(app).post(`${API}/auth/logout-all`);
    expect(res.status).toBe(401);
  });

  // —— Edge cases ——
  test('TC-7.7 reset MK yếu → 400', async () => {
    const forgot = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: testUser.email });
    const res = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({
        token: forgot.body.resetToken,
        newPassword: 'weak',
        confirmPassword: 'weak'
      });
    expect(res.status).toBe(400);
    expect(res.body.errors?.length || 0).toBeGreaterThan(0);
  });

  test('TC-7.8 confirm password không khớp → 400', async () => {
    const forgot = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: testUser.email });
    const res = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({
        token: forgot.body.resetToken,
        newPassword: 'GoodPass1!',
        confirmPassword: 'GoodPass2!'
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/không khớp/i);
  });

  test('TC-7.9 forgot email sai format → 400', async () => {
    const res = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('TC-7.10 user inactive forgot → 200 generic, không cấp token', async () => {
    const res = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: inactiveUser.email });
    expect(res.status).toBe(200);
    expect(res.body.resetToken).toBeUndefined();
  });

  test('TC-7.11 reuse token sau khi reset thành công → 400', async () => {
    const forgot = await request(app)
      .post(`${API}/auth/forgot-password`)
      .send({ email: testUser.email });
    const raw = forgot.body.resetToken;
    expect(raw).toBeTruthy();

    const first = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({
        token: raw,
        newPassword: 'ReusePass1!',
        confirmPassword: 'ReusePass1!'
      });
    expect(first.status).toBe(200);
    currentPassword = 'ReusePass1!';

    const second = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({
        token: raw,
        newPassword: 'ReusePass2!',
        confirmPassword: 'ReusePass2!'
      });
    expect(second.status).toBe(400);
    expect(second.body.code).toBe('RESET_TOKEN_INVALID');
  });

  test('TC-7.12 token hết hạn theo TTL → 400', async () => {
    const raw = crypto.randomBytes(32).toString('hex');
    await User.updateOne(
      { _id: testUser._id },
      {
        $set: {
          password_reset_token_hash: hashToken(raw),
          password_reset_expires: new Date(Date.now() - 60 * 1000)
        }
      }
    );

    const res = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({
        token: raw,
        newPassword: 'Expired1!',
        confirmPassword: 'Expired1!'
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESET_TOKEN_INVALID');
  });

  test('TC-7.13 sau logout-all, refresh token cũ → 401', async () => {
    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: testUser.email, password: currentPassword });
    expect(login.status).toBe(200);
    const refreshToken = login.body.refreshToken;
    expect(refreshToken).toBeTruthy();

    const logoutAll = await request(app)
      .post(`${API}/auth/logout-all`)
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(logoutAll.status).toBe(200);

    const refresh = await request(app)
      .post(`${API}/auth/refresh`)
      .send({ refreshToken });
    expect(refresh.status).toBe(401);
  });

  test('TC-7.14 AUTH_RESET_TOKEN_IN_RESPONSE=false → không trả resetToken', async () => {
    const prev = process.env.AUTH_RESET_TOKEN_IN_RESPONSE;
    process.env.AUTH_RESET_TOKEN_IN_RESPONSE = 'false';
    try {
      const res = await request(app)
        .post(`${API}/auth/forgot-password`)
        .send({ email: testUser.email });
      expect(res.status).toBe(200);
      expect(res.body.resetToken).toBeUndefined();
    } finally {
      process.env.AUTH_RESET_TOKEN_IN_RESPONSE = prev || 'true';
    }
  });

  test('TC-7.15 reset thiếu token → 400 RESET_TOKEN_MISSING', async () => {
    const res = await request(app)
      .post(`${API}/auth/reset-password`)
      .send({
        newPassword: 'GoodPass1!',
        confirmPassword: 'GoodPass1!'
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESET_TOKEN_MISSING');
  });

  test('TC-7.16 logout-all → access JWT cũ bị SESSION_REVOKED', async () => {
    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: testUser.email, password: currentPassword });
    expect(login.status).toBe(200);
    const oldAccess = login.body.token;

    const meOk = await request(app)
      .get(`${API}/users/me`)
      .set('Authorization', `Bearer ${oldAccess}`);
    expect(meOk.status).toBe(200);

    const logoutAll = await request(app)
      .post(`${API}/auth/logout-all`)
      .set('Authorization', `Bearer ${oldAccess}`);
    expect(logoutAll.status).toBe(200);

    const meRevoked = await request(app)
      .get(`${API}/users/me`)
      .set('Authorization', `Bearer ${oldAccess}`);
    expect(meRevoked.status).toBe(401);
    expect(meRevoked.body.code).toBe('SESSION_REVOKED');

    const login2 = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: testUser.email, password: currentPassword });
    expect(login2.status).toBe(200);
    const meNew = await request(app)
      .get(`${API}/users/me`)
      .set('Authorization', `Bearer ${login2.body.token}`);
    expect(meNew.status).toBe(200);
  });

  test('TC-7.17 SMTP configured → gửi mail, không trả resetToken', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'mock-msg-1' });
    process.env.SMTP_HOST = 'smtp.test.local';
    process.env.SMTP_USER = 'test@local';
    process.env.SMTP_PASS = 'secret';
    process.env.PUBLIC_BASE_URL = 'http://localhost:5000';
    setTestTransporter({ sendMail });

    try {
      const res = await request(app)
        .post(`${API}/auth/forgot-password`)
        .send({ email: testUser.email });
      expect(res.status).toBe(200);
      expect(res.body.emailSent).toBe(true);
      expect(res.body.resetToken).toBeUndefined();
      expect(sendMail).toHaveBeenCalledTimes(1);
      const mailArg = sendMail.mock.calls[0][0];
      expect(mailArg.to).toBe(testUser.email);
      expect(mailArg.html).toMatch(/reset-password\.html\?token=/);
    } finally {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      setTestTransporter(null);
      resetMailServiceCache();
    }
  });
});
