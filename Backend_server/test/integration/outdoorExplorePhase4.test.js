/**
 * PHASE 4 — Outdoor Explore smoke (API + static page)
 */
const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const app = require('../../server');
const Place = require('../../models/Place');
const { slugifyPlaceName } = require('../../utils/placeRegistry');

const TAG = 'ex-p4-' + Date.now();

describe('Outdoor Explore PHASE 4', () => {
  let place;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    place = await Place.create({
      name: TAG + ' Explore Spot',
      slug: slugifyPlaceName(TAG + ' Explore Spot') + '-' + Date.now().toString(36),
      latitude: 10.78,
      longitude: 106.70,
      address: 'HCMC',
      category: 'mall',
      radius: 100,
      status: 'ACTIVE',
      publication_status: 'PUBLIC'
    });
  });

  afterAll(async () => {
    if (place?._id) await Place.findByIdAndDelete(place._id).catch(() => {});
    await Place.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-EX-01 static explore page exists', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '../../public/explore/index.html'),
      'utf8'
    );
    expect(html).toMatch(/leaflet/i);
    expect(html).toMatch(/explore\.js/);
    expect(html).toMatch(/exCat/);
    const js = fs.readFileSync(
      path.join(__dirname, '../../public/explore/explore.js'),
      'utf8'
    );
    expect(js).toMatch(/places\/search/);
    expect(js).toMatch(/geolocation/);
    expect(js).toMatch(/DEBOUNCE_MS|scheduleSearch/);
    expect(js).toMatch(/place.*slug|slug.*place/i);
  });

  test('TC-EX-02 GET /explore serves page', async () => {
    const res = await request(app).get('/explore');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Outdoor Map|Khám phá/i);
    expect(res.text).toMatch(/exCat/);
  });

  test('TC-EX-03 search nearby + public detail indoor fields', async () => {
    const search = await request(app)
      .get('/api/places/search')
      .query({ q: TAG, lat: 10.78, lng: 106.70, radius_m: 2000 });
    expect(search.status).toBe(200);
    expect(search.body.places.some((p) => String(p._id) === String(place._id))).toBe(true);

    const detail = await request(app).get(`/api/places/public/${place.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toHaveProperty('has_indoor');
    expect(Array.isArray(detail.body.indoor_buildings)).toBe(true);
    expect(Array.isArray(detail.body.workspaces)).toBe(true);
  });

  test('TC-EX-04 category filter on public search', async () => {
    const res = await request(app)
      .get('/api/places/search')
      .query({ category: 'mall', q: TAG });
    expect(res.status).toBe(200);
    expect(res.body.places.some((p) => String(p._id) === String(place._id))).toBe(true);
  });
});
