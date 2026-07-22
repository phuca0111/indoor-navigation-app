/**
 * Map Governance P3 — Moderation + Reputation + AI triage scoring
 */
const {
  levelFromScore,
  assertCanRequestCommunity,
  canAutoApproveCommunity,
  isMapBanned,
  clampScore
} = require('../../services/mapReputation');
const { buildAiAssessment, compositeScore } = require('../../services/placeDuplicateDetection');

describe('mapReputation unit', () => {
  test('levelFromScore boundaries', () => {
    expect(levelFromScore(0)).toBe(1);
    expect(levelFromScore(19)).toBe(1);
    expect(levelFromScore(20)).toBe(2);
    expect(levelFromScore(50)).toBe(3);
    expect(levelFromScore(80)).toBe(5);
    expect(levelFromScore(100)).toBe(5);
  });

  test('assertCanRequestCommunity level 1 / banned', () => {
    expect(assertCanRequestCommunity({ map_trust_score: 10, map_trust_level: 1 }).ok).toBe(false);
    expect(assertCanRequestCommunity({ map_trust_score: 10, map_trust_level: 1 }).code).toBe('TRUST_TOO_LOW');
    expect(assertCanRequestCommunity({ map_ban_permanent: true, map_trust_score: 90 }).ok).toBe(false);
    expect(assertCanRequestCommunity({ map_ban_permanent: true }).code).toBe('MAP_BANNED');
    expect(assertCanRequestCommunity({ map_trust_score: 50, map_trust_level: 3 }).ok).toBe(true);
  });

  test('canAutoApproveCommunity level 5', () => {
    expect(canAutoApproveCommunity({ map_trust_level: 5, map_trust_score: 90 })).toBe(true);
    expect(canAutoApproveCommunity({ map_trust_level: 4, map_trust_score: 70 })).toBe(false);
    expect(canAutoApproveCommunity({ map_trust_level: 5, map_ban_permanent: true })).toBe(false);
  });

  test('clampScore', () => {
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(150)).toBe(100);
  });

  test('isMapBanned until future', () => {
    expect(isMapBanned({ map_banned_until: new Date(Date.now() + 60000) })).toBe(true);
    expect(isMapBanned({ map_banned_until: new Date(Date.now() - 60000) })).toBe(false);
  });
});

describe('AI triage scoring unit', () => {
  test('buildAiAssessment LIKELY_DUPLICATE', () => {
    const detail = compositeScore(
      { name: 'AEON Mall', aliases: [], latitude: 10.98, longitude: 106.67, category: 'mall' },
      { name: 'AEON Mall', aliases: [], latitude: 10.9801, longitude: 106.6701, category: 'mall' }
    );
    const ai = buildAiAssessment(detail, 0.95);
    expect(ai.recommendation).toBe('LIKELY_DUPLICATE');
    expect(ai.model).toBe('rule-based-v1');
    expect(ai.factors.length).toBeGreaterThanOrEqual(2);
  });
});

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Place = require('../../models/Place');
const Building = require('../../models/Building');
const MapModerationReport = require('../../models/MapModerationReport');
const MapReviewRequest = require('../../models/MapReviewRequest');

const TAG = 'mgc-p3-' + Date.now();

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Map Governance P3 API', () => {
  let superToken;
  let superUser;
  let lowUser;
  let highUser;
  let lowToken;
  let highToken;
  const cleanup = { places: [], buildings: [], reports: [], reviews: [], users: [] };

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser);

    lowUser = await User.create({
      email: TAG + '-low@test.local',
      password: 'Abcd1234!',
      full_name: 'Low Trust',
      role: 'REGISTERED_USER',
      map_trust_score: 10,
      map_trust_level: 1
    });
    highUser = await User.create({
      email: TAG + '-high@test.local',
      password: 'Abcd1234!',
      full_name: 'High Trust',
      role: 'REGISTERED_USER',
      map_trust_score: 90,
      map_trust_level: 5
    });
    cleanup.users.push(lowUser._id, highUser._id);
    lowToken = tokenFor(lowUser);
    highToken = tokenFor(highUser);
  });

  afterAll(async () => {
    await MapModerationReport.deleteMany({ _id: { $in: cleanup.reports } }).catch(() => {});
    await MapReviewRequest.deleteMany({ _id: { $in: cleanup.reviews } }).catch(() => {});
    await Building.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    await Place.deleteMany({ name: new RegExp('^' + TAG) }).catch(() => {});
    await User.deleteMany({ _id: { $in: cleanup.users } }).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-P3-01 stats + ai-duplicate-check', async () => {
    const stats = await request(app)
      .get('/api/map-moderation/stats')
      .set('Authorization', `Bearer ${superToken}`);
    expect(stats.status).toBe(200);
    expect(typeof stats.body.places).toBe('number');

    await Place.create({
      name: TAG + ' AEON AI',
      latitude: 10.98,
      longitude: 106.67,
      status: 'ACTIVE'
    }).then((p) => cleanup.places.push(p._id));

    const ai = await request(app)
      .post('/api/map-moderation/ai-duplicate-check')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: TAG + ' AEON AI',
        latitude: 10.9801,
        longitude: 106.6701,
        category: 'mall'
      });
    expect(ai.status).toBe(200);
    expect(ai.body.ai_triage).toBeTruthy();
    expect(ai.body.top?.ai?.recommendation).toBeTruthy();
  });

  test('TC-P3-02 report PLACE → LOCK_PLACE', async () => {
    const place = await Place.create({ name: TAG + ' Spam Place', status: 'ACTIVE' });
    cleanup.places.push(place._id);
    const create = await request(app)
      .post('/api/map-moderation/reports')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        target_type: 'PLACE',
        target_id: place._id,
        reason_code: 'SPAM',
        detail: TAG + ' spam'
      });
    expect(create.status).toBe(201);
    cleanup.reports.push(create.body.report._id);

    const resolve = await request(app)
      .post(`/api/map-moderation/reports/${create.body.report._id}/resolve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ action: 'LOCK_PLACE', note: 'locked' });
    expect(resolve.status).toBe(200);
    const p = await Place.findById(place._id).lean();
    expect(p.status).toBe('LOCKED');
  });

  test('TC-P3-03 ban USER + reputation', async () => {
    const victim = await User.create({
      email: TAG + '-victim@test.local',
      password: 'Abcd1234!',
      full_name: 'Victim',
      role: 'REGISTERED_USER',
      map_trust_score: 60,
      map_trust_level: 3
    });
    cleanup.users.push(victim._id);

    const report = await request(app)
      .post('/api/map-moderation/reports')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        target_type: 'USER',
        target_id: victim._id,
        reason_code: 'SPAM',
        detail: 'ban me'
      });
    expect(report.status).toBe(201);
    cleanup.reports.push(report.body.report._id);

    const ban = await request(app)
      .post(`/api/map-moderation/reports/${report.body.report._id}/resolve`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ action: 'BAN_USER', ban_days: 3, note: 'temp ban' });
    expect(ban.status).toBe(200);

    const rep = await request(app)
      .get(`/api/map-moderation/reputation/${victim._id}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(rep.status).toBe(200);
    expect(rep.body.reputation.banned).toBe(true);
    expect(rep.body.reputation.score).toBeLessThan(60);
  });

  test('TC-P3-04 trust level 1 không gửi COMMUNITY; level 5 auto approve', async () => {
    const bLow = await Building.create({
      name: TAG + ' Low Bld',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      owner_user_id: lowUser._id,
      gps_location: { lat: 1, lng: 1 }
    });
    cleanup.buildings.push(bLow._id);

    const denied = await request(app)
      .post('/api/map-reviews')
      .set('Authorization', `Bearer ${lowToken}`)
      .send({ building_id: bLow._id, requested_visibility: 'COMMUNITY' });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('TRUST_TOO_LOW');

    const bHigh = await Building.create({
      name: TAG + ' High Bld',
      status: 'DRAFT',
      visibility: 'PRIVATE',
      owner_user_id: highUser._id,
      gps_location: { lat: 2, lng: 2 }
    });
    cleanup.buildings.push(bHigh._id);

    const auto = await request(app)
      .post('/api/map-reviews')
      .set('Authorization', `Bearer ${highToken}`)
      .send({ building_id: bHigh._id, requested_visibility: 'COMMUNITY', note: TAG });
    expect(auto.status).toBe(201);
    expect(auto.body.auto_approved).toBe(true);
    cleanup.reviews.push(auto.body.review._id);

    const b = await Building.findById(bHigh._id).lean();
    expect(b.visibility).toBe('COMMUNITY');
    expect(b.status).toBe('PUBLISHED');
  });

  test('TC-P3-05 patch reputation score + unban', async () => {
    const u = await User.create({
      email: TAG + '-rep@test.local',
      password: 'Abcd1234!',
      full_name: 'Rep',
      role: 'REGISTERED_USER',
      map_trust_score: 40,
      map_trust_level: 2,
      map_ban_permanent: true
    });
    cleanup.users.push(u._id);

    const patch = await request(app)
      .patch(`/api/map-moderation/reputation/${u._id}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ score: 85, unban: true });
    expect(patch.status).toBe(200);
    expect(patch.body.reputation.level).toBe(5);
    expect(patch.body.reputation.banned).toBe(false);
  });

  test('TC-P3-06 ORG_ADMIN không vào moderation', async () => {
    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    if (!orgAdmin) return;
    const tok = tokenFor(orgAdmin);
    const res = await request(app)
      .get('/api/map-moderation/stats')
      .set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(403);
  });
});
