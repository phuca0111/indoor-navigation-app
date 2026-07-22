const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const app = require('../../server');

describe('D5 — MARKETING_MANAGER RBAC', () => {
  let user;
  let token;

  beforeAll(async () => {
    require('dotenv').config();
    const uri =
      process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    user = await User.create({
      email: `marketing-${Date.now()}@test.local`,
      password: 'test-password-not-used',
      role: 'MARKETING_MANAGER',
      full_name: 'Marketing Test'
    });
    token = jwt.sign(
      { userId: String(user._id), role: user.role, sv: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await User.deleteOne({ _id: user?._id });
  });

  test('được quản lý CMS nhưng không có quyền Finance/Users', async () => {
    const cms = await request(app)
      .get('/api/website/articles')
      .set('Authorization', `Bearer ${token}`);
    const finance = await request(app)
      .get('/api/finance/overview')
      .set('Authorization', `Bearer ${token}`);
    const users = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);

    expect(cms.status).toBe(200);
    expect(finance.status).toBe(403);
    expect(users.status).toBe(403);
  });
});
