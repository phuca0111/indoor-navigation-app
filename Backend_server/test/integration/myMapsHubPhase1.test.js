/**
 * My Maps Hub Phase 1 — smoke
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = require('../../server');
const User = require('../../models/User');
const Place = require('../../models/Place');
const UserFavorite = require('../../models/UserFavorite');
const { slugifyPlaceName } = require('../../utils/placeRegistry');

const TAG = 'hub-p1-' + Date.now();

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('My Maps Hub Phase 1', () => {
  let user;
  let place;
  let token;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    user = await User.create({
      email: TAG + '@test.local',
      password: await bcrypt.hash('Demo@1234', 10),
      role: 'REGISTERED_USER',
      full_name: 'Hub Tester',
      is_active: true
    });
    token = tokenFor(user);

    place = await Place.create({
      name: TAG + ' Place',
      slug: slugifyPlaceName(TAG + ' Place') + '-' + Date.now().toString(36),
      latitude: 10.77,
      longitude: 106.70,
      address: 'HCMC',
      category: 'mall',
      status: 'ACTIVE',
      publication_status: 'PUBLIC'
    });
  });

  afterAll(async () => {
    if (user?._id) {
      await UserFavorite.deleteMany({ user_id: user._id }).catch(() => {});
      await User.findByIdAndDelete(user._id).catch(() => {});
    }
    if (place?._id) await Place.findByIdAndDelete(place._id).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-HUB-01 static /app shell exists', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../public/app/index.html'), 'utf8');
    expect(html).toMatch(/My Maps/);
    expect(html).toMatch(/app\.js/);
  });

  test('TC-HUB-02 GET /app serves page', async () => {
    const res = await request(app).get('/app');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/My Maps/i);
  });

  test('TC-HUB-03 hub/me maps REGISTERED_USER → END_USER', async () => {
    const res = await request(app)
      .get('/api/hub/me')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('REGISTERED_USER');
    expect(res.body.user.display_role).toBe('END_USER');
    expect(res.body.user.display_plan).toBe('DEMO');
    expect(res.body.user.capabilities.canRequestOfficial).toBe(false);
    expect(res.body.user.capabilities.canSubmitCommunity).toBe(true);
    expect(res.body.user.limits.maxWorkspaces).toBe(1);
  });

  test('TC-HUB-04 favorites add/list/remove', async () => {
    const add = await request(app)
      .post('/api/hub/favorites')
      .set('Authorization', 'Bearer ' + token)
      .send({ place_id: place._id });
    expect(add.status).toBe(200);

    const list = await request(app)
      .get('/api/hub/favorites')
      .set('Authorization', 'Bearer ' + token);
    expect(list.status).toBe(200);
    expect(list.body.favorites.some((f) => String(f.place_id) === String(place._id))).toBe(true);

    const del = await request(app)
      .delete('/api/hub/favorites/' + place._id)
      .set('Authorization', 'Bearer ' + token);
    expect(del.status).toBe(200);
  });

  test('TC-HUB-05 workspaces + history endpoints', async () => {
    const ws = await request(app)
      .get('/api/hub/workspaces')
      .set('Authorization', 'Bearer ' + token);
    expect(ws.status).toBe(200);
    expect(Array.isArray(ws.body.workspaces)).toBe(true);

    const hist = await request(app)
      .post('/api/hub/history')
      .set('Authorization', 'Bearer ' + token)
      .send({ type: 'VIEW_PLACE', place_id: place._id, label: 'View test' });
    expect(hist.status).toBe(201);

    const list = await request(app)
      .get('/api/hub/history')
      .set('Authorization', 'Bearer ' + token);
    expect(list.status).toBe(200);
    expect(list.body.history.length).toBeGreaterThan(0);
  });

  test('TC-HUB-06 favorites/check + place proposal form API', async () => {
    await request(app)
      .post('/api/hub/favorites')
      .set('Authorization', 'Bearer ' + token)
      .send({ place_id: place._id });

    const check = await request(app)
      .get('/api/hub/favorites/check')
      .query({ place_id: String(place._id) })
      .set('Authorization', 'Bearer ' + token);
    expect(check.status).toBe(200);
    expect(check.body.favorited).toBe(true);

    const prop = await request(app)
      .post('/api/place-proposals')
      .set('Authorization', 'Bearer ' + token)
      .send({
        name: TAG + ' Proposal Unique ' + Date.now(),
        latitude: 10.781234,
        longitude: 106.712345,
        address: 'Test Addr',
        category: 'mall',
        description: 'Hub form smoke'
      });
    expect([201, 400].includes(prop.status)).toBe(true);
    if (prop.status === 201) {
      expect(prop.body.proposal).toBeTruthy();
      const PlaceProposal = require('../../models/PlaceProposal');
      await PlaceProposal.findByIdAndDelete(prop.body.proposal._id).catch(() => {});
    }
  });

  test('TC-HUB-07 submit-community ownership gate', async () => {
    const Building = require('../../models/Building');
    const IndoorWorkspace = require('../../models/IndoorWorkspace');
    const MapReviewRequest = require('../../models/MapReviewRequest');

    const building = await Building.create({
      name: TAG + ' Hub Building',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      place_id: place._id,
      gps_location: { lat: 10.77, lng: 106.70 },
      created_by: user._id
    });
    const ws = await IndoorWorkspace.create({
      name: TAG + ' Hub WS',
      place_id: place._id,
      building_id: building._id,
      owner_user_id: user._id,
      created_by: user._id,
      kind: 'PERSONAL',
      status: 'DRAFT'
    });

    const res = await request(app)
      .post('/api/hub/workspaces/' + ws._id + '/submit-community')
      .set('Authorization', 'Bearer ' + token)
      .send({ note: 'from hub test' });
    expect(res.status).toBe(201);
    expect(res.body.review || res.auto_approved != null || res.body.message).toBeTruthy();

    await MapReviewRequest.deleteMany({ building_id: building._id }).catch(() => {});
    await IndoorWorkspace.findByIdAndDelete(ws._id).catch(() => {});
    await Building.findByIdAndDelete(building._id).catch(() => {});
  });

  test('TC-HUB-08 Demo plan blocks OFFICIAL review', async () => {
    const Building = require('../../models/Building');
    const MapReviewRequest = require('../../models/MapReviewRequest');
    const building = await Building.create({
      name: TAG + ' Official Deny',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      place_id: place._id,
      gps_location: { lat: 10.77, lng: 106.70 },
      created_by: user._id,
      owner_user_id: user._id
    });

    const denied = await request(app)
      .post('/api/map-reviews')
      .set('Authorization', 'Bearer ' + token)
      .send({
        building_id: building._id,
        requested_visibility: 'OFFICIAL',
        note: 'demo deny'
      });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('PLAN_OFFICIAL_DENIED');

    const ok = await request(app)
      .post('/api/map-reviews')
      .set('Authorization', 'Bearer ' + token)
      .send({
        building_id: building._id,
        requested_visibility: 'COMMUNITY',
        note: 'demo community ok'
      });
    expect(ok.status).toBe(201);

    await MapReviewRequest.deleteMany({ building_id: building._id }).catch(() => {});
    await Building.findByIdAndDelete(building._id).catch(() => {});
  });
});
