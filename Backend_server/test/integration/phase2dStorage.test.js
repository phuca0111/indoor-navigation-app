/**
 * Phase 2d — Object Storage (ảnh nền map)
 * npm run test:phase2d
 *
 * Cover: upload OK, static serve, delete, auth, mime, size, base64 reject
 *        validate/publish/draft, wrong building key, empty file field
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Building = require('../../models/Building');
const Floor = require('../../models/Floor');
const Draft = require('../../models/Draft');
const {
  assertNoBase64Background,
  getLocalRoot,
  fileExists,
  getMaxBytes
} = require('../../services/objectStorage');
const { validateMapData: validatePublish } = require('../../services/publishMapValidate');

const API = '/api/v1';

// 1×1 PNG
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

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

function uploadUrl(buildingId, floor) {
  return `${API}/buildings/${buildingId}/floors/${floor}/assets/background`;
}

describe('Phase 2d — Storage ảnh nền', () => {
  let superUser;
  let orgUser;
  let stranger;
  let superToken;
  let orgToken;
  let strangerToken;
  let testBuildingId;
  let otherBuildingId;
  let createdIds = [];
  const uploadedKeys = [];

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    process.env.STORAGE_BACKEND = 'local';
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } });
    orgUser = await User.findOne({
      role: 'ORG_ADMIN',
      is_active: { $ne: false },
      organization_id: { $ne: null }
    });
    stranger = await User.findOne({
      role: 'ORG_ADMIN',
      is_active: { $ne: false },
      organization_id: { $ne: null },
      _id: { $ne: orgUser?._id }
    });
    if (!superUser || !orgUser) throw new Error('Thiếu SUPER/ORG_ADMIN');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', Number(superUser.session_version) || 0);
    orgToken = tokenFor(orgUser._id, 'ORG_ADMIN', Number(orgUser.session_version) || 0);
    if (stranger) {
      strangerToken = tokenFor(stranger._id, 'ORG_ADMIN', Number(stranger.session_version) || 0);
    }

    const b1 = await authReq(superToken)('post', '/api/buildings').send({
      name: `Storage2d ${Date.now()}`,
      address: 'Test',
      total_floors: 2,
      organization_id: orgUser.organization_id
    });
    testBuildingId = b1.body?.building?._id || b1.body?._id;
    if (testBuildingId) createdIds.push(testBuildingId);

    const b2 = await authReq(superToken)('post', '/api/buildings').send({
      name: `Storage2d-other ${Date.now()}`,
      address: 'Test',
      total_floors: 1,
      organization_id: orgUser.organization_id
    });
    otherBuildingId = b2.body?.building?._id || b2.body?._id;
    if (otherBuildingId) createdIds.push(otherBuildingId);

    if (!testBuildingId) throw new Error('Không tạo building test');
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await Draft.deleteMany({ building_id: id });
      await Floor.deleteMany({ building_id: id });
      await Building.findByIdAndDelete(id);
    }
    // dọn file test
    const root = getLocalRoot();
    for (const key of uploadedKeys) {
      try {
        fs.unlinkSync(path.join(root, key));
      } catch (_) {
        /* ignore */
      }
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-2d-01 unit: Base64 background bị cấm', () => {
    const bad = assertNoBase64Background({
      background_image: 'data:image/png;base64,AAAA'
    });
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe('BG_BASE64_FORBIDDEN');

    const okEmpty = assertNoBase64Background({ background_image: '' });
    expect(okEmpty.ok).toBe(true);

    const okUrl = assertNoBase64Background({
      background_image: '/uploads/map-backgrounds/x/floor-0.png'
    });
    expect(okUrl.ok).toBe(true);
  });

  test('TC-2d-02 validateMapData (publish) từ chối Base64', () => {
    const r = validatePublish({
      rooms: [{ id: 'r1' }],
      nodes: [],
      edges: [],
      background_image: 'data:image/jpeg;base64,/9j/4AAQ'
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'BG_BASE64_FORBIDDEN')).toBe(true);
  });

  test('TC-2d-03 upload PNG → 201 + key/url + file tồn tại', async () => {
    const res = await authReq(superToken)('post', uploadUrl(testBuildingId, 0))
      .attach('file', PNG_1X1, { filename: 'bg.png', contentType: 'image/png' });

    expect(res.statusCode).toBe(201);
    expect(res.body.key).toMatch(/^map-backgrounds\//);
    expect(res.body.url).toMatch(/\/uploads\//);
    expect(res.body.bytes).toBe(PNG_1X1.length);
    expect(res.body.backend).toBe('local');
    expect(fileExists(res.body.key)).toBe(true);
    uploadedKeys.push(res.body.key);
  });

  test('TC-2d-04 GET static /uploads/... → 200 image', async () => {
    const up = await authReq(superToken)('post', uploadUrl(testBuildingId, 0))
      .attach('file', PNG_1X1, { filename: 'bg2.png', contentType: 'image/png' });
    expect(up.statusCode).toBe(201);
    uploadedKeys.push(up.body.key);

    const pathPart = up.body.url.includes('/uploads/')
      ? up.body.url.slice(up.body.url.indexOf('/uploads/'))
      : `/uploads/${up.body.key}`;
    const get = await request(app).get(pathPart);
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toMatch(/image|octet/);
  });

  test('TC-2d-05 thiếu file → 400 STORAGE_NO_FILE', async () => {
    const res = await authReq(superToken)('post', uploadUrl(testBuildingId, 0));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('STORAGE_NO_FILE');
  });

  test('TC-2d-06 MIME text → 400', async () => {
    const res = await authReq(superToken)('post', uploadUrl(testBuildingId, 0))
      .attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.statusCode).toBe(400);
  });

  test('TC-2d-07 không login → 401', async () => {
    const res = await request(app)
      .post(uploadUrl(testBuildingId, 0))
      .attach('file', PNG_1X1, { filename: 'bg.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(401);
  });

  test('TC-2d-08 floor không hợp lệ → 400', async () => {
    const res = await authReq(superToken)('post', uploadUrl(testBuildingId, 'abc'))
      .attach('file', PNG_1X1, { filename: 'bg.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(400);
  });

  test('TC-2d-09 ORG_ADMIN upload building org mình → 201', async () => {
    const res = await authReq(orgToken)('post', uploadUrl(testBuildingId, 1))
      .attach('file', PNG_1X1, { filename: 'org.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(201);
    uploadedKeys.push(res.body.key);
  });

  test('TC-2d-10 ORG_ADMIN khác org → 403 (nếu có stranger)', async () => {
    if (!strangerToken || !stranger) return;
    if (String(stranger.organization_id) === String(orgUser.organization_id)) return;

    const res = await authReq(strangerToken)('post', uploadUrl(testBuildingId, 0))
      .attach('file', PNG_1X1, { filename: 'x.png', contentType: 'image/png' });
    expect(res.statusCode).toBe(403);
  });

  test('TC-2d-11 delete đúng key → deleted true', async () => {
    const up = await authReq(superToken)('post', uploadUrl(testBuildingId, 0))
      .attach('file', PNG_1X1, { filename: 'del.png', contentType: 'image/png' });
    expect(up.statusCode).toBe(201);
    const key = up.body.key;

    const del = await authReq(superToken)('delete', uploadUrl(testBuildingId, 0)).send({ key });
    expect(del.statusCode).toBe(200);
    expect(del.body.deleted).toBe(true);
    expect(fileExists(key)).toBe(false);
  });

  test('TC-2d-12 delete key building khác → 403', async () => {
    const up = await authReq(superToken)('post', uploadUrl(otherBuildingId, 0))
      .attach('file', PNG_1X1, { filename: 'other.png', contentType: 'image/png' });
    expect(up.statusCode).toBe(201);
    uploadedKeys.push(up.body.key);

    const del = await authReq(superToken)('delete', uploadUrl(testBuildingId, 0)).send({
      key: up.body.key
    });
    expect(del.statusCode).toBe(403);
    expect(del.body.code).toBe('STORAGE_KEY_FORBIDDEN');
  });

  test('TC-2d-13 publish validate API từ chối Base64', async () => {
    const res = await authReq(superToken)(
      'post',
      `${API}/buildings/${testBuildingId}/floors/0/publish/validate`
    ).send({
      map_data: {
        rooms: [{ id: 'r1', name: 'X' }],
        nodes: [],
        edges: [],
        background_image: 'data:image/png;base64,iVBORw0KGgo='
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('TC-2d-14 publish sync + URL storage → OK', async () => {
    const up = await authReq(superToken)('post', uploadUrl(testBuildingId, 0))
      .attach('file', PNG_1X1, { filename: 'pub.png', contentType: 'image/png' });
    expect(up.statusCode).toBe(201);
    uploadedKeys.push(up.body.key);

    const pub = await authReq(superToken)('post', `/api/maps/${testBuildingId}/0/publish`).send({
      map_data: {
        rooms: [{ id: 'r-storage', name: 'Stored BG' }],
        nodes: [],
        edges: [],
        background_image: up.body.url.includes('/uploads/')
          ? up.body.url.slice(up.body.url.indexOf('/uploads/'))
          : `/uploads/${up.body.key}`
      }
    });
    expect([200, 201]).toContain(pub.statusCode);

    const floor = await Floor.findOne({
      building_id: testBuildingId,
      floor_number: 0
    }).lean();
    expect(floor.map_data.background_image).toMatch(/\/uploads\//);
    expect(floor.map_data.background_image).not.toMatch(/^data:image/);
  });

  test('TC-2d-15 publish sync Base64 → 400 VALIDATE', async () => {
    const res = await authReq(superToken)('post', `/api/maps/${testBuildingId}/0/publish`).send({
      map_data: {
        rooms: [{ id: 'r1', name: 'Bad' }],
        nodes: [],
        edges: [],
        background_image: 'data:image/png;base64,AAAA'
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATE_FAILED');
  });

  test('TC-2d-16 draft PUT Base64 → 400', async () => {
    const res = await authReq(superToken)(
      'put',
      `${API}/buildings/${testBuildingId}/floors/0/draft`
    ).send({
      map_data: {
        rooms: [],
        nodes: [],
        edges: [],
        background_image: 'data:image/png;base64,BBBB'
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('BG_BASE64_FORBIDDEN');
  });

  test('TC-2d-17 draft PUT URL → 200', async () => {
    const res = await authReq(superToken)(
      'put',
      `${API}/buildings/${testBuildingId}/floors/0/draft`
    ).send({
      map_data: {
        rooms: [{ id: 'd1', name: 'Draft' }],
        nodes: [],
        edges: [],
        background_image: '/uploads/map-backgrounds/demo/floor-0.png'
      }
    });
    expect(res.statusCode).toBe(200);
  });

  test('TC-2d-18 async publish Base64 → 400', async () => {
    const res = await authReq(superToken)(
      'post',
      `${API}/buildings/${testBuildingId}/floors/0/publish`
    ).send({
      map_data: {
        rooms: [{ id: 'r1', name: 'A' }],
        nodes: [],
        edges: [],
        background_image: 'data:image/png;base64,CCCC'
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATE_FAILED');
  });

  test('TC-2d-19 max_bytes env có giá trị dương', () => {
    expect(getMaxBytes()).toBeGreaterThan(0);
  });
});
