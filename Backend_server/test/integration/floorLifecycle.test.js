/**
 * Floor lifecycle — integration tests (F.1–F.3)
 * Chạy: npm run test:floor
 *
 * Yêu cầu: MongoDB + SUPER_ADMIN, ORG_ADMIN, BUILDING_ADMIN (có assigned_buildings).
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Building = require('../../models/Building');
const Floor = require('../../models/Floor');
const ActivityLog = require('../../models/ActivityLog');

const API = '/api';

function tokenFor(userId, role) {
  return jwt.sign(
    { userId: String(userId), role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function authReq(token) {
  return (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
}

describe('Floor lifecycle — add/remove + publish range', () => {
  let superToken;
  let orgToken;
  let baToken;
  let superUser;
  let orgUser;
  let baUser;
  let testBuildingId;
  let createdBuildingIds = [];

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) {
      require('dotenv').config();
    }
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }

    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    orgUser = await User.findOne({
      role: 'ORG_ADMIN',
      is_active: { $ne: false },
      organization_id: { $ne: null }
    }).lean();
    baUser = await User.findOne({
      role: 'BUILDING_ADMIN',
      is_active: { $ne: false },
      assigned_buildings: { $exists: true, $not: { $size: 0 } }
    }).lean();

    if (!superUser) throw new Error('Thiếu SUPER_ADMIN — không chạy Floor lifecycle test');
    if (!orgUser) throw new Error('Thiếu ORG_ADMIN — không chạy Floor lifecycle test');
    if (!baUser) throw new Error('Thiếu BUILDING_ADMIN — không chạy Floor lifecycle test');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN');
    orgToken = tokenFor(orgUser._id, 'ORG_ADMIN');
    baToken = tokenFor(baUser._id, 'BUILDING_ADMIN');
  });

  afterAll(async () => {
    for (const id of createdBuildingIds) {
      await Floor.deleteMany({ building_id: id });
      await Building.findByIdAndDelete(id);
      await ActivityLog.deleteMany({ target_id: String(id) });
    }
  });

  test('TC-FL-01: SUPER tạo tòa + PATCH add → total_floors +1', async () => {
    const createRes = await authReq(superToken)('post', `${API}/buildings`).send({
      name: `Floor LC Test ${Date.now()}`,
      address: 'Test',
      total_floors: 2,
      organization_id: String(orgUser.organization_id),
      lat: 10.7,
      lng: 106.6
    });
    expect(createRes.status).toBe(201);
    testBuildingId = String(createRes.body.building._id);
    createdBuildingIds.push(testBuildingId);
    expect(createRes.body.building.total_floors).toBe(2);

    const addRes = await authReq(superToken)('patch', `${API}/buildings/${testBuildingId}/floors`)
      .send({ action: 'add' });
    expect(addRes.status).toBe(200);
    expect(addRes.body.total_floors).toBe(3);
    expect(addRes.body.floors).toEqual([0, 1, 2]);

    const log = await ActivityLog.findOne({
      target_id: testBuildingId,
      action: 'ADD_FLOOR'
    }).lean();
    expect(log).toBeTruthy();
  });

  test('TC-FL-02: PATCH remove khi không có Floor ở đuôi → OK', async () => {
    const rem = await authReq(superToken)('patch', `${API}/buildings/${testBuildingId}/floors`)
      .send({ action: 'remove' });
    expect(rem.status).toBe(200);
    expect(rem.body.total_floors).toBe(2);

    const log = await ActivityLog.findOne({
      target_id: testBuildingId,
      action: 'REMOVE_FLOOR'
    }).lean();
    expect(log).toBeTruthy();
  });

  test('TC-FL-03: PATCH remove khi có Floor doc ở đuôi → 409 FLOOR_HAS_MAP', async () => {
    // Publish floor 1 (đuôi khi N=2)
    const pub = await authReq(superToken)('post', `${API}/maps/${testBuildingId}/1/publish`)
      .send({
        map_data: {
          rooms: [{ id: 'r1', name: 'Room', points: [[0, 0], [1, 0], [1, 1], [0, 1]] }],
          nodes: [],
          edges: [],
          walls: [],
          qr_anchors: []
        }
      });
    expect([200, 201]).toContain(pub.status);

    const rem = await authReq(superToken)('patch', `${API}/buildings/${testBuildingId}/floors`)
      .send({ action: 'remove' });
    expect(rem.status).toBe(409);
    expect(rem.body.code).toBe('FLOOR_HAS_MAP');
    expect(rem.body.floor_number).toBe(1);

    const b = await Building.findById(testBuildingId).lean();
    expect(b.total_floors).toBe(2);
  });

  test('TC-FL-04: PUT total_floors giảm khi đuôi có map → 409', async () => {
    const put = await authReq(superToken)('put', `${API}/buildings/${testBuildingId}`)
      .send({ total_floors: 1 });
    expect(put.status).toBe(409);
    expect(put.body.code).toBe('FLOOR_HAS_MAP');
  });

  test('TC-FL-05: BUILDING_ADMIN PATCH floors → 403', async () => {
    const assignedId = String(baUser.assigned_buildings[0]);
    const rem = await authReq(baToken)('patch', `${API}/buildings/${assignedId}/floors`)
      .send({ action: 'add' });
    expect(rem.status).toBe(403);
  });

  test('TC-FL-06: Publish floor >= total_floors → 400 FLOOR_OUT_OF_RANGE', async () => {
    const pub = await authReq(superToken)('post', `${API}/maps/${testBuildingId}/99/publish`)
      .send({
        map_data: { rooms: [], nodes: [], edges: [], walls: [], qr_anchors: [] }
      });
    expect(pub.status).toBe(400);
    expect(pub.body.code).toBe('FLOOR_OUT_OF_RANGE');
  });

  test('TC-FL-07: ORG_ADMIN PATCH add trên tòa cùng org → 200', async () => {
    // Đảm bảo tòa thuộc org của ORG_ADMIN
    await Building.findByIdAndUpdate(testBuildingId, {
      organization_id: orgUser.organization_id
    });
    const add = await authReq(orgToken)('patch', `${API}/buildings/${testBuildingId}/floors`)
      .send({ action: 'add' });
    expect(add.status).toBe(200);
    expect(add.body.total_floors).toBe(3);
  });
});
