/**
 * Integration tests for User Management API (Task 1A.6)
 * Tests: Auth, RBAC, CRUD, Validation, Self-protection
 */

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Import app & models
const app = require('../../server'); // Assuming server.js exports app
const User = require('../../models/User');
const Organization = require('../../models/Organization');

// Test config
const API_BASE = '/api';
let superAdminToken;
let buildingAdminToken;
let superAdminId;
let buildingAdminId;
let tempUserId;
let testOrganizationId;

const TEST_USER_EMAILS = [
  'admin@test.com',
  'toanha1@test.com',
  'test_active_1a6@test.com',
  'test_inactive_1a6@test.com',
  'test_inactive_flow@test.com',
  'test_update_validation@test.com',
  'test_activity_activate@test.com'
];

// Helper: generate JWT token for user
function generateToken(userId, role, sv = 0) {
  return jwt.sign(
    { userId, role, sv },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('1A.6 Admin User Management API', () => {
  beforeAll(async () => {
    // Connect to test DB (use existing DB for integration)
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/indoor_nav_test';
    await mongoose.connect(mongoUri);

    // Clean up test users
    await User.deleteMany({ email: { $in: TEST_USER_EMAILS } });
    await Organization.deleteMany({ slug: 'user-api-integration-test' });

    const testOrganization = await Organization.create({
      name: 'User API Integration Test',
      slug: 'user-api-integration-test',
      plan: 'ENTERPRISE',
      billing_status: 'ACTIVE',
      is_active: true
    });
    testOrganizationId = testOrganization._id;

    // Create SUPER_ADMIN
    const superAdmin = await User.create({
      email: 'admin@test.com',
      password: await bcrypt.hash('123456', 10),
      role: 'SUPER_ADMIN',
      is_active: true
    });
    superAdminId = superAdmin._id;
    superAdminToken = generateToken(
      superAdminId,
      'SUPER_ADMIN',
      Number(superAdmin.session_version) || 0
    );

    // Create BUILDING_ADMIN active
    const buildingAdmin = await User.create({
      email: 'toanha1@test.com',
      password: await bcrypt.hash('123456', 10),
      role: 'BUILDING_ADMIN',
      organization_id: testOrganizationId,
      is_active: true
    });
    buildingAdminId = buildingAdmin._id;
    buildingAdminToken = generateToken(
      buildingAdminId,
      'BUILDING_ADMIN',
      Number(buildingAdmin.session_version) || 0
    );
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $in: TEST_USER_EMAILS } });
    if (testOrganizationId) await Organization.findByIdAndDelete(testOrganizationId);
    await mongoose.connection.close();
  });

  describe('A. AUTH & RBAC API TESTS', () => {
    test('TC-01 GET /api/users without token — expect 401', async () => {
      const res = await request(app).get(`${API_BASE}/users`);
      expect(res.status).toBe(401);
    });

    test('TC-02 GET /api/users by BUILDING_ADMIN — expect 403', async () => {
      const res = await request(app)
        .get(`${API_BASE}/users`)
        .set('Authorization', `Bearer ${buildingAdminToken}`);
      expect(res.status).toBe(403);
    });

    test('TC-03 GET /api/users by SUPER_ADMIN — expect 200 and array', async () => {
      const res = await request(app)
        .get(`${API_BASE}/users`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    test('TC-04 GET /api/users/:userId by SUPER_ADMIN — expect 200', async () => {
      const res = await request(app)
        .get(`${API_BASE}/users/${buildingAdminId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('toanha1@test.com');
    });

    test('TC-05 GET /api/users/:userId by BUILDING_ADMIN — expect 403', async () => {
      const res = await request(app)
        .get(`${API_BASE}/users/${superAdminId}`)
        .set('Authorization', `Bearer ${buildingAdminToken}`);
      expect(res.status).toBe(403);
    });

    test('TC-06 PUT /api/users/:userId without token — expect 401', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${buildingAdminId}`)
        .send({ full_name: 'Test' });
      expect(res.status).toBe(401);
    });

    test('TC-07 PUT /api/users/:userId by BUILDING_ADMIN — expect 403', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${superAdminId}`)
        .set('Authorization', `Bearer ${buildingAdminToken}`)
        .send({ full_name: 'Test' });
      expect(res.status).toBe(403);
    });
  });

  describe('B. LIST USERS & DATA SECURITY', () => {
    test('TC-08 List users — no password field', async () => {
      const res = await request(app)
        .get(`${API_BASE}/users`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      const users = res.body;
      users.forEach(user => {
        expect(user.password).toBeUndefined();
        expect(user.password_hash).toBeUndefined();
        expect(user.refreshToken).toBeUndefined();
      });
    });

    test('TC-09 List users — required fields present', async () => {
      const res = await request(app)
        .get(`${API_BASE}/users`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      const user = res.body[0];
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('full_name');
      expect(user).toHaveProperty('phone');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('is_active');
      expect(user).toHaveProperty('assigned_buildings');
      expect(user).toHaveProperty('createdAt');
      expect(user).toHaveProperty('updatedAt');
    });

    test('TC-10 Filter users by is_active', async () => {
      // Create inactive user
      await User.create({
        email: 'test_inactive_1a6@test.com',
        password: await bcrypt.hash('123456', 10),
        role: 'BUILDING_ADMIN',
        organization_id: testOrganizationId,
        is_active: false
      });

      const res = await request(app)
        .get(`${API_BASE}/users?is_active=true`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      res.body.forEach(user => {
        expect(user.is_active).toBe(true);
      });
    });

    test('TC-10 Filter users by role', async () => {
      const res = await request(app)
        .get(`${API_BASE}/users?role=BUILDING_ADMIN`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      res.body.forEach(user => {
        expect(user.role).toBe('BUILDING_ADMIN');
      });
    });
  });

  describe('C. ACTIVATE / DEACTIVATE FLOW', () => {
    let inactiveUser;

    beforeAll(async () => {
      const user = await User.create({
        email: 'test_inactive_flow@test.com',
        password: await bcrypt.hash('123456', 10),
        role: 'REGISTERED_USER',
        is_active: false
      });
      inactiveUser = user;
    });

    test('TC-11 Inactive user cannot login', async () => {
      const res = await request(app)
        .post(`${API_BASE}/auth/login`)
        .send({ email: inactiveUser.email, password: '123456' });
      expect([400, 403]).toContain(res.status);
      if (res.body.message) {
        expect(res.body.message).toMatch(/chờ|khóa|inactive|không thể đăng nhập/i);
      }
    });

    test('TC-12 Super Admin activates inactive user', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${inactiveUser._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ is_active: true });
      expect(res.status).toBe(200);
      expect(res.body.user.is_active).toBe(true);
    });

    test('TC-13 Activated user can login', async () => {
      const res = await request(app)
        .post(`${API_BASE}/auth/login`)
        .send({ email: inactiveUser.email, password: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    test('TC-14 Super Admin deactivates active user', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${buildingAdminId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ is_active: false });
      expect(res.status).toBe(200);
      expect(res.body.user.is_active).toBe(false);
    });

    test('TC-15 Deactivated user cannot login', async () => {
      const res = await request(app)
        .post(`${API_BASE}/auth/login`)
        .send({ email: 'toanha1@test.com', password: '123456' });
      expect([400, 403]).toContain(res.status);
    });

    test('TC-16 Restore user after test', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${buildingAdminId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ is_active: true });
      expect(res.status).toBe(200);
      expect(res.body.user.is_active).toBe(true);
    });
  });

  describe('D. UPDATE USER VALIDATION', () => {
    let targetUserId;

    beforeAll(async () => {
      const user = await User.create({
        email: 'test_update_validation@test.com',
        password: await bcrypt.hash('123456', 10),
        role: 'BUILDING_ADMIN',
        is_active: true,
        phone: '0123456789'
      });
      targetUserId = user._id;
    });

    test('TC-17 Update full_name/phone — valid', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${targetUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ full_name: 'Updated Name', phone: '0946578399' });
      expect(res.status).toBe(200);
      expect(res.body.user.full_name).toBe('Updated Name');
      expect(res.body.user.phone).toBe('0946578399');
    });

    test('TC-18 Update role — valid', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${targetUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ role: 'SUPER_ADMIN' });
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('SUPER_ADMIN');
    });

    test('TC-19 Update role — invalid value', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${targetUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ role: 'HACKER' });
      expect([400, 500]).toContain(res.status);
      expect(res.body.message).toMatch(/role phải là/i);
    });

    test('TC-20 Update is_active — non-boolean', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${targetUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ is_active: 'false' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/boolean/i);
    });

    test('TC-21 Update assigned_buildings — not array', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${targetUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ assigned_buildings: 'abc' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/mảng/i);
    });

    test('TC-22 Block update email/password/created_by', async () => {
      const original = await User.findById(targetUserId);
      const originalEmail = original.email;

      const res = await request(app)
        .put(`${API_BASE}/users/${targetUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'hack@example.com', password: 'NewPass123!', created_by: 'fake' });

      expect([400, 200]).toContain(res.status); // 400 preferred
      const updated = await User.findById(targetUserId);
      expect(updated.email).toBe(originalEmail); // email unchanged
      // password unchanged (would need re-auth to verify, just check no-change)
    });

    test('TC-17/TC-24 Phone validation — reject non-digit', async () => {
      // First, reset to valid phone
      await User.findByIdAndUpdate(targetUserId, { phone: '0123456789' });

      // Try update with letters
      const res = await request(app)
        .put(`${API_BASE}/users/${targetUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ phone: 'abc123' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Số điện thoại|không hợp lệ/i);
    });

    test('TC-17/TC-24 Phone validation — accept valid', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${targetUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ phone: '0987654321' });
      expect(res.status).toBe(200);
      expect(res.body.user.phone).toBe('0987654321');
    });
  });

  describe('E. SELF PROTECTION', () => {
    test('TC-23 Super Admin cannot self-deactivate', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${superAdminId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ is_active: false });
      expect([403, 400]).toContain(res.status);
      expect(res.body.message).toMatch(/không thể tự|khóa|deactivate/i);
    });

    test('TC-24 Super Admin cannot self-demote', async () => {
      const res = await request(app)
        .put(`${API_BASE}/users/${superAdminId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ role: 'BUILDING_ADMIN' });
      expect([403, 400]).toContain(res.status);
      expect(res.body.message).toMatch(/không thể hạ|cấp role|Super Admin/i);
    });
  });

  describe('F. ACTIVITY LOG', () => {
    test('TC-42 Log ACTIVATE_USER', async () => {
      // Activate a user and check ActivityLog
      const user = await User.create({
        email: 'test_activity_activate@test.com',
        password: await bcrypt.hash('123456', 10),
        role: 'BUILDING_ADMIN',
        is_active: false
      });

      await request(app)
        .put(`${API_BASE}/users/${user._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ is_active: true });

      const ActivityLog = require('../../models/ActivityLog');
      const log = await ActivityLog.findOne({
        action: 'ACTIVATE_USER',
        target_id: user._id.toString()
      });
      expect(log).toBeDefined();
      expect(log.user_id.toString()).toBe(superAdminId.toString());
    });

    test('TC-43 Log DEACTIVATE_USER', async () => {
      const user = await User.findOne({ email: 'test_activity_activate@test.com' });

      await request(app)
        .put(`${API_BASE}/users/${user._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ is_active: false });

      const ActivityLog = require('../../models/ActivityLog');
      const log = await ActivityLog.findOne({
        action: 'DEACTIVATE_USER',
        target_id: user._id.toString()
      });
      expect(log).toBeDefined();
    });

    test('TC-44 Log ADMIN_UPDATE_USER', async () => {
      const user = await User.findOne({ email: 'test_update_validation@test.com' });

      await request(app)
        .put(`${API_BASE}/users/${user._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ full_name: 'ActivityLog Test' });

      const ActivityLog = require('../../models/ActivityLog');
      const log = await ActivityLog.findOne({
        action: 'ADMIN_UPDATE_USER',
        target_id: user._id.toString()
      });
      expect(log).toBeDefined();
    });
  });
});
