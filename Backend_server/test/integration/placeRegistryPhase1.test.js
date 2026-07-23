/**
 * Place Registry PHASE 1 — public search + CRUD fields mới
 * Local test — không commit trừ khi được yêu cầu.
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Place = require('../../models/Place');

const TAG = 'reg-p1-' + Date.now();

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Place Registry PHASE 1', () => {
  let superToken;
  let placeId;
  let slug;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser);
  });

  afterAll(async () => {
    if (placeId) await Place.findByIdAndDelete(placeId).catch(() => {});
    await Place.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-REG-01 tạo Place có slug, radius, owner_type, publication_status', async () => {
    const res = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: TAG + ' Vincom Dong Khoi',
        latitude: 10.7765,
        longitude: 106.703,
        address: 'Quận 1',
        category: 'mall',
        radius: 100,
        owner_type: 'UNCLAIMED',
        publication_status: 'PUBLIC',
        force: true
      });
    expect(res.status).toBe(201);
    expect(res.body.place.slug).toMatch(/vincom|reg-p1/i);
    expect(res.body.place.radius).toBe(100);
    expect(res.body.place.owner_type).toBe('UNCLAIMED');
    expect(res.body.place.publication_status).toBe('PUBLIC');
    placeId = res.body.place._id;
    slug = res.body.place.slug;
  });

  test('TC-REG-02 GET /places/search public theo q', async () => {
    const res = await request(app).get('/api/places/search').query({ q: TAG });
    expect(res.status).toBe(200);
    expect(res.body.places.some((p) => String(p._id) === String(placeId))).toBe(true);
  });

  test('TC-REG-03 GET /places/public/:slug', async () => {
    const res = await request(app).get(`/api/places/public/${slug}`);
    expect(res.status).toBe(200);
    expect(String(res.body.place._id)).toBe(String(placeId));
    expect(typeof res.body.has_indoor).toBe('boolean');
  });

  test('TC-REG-04 ARCHIVED không hiện public search', async () => {
    await request(app)
      .patch(`/api/places/${placeId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ publication_status: 'ARCHIVED' })
      .expect(200);

    const res = await request(app).get('/api/places/search').query({ q: TAG });
    expect(res.body.places.some((p) => String(p._id) === String(placeId))).toBe(false);

    const detail = await request(app).get(`/api/places/public/${slug}`);
    expect(detail.status).toBe(404);
    expect(detail.body.code).toBe('PLACE_NOT_PUBLIC');

    // restore PUBLIC for cleanup clarity
    await request(app)
      .patch(`/api/places/${placeId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ publication_status: 'PUBLIC' });
  });

  test('TC-REG-05 meta có owner_types + publication_status', async () => {
    const res = await request(app)
      .get('/api/places/meta/visibility')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.owner_types).toEqual(
      expect.arrayContaining(['PLATFORM', 'ORGANIZATION', 'PERSONAL', 'UNCLAIMED'])
    );
    expect(res.body.publication_status).toEqual(
      expect.arrayContaining(['DRAFT', 'PUBLIC', 'UNLISTED', 'ARCHIVED'])
    );
  });
});
