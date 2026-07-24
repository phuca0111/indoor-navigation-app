/**
 * Community Platform — reputation, badges, follow Place.
 */
const ContributorProfile = require('../../models/ContributorProfile');
const PlaceFollow = require('../../models/PlaceFollow');
const Place = require('../../models/Place');
const mongoose = require('mongoose');

function assertObjectId(id, label = 'id') {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    const err = new Error(`${label} không hợp lệ.`);
    err.status = 400;
    err.code = 'INVALID_ID';
    throw err;
  }
  return String(id);
}

async function getOrCreateProfile(userId) {
  assertObjectId(userId, 'userId');
  let doc = await ContributorProfile.findOne({ user_id: userId });
  if (!doc) {
    doc = await ContributorProfile.create({ user_id: userId, points: 0, badges: ['EXPLORER'] });
  }
  return doc;
}

function deriveBadges(profile) {
  const badges = new Set(profile.badges || []);
  badges.add('EXPLORER');
  if ((profile.stats?.reviews || 0) >= 1) badges.add('REVIEWER');
  if ((profile.stats?.maps_submitted || 0) >= 1 || (profile.stats?.proposals || 0) >= 3) {
    badges.add('MAPPER');
  }
  if ((profile.points || 0) >= 100) badges.add('TRUSTED');
  if ((profile.points || 0) >= 300) badges.add('TOP_CONTRIBUTOR');
  return [...badges];
}

async function addPoints(userId, delta, statKey) {
  const doc = await getOrCreateProfile(userId);
  doc.points = Math.max(0, (doc.points || 0) + Number(delta || 0));
  if (statKey && doc.stats && typeof doc.stats[statKey] === 'number') {
    doc.stats[statKey] = (doc.stats[statKey] || 0) + 1;
  }
  doc.tier = ContributorProfile.tierFromPoints(doc.points);
  doc.badges = deriveBadges(doc);
  await doc.save();
  return doc;
}

async function getProfile(userId) {
  const doc = await getOrCreateProfile(userId);
  return {
    user_id: doc.user_id,
    points: doc.points,
    tier: doc.tier,
    badges: doc.badges,
    stats: doc.stats
  };
}

async function followPlace(userId, placeId) {
  assertObjectId(userId, 'userId');
  assertObjectId(placeId, 'place_id');
  const place = await Place.findById(placeId).select('_id name').lean();
  if (!place) {
    const err = new Error('Không tìm thấy Place.');
    err.status = 404;
    throw err;
  }
  const doc = await PlaceFollow.findOneAndUpdate(
    { user_id: userId, place_id: placeId },
    { $setOnInsert: { user_id: userId, place_id: placeId } },
    { upsert: true, returnDocument: 'after', new: true }
  );
  return doc;
}

async function unfollowPlace(userId, placeId) {
  assertObjectId(userId, 'userId');
  assertObjectId(placeId, 'place_id');
  await PlaceFollow.deleteOne({ user_id: userId, place_id: placeId });
  return { ok: true };
}

async function listFollowing(userId, { limit = 50 } = {}) {
  assertObjectId(userId, 'userId');
  const rows = await PlaceFollow.find({ user_id: userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .lean();
  const ids = rows.map((r) => r.place_id);
  const places = await Place.find({ _id: { $in: ids } })
    .select('name slug address category publication_status verification_status owner_type')
    .lean();
  const map = Object.fromEntries(places.map((p) => [String(p._id), p]));
  return {
    total: rows.length,
    following: rows.map((r) => ({
      ...r,
      place_id: String(r.place_id),
      place: map[String(r.place_id)] || null
    }))
  };
}

module.exports = {
  getOrCreateProfile,
  getProfile,
  addPoints,
  followPlace,
  unfollowPlace,
  listFollowing
};
