// ============================================
// Map Governance P3 — Reputation / Trust Level
// Level 1: không publish COMMUNITY
// Level 5: auto-approve COMMUNITY
// ============================================

const User = require('../models/User');

const DEFAULT_SCORE = 50;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

/** Score → Level 1..5 */
function levelFromScore(score) {
  const s = Number(score);
  const n = Number.isFinite(s) ? s : DEFAULT_SCORE;
  if (n < 20) return 1;
  if (n < 40) return 2;
  if (n < 60) return 3;
  if (n < 80) return 4;
  return 5;
}

function clampScore(score) {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(Number(score) || 0)));
}

function isMapBanned(user) {
  if (!user) return false;
  if (user.map_ban_permanent === true) return true;
  if (user.map_banned_until && new Date(user.map_banned_until) > new Date()) return true;
  return false;
}

/**
 * @returns {{ ok: boolean, code?: string, message?: string, level: number, score: number }}
 */
function assertCanRequestCommunity(user) {
  const score = user?.map_trust_score != null ? user.map_trust_score : DEFAULT_SCORE;
  const level = user?.map_trust_level != null ? user.map_trust_level : levelFromScore(score);
  if (isMapBanned(user)) {
    return {
      ok: false,
      code: 'MAP_BANNED',
      message: 'Tài khoản bị cấm đóng góp bản đồ cộng đồng.',
      level,
      score
    };
  }
  if (level <= 1) {
    return {
      ok: false,
      code: 'TRUST_TOO_LOW',
      message: 'Trust Level 1: chưa được gửi COMMUNITY/OFFICIAL. Hãy đóng góp / được duyệt để tăng điểm.',
      level,
      score
    };
  }
  return { ok: true, level, score };
}

function canAutoApproveCommunity(user) {
  if (isMapBanned(user)) return false;
  const score = user?.map_trust_score != null ? user.map_trust_score : DEFAULT_SCORE;
  const level = user?.map_trust_level != null ? user.map_trust_level : levelFromScore(score);
  return level >= 5;
}

async function loadUserReputation(userId) {
  if (!userId) return null;
  return User.findById(userId)
    .select('map_trust_score map_trust_level map_banned_until map_ban_permanent is_active role')
    .lean();
}

async function adjustTrustScore(userId, delta, reason) {
  const user = await User.findById(userId).select('map_trust_score map_trust_level');
  if (!user) return null;
  const prev = user.map_trust_score != null ? user.map_trust_score : DEFAULT_SCORE;
  user.map_trust_score = clampScore(prev + Number(delta || 0));
  user.map_trust_level = levelFromScore(user.map_trust_score);
  await user.save();
  return {
    user_id: user._id,
    from: prev,
    to: user.map_trust_score,
    level: user.map_trust_level,
    reason: reason || ''
  };
}

async function setTrustScore(userId, score) {
  const user = await User.findById(userId).select('map_trust_score map_trust_level');
  if (!user) return null;
  user.map_trust_score = clampScore(score);
  user.map_trust_level = levelFromScore(user.map_trust_score);
  await user.save();
  return { user_id: user._id, score: user.map_trust_score, level: user.map_trust_level };
}

async function banUserMap(userId, { until = null, permanent = false, reason = '' } = {}) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Không tìm thấy user.');
    err.status = 404;
    throw err;
  }
  user.map_ban_permanent = !!permanent;
  user.map_banned_until = permanent ? null : (until ? new Date(until) : new Date(Date.now() + 7 * 24 * 3600 * 1000));
  user.map_ban_reason = String(reason || '').slice(0, 500);
  await user.save();
  return {
    user_id: user._id,
    map_ban_permanent: user.map_ban_permanent,
    map_banned_until: user.map_banned_until,
    map_ban_reason: user.map_ban_reason
  };
}

async function unbanUserMap(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('Không tìm thấy user.');
    err.status = 404;
    throw err;
  }
  user.map_ban_permanent = false;
  user.map_banned_until = null;
  user.map_ban_reason = '';
  await user.save();
  return { user_id: user._id, unbanned: true };
}

module.exports = {
  DEFAULT_SCORE,
  levelFromScore,
  clampScore,
  isMapBanned,
  assertCanRequestCommunity,
  canAutoApproveCommunity,
  loadUserReputation,
  adjustTrustScore,
  setTrustScore,
  banUserMap,
  unbanUserMap
};
