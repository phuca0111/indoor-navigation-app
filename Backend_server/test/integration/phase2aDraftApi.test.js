/**
 * Phase 2a — Draft API đời mới (collection 'drafts')
 * Chạy: npm run test:phase2a
 * URL: GET/PUT /api/v1/buildings/:buildingId/floors/:floor/draft
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Building = require('../../models/Building');
const Draft = require('../../models/Draft');

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

function draftUrl(buildingId, floor) {
  return `${API}/buildings/${buildingId}/floors/${floor}/draft`;
}

describe('Phase 2a — Draft API (collection drafts)', () => {
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

    // Gắn org của ORG_ADMIN để TC-2a-06 không 403
    const b = await authReq(superToken)('post', '/api/buildings').send({
      name: `DraftTest ${Date.now()}`,
      address: 'Test',
      total_floors: 3,
      organization_id: orgUser.organization_id
    });
    if (b.status === 201 || b.status === 200) {
      testBuildingId = b.body?.building?._id || b.body?._id;
      createdBuilding = Boolean(testBuildingId);
    }
    if (!testBuildingId) {
      const existing = await Building.findOne({
        organization_id: orgUser.organization_id
      }).lean();
      testBuildingId = existing?._id;
    }
    if (!testBuildingId) {
      throw new Error('Không tạo/tìm được building thuộc org của ORG_ADMIN');
    }
  });

  afterAll(async () => {
    if (testBuildingId) {
      await Draft.deleteMany({ building_id: testBuildingId });
      if (createdBuilding) {
        await Building.findByIdAndDelete(testBuildingId);
      }
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  beforeEach(async () => {
    if (testBuildingId) {
      await Draft.deleteMany({ building_id: testBuildingId });
    }
  });

  test('TC-2a-01 GET draft mới → 200, tạo draft rỗng', async () => {
    const res = await authReq(superToken)('get', draftUrl(testBuildingId, 0));
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('payload');
    expect(res.body).toHaveProperty('version');
    expect(res.body.version).toBe(1);
  });

  test('TC-2a-02 PUT draft → 200, version++', async () => {
    const mapData = { rooms: [{ id: 'r1', name: 'Phòng 1' }], nodes: [], edges: [] };

    // Lần đầu upsert → version 1
    const put1 = await authReq(superToken)('put', draftUrl(testBuildingId, 0))
      .send({ map_data: mapData });
    expect(put1.statusCode).toBe(200);
    expect(put1.body.version).toBe(1);

    // Lần hai → version 2
    const put2 = await authReq(superToken)('put', draftUrl(testBuildingId, 0))
      .send({ map_data: { ...mapData, rooms: [{ id: 'r1', name: 'Phòng 1b' }] } });
    expect(put2.statusCode).toBe(200);
    expect(put2.body.version).toBe(2);

    const getRes = await authReq(superToken)('get', draftUrl(testBuildingId, 0));
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.payload.rooms).toHaveLength(1);
    expect(getRes.body.payload.rooms[0].name).toBe('Phòng 1b');
    expect(getRes.body.version).toBe(2);
  });

  test('TC-2a-03 PUT thiếu map_data → 400', async () => {
    const res = await authReq(superToken)('put', draftUrl(testBuildingId, 0))
      .send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.code || res.body.message).toBeDefined();
  });

  test('TC-2a-04 GET floor không hợp lệ → 400', async () => {
    const res = await authReq(superToken)('get', draftUrl(testBuildingId, 'abc'));
    expect(res.statusCode).toBe(400);
  });

  test('TC-2a-05 PUT không login → 401', async () => {
    const res = await request(app)
      .put(draftUrl(testBuildingId, 0))
      .send({ map_data: {} });
    expect(res.statusCode).toBe(401);
  });

  test('TC-2a-06 ORG_ADMIN đọc draft → 200', async () => {
    const res = await authReq(orgToken)('get', draftUrl(testBuildingId, 0));
    expect(res.statusCode).toBe(200);
  });
});
