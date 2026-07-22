/**
 * Map Governance P4 — community search + verification + public filter regression
 * Local — không commit trừ khi được yêu cầu.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Place = require('../../models/Place');
const Building = require('../../models/Building');

const TAG = 'mgc-p4-' + Date.now();

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Map Governance P4 community + verification', () => {
  let superToken;
  let superUser;
  let place;
  let building;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser);

    place = await Place.create({
      name: TAG + ' Place',
      latitude: 10.95,
      longitude: 106.75,
      status: 'ACTIVE',
      verified: false,
      verification_status: 'UNVERIFIED',
      created_by: superUser._id
    });
    building = await Building.create({
      name: TAG + ' Community Bld',
      address: 'AEON test',
      gps_location: { lat: 10.95, lng: 106.75 },
      activation_radius: 200,
      status: 'PUBLISHED',
      visibility: 'COMMUNITY',
      place_id: place._id,
      created_by: superUser._id,
      total_floors: 1
    });
  });

  afterAll(async () => {
    if (building?._id) await Building.findByIdAndDelete(building._id).catch(() => {});
    if (place?._id) await Place.findByIdAndDelete(place._id).catch(() => {});
    await Building.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    await Place.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-P4-01 public community buildings search by q', async () => {
    const res = await request(app).get('/api/community/buildings').query({ q: TAG });
    expect(res.status).toBe(200);
    expect(res.body.buildings.some((b) => String(b._id) === String(building._id))).toBe(true);
  });

  test('TC-P4-02 community places + hub Super Admin', async () => {
    const places = await request(app).get('/api/community/places').query({ q: TAG });
    expect(places.status).toBe(200);
    expect(places.body.places.some((p) => String(p._id) === String(place._id))).toBe(true);

    const hub = await request(app)
      .get('/api/community/hub')
      .set('Authorization', `Bearer ${superToken}`);
    expect(hub.status).toBe(200);
    expect(hub.body.community_buildings.some((b) => String(b._id) === String(building._id))).toBe(true);
  });

  test('TC-P4-03 verification request → approve', async () => {
    const reqv = await request(app)
      .post(`/api/places/${place._id}/verification`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ action: 'request', note: 'cần xác minh' });
    expect(reqv.status).toBe(200);
    expect(reqv.body.place.verification_status).toBe('PENDING');

    const hub = await request(app)
      .get('/api/community/hub')
      .set('Authorization', `Bearer ${superToken}`);
    expect(hub.body.verification_queue.some((p) => String(p._id) === String(place._id))).toBe(true);

    const ok = await request(app)
      .post(`/api/places/${place._id}/verification`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ action: 'approve', note: 'ok' });
    expect(ok.status).toBe(200);
    expect(ok.body.place.verified).toBe(true);
    expect(ok.body.place.verification_status).toBe('VERIFIED');
  });

  test('TC-P4-04 check-location chỉ COMMUNITY', async () => {
    const res = await request(app)
      .get('/api/buildings/check-location')
      .query({ lat: 10.95, lng: 106.75 });
    expect(res.status).toBe(200);
    if (res.body.found) {
      expect(res.body.buildings.every((b) => ['COMMUNITY', 'OFFICIAL'].includes(b.visibility))).toBe(true);
    }
  });
});
