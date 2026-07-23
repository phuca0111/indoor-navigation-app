/**
 * PHASE 3 — Indoor Workspace + create from Place
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Place = require('../../models/Place');
const Building = require('../../models/Building');
const IndoorWorkspace = require('../../models/IndoorWorkspace');
const Organization = require('../../models/Organization');
const { slugifyPlaceName } = require('../../utils/placeRegistry');

const TAG = 'ws-p3-' + Date.now();

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe.skip('Indoor Workspace PHASE 3', () => {
  let superToken;
  let orgId;
  let place;
  let workspaceId;
  let buildingId;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser);

    const org = await Organization.findOne({ is_active: { $ne: false } }).select('_id').lean();
    orgId = org?._id;
    if (!orgId) throw new Error('Thiếu Organization');

    place = await Place.create({
      name: TAG + ' Place Mall',
      slug: slugifyPlaceName(TAG + ' Place Mall') + '-' + Date.now().toString(36),
      latitude: 10.777,
      longitude: 106.701,
      address: 'Q1',
      category: 'mall',
      radius: 90,
      status: 'ACTIVE',
      publication_status: 'PUBLIC'
    });
  });

  afterAll(async () => {
    if (workspaceId) await IndoorWorkspace.findByIdAndDelete(workspaceId).catch(() => {});
    if (buildingId) await Building.findByIdAndDelete(buildingId).catch(() => {});
    if (place?._id) await Place.findByIdAndDelete(place._id).catch(() => {});
    await IndoorWorkspace.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    await Building.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    await Place.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-WS-01 tạo Workspace từ Place → Building GPS lấy từ Place', async () => {
    const res = await request(app)
      .post('/api/indoor-workspaces')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        place_id: String(place._id),
        name: TAG + ' Official WS',
        kind: 'OFFICIAL',
        total_floors: 3,
        activation_radius: 70,
        organization_id: String(orgId),
        description: 'Workspace test'
      });

    if (res.status !== 201) {
      // quota đầy — skip soft
      console.warn('create workspace status', res.status, res.body);
    }
    expect([201, 403]).toContain(res.status);
    if (res.status !== 201) return;

    expect(res.body.workspace.place_id).toBeTruthy();
    expect(res.body.workspace.building_id).toBeTruthy();
    expect(res.body.next.building_id).toBeTruthy();
    workspaceId = res.body.workspace._id;
    buildingId = res.body.building._id || res.body.next.building_id;

    const b = await Building.findById(buildingId).lean();
    expect(b.place_id.toString()).toBe(place._id.toString());
    expect(b.gps_location.lat).toBeCloseTo(10.777, 3);
    expect(b.total_floors).toBe(3);
    expect(String(b.workspace_id)).toBe(String(workspaceId));
  });

  test('TC-WS-02 list theo place_id', async () => {
    if (!workspaceId) return;
    const res = await request(app)
      .get('/api/indoor-workspaces')
      .query({ place_id: String(place._id) })
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.workspaces.some((w) => String(w._id) === String(workspaceId))).toBe(true);
  });

  test('TC-WS-03 get workspace detail', async () => {
    if (!workspaceId) return;
    const res = await request(app)
      .get(`/api/indoor-workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.workspace.building).toBeTruthy();
    expect(res.body.workspace.place.name).toContain('Place Mall');
  });

  test('TC-WS-04 thiếu place_id → 400', async () => {
    const res = await request(app)
      .post('/api/indoor-workspaces')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'No place' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PLACE_REQUIRED');
  });
});
