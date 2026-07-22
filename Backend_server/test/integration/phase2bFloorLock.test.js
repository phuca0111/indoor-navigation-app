/**
 * Phase 2b — Floor lock (Redis SET NX / memory fallback)
 * Chạy: npm run test:phase2b
 * URL: /api/v1/buildings/:buildingId/floors/:floor/lock
 */

process.env.FLOOR_LOCK_BACKEND = process.env.FLOOR_LOCK_BACKEND || 'memory';
process.env.FLOOR_EDIT_LOCK_TTL_SEC = process.env.FLOOR_EDIT_LOCK_TTL_SEC || '30';

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Building = require('../../models/Building');
const {
  clearLocksForBuilding,
  getBackendName,
  getTtlSec
} = require('../../services/floorEditLock');
const memoryStore = require('../../services/floorLockMemoryStore');

const API = '/api/v1';

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function authReq(token) {
  return (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
}

function lockUrl(buildingId, floor, suffix = '') {
  return `${API}/buildings/${buildingId}/floors/${floor}/lock${suffix}`;
}

describe('Phase 2b — Floor lock (2 client, 1 win)', () => {
  let superUser;
  let orgUser;
  let superToken;
  let orgToken;
  let testBuildingId;
  let createdBuilding = false;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } });
    orgUser = await User.findOne({
      role: 'ORG_ADMIN',
      is_active: { $ne: false },
      organization_id: { $ne: null }
    });
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    if (!orgUser) throw new Error('Thiếu ORG_ADMIN');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', Number(superUser.session_version) || 0);
    orgToken = tokenFor(orgUser._id, 'ORG_ADMIN', Number(orgUser.session_version) || 0);

    const b = await authReq(superToken)('post', '/api/buildings').send({
      name: `LockTest ${Date.now()}`,
      address: 'Test',
      total_floors: 3,
      organization_id: orgUser.organization_id
    });
    if (b.status === 201 || b.status === 200) {
      testBuildingId = b.body?.building?._id || b.body?._id;
      createdBuilding = Boolean(testBuildingId);
    }
    if (!testBuildingId) {
      const existing = await Building.findOne({ organization_id: orgUser.organization_id }).lean();
      testBuildingId = existing?._id;
    }
    if (!testBuildingId) throw new Error('Không có building test');
  });

  afterAll(async () => {
    if (testBuildingId) {
      await clearLocksForBuilding(testBuildingId);
      if (createdBuilding) await Building.findByIdAndDelete(testBuildingId);
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  beforeEach(async () => {
    memoryStore.kvClearAll();
    if (testBuildingId) await clearLocksForBuilding(testBuildingId);
  });

  test('TC-2b-01 backend memory|redis (không mongo mặc định trong Jest)', () => {
    const b = getBackendName();
    expect(['memory', 'redis']).toContain(b);
  });

  test('TC-2b-02 acquire → 200 held', async () => {
    const res = await authReq(superToken)('post', lockUrl(testBuildingId, 0)).send({
      session_id: 'sess-A'
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.lock.session_id).toBe('sess-A');
    expect(res.body.ttl_sec).toBe(getTtlSec());
    expect(res.body.backend).toBeTruthy();
  });

  test('TC-2b-03 hai client: A win, B → 409 LOCK_HELD', async () => {
    const a = await authReq(orgToken)('post', lockUrl(testBuildingId, 0)).send({
      session_id: 'sess-org'
    });
    expect(a.statusCode).toBe(200);

    const b = await authReq(superToken)('post', lockUrl(testBuildingId, 0)).send({
      session_id: 'sess-super'
    });
    expect(b.statusCode).toBe(409);
    expect(b.body.code).toBe('LOCK_HELD');
    expect(b.body.holder).toBeTruthy();
    expect(String(b.body.holder.session_id)).toBe('sess-org');
  });

  test('TC-2b-04 heartbeat owner → 200; stranger → 409', async () => {
    await authReq(superToken)('post', lockUrl(testBuildingId, 0)).send({ session_id: 'sess-A' });

    const hb = await authReq(superToken)('post', lockUrl(testBuildingId, 0, '/heartbeat')).send({
      session_id: 'sess-A'
    });
    expect(hb.statusCode).toBe(200);

    const bad = await authReq(orgToken)('post', lockUrl(testBuildingId, 0, '/heartbeat')).send({
      session_id: 'sess-B'
    });
    expect(bad.statusCode).toBe(409);
  });

  test('TC-2b-05 release → GET held=false; client khác acquire được', async () => {
    await authReq(superToken)('post', lockUrl(testBuildingId, 0)).send({ session_id: 'sess-A' });
    const rel = await authReq(superToken)('post', lockUrl(testBuildingId, 0, '/release')).send({
      session_id: 'sess-A'
    });
    expect(rel.statusCode).toBe(200);
    expect(rel.body.released).toBe(true);

    const st = await authReq(superToken)('get', lockUrl(testBuildingId, 0));
    expect(st.statusCode).toBe(200);
    expect(st.body.held).toBe(false);

    const b = await authReq(orgToken)('post', lockUrl(testBuildingId, 0)).send({
      session_id: 'sess-org'
    });
    expect(b.statusCode).toBe(200);
  });

  test('TC-2b-06 thiếu session_id → 400', async () => {
    const res = await authReq(superToken)('post', lockUrl(testBuildingId, 0)).send({});
    expect(res.statusCode).toBe(400);
  });

  test('TC-2b-07 không login → 401', async () => {
    const res = await request(app)
      .post(lockUrl(testBuildingId, 0))
      .send({ session_id: 'x' });
    expect(res.statusCode).toBe(401);
  });

  test('TC-2b-08 legacy /api/maps/.../lock vẫn conflict 409', async () => {
    const maps = `/api/maps/${testBuildingId}/0/lock`;
    const a = await authReq(orgToken)('post', maps).send({ session_id: 'legacy-A' });
    expect(a.statusCode).toBe(200);

    const b = await authReq(superToken)('post', maps).send({ session_id: 'legacy-B' });
    expect(b.statusCode).toBe(409);
    expect(b.body.code).toBe('LOCK_HELD');
  });
});
