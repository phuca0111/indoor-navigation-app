/**
 * Map Governance P1 — Duplicate + Review
 * npx jest test/unit/placeDuplicateDetection.test.js test/integration/mapGovernanceP1.test.js --runInBand --verbose
 */
const {
  normalizeName,
  nameSimilarity,
  gpsSimilarity,
  compositeScore,
  findDuplicatePlaces
} = require('../../services/placeDuplicateDetection');

describe('placeDuplicateDetection unit', () => {
  test('normalizeName bỏ dấu', () => {
    expect(normalizeName('AEON Mall Bình Dương')).toContain('binh');
    expect(normalizeName('AEON Mall Bình Dương')).toContain('duong');
  });

  test('nameSimilarity cao với alias gần giống', () => {
    expect(nameSimilarity('AEON Mall Binh Duong', 'AEON Mall BD')).toBeGreaterThan(0.3);
    expect(nameSimilarity('AEON Mall', 'AEON Mall')).toBe(1);
  });

  test('gpsSimilarity gần = 1, xa = 0', () => {
    const near = gpsSimilarity(10.98, 106.67, 10.9801, 106.6701);
    expect(near.skipped).toBe(false);
    expect(near.score).toBeGreaterThan(0.8);
    const far = gpsSimilarity(10.98, 106.67, 11.5, 107.5);
    expect(far.score).toBe(0);
  });

  test('compositeScore AEON gần GPS cao', () => {
    const r = compositeScore(
      { name: 'AEON Mall Binh Duong', aliases: ['AEON'], latitude: 10.98, longitude: 106.67, category: 'mall' },
      { name: 'AEON Mall Binh Duong', aliases: ['AEON BD'], latitude: 10.9802, longitude: 106.6702, category: 'mall' }
    );
    expect(r.score).toBeGreaterThanOrEqual(0.95);
  });
});

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Place = require('../../models/Place');
const Building = require('../../models/Building');
const MapReviewRequest = require('../../models/MapReviewRequest');

const TAG = 'mgc-p1-' + Date.now();

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Map Governance P1 API', () => {
  let superToken;
  let superUser;
  let placeA;
  let placeB;
  let building;
  let reviewId;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser);
  });

  afterAll(async () => {
    if (reviewId) await MapReviewRequest.findByIdAndDelete(reviewId).catch(() => {});
    await MapReviewRequest.deleteMany({ note: new RegExp(TAG) }).catch(() => {});
    if (building) await Building.findByIdAndDelete(building._id).catch(() => {});
    await Building.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    if (placeA) await Place.findByIdAndDelete(placeA._id).catch(() => {});
    if (placeB) await Place.findByIdAndDelete(placeB._id).catch(() => {});
    await Place.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-P1-01 tạo Place A', async () => {
    const res = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: TAG + ' AEON Mall Binh Duong',
        aliases: ['AEON', 'AEON BD'],
        latitude: 10.9801,
        longitude: 106.6752,
        category: 'mall',
        force: true
      });
    expect(res.status).toBe(201);
    placeA = res.body.place;
  });

  test('TC-P1-02 check-duplicates + tạo trùng → 409', async () => {
    const check = await request(app)
      .post('/api/places/check-duplicates')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: TAG + ' AEON Mall Binh Duong',
        aliases: ['AEON Mall'],
        latitude: 10.98015,
        longitude: 106.67525,
        category: 'mall'
      });
    expect(check.status).toBe(200);
    expect(check.body.suspected).toBe(true);
    expect(check.body.top.similarity).toBeGreaterThanOrEqual(0.95);

    const blocked = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: TAG + ' AEON Mall Binh Duong',
        aliases: ['AEON'],
        latitude: 10.98015,
        longitude: 106.67525,
        category: 'mall'
      });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('DUPLICATE_SUSPECTED');

    const forced = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: TAG + ' AEON Mall Binh Duong Copy',
        aliases: ['AEON'],
        latitude: 10.98015,
        longitude: 106.67525,
        category: 'mall',
        force: true
      });
    expect(forced.status).toBe(201);
    placeB = forced.body.place;
  });

  test('TC-P1-03 scan duplicates tìm cặp', async () => {
    const res = await request(app)
      .get('/api/places/duplicates/scan')
      .query({ threshold: 0.9, limit: 50 })
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.pairs)).toBe(true);
    const hit = res.body.pairs.some((p) =>
      [String(p.place_a._id), String(p.place_b._id)].includes(String(placeA._id)) &&
      [String(p.place_a._id), String(p.place_b._id)].includes(String(placeB._id))
    );
    expect(hit).toBe(true);
  });

  test('TC-P1-04 review create → approve', async () => {
    building = await Building.create({
      name: TAG + ' Building Review',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      place_id: placeA._id,
      gps_location: { lat: 10.98, lng: 106.67 },
      created_by: superUser._id
    });

    const create = await request(app)
      .post('/api/map-reviews')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        building_id: building._id,
        requested_visibility: 'COMMUNITY',
        note: TAG + ' please review',
        place_id: placeA._id
      });
    expect(create.status).toBe(201);
    reviewId = create.body.review._id;

    const dup = await request(app)
      .post('/api/map-reviews')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        building_id: building._id,
        requested_visibility: 'OFFICIAL',
        note: TAG + ' dup'
      });
    expect(dup.status).toBe(409);

    const approve = await request(app)
      .post(`/api/map-reviews/${reviewId}/approve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(approve.status).toBe(200);

    const b = await Building.findById(building._id).lean();
    expect(b.visibility).toBe('COMMUNITY');
    expect(b.status).toBe('PUBLISHED');
  });

  test('TC-P1-05 review reject', async () => {
    const b2 = await Building.create({
      name: TAG + ' Building Reject',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      gps_location: { lat: 1, lng: 1 }
    });
    const create = await request(app)
      .post('/api/map-reviews')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        building_id: b2._id,
        requested_visibility: 'OFFICIAL',
        note: TAG + ' reject me'
      });
    expect(create.status).toBe(201);
    const id = create.body.review._id;

    const reject = await request(app)
      .post(`/api/map-reviews/${id}/reject`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ reason: 'spam' });
    expect(reject.status).toBe(200);
    expect(reject.body.review.status).toBe('REJECTED');

    await MapReviewRequest.findByIdAndDelete(id);
    await Building.findByIdAndDelete(b2._id);
  });

  test('TC-P1-06 merge-stub gắn place', async () => {
    const b3 = await Building.create({
      name: TAG + ' Building Merge',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      gps_location: { lat: 2, lng: 2 }
    });
    const create = await request(app)
      .post('/api/map-reviews')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        building_id: b3._id,
        requested_visibility: 'COMMUNITY',
        note: TAG + ' merge'
      });
    expect(create.status).toBe(201);
    const id = create.body.review._id;

    const merge = await request(app)
      .post(`/api/map-reviews/${id}/merge-stub`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ target_place_id: placeA._id });
    expect(merge.status).toBe(200);
    expect(merge.body.review.status).toBe('MERGED');

    const b = await Building.findById(b3._id).lean();
    expect(String(b.place_id)).toBe(String(placeA._id));
    expect(b.visibility).toBe('COMMUNITY');

    await MapReviewRequest.findByIdAndDelete(id);
    await Building.findByIdAndDelete(b3._id);
  });

  test('findDuplicatePlaces helper', async () => {
    const r = await findDuplicatePlaces({
      name: placeA.name,
      aliases: ['AEON'],
      latitude: placeA.latitude,
      longitude: placeA.longitude,
      category: 'mall'
    }, { excludeId: placeA._id, threshold: 0.9 });
    expect(r.suspected).toBe(true);
  });
});
