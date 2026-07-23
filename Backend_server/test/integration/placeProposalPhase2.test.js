/**
 * PHASE 2 — Place Proposal + Validation + Moderation
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Place = require('../../models/Place');
const PlaceProposal = require('../../models/PlaceProposal');
const { validatePlaceProposal } = require('../../services/placeProposalValidation');
const { slugifyPlaceName } = require('../../utils/placeRegistry');

const TAG = 'prop-p2-' + Date.now();

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe.skip('placeProposalValidation unit', () => {
  test('GPS 0,0 → invalid', async () => {
    const v = await validatePlaceProposal({
      name: 'Test',
      latitude: 0,
      longitude: 0
    });
    expect(v.ok).toBe(false);
    expect(v.recommendation).toBe('REJECT_INVALID');
  });
});

describe.skip('Place Proposal PHASE 2 API', () => {
  let superToken;
  let userToken;
  let existingPlace;
  let proposalId;
  let createdPlaceId;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser);

    let user = await User.findOne({ role: 'REGISTERED_USER', is_active: { $ne: false } }).lean();
    if (!user) {
      user = await User.create({
        email: `${TAG}@test.local`,
        password: 'Test1234!',
        full_name: 'Proposal Tester',
        role: 'REGISTERED_USER',
        is_active: true
      });
      user = user.toObject();
    }
    userToken = tokenFor(user);

    existingPlace = await Place.create({
      name: TAG + ' Existing Mall',
      slug: slugifyPlaceName(TAG + ' Existing Mall') + '-' + Date.now().toString(36),
      latitude: 10.7765,
      longitude: 106.703,
      category: 'mall',
      status: 'ACTIVE',
      publication_status: 'PUBLIC'
    });
  });

  afterAll(async () => {
    if (proposalId) await PlaceProposal.findByIdAndDelete(proposalId).catch(() => {});
    await PlaceProposal.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    if (createdPlaceId) await Place.findByIdAndDelete(createdPlaceId).catch(() => {});
    if (existingPlace?._id) await Place.findByIdAndDelete(existingPlace._id).catch(() => {});
    await Place.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-P2-01 tạo proposal hợp lệ → PENDING', async () => {
    const res = await request(app)
      .post('/api/place-proposals')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: TAG + ' Unique Tower XYZ',
        latitude: 10.81,
        longitude: 106.72,
        address: 'Q.Thu Duc',
        category: 'office',
        description: 'Đề xuất mới'
      });
    expect(res.status).toBe(201);
    expect(res.body.proposal.status).toBe('PENDING');
    expect(res.body.proposal.duplicate_score).toBeLessThan(0.95);
    proposalId = res.body.proposal._id;
  });

  test('TC-P2-02 proposal gần Place hiện có → DUPLICATE', async () => {
    const res = await request(app)
      .post('/api/place-proposals')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: TAG + ' Existing Mall',
        latitude: 10.7764,
        longitude: 106.7031,
        category: 'mall'
      });
    expect(res.status).toBe(201);
    expect(res.body.proposal.status).toBe('DUPLICATE');
    expect(res.body.proposal.duplicate_score).toBeGreaterThanOrEqual(0.95);
    await PlaceProposal.findByIdAndDelete(res.body.proposal._id);
  });

  test('TC-P2-03 Super list queue + approve → tạo Place', async () => {
    const list = await request(app)
      .get('/api/place-proposals')
      .query({ status: 'QUEUE' })
      .set('Authorization', `Bearer ${superToken}`);
    expect(list.status).toBe(200);
    expect(list.body.proposals.some((p) => String(p._id) === String(proposalId))).toBe(true);

    const ok = await request(app)
      .post(`/api/place-proposals/${proposalId}/approve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(ok.status).toBe(200);
    expect(ok.body.proposal.status).toBe('APPROVED');
    expect(ok.body.place._id).toBeTruthy();
    createdPlaceId = ok.body.place._id;

    const place = await Place.findById(createdPlaceId).lean();
    expect(place.name).toContain('Unique Tower');
  });

  test('TC-P2-04 double approve → NOT_PENDING', async () => {
    const res = await request(app)
      .post(`/api/place-proposals/${proposalId}/approve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_PENDING');
  });

  test('TC-P2-05 reject proposal', async () => {
    const create = await request(app)
      .post('/api/place-proposals')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: TAG + ' Reject Me Building',
        latitude: 10.85,
        longitude: 106.75,
        category: 'other'
      });
    expect(create.status).toBe(201);
    const id = create.body.proposal._id;

    const rej = await request(app)
      .post(`/api/place-proposals/${id}/reject`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ reason: 'Không đủ thông tin' });
    expect(rej.status).toBe(200);
    expect(rej.body.proposal.status).toBe('REJECTED');
    await PlaceProposal.findByIdAndDelete(id);
  });

  test('TC-P2-06 user không approve được', async () => {
    const create = await request(app)
      .post('/api/place-proposals')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: TAG + ' No Approve',
        latitude: 10.86,
        longitude: 106.76,
        category: 'other'
      });
    const id = create.body.proposal._id;
    const denied = await request(app)
      .post(`/api/place-proposals/${id}/approve`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    expect(denied.status).toBe(403);
    await PlaceProposal.findByIdAndDelete(id);
  });
});
