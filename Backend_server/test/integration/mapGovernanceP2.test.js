/**
 * Map Governance P2 — Ownership + Merge Engine
 * npx jest test/integration/mapGovernanceP2.test.js --runInBand --verbose
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Place = require('../../models/Place');
const Building = require('../../models/Building');
const Organization = require('../../models/Organization');
const PlaceOwnershipRequest = require('../../models/PlaceOwnershipRequest');
const PlaceMergeRequest = require('../../models/PlaceMergeRequest');
const { mergePlaces } = require('../../services/placeMergeEngine');

const TAG = 'mgc-p2-' + Date.now();

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Map Governance P2', () => {
  let superToken;
  let orgToken;
  let org;
  let placeA;
  let placeB;
  let buildingOnB;
  const cleanup = { ownership: [], merges: [], places: [], buildings: [] };

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser);
    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    if (orgAdmin) orgToken = tokenFor(orgAdmin);
    org = await Organization.findOne({ is_active: { $ne: false } }).select('_id name').lean();
    if (!org) throw new Error('Thiếu Organization');
  });

  afterAll(async () => {
    await PlaceOwnershipRequest.deleteMany({ _id: { $in: cleanup.ownership } }).catch(() => {});
    await PlaceMergeRequest.deleteMany({ _id: { $in: cleanup.merges } }).catch(() => {});
    await Building.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    await Place.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-P2-01 CLAIM ownership + approve', async () => {
    const created = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: TAG + ' Place Claim',
        latitude: 10.1,
        longitude: 106.1,
        force: true
      });
    expect(created.status).toBe(201);
    placeA = created.body.place;
    cleanup.places.push(placeA._id);

    const claim = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        type: 'CLAIM',
        place_id: placeA._id,
        organization_id: org._id,
        note: TAG + ' claim'
      });
    expect(claim.status).toBe(201);
    cleanup.ownership.push(claim.body.request._id);

    const approve = await request(app)
      .post(`/api/place-ownership/${claim.body.request._id}/approve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(approve.status).toBe(200);

    const p = await Place.findById(placeA._id).lean();
    expect(String(p.owner_org_id)).toBe(String(org._id));
    expect(p.verified).toBe(true);
  });

  test('TC-P2-02 CLAIM khi đã có owner → 400; CHANGE approve', async () => {
    const otherOrgId = new mongoose.Types.ObjectId();
    const badSame = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        type: 'CLAIM',
        place_id: placeA._id,
        organization_id: org._id
      });
    expect(badSame.status).toBe(400);

    // org khác nhưng place đã có chủ → PLACE_HAS_OWNER (cần org tồn tại)
    const org2 = await Organization.findOne({
      _id: { $ne: org._id },
      is_active: { $ne: false }
    }).select('_id').lean();

    if (org2) {
      const badOther = await request(app)
        .post('/api/place-ownership')
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          type: 'CLAIM',
          place_id: placeA._id,
          organization_id: org2._id
        });
      expect(badOther.status).toBe(400);
      expect(badOther.body.code).toBe('PLACE_HAS_OWNER');
    } else {
      // không có org2: fake id → 400 org không tồn tại cũng chấp nhận được
      const badFake = await request(app)
        .post('/api/place-ownership')
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          type: 'CLAIM',
          place_id: placeA._id,
          organization_id: otherOrgId
        });
      expect(badFake.status).toBe(400);
    }

    const change = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        type: 'CHANGE',
        place_id: placeA._id,
        proposed_changes: { name: TAG + ' Place Claim Renamed', aliases: 'AliasA, AliasB' },
        note: TAG + ' change'
      });
    expect(change.status).toBe(201);
    cleanup.ownership.push(change.body.request._id);

    const approve = await request(app)
      .post(`/api/place-ownership/${change.body.request._id}/approve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(approve.status).toBe(200);
    const p = await Place.findById(placeA._id).lean();
    expect(p.name).toContain('Renamed');
    expect(p.aliases).toEqual(expect.arrayContaining(['AliasA', 'AliasB']));
  });

  test('TC-P2-03 Merge engine chuyển building + MERGED source', async () => {
    const bPlace = await request(app)
      .post('/api/places')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: TAG + ' Place Source Merge',
        aliases: ['SRC'],
        latitude: 10.9801,
        longitude: 106.6752,
        category: 'mall',
        force: true
      });
    expect(bPlace.status).toBe(201);
    placeB = bPlace.body.place;
    cleanup.places.push(placeB._id);

    buildingOnB = await Building.create({
      name: TAG + ' Bld on source',
      place_id: placeB._id,
      status: 'DRAFT',
      visibility: 'PRIVATE',
      gps_location: { lat: 10.98, lng: 106.67 }
    });
    cleanup.buildings.push(buildingOnB._id);

    // target = placeA
    const result = await mergePlaces(placeB._id, placeA._id, { markVerified: true });
    expect(result.buildings_moved).toBeGreaterThanOrEqual(1);

    const src = await Place.findById(placeB._id).lean();
    const tgt = await Place.findById(placeA._id).lean();
    const b = await Building.findById(buildingOnB._id).lean();
    expect(src.status).toBe('MERGED');
    expect(String(b.place_id)).toBe(String(placeA._id));
    expect(tgt.aliases).toEqual(expect.arrayContaining(['SRC']));
  });

  test('TC-P2-04 merge request queue approve', async () => {
    const s = await Place.create({
      name: TAG + ' QSource',
      latitude: 11,
      longitude: 107,
      status: 'ACTIVE'
    });
    const t = await Place.create({
      name: TAG + ' QTarget',
      latitude: 11.0001,
      longitude: 107.0001,
      status: 'ACTIVE'
    });
    cleanup.places.push(s._id, t._id);
    const b = await Building.create({
      name: TAG + ' QBld',
      place_id: s._id,
      gps_location: { lat: 11, lng: 107 }
    });
    cleanup.buildings.push(b._id);

    const create = await request(app)
      .post('/api/place-merges')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        source_place_id: s._id,
        target_place_id: t._id,
        note: TAG + ' queue'
      });
    expect(create.status).toBe(201);
    cleanup.merges.push(create.body.request._id);

    const approve = await request(app)
      .post(`/api/place-merges/${create.body.request._id}/approve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(approve.status).toBe(200);
    expect(approve.body.request.status).toBe('COMPLETED');

    const src = await Place.findById(s._id).lean();
    const moved = await Building.findById(b._id).lean();
    expect(src.status).toBe('MERGED');
    expect(String(moved.place_id)).toBe(String(t._id));
  });

  test('TC-P2-05 execute_now merge', async () => {
    const s = await Place.create({ name: TAG + ' ExecSrc', latitude: 12, longitude: 108, status: 'ACTIVE' });
    const t = await Place.create({ name: TAG + ' ExecTgt', latitude: 12.001, longitude: 108.001, status: 'ACTIVE' });
    cleanup.places.push(s._id, t._id);

    const res = await request(app)
      .post('/api/place-merges/execute')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        source_place_id: s._id,
        target_place_id: t._id,
        note: TAG + ' exec'
      });
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe('COMPLETED');
    cleanup.merges.push(res.body.request._id);

    const src = await Place.findById(s._id).lean();
    expect(src.status).toBe('MERGED');
  });

  test('TC-P2-06 set owner trực tiếp', async () => {
    const p = await Place.create({ name: TAG + ' SetOwner', status: 'ACTIVE' });
    cleanup.places.push(p._id);
    const res = await request(app)
      .patch(`/api/place-ownership/places/${p._id}/owner`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ organization_id: org._id, verified: true });
    expect(res.status).toBe(200);
    const doc = await Place.findById(p._id).lean();
    expect(String(doc.owner_org_id)).toBe(String(org._id));
    expect(doc.verified).toBe(true);
  });

  test('TC-P2-07 reject ownership', async () => {
    const p = await Place.create({ name: TAG + ' RejectClaim', status: 'ACTIVE' });
    cleanup.places.push(p._id);
    const create = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ type: 'CLAIM', place_id: p._id, organization_id: org._id, note: TAG });
    expect(create.status).toBe(201);
    cleanup.ownership.push(create.body.request._id);

    const reject = await request(app)
      .post(`/api/place-ownership/${create.body.request._id}/reject`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ reason: 'nope' });
    expect(reject.status).toBe(200);
    expect(reject.body.request.status).toBe('REJECTED');
    const doc = await Place.findById(p._id).lean();
    expect(doc.owner_org_id).toBeFalsy();
  });

  test('TC-P2-08 auth: không token 401, ORG_ADMIN 403', async () => {
    const noAuth = await request(app).get('/api/place-ownership');
    expect(noAuth.status).toBe(401);
    const noAuthMerge = await request(app).get('/api/place-merges');
    expect(noAuthMerge.status).toBe(401);
    if (orgToken) {
      const forbidden = await request(app)
        .get('/api/place-ownership')
        .set('Authorization', `Bearer ${orgToken}`);
      expect(forbidden.status).toBe(403);
      const forbiddenMerge = await request(app)
        .post('/api/place-merges')
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ source_place_id: placeA._id, target_place_id: placeA._id });
      expect(forbiddenMerge.status).toBe(403);
    }
  });

  test('TC-P2-09 validation CLAIM/CHANGE thiếu field', async () => {
    const p = await Place.create({ name: TAG + ' Val', status: 'ACTIVE' });
    cleanup.places.push(p._id);

    const noOrg = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ type: 'CLAIM', place_id: p._id });
    expect(noOrg.status).toBe(400);

    const noChanges = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ type: 'CHANGE', place_id: p._id });
    expect(noChanges.status).toBe(400);

    const badType = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ type: 'HACK', place_id: p._id });
    expect(badType.status).toBe(400);
    expect(badType.body.code).toBe('INVALID_TYPE');
  });

  test('TC-P2-10 TRANSFER approve đổi chủ', async () => {
    const org2 = await Organization.findOne({
      _id: { $ne: org._id },
      is_active: { $ne: false }
    }).select('_id').lean();
    if (!org2) return;

    const p = await Place.create({
      name: TAG + ' Transfer',
      status: 'ACTIVE',
      owner_org_id: org._id
    });
    cleanup.places.push(p._id);

    const transferOnEmpty = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        type: 'TRANSFER',
        place_id: (await Place.create({ name: TAG + ' NoOwnerX', status: 'ACTIVE' }))._id,
        organization_id: org2._id
      });
    // place vừa tạo không cleanup id — thêm
    const emptyPlace = await Place.findOne({ name: TAG + ' NoOwnerX' }).lean();
    if (emptyPlace) cleanup.places.push(emptyPlace._id);
    expect(transferOnEmpty.status).toBe(400);
    expect(transferOnEmpty.body.code).toBe('NO_OWNER');

    const create = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        type: 'TRANSFER',
        place_id: p._id,
        organization_id: org2._id,
        note: TAG + ' transfer'
      });
    expect(create.status).toBe(201);
    cleanup.ownership.push(create.body.request._id);
    expect(String(create.body.request.from_organization_id)).toBe(String(org._id));

    const approve = await request(app)
      .post(`/api/place-ownership/${create.body.request._id}/approve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(approve.status).toBe(200);
    const doc = await Place.findById(p._id).lean();
    expect(String(doc.owner_org_id)).toBe(String(org2._id));
  });

  test('TC-P2-11 double approve / reject → NOT_PENDING', async () => {
    const p = await Place.create({ name: TAG + ' Double', status: 'ACTIVE' });
    cleanup.places.push(p._id);
    const create = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ type: 'CLAIM', place_id: p._id, organization_id: org._id });
    expect(create.status).toBe(201);
    const id = create.body.request._id;
    cleanup.ownership.push(id);

    await request(app)
      .post(`/api/place-ownership/${id}/approve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({});

    const again = await request(app)
      .post(`/api/place-ownership/${id}/approve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('NOT_PENDING');

    const rejectAgain = await request(app)
      .post(`/api/place-ownership/${id}/reject`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ reason: 'x' });
    expect(rejectAgain.status).toBe(400);
    expect(rejectAgain.body.code).toBe('NOT_PENDING');
  });

  test('TC-P2-12 merge SAME_PLACE / MERGED / LOCKED', async () => {
    const locked = await Place.create({ name: TAG + ' LockedTgt', status: 'LOCKED' });
    const merged = await Place.create({ name: TAG + ' MergedSrc', status: 'MERGED' });
    const live = await Place.create({ name: TAG + ' Live', status: 'ACTIVE' });
    cleanup.places.push(locked._id, merged._id, live._id);

    const same = await request(app)
      .post('/api/place-merges')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ source_place_id: live._id, target_place_id: live._id, execute_now: true });
    expect(same.status).toBe(400);
    expect(same.body.code).toBe('SAME_PLACE');

    await expect(mergePlaces(merged._id, live._id)).rejects.toMatchObject({ code: 'SOURCE_NOT_MERGEABLE' });
    await expect(mergePlaces(live._id, locked._id)).rejects.toMatchObject({ code: 'TARGET_NOT_MERGEABLE' });
  });

  test('TC-P2-13 merge GPS ưu tiên source verified; owner từ source nếu target trống', async () => {
    const source = await Place.create({
      name: TAG + ' GpsSrc',
      aliases: ['S1'],
      latitude: 20.5,
      longitude: 105.5,
      address: 'FromSource',
      verified: true,
      owner_org_id: org._id,
      status: 'ACTIVE'
    });
    const target = await Place.create({
      name: TAG + ' GpsTgt',
      aliases: ['T1'],
      latitude: 1,
      longitude: 1,
      verified: false,
      owner_org_id: null,
      status: 'ACTIVE'
    });
    cleanup.places.push(source._id, target._id);

    const result = await mergePlaces(source._id, target._id, { markVerified: true });
    expect(result.target_verified).toBe(true);

    const tgt = await Place.findById(target._id).lean();
    expect(tgt.latitude).toBe(20.5);
    expect(tgt.longitude).toBe(105.5);
    expect(tgt.address).toBe('FromSource');
    expect(String(tgt.owner_org_id)).toBe(String(org._id));
    expect(tgt.aliases).toEqual(expect.arrayContaining(['S1', 'T1', TAG + ' GpsSrc']));
  });

  test('TC-P2-14 duplicate pending merge → 409; reject merge', async () => {
    const s = await Place.create({ name: TAG + ' DupS', status: 'ACTIVE' });
    const t = await Place.create({ name: TAG + ' DupT', status: 'ACTIVE' });
    cleanup.places.push(s._id, t._id);

    const first = await request(app)
      .post('/api/place-merges')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ source_place_id: s._id, target_place_id: t._id });
    expect(first.status).toBe(201);
    cleanup.merges.push(first.body.request._id);

    const dup = await request(app)
      .post('/api/place-merges')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ source_place_id: s._id, target_place_id: t._id });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('MERGE_PENDING');

    const reject = await request(app)
      .post(`/api/place-merges/${first.body.request._id}/reject`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ reason: 'not now' });
    expect(reject.status).toBe(200);
    expect(reject.body.request.status).toBe('REJECTED');

    const src = await Place.findById(s._id).lean();
    expect(src.status).toBe('ACTIVE');
  });

  test('TC-P2-15 clear owner + list endpoints', async () => {
    const p = await Place.create({
      name: TAG + ' ClearOwner',
      status: 'ACTIVE',
      owner_org_id: org._id,
      verified: true
    });
    cleanup.places.push(p._id);

    const clear = await request(app)
      .patch(`/api/place-ownership/places/${p._id}/owner`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ organization_id: null, verified: false });
    expect(clear.status).toBe(200);
    const doc = await Place.findById(p._id).lean();
    expect(doc.owner_org_id).toBeFalsy();
    expect(doc.verified).toBe(false);

    const listOwn = await request(app)
      .get('/api/place-ownership')
      .query({ status: 'PENDING' })
      .set('Authorization', `Bearer ${superToken}`);
    expect(listOwn.status).toBe(200);
    expect(Array.isArray(listOwn.body.requests)).toBe(true);

    const listMerge = await request(app)
      .get('/api/place-merges')
      .query({ status: 'ALL' })
      .set('Authorization', `Bearer ${superToken}`);
    expect(listMerge.status).toBe(200);
    expect(Array.isArray(listMerge.body.requests)).toBe(true);
  });

  test('TC-P2-16 CLAIM trùng PENDING → 409', async () => {
    const p = await Place.create({ name: TAG + ' ClaimDup', status: 'ACTIVE' });
    cleanup.places.push(p._id);
    const a = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ type: 'CLAIM', place_id: p._id, organization_id: org._id });
    expect(a.status).toBe(201);
    cleanup.ownership.push(a.body.request._id);

    const b = await request(app)
      .post('/api/place-ownership')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ type: 'CLAIM', place_id: p._id, organization_id: org._id });
    expect(b.status).toBe(409);
    expect(b.body.code).toBe('CLAIM_PENDING');
  });
});
