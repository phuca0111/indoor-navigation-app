/**
 * Admin User Detail — xem hồ sơ + hoạt động của một user (Super Admin / Org Admin trong tenant).
 * Tái dùng getUser (tenant scope) từ identity; không đụng Hub /me.
 */
const UserFavorite = require('../../models/UserFavorite');
const UserHistory = require('../../models/UserHistory');
const Place = require('../../models/Place');
const { getUser } = require('../identity/userApplicationService');
const { listSessions } = require('../identity/sessionApplicationService');

async function assertAdminCanViewUser(userId, principal) {
  const user = await getUser(userId, principal);
  if (!user) {
    throw Object.assign(new Error('Không tìm thấy tài khoản.'), { status: 404, code: 'USER_NOT_FOUND' });
  }
  return user;
}

async function getAdminUserOverview(userId, principal) {
  const user = await assertAdminCanViewUser(userId, principal);
  const [favorites_count, history_count, sessions] = await Promise.all([
    UserFavorite.countDocuments({ user_id: userId }),
    UserHistory.countDocuments({ user_id: userId }),
    listSessions(userId, null)
  ]);
  return {
    user,
    counts: {
      favorites: favorites_count,
      history: history_count,
      sessions: Array.isArray(sessions) ? sessions.length : 0
    }
  };
}

async function listAdminUserFavorites(userId, principal, { limit = 100 } = {}) {
  await assertAdminCanViewUser(userId, principal);
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const rows = await UserFavorite.find({ user_id: userId })
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();
  const placeIds = rows.map((r) => r.place_id).filter(Boolean);
  const places = placeIds.length
    ? await Place.find({ _id: { $in: placeIds } })
      .select('name slug address category latitude longitude publication_status verification_status')
      .lean()
    : [];
  const placeMap = {};
  places.forEach((p) => { placeMap[String(p._id)] = p; });
  return {
    total: rows.length,
    favorites: rows.map((r) => ({
      _id: r._id,
      place_id: r.place_id,
      place: placeMap[String(r.place_id)] || null,
      createdAt: r.createdAt
    }))
  };
}

async function listAdminUserHistory(userId, principal, { limit = 50 } = {}) {
  await assertAdminCanViewUser(userId, principal);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = await UserHistory.find({ user_id: userId })
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();
  return { total: rows.length, history: rows };
}

async function listAdminUserSessions(userId, principal) {
  await assertAdminCanViewUser(userId, principal);
  const sessions = await listSessions(userId, null);
  return { total: sessions.length, sessions };
}

module.exports = {
  getAdminUserOverview,
  listAdminUserFavorites,
  listAdminUserHistory,
  listAdminUserSessions
};
