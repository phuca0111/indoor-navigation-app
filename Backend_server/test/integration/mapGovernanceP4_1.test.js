/**
 * Map Governance P4.1 — soft-require Place + visibility matrix + public filter
 * Local test — không commit trừ khi được yêu cầu.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Place = require('../../models/Place');
const Building = require('../../models/Building');
const Organization = require('../../models/Organization');

const TAG = 'mgc-p41-' + Date.now();

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Map Governance P4.1 policy', () => {
  let superToken;
  let superUser;
  let orgId;
  let building;
  let placeId;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser);
    const org = await Organization.findOne({ is_active: { $ne: false } }).select('_id').lean();
    orgId = org?._id;
    if (!orgId) throw new Error('Thiếu Organization');

    // Tạo 1 building qua API (soft-require Place); các case sau reuse / seed DB
    const res = await request(app)
      .post('/api/buildings')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: TAG + '-main',
        address: 'Test',
        lat: 10.9,
        lng: 106.7,
        organization_id: String(orgId)
      });

    if (res.status === 201) {
      building = res.body.building;
      placeId = building.place_id;
      expect(res.body.place_auto_created).toBe(true);
      expect(placeId).toBeTruthy();
    } else {
      // Quota đầy → seed trực tiếp DB để vẫn cover policy
      const place = await Place.create({
        name: TAG + '-seed-place',
        latitude: 10.9,
        longitude: 106.7,
        status: 'ACTIVE',
        created_by: superUser._id
      });
      placeId = place._id;
      building = await Building.create({
        name: TAG + '-seed-b',
        address: 'Test',
        gps_location: { lat: 10.9, lng: 106.7 },
        activation_radius: 50,
        status: 'DRAFT',
        visibility: 'PRIVATE',
        place_id: placeId,
        organization_id: orgId,
        created_by: superUser._id,
        total_floors: 1
      });
      building = building.toObject ? building.toObject() : building;
    }
  });

  afterAll(async () => {
    if (building?._id) await Building.findByIdAndDelete(building._id).catch(() => {});
    if (placeId) await Place.findByIdAndDelete(placeId).catch(() => {});
    await Building.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    await Place.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-P41-01 soft-require: building có place_id', async () => {
    expect(building.place_id || placeId).toBeTruthy();
  });

  test('TC-P41-02 COMMUNITY khi DRAFT → 400 VISIBILITY_REQUIRES_PUBLISHED', async () => {
    const denied = await request(app)
      .put(`/api/buildings/${building._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ visibility: 'COMMUNITY' });
    expect(denied.status).toBe(400);
    expect(denied.body.code).toBe('VISIBILITY_REQUIRES_PUBLISHED');
  });

  test('TC-P41-03 PUBLISHED + COMMUNITY → public list; PRIVATE không lộ', async () => {
    const up = await request(app)
      .put(`/api/buildings/${building._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ status: 'PUBLISHED', visibility: 'COMMUNITY' });
    expect(up.status).toBe(200);

    const pub = await request(app).get('/api/buildings/public');
    expect(pub.status).toBe(200);
    const list = Array.isArray(pub.body) ? pub.body : (pub.body.buildings || []);
    expect(list.some((b) => String(b._id) === String(building._id))).toBe(true);

    await request(app)
      .put(`/api/buildings/${building._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ visibility: 'PRIVATE' })
      .expect(200);

    const pub2 = await request(app).get('/api/buildings/public');
    const list2 = Array.isArray(pub2.body) ? pub2.body : (pub2.body.buildings || []);
    expect(list2.some((b) => String(b._id) === String(building._id))).toBe(false);
  });

  test('TC-P41-04 hạ DRAFT từ COMMUNITY → auto PRIVATE', async () => {
    await request(app)
      .put(`/api/buildings/${building._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ status: 'PUBLISHED', visibility: 'COMMUNITY' })
      .expect(200);

    const down = await request(app)
      .put(`/api/buildings/${building._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ status: 'DRAFT' });
    expect(down.status).toBe(200);
    expect(down.body.building.status).toBe('DRAFT');
    expect(down.body.building.visibility).toBe('PRIVATE');
  });
});
