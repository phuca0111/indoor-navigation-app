// ============================================
// Map Governance P3 — Moderation + Reputation API
// ============================================

const mongoose = require('mongoose');
const MapModerationReport = require('../models/MapModerationReport');
const Place = require('../models/Place');
const Building = require('../models/Building');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const {
  loadUserReputation,
  setTrustScore,
  adjustTrustScore,
  banUserMap,
  unbanUserMap,
  levelFromScore,
  DEFAULT_SCORE,
  isMapBanned
} = require('../services/mapReputation');
const { findDuplicatePlaces, DEFAULT_THRESHOLD } = require('../services/placeDuplicateDetection');

function logActivity(data) {
  ActivityLog.create(data).catch(() => {});
}

function assertObjectId(id, label = 'id') {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    const err = new Error(`${label} không hợp lệ.`);
    err.status = 400;
    err.code = 'INVALID_ID';
    throw err;
  }
  return String(id);
}

function serializeReport(doc) {
  const r = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: r._id,
    target_type: r.target_type,
    target_id: r.target_id,
    reason_code: r.reason_code,
    detail: r.detail || '',
    status: r.status,
    resolution: r.resolution,
    reported_by: r.reported_by,
    resolved_by: r.resolved_by,
    resolved_at: r.resolved_at,
    resolver_note: r.resolver_note || '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

// GET /api/map-moderation/reports
async function listReports(req, res) {
  try {
    const status = String(req.query.status || 'OPEN').toUpperCase();
    const filter = {};
    if (['OPEN', 'RESOLVED', 'DISMISSED', 'ALL'].includes(status) && status !== 'ALL') {
      filter.status = status;
    }
    if (req.query.target_type) filter.target_type = String(req.query.target_type).toUpperCase();
    const rows = await MapModerationReport.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit, 10) || 50, 100))
      .lean();
    return res.status(200).json({ total: rows.length, reports: rows.map(serializeReport) });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/map-moderation/reports
async function createReport(req, res) {
  try {
    const target_type = String(req.body?.target_type || '').toUpperCase();
    if (!['PLACE', 'BUILDING', 'USER'].includes(target_type)) {
      return res.status(400).json({ message: 'target_type phải là PLACE|BUILDING|USER', code: 'INVALID_TARGET' });
    }
    const target_id = String(req.body?.target_id || '').trim();
    if (!target_id) return res.status(400).json({ message: 'Thiếu target_id.' });

    if (target_type === 'PLACE') {
      const p = await Place.findById(target_id).select('_id').lean();
      if (!p) return res.status(404).json({ message: 'Place không tồn tại.' });
    } else if (target_type === 'BUILDING') {
      const b = await Building.findById(target_id).select('_id').lean();
      if (!b) return res.status(404).json({ message: 'Building không tồn tại.' });
    } else {
      assertObjectId(target_id, 'user id');
      const u = await User.findById(target_id).select('_id').lean();
      if (!u) return res.status(404).json({ message: 'User không tồn tại.' });
    }

    const reason_code = String(req.body?.reason_code || 'OTHER').toUpperCase();
    const allowed = ['SPAM', 'INAPPROPRIATE', 'DUPLICATE', 'COPYRIGHT', 'OTHER'];
    const doc = await MapModerationReport.create({
      target_type,
      target_id,
      reason_code: allowed.includes(reason_code) ? reason_code : 'OTHER',
      detail: String(req.body?.detail || '').slice(0, 2000),
      status: 'OPEN',
      reported_by: req.user.userId
    });

    return res.status(201).json({ message: 'Đã gửi báo cáo.', report: serializeReport(doc) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/map-moderation/reports/:id/resolve
// body: { action: DISMISS|LOCK_PLACE|LOCK_BUILDING|BAN_USER|WARN, note?, ban_days?, permanent? }
async function resolveReport(req, res) {
  try {
    assertObjectId(req.params.id, 'report id');
    const report = await MapModerationReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Không tìm thấy báo cáo.' });
    if (report.status !== 'OPEN') {
      return res.status(400).json({ message: 'Báo cáo đã xử lý.', code: 'NOT_OPEN' });
    }

    const action = String(req.body?.action || 'DISMISS').toUpperCase();
    let resolution = 'NONE';
    const note = String(req.body?.note || '').slice(0, 1000);

    if (action === 'DISMISS') {
      report.status = 'DISMISSED';
      resolution = 'NONE';
    } else if (action === 'LOCK_PLACE') {
      if (report.target_type !== 'PLACE') {
        return res.status(400).json({ message: 'Báo cáo không phải PLACE.' });
      }
      const place = await Place.findById(report.target_id);
      if (!place) return res.status(404).json({ message: 'Place không tồn tại.' });
      place.status = 'LOCKED';
      await place.save();
      await Building.updateMany({ place_id: place._id }, { $set: { place_id: null } });
      report.status = 'RESOLVED';
      resolution = 'LOCK_PLACE';
    } else if (action === 'LOCK_BUILDING') {
      if (report.target_type !== 'BUILDING') {
        return res.status(400).json({ message: 'Báo cáo không phải BUILDING.' });
      }
      const building = await Building.findById(report.target_id);
      if (!building) return res.status(404).json({ message: 'Building không tồn tại.' });
      building.is_active = false;
      building.visibility = 'PRIVATE';
      await building.save();
      report.status = 'RESOLVED';
      resolution = 'LOCK_BUILDING';
    } else if (action === 'BAN_USER') {
      const userId = report.target_type === 'USER'
        ? report.target_id
        : (req.body?.user_id || null);
      if (!userId) return res.status(400).json({ message: 'Cần user_id hoặc báo cáo USER.' });
      const days = Number(req.body?.ban_days) || 7;
      const permanent = !!req.body?.permanent;
      await banUserMap(userId, {
        permanent,
        until: permanent ? null : new Date(Date.now() + days * 24 * 3600 * 1000),
        reason: note || report.detail
      });
      await adjustTrustScore(userId, -20, 'moderation_ban');
      report.status = 'RESOLVED';
      resolution = 'BAN_USER';
    } else if (action === 'WARN') {
      if (report.target_type === 'USER') {
        await adjustTrustScore(report.target_id, -5, 'moderation_warn');
      }
      report.status = 'RESOLVED';
      resolution = 'WARN';
    } else {
      return res.status(400).json({
        message: 'action: DISMISS|LOCK_PLACE|LOCK_BUILDING|BAN_USER|WARN',
        code: 'INVALID_ACTION'
      });
    }

    report.resolution = resolution;
    report.resolver_note = note;
    report.resolved_by = req.user.userId;
    report.resolved_at = new Date();
    await report.save();

    logActivity({
      user_id: req.user.userId,
      action: 'MAP_MODERATION_RESOLVE',
      target_type: report.target_type.toLowerCase(),
      target_id: report.target_id,
      target: report.target_id,
      details: { report_id: String(report._id), resolution, action },
      ip_address: req.ip || ''
    });

    return res.status(200).json({ message: 'Đã xử lý báo cáo.', report: serializeReport(report) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/map-moderation/reputation/:userId
async function getReputation(req, res) {
  try {
    assertObjectId(req.params.userId, 'user id');
    const user = await User.findById(req.params.userId)
      .select('email full_name map_trust_score map_trust_level map_banned_until map_ban_permanent map_ban_reason is_active')
      .lean();
    if (!user) return res.status(404).json({ message: 'Không tìm thấy user.' });
    const score = user.map_trust_score != null ? user.map_trust_score : DEFAULT_SCORE;
    const level = user.map_trust_level != null ? user.map_trust_level : levelFromScore(score);
    return res.status(200).json({
      user: {
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        is_active: user.is_active
      },
      reputation: {
        score,
        level,
        banned: isMapBanned(user),
        map_banned_until: user.map_banned_until,
        map_ban_permanent: !!user.map_ban_permanent,
        map_ban_reason: user.map_ban_reason || ''
      }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// PATCH /api/map-moderation/reputation/:userId  { score?, delta?, unban?, ban?, ban_days?, permanent?, reason? }
async function patchReputation(req, res) {
  try {
    assertObjectId(req.params.userId, 'user id');
    if (req.body?.unban === true) {
      await unbanUserMap(req.params.userId);
    }
    if (req.body?.ban === true) {
      await banUserMap(req.params.userId, {
        permanent: !!req.body.permanent,
        until: req.body.ban_days
          ? new Date(Date.now() + Number(req.body.ban_days) * 24 * 3600 * 1000)
          : undefined,
        reason: req.body.reason || ''
      });
    }
    let result = null;
    if (req.body?.score !== undefined) {
      result = await setTrustScore(req.params.userId, req.body.score);
    } else if (req.body?.delta !== undefined) {
      result = await adjustTrustScore(req.params.userId, req.body.delta, req.body.reason || 'manual');
    }
    const fresh = await loadUserReputation(req.params.userId);
    return res.status(200).json({
      message: 'Đã cập nhật reputation.',
      result,
      reputation: {
        score: fresh?.map_trust_score ?? DEFAULT_SCORE,
        level: fresh?.map_trust_level ?? levelFromScore(fresh?.map_trust_score),
        banned: isMapBanned(fresh)
      }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/map-moderation/stats — thống kê nhanh
async function getStats(req, res) {
  try {
    const [
      places,
      openReports,
      pendingReviews,
      lockedPlaces,
      bannedUsers
    ] = await Promise.all([
      Place.countDocuments({ status: { $nin: ['MERGED'] } }),
      MapModerationReport.countDocuments({ status: 'OPEN' }),
      require('../models/MapReviewRequest').countDocuments({ status: 'PENDING' }),
      Place.countDocuments({ status: 'LOCKED' }),
      User.countDocuments({
        $or: [
          { map_ban_permanent: true },
          { map_banned_until: { $gt: new Date() } }
        ]
      })
    ]);
    return res.status(200).json({
      places,
      open_reports: openReports,
      pending_reviews: pendingReviews,
      locked_places: lockedPlaces,
      banned_users: bannedUsers
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/map-moderation/ai-duplicate-check — scoring có giải thích (rule-based “AI triage”)
async function aiDuplicateCheck(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Thiếu tên.' });
    const result = await findDuplicatePlaces(
      {
        name,
        aliases: req.body?.aliases || [],
        latitude: Number(req.body?.latitude) || 0,
        longitude: Number(req.body?.longitude) || 0,
        category: String(req.body?.category || '')
      },
      {
        excludeId: req.body?.exclude_id || null,
        threshold: Number(req.body?.threshold) || DEFAULT_THRESHOLD,
        limit: Number(req.body?.limit) || 10,
        withAiExplain: true
      }
    );
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

module.exports = {
  listReports,
  createReport,
  resolveReport,
  getReputation,
  patchReputation,
  getStats,
  aiDuplicateCheck
};
