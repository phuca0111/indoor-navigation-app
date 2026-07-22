/**
 * Map Governance P0 — Places API + Building place_id/visibility
 * Chạy: npx jest test/unit/mapVisibility.test.js test/integration/mapGovernanceP0.test.js --runInBand --verbose
 *
 * File test local — theo quy ước user: không commit tests trừ khi được yêu cầu.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Place = require('../../models/Place');
const Building = require('../../models/Building');
const Organization = require('../../models/Organization');

const API = '/api/places';
const TAG = 'mgc-p0-test-' + Date.now();

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Map Governance P0', () => {
  let superToken;
  let orgToken;
  let superUser;
  let orgId;
  let placeId;
  let buildingId;
  let placeId2;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN trong DB');
    superToken = tokenFor(superUser);

    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    if (orgAdmin) orgToken = tokenFor(orgAdmin);

    const org = await Organization.findOne({ is_active: { $ne: false } }).select('_id').lean();
    orgId = org?._id || null;
  });

  afterAll(async () => {
    if (buildingId) await Building.findByIdAndDelete(buildingId).catch(() => {});
    if (placeId) await Place.findByIdAndDelete(placeId).catch(() => {});
    if (placeId2) await Place.findByIdAndDelete(placeId2).catch(() => {});
    await Place.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    await Building.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-P0-01 không token → 401', async () => {
    const res = await request(app).get(API);
    expect(res.status).toBe(401);
  });

  test('TC-P0-02 ORG_ADMIN → 403', async () => {
    if (!orgToken) return;
    const res = await request(app).get(API).set('Authorization', `Bearer ${orgToken}`);
    expect(res.status).toBe(403);
  });

  test('TC-P0-03 meta visibility', async () => {
    const res = await request(app)
      .get(`${API}/meta/visibility`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.visibility).toEqual(
      expect.arrayContaining(['PRIVATE', 'UNLISTED', 'COMMUNITY', 'OFFICIAL'])
    );
  });

  test('TC-P0-04 tạo Place thiếu name → 400', async () => {
    const res = await request(app)
      .post(API)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ latitude: 10.7 });
    expect(res.status).toBe(400);
  });

  test('TC-P0-05 tạo Place + aliases + list/filter', async () => {
    const res = await request(app)
      .post(API)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: TAG + ' AEON Mall BD',
        aliases: ['AEON', 'AEON BD', '  ', 'AEON'],
        latitude: 10.9801,
        longitude: 106.6752,
        address: 'Binh Duong',
        category: 'mall',
        verified: false,
        status: 'ACTIVE',
        owner_org_id: orgId || undefined,
        force: true
      });
    expect(res.status).toBe(201);
    expect(res.body.place._id).toBeTruthy();
    placeId = res.body.place._id;
    expect(res.body.place.aliases).toEqual(expect.arrayContaining(['AEON', 'AEON BD']));
    expect(res.body.place.aliases.filter((a) => a === 'AEON').length).toBe(1);

    const list = await request(app)
      .get(API)
      .query({ q: 'AEON Mall BD', status: 'ACTIVE' })
      .set('Authorization', `Bearer ${superToken}`);
    expect(list.status).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
    expect(list.body.places.some((p) => String(p._id) === String(placeId))).toBe(true);
  });

  test('TC-P0-06 get Place detail', async () => {
    const res = await request(app)
      .get(`${API}/${placeId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.place.name).toContain('AEON');
    expect(Array.isArray(res.body.buildings)).toBe(true);
  });

  test('TC-P0-07 update Place', async () => {
    const res = await request(app)
      .patch(`${API}/${placeId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ verified: true, category: 'shopping-mall', aliases: 'AEON Mall, AEON BD' });
    expect(res.status).toBe(200);
    expect(res.body.place.verified).toBe(true);
    expect(res.body.place.category).toBe('shopping-mall');
    expect(res.body.place.aliases).toEqual(expect.arrayContaining(['AEON Mall', 'AEON BD']));
  });

  test('TC-P0-08 tạo Building mặc định visibility PRIVATE + attach Place', async () => {
    const building = await Building.create({
      name: TAG + ' Building A',
      address: 'BD',
      gps_location: { lat: 10.98, lng: 106.67 },
      status: 'DRAFT',
      organization_id: orgId || null,
      created_by: superUser._id
    });
    buildingId = building._id;
    expect(building.visibility || 'PRIVATE').toBe('PRIVATE');
    expect(building.place_id == null).toBe(true);

    const attach = await request(app)
      .post(`${API}/${placeId}/attach-building`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ building_id: buildingId, visibility: 'UNLISTED' });
    expect(attach.status).toBe(200);
    expect(String(attach.body.building.place_id)).toBe(String(placeId));
    expect(attach.body.building.visibility).toBe('UNLISTED');

    const detail = await request(app)
      .get(`${API}/${placeId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(detail.body.buildings.some((b) => String(b._id) === String(buildingId))).toBe(true);
  });

  test('TC-P0-09 đổi visibility hợp lệ / không hợp lệ', async () => {
    const bad = await request(app)
      .patch(`${API}/buildings/${buildingId}/visibility`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ visibility: 'PUBLIC' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_VISIBILITY');

    // P4.1: COMMUNITY trên DRAFT bị chặn
    const blocked = await request(app)
      .patch(`${API}/buildings/${buildingId}/visibility`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ visibility: 'COMMUNITY' });
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe('VISIBILITY_REQUIRES_PUBLISHED');

    await Building.findByIdAndUpdate(buildingId, { status: 'PUBLISHED' });

    const ok = await request(app)
      .patch(`${API}/buildings/${buildingId}/visibility`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ visibility: 'COMMUNITY' });
    expect(ok.status).toBe(200);
    expect(ok.body.building.visibility).toBe('COMMUNITY');

    const viaBuilding = await request(app)
      .put(`/api/buildings/${buildingId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ visibility: 'OFFICIAL' });
    expect(viaBuilding.status).toBe(200);
    expect(viaBuilding.body.building.visibility).toBe('OFFICIAL');
  });

  test('TC-P0-10 PATCH building visibility + place_id qua /api/buildings', async () => {
    const create2 = await request(app)
      .post(API)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: TAG + ' Place 2', latitude: 1, longitude: 1, force: true });
    expect(create2.status).toBe(201);
    placeId2 = create2.body.place._id;

    const res = await request(app)
      .put(`/api/buildings/${buildingId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ place_id: placeId2, visibility: 'PRIVATE' });

    // Một số route dùng PATCH — thử cả hai
    if (res.status === 404 || res.status === 405) {
      const res2 = await request(app)
        .patch(`/api/buildings/${buildingId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ place_id: placeId2, visibility: 'PRIVATE' });
      expect(res2.status).toBe(200);
      expect(String(res2.body.building?.place_id || res2.body.place_id)).toBe(String(placeId2));
    } else {
      expect(res.status).toBe(200);
      const b = res.body.building || res.body;
      expect(String(b.place_id)).toBe(String(placeId2));
      expect(b.visibility).toBe('PRIVATE');
    }
  });

  test('TC-P0-11 không attach vào Place LOCKED', async () => {
    await Place.findByIdAndUpdate(placeId2, { status: 'LOCKED' });
    // tạo building tạm
    const tmp = await Building.create({
      name: TAG + ' Building LockedTest',
      gps_location: { lat: 0, lng: 0 },
      status: 'DRAFT'
    });
    const res = await request(app)
      .post(`${API}/${placeId2}/attach-building`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ building_id: tmp._id });
    expect(res.status).toBe(400);
    await Building.findByIdAndDelete(tmp._id);
  });

  test('TC-P0-12 soft lock Place → detach buildings', async () => {
    // gắn lại building vào placeId rồi lock
    await Building.findByIdAndUpdate(buildingId, { place_id: placeId });
    const res = await request(app)
      .delete(`${API}/${placeId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.detached_buildings).toBeGreaterThanOrEqual(1);

    const b = await Building.findById(buildingId).lean();
    expect(b.place_id).toBeNull();
    const p = await Place.findById(placeId).lean();
    expect(p.status).toBe('LOCKED');
  });

  test('TC-P0-13 hard delete khi còn building → 400; sau detach → ok', async () => {
    // placeId đang LOCKED; tạo place mới + building gắn
    const p = await Place.create({ name: TAG + ' HardDel', latitude: 0, longitude: 0 });
    const b = await Building.create({
      name: TAG + ' HardDel Bld',
      place_id: p._id,
      gps_location: { lat: 0, lng: 0 }
    });

    const fail = await request(app)
      .delete(`${API}/${p._id}?hard=1`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(fail.status).toBe(400);
    expect(fail.body.code).toBe('PLACE_HAS_BUILDINGS');

    await Building.findByIdAndUpdate(b._id, { place_id: null });
    const ok = await request(app)
      .delete(`${API}/${p._id}?hard=1`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(ok.status).toBe(200);
    expect(await Place.findById(p._id)).toBeNull();
    await Building.findByIdAndDelete(b._id);
  });

  test('TC-P0-14 detach building sai place → 400', async () => {
    const p = await Place.create({ name: TAG + ' Detach', status: 'ACTIVE' });
    const b = await Building.create({
      name: TAG + ' DetachB',
      place_id: null,
      gps_location: { lat: 0, lng: 0 }
    });
    const res = await request(app)
      .post(`${API}/${p._id}/detach-building`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ building_id: b._id });
    expect(res.status).toBe(400);
    await Place.findByIdAndDelete(p._id);
    await Building.findByIdAndDelete(b._id);
  });

  test('TC-P0-15 get Place không tồn tại → 404', async () => {
    const fake = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`${API}/${fake}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(404);
  });
});
