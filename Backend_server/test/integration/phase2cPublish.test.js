/**
 * Phase 2c — Publish validate + async job (202)
 * npm run test:phase2c
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Building = require('../../models/Building');
const Floor = require('../../models/Floor');
const PublishJob = require('../../models/PublishJob');
const MapVersion = require('../../models/MapVersion');
const ActivityLog = require('../../models/ActivityLog');
const { validateMapData } = require('../../services/publishMapValidate');
const { processPublishJob } = require('../../services/publishService');

const API = '/api/v1';

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitJobSuccess(token, jobId, maxMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const res = await authReq(token)('get', `${API}/publish-jobs/${jobId}`);
    if (res.statusCode === 200 && (res.body.status === 'SUCCESS' || res.body.status === 'FAILED')) {
      return res;
    }
    await sleep(50);
  }
  throw new Error('Timeout chờ job');
}

describe('Phase 2c — Publish validate + async', () => {
  let superUser;
  let superToken;
  let orgUser;
  let orgToken;
  let testBuildingId;
  let createdBuilding = false;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } });
    orgUser = await User.findOne({
      role: 'ORG_ADMIN',
      is_active: { $ne: false },
      organization_id: { $ne: null }
    });
    if (!superUser || !orgUser) throw new Error('Thiếu user test');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', Number(superUser.session_version) || 0);
    orgToken = tokenFor(orgUser._id, 'ORG_ADMIN', Number(orgUser.session_version) || 0);

    const b = await authReq(superToken)('post', '/api/buildings').send({
      name: `Pub2c ${Date.now()}`,
      address: 'Test',
      total_floors: 2,
      organization_id: orgUser.organization_id
    });
    testBuildingId = b.body?.building?._id || b.body?._id;
    createdBuilding = Boolean(testBuildingId);
    if (!testBuildingId) throw new Error('Không tạo building');
  });

  afterAll(async () => {
    if (testBuildingId) {
      await ActivityLog.deleteMany({
        action: { $in: ['PUBLISH_MAP', 'ROLLBACK_MAP'] },
        target: { $regex: String(testBuildingId) }
      });
      await PublishJob.deleteMany({ building_id: testBuildingId });
      await MapVersion.deleteMany({ building_id: testBuildingId });
      await Floor.deleteMany({ building_id: testBuildingId });
      if (createdBuilding) await Building.findByIdAndDelete(testBuildingId);
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-2c-01 validate unit: edge thiếu node → fail', () => {
    const r = validateMapData({
      nodes: [{ id: 'n1', x: 0, y: 0 }],
      edges: [{ from: 'n1', to: 'n_missing' }],
      rooms: []
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'EDGE_NODE_MISSING')).toBe(true);
  });

  test('TC-2c-02 validate API → 200 ok map đơn giản', async () => {
    const res = await authReq(superToken)(
      'post',
      `${API}/buildings/${testBuildingId}/floors/0/publish/validate`
    ).send({
      map_data: {
        rooms: [{ id: 'r1', name: 'A' }],
        nodes: [],
        edges: []
      }
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('TC-2c-03 validate API map lỗi → 400', async () => {
    const res = await authReq(superToken)(
      'post',
      `${API}/buildings/${testBuildingId}/floors/0/publish/validate`
    ).send({
      map_data: {
        nodes: [{ id: 'a', x: 1, y: 1 }],
        edges: [{ from: 'a', to: 'b' }]
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('TC-2c-04 enqueue → 202 + poll SUCCESS + public đọc được', async () => {
    const map_data = {
      rooms: [{ id: 'r-async', name: 'Async Room' }],
      nodes: [{ id: 'n1', x: 10, y: 20 }],
      edges: []
    };

    const enq = await authReq(superToken)(
      'post',
      `${API}/buildings/${testBuildingId}/floors/0/publish`
    ).send({ map_data });

    expect(enq.statusCode).toBe(202);
    expect(enq.body.job_id).toBeTruthy();
    expect(enq.body.status).toBe('QUEUED');

    // Đảm bảo worker chạy (tránh race setImmediate)
    await processPublishJob(enq.body.job_id);

    const job = await waitJobSuccess(superToken, enq.body.job_id);
    expect(job.body.status).toBe('SUCCESS');
    expect(job.body.version).toBeGreaterThanOrEqual(1);

    const pub = await request(app).get(`/api/maps/${testBuildingId}/0/public`);
    expect(pub.statusCode).toBe(200);
    expect(pub.body.map_data?.rooms?.[0]?.name).toBe('Async Room');

    const audit = await ActivityLog.findOne({
      action: 'PUBLISH_MAP',
      target: { $regex: String(testBuildingId) }
    }).sort({ createdAt: -1 }).lean();
    expect(audit.details.operation).toBe('publish');
    expect(audit.details.before).toEqual(expect.objectContaining({
      version: expect.any(Number),
      snapshot_sha256: expect.any(String)
    }));
    expect(audit.details.after).toEqual(expect.objectContaining({
      version: job.body.version,
      rooms_count: 1,
      snapshot_sha256: expect.any(String)
    }));
  });

  test('TC-2c-05 enqueue map lỗi → 400 (không tạo job)', async () => {
    const res = await authReq(superToken)(
      'post',
      `${API}/buildings/${testBuildingId}/floors/0/publish`
    ).send({
      map_data: {
        nodes: [],
        edges: [{ from: 'x', to: 'y' }]
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATE_FAILED');
  });

  test('TC-2c-06 sync publish legacy vẫn version++', async () => {
    const before = await Floor.findOne({
      building_id: testBuildingId,
      floor_number: 0
    }).lean();
    const prev = before?.version || 0;

    const res = await authReq(superToken)('post', `/api/maps/${testBuildingId}/0/publish`).send({
      map_data: {
        rooms: [{ id: 'r-sync', name: 'Sync Room' }],
        nodes: [],
        edges: []
      }
    });
    expect([200, 201]).toContain(res.statusCode);
    expect(res.body.version || res.body.map?.version).toBe(prev + 1);
  });

  test('TC-2c-06b public/download không lộ tầng chỉ có draft', async () => {
    const draft = await authReq(superToken)(
      'put',
      `/api/maps/${testBuildingId}/1/draft`
    ).send({
      map_data: {
        rooms: [{ id: 'draft-only', name: 'Draft Only Floor' }],
        nodes: [],
        edges: []
      }
    });
    expect(draft.statusCode).toBe(200);

    const publicFloor = await request(app).get(`/api/maps/${testBuildingId}/1/public`);
    expect(publicFloor.statusCode).toBe(404);

    const download = await request(app).get(`/api/maps/${testBuildingId}/download`);
    expect(download.statusCode).toBe(200);
    expect(download.body.floors).toHaveLength(1);
    expect(download.body.floors[0].floor_number).toBe(0);
    expect(download.body.floors[0].draft_map_data).toBeUndefined();
    expect(download.body.floors[0].draft_updated_at).toBeUndefined();
  });

  test('TC-2c-07 ORG_ADMIN cùng org được xem job publish của building mình', async () => {
    const enq = await authReq(superToken)(
      'post',
      `${API}/buildings/${testBuildingId}/floors/1/publish`
    ).send({
      map_data: { rooms: [{ id: 'r2', name: 'F1' }], nodes: [], edges: [] }
    });
    expect(enq.statusCode).toBe(202);
    await processPublishJob(enq.body.job_id);

    const peek = await waitJobSuccess(orgToken, enq.body.job_id);
    expect(peek.statusCode).toBe(200);
    expect(peek.body.status).toBe('SUCCESS');
  });

  test('TC-2c-09 job FAILED + retry với map_data hợp lệ → SUCCESS', async () => {
    const job = await PublishJob.create({
      building_id: testBuildingId,
      floor_number: 0,
      status: 'QUEUED',
      requested_by: superUser._id,
      map_data: {
        rooms: [{ id: 'bad', name: 'Bad' }],
        nodes: [{ id: 'n1' }],
        edges: [{ from: 'n1', to: 'missing-node' }]
      }
    });

    const failed = await processPublishJob(String(job._id));
    expect(failed.status).toBe('FAILED');
    expect(failed.attempts).toBeGreaterThanOrEqual(1);

    const peek = await authReq(superToken)('get', `${API}/publish-jobs/${job._id}`);
    expect(peek.statusCode).toBe(200);
    expect(peek.body.status).toBe('FAILED');

    const retry = await authReq(superToken)('post', `${API}/publish-jobs/${job._id}/retry`).send({
      map_data: {
        rooms: [{ id: 'ok', name: 'OK Retry' }],
        nodes: [],
        edges: []
      }
    });
    expect(retry.statusCode).toBe(202);
    expect(retry.body.status).toBe('QUEUED');

    await processPublishJob(String(job._id));
    const done = await waitJobSuccess(superToken, String(job._id));
    expect(done.body.status).toBe('SUCCESS');
  });

  test('TC-2c-10 list publish-jobs + filter FAILED', async () => {
    const list = await authReq(superToken)('get', `${API}/publish-jobs?limit=20`);
    expect(list.statusCode).toBe(200);
    expect(Array.isArray(list.body.jobs)).toBe(true);

    const failed = await authReq(superToken)('get', `${API}/publish-jobs?status=FAILED&limit=10`);
    expect(failed.statusCode).toBe(200);
    (failed.body.jobs || []).forEach((j) => expect(j.status).toBe('FAILED'));
  });

  test('TC-2c-08 rollback tạo version mới + audit before/after; public chỉ đọc bản rollback đã publish', async () => {
    const versions = await MapVersion.find({
      building_id: testBuildingId,
      floor_number: 0,
      map_snapshot: { $ne: null }
    }).sort({ version: 1 }).lean();
    expect(versions.length).toBeGreaterThanOrEqual(2);

    const target = versions[0];
    const before = await Floor.findOne({
      building_id: testBuildingId,
      floor_number: 0
    }).lean();

    const rollback = await authReq(superToken)(
      'post',
      `/api/map-versions/${testBuildingId}/0/${target.version}/rollback`
    );
    expect(rollback.statusCode).toBe(200);
    expect(rollback.body.map.version).toBe(before.version + 1);

    const pub = await request(app).get(`/api/maps/${testBuildingId}/0/public`);
    expect(pub.statusCode).toBe(200);
    expect(pub.body.version).toBe(rollback.body.map.version);
    expect(pub.body.map_data?.rooms?.[0]?.name).toBe(
      target.map_snapshot?.rooms?.[0]?.name
    );
    expect(pub.body.draft_map_data).toBeUndefined();

    const audit = await ActivityLog.findOne({
      action: 'ROLLBACK_MAP',
      target: { $regex: String(testBuildingId) }
    }).sort({ createdAt: -1 }).lean();
    expect(audit.details.operation).toBe('rollback');
    expect(audit.details.rollback_from_version).toBe(target.version);
    expect(audit.details.before.version).toBe(before.version);
    expect(audit.details.after.version).toBe(rollback.body.map.version);
    expect(audit.details.before.snapshot_sha256).not.toBe(
      audit.details.after.snapshot_sha256
    );
  });
});
