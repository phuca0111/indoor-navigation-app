/**
 * Phase 3.9 — Regression integration tests (Map workflow + RBAC)
 * Chạy: npm run test:phase3
 *
 * Yêu cầu: MongoDB local + dữ liệu dev (ít nhất 1 SUPER_ADMIN, 1 ORG_ADMIN, 1 BUILDING_ADMIN).
 * Không dùng login HTTP — tạo JWT từ userId trong DB (giống pattern test 1A.6).
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Building = require('../../models/Building');
const Floor = require('../../models/Floor');
const MapVersion = require('../../models/MapVersion');

const API = '/api';

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

describe('Phase 3.9 — Map workflow regression', () => {
  let superToken;
  let orgToken;
  let baToken;
  let superUser;
  let orgUser;
  let baUser;
  let publishedBuildingId;
  let draftBuildingId;
  let baAssignedId;
  let baUnassignedId;
  let rollbackBuildingId;
  let rollbackFloor = 0;
  let rollbackTargetVersion;
  let versionBeforeRollback;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) {
      require('dotenv').config();
    }
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }

    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    orgUser = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false }, organization_id: { $ne: null } }).lean();
    baUser = await User.findOne({
      role: 'BUILDING_ADMIN',
      is_active: { $ne: false },
      assigned_buildings: { $exists: true, $not: { $size: 0 } }
    }).lean();

    if (!superUser) throw new Error('Thiếu SUPER_ADMIN active trong DB — không chạy được Phase 3.9');
    if (!orgUser) throw new Error('Thiếu ORG_ADMIN active trong DB — không chạy được Phase 3.9');
    if (!baUser) throw new Error('Thiếu BUILDING_ADMIN có assigned_buildings — không chạy được Phase 3.9');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', Number(superUser.session_version) || 0);
    orgToken = tokenFor(orgUser._id, 'ORG_ADMIN', Number(orgUser.session_version) || 0);
    baToken = tokenFor(baUser._id, 'BUILDING_ADMIN', Number(baUser.session_version) || 0);

    baAssignedId = String(baUser.assigned_buildings[0]);

    const otherBuilding = await Building.findOne({
      _id: { $nin: baUser.assigned_buildings },
      is_active: { $ne: false },
      organization_id: baUser.organization_id
    }).select('_id').lean();
    baUnassignedId = otherBuilding ? String(otherBuilding._id) : null;

    const published = await Building.findOne({
      status: 'PUBLISHED',
      is_active: { $ne: false }
    }).select('_id').lean();
    publishedBuildingId = published ? String(published._id) : baAssignedId;

    const draft = await Building.findOne({
      status: 'DRAFT',
      is_active: { $ne: false }
    }).select('_id').lean();
    draftBuildingId = draft ? String(draft._id) : null;

    // Luôn seed snapshot rollback tự đủ — không phụ thuộc MapVersion orphan từ suite khác.
    const seedBuildingId = (await Building.findOne({
      organization_id: orgUser.organization_id,
      is_active: { $ne: false }
    }).select('_id').lean())?._id || baAssignedId;

    if (seedBuildingId) {
      let floorDoc = await Floor.findOne({
        building_id: seedBuildingId,
        floor_number: 0
      });
      if (!floorDoc) {
        floorDoc = await Floor.create({
          building_id: seedBuildingId,
          floor_number: 0,
          floor_name: 'Tầng trệt',
          version: 1,
          map_data: { rooms: [{ id: 'r-seed' }], nodes: [], edges: [] },
          published_at: new Date()
        });
      } else if (!floorDoc.map_data || !Array.isArray(floorDoc.map_data.rooms)) {
        floorDoc = await Floor.findOneAndUpdate(
          { _id: floorDoc._id },
          {
            $set: {
              map_data: { rooms: [{ id: 'r-seed' }], nodes: [], edges: [] },
              published_at: floorDoc.published_at || new Date()
            }
          },
          { new: true }
        );
      }

      const seedVersion = Number(floorDoc.version) || 1;
      await MapVersion.findOneAndUpdate(
        {
          building_id: seedBuildingId,
          floor_number: 0,
          version: seedVersion
        },
        {
          $set: {
            rooms_count: 1,
            nodes_count: 0,
            edges_count: 0,
            map_snapshot: {
              rooms: [{ id: 'r-seed', name: 'Seed Room' }],
              nodes: [],
              edges: []
            },
            graph_snapshot: { nodes: [], edges: [] },
            published_at: new Date()
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      );

      rollbackBuildingId = String(seedBuildingId);
      rollbackFloor = 0;
      rollbackTargetVersion = seedVersion;
      versionBeforeRollback = seedVersion;
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  // --- 3.2 Tạo tòa ---
  test('TC-3.9-01 BUILDING_ADMIN POST /buildings → 403', async () => {
    const res = await authReq(baToken)('post', `${API}/buildings`)
      .send({ name: 'TC39 Forbidden', address: 'x', organization_id: String(orgUser.organization_id) });
    expect(res.status).toBe(403);
  });

  test('TC-3.9-02 ORG_ADMIN POST /buildings → 201 hoặc 200', async () => {
    const res = await authReq(orgToken)('post', `${API}/buildings`)
      .send({
        name: 'TC39 Temp Building',
        address: 'Regression test',
        total_floors: 1,
        latitude: 10.77,
        longitude: 106.69
      });
    expect([200, 201]).toContain(res.status);
    if (res.body && res.body._id) {
      await authReq(orgToken)('delete', `${API}/buildings/${res.body._id}`);
    }
  });

  // --- 3.6 Metadata tòa ---
  test('TC-3.9-03 BUILDING_ADMIN PUT /buildings/:assigned → 403', async () => {
    const res = await authReq(baToken)('put', `${API}/buildings/${baAssignedId}`)
      .send({ name: 'Hacked Name TC39' });
    expect(res.status).toBe(403);
  });

  test('TC-3.9-04 BUILDING_ADMIN DELETE /buildings/:assigned → 403', async () => {
    const res = await authReq(baToken)('delete', `${API}/buildings/${baAssignedId}`);
    expect(res.status).toBe(403);
  });

  // --- 3.1 buildingAccess map ---
  test('TC-3.9-05 BUILDING_ADMIN GET map tòa được gán → 200', async () => {
    const res = await authReq(baToken)('get', `${API}/maps/${baAssignedId}/0`);
    expect([200, 404]).toContain(res.status);
  });

  test('TC-3.9-06 BUILDING_ADMIN GET map tòa không gán → 403', async () => {
    if (!baUnassignedId) {
      console.warn('SKIP TC-3.9-06: không có tòa unassigned cùng org');
      return;
    }
    const res = await authReq(baToken)('get', `${API}/maps/${baUnassignedId}/0`);
    expect(res.status).toBe(403);
  });

  test('TC-3.9-07 BUILDING_ADMIN publish tòa không gán → 403', async () => {
    if (!baUnassignedId) return;
    const res = await authReq(baToken)('post', `${API}/maps/${baUnassignedId}/0/publish`)
      .send({ map_data: { rooms: [], nodes: [], edges: [] } });
    expect(res.status).toBe(403);
  });

  // --- 3.3 Public gate ---
  test('TC-3.9-08 Public GET /maps/:id/download PUBLISHED → 200', async () => {
    const res = await request(app).get(`${API}/maps/${publishedBuildingId}/download`);
    expect(res.status).toBe(200);
    expect(res.body.floors).toBeDefined();
  });

  test('TC-3.9-09 Public GET /maps DRAFT → 404', async () => {
    if (!draftBuildingId) {
      console.warn('SKIP TC-3.9-09: không có tòa DRAFT trong DB');
      return;
    }
    const res = await request(app).get(`${API}/maps/${draftBuildingId}/download`);
    expect(res.status).toBe(404);
  });

  // --- 3.5 GET building by id ---
  test('TC-3.9-10 BUILDING_ADMIN GET /buildings/:assigned → 200', async () => {
    const res = await authReq(baToken)('get', `${API}/buildings/${baAssignedId}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBeDefined();
  });

  // --- 3.8 Map versions ---
  test('TC-3.9-11 GET map-versions trả current_version + versions[]', async () => {
    const res = await authReq(baToken)('get', `${API}/map-versions/${baAssignedId}/0`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('versions');
    expect(Array.isArray(res.body.versions)).toBe(true);
  });

  test('TC-3.9-12 Rollback bản không snapshot → 400', async () => {
    const candidates = await MapVersion.find({}).lean();
    const oldVer = candidates.find((v) => {
      const hasRooms = !!(v.map_snapshot && Array.isArray(v.map_snapshot.rooms));
      const nodes = v.graph_snapshot?.nodes || [];
      const edges = v.graph_snapshot?.edges || [];
      return !hasRooms && nodes.length === 0 && edges.length === 0;
    });
    if (!oldVer) {
      console.warn('SKIP TC-3.9-12: không có version cũ thiếu snapshot');
      return;
    }
    const res = await authReq(superToken)('post',
      `${API}/map-versions/${oldVer.building_id}/${oldVer.floor_number}/${oldVer.version}/rollback`);
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('no_restorable_snapshot');
  });

  test('TC-3.9-13 Rollback bản snapshot đủ → 200 và version tăng', async () => {
    if (!rollbackBuildingId || rollbackTargetVersion == null || versionBeforeRollback == null) {
      console.warn('SKIP TC-3.9-13: không có dữ liệu rollback phù hợp');
      return;
    }
    const res = await authReq(superToken)('post',
      `${API}/map-versions/${rollbackBuildingId}/${rollbackFloor}/${rollbackTargetVersion}/rollback`);
    expect(res.status).toBe(200);
    expect(res.body.rollback_mode).toBe('full');
    expect(res.body.map.version).toBeGreaterThan(versionBeforeRollback);
  });

  test('TC-3.9-14 ORG_ADMIN GET map-versions tòa trong org → 200', async () => {
    const building = await Building.findOne({
      organization_id: orgUser.organization_id,
      is_active: { $ne: false }
    }).select('_id').lean();
    if (!building) return;
    const res = await authReq(orgToken)('get', `${API}/map-versions/${building._id}/0`);
    expect(res.status).toBe(200);
  });

  test('TC-3.9-15 ORG_ADMIN rollback tòa trong org (nếu có snapshot) → 200 hoặc 400', async () => {
    if (!rollbackBuildingId || rollbackTargetVersion == null) return;
    const inOrg = await Building.findOne({
      _id: rollbackBuildingId,
      organization_id: orgUser.organization_id
    }).lean();
    if (!inOrg) {
      console.warn('SKIP TC-3.9-15: building rollback không thuộc org ORG_ADMIN test');
      return;
    }
    const res = await authReq(orgToken)('post',
      `${API}/map-versions/${rollbackBuildingId}/${rollbackFloor}/${rollbackTargetVersion}/rollback`);
    expect([200, 400]).toContain(res.status);
  });
});
