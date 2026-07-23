// ============================================
// Map Governance P1 — Review Center (Super Admin)
// ============================================

const mongoose = require('mongoose');
const MapReviewRequest = require('../models/MapReviewRequest');
const Building = require('../models/Building');
const Place = require('../models/Place');
const ActivityLog = require('../models/ActivityLog');
const { MAP_VISIBILITY_VALUES, normalizeVisibility } = require('../utils/mapVisibility');
const {
  loadUserReputation,
  assertCanRequestCommunity,
  canAutoApproveCommunity,
  adjustTrustScore
} = require('../services/mapReputation');

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

function serialize(doc, extras = {}) {
  const r = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: r._id,
    building_id: r.building_id,
    place_id: r.place_id,
    requested_visibility: r.requested_visibility,
    status: r.status,
    note: r.note || '',
    reject_reason: r.reject_reason || '',
    merge_target_place_id: r.merge_target_place_id || null,
    submitted_by: r.submitted_by,
    reviewer_id: r.reviewer_id,
    decided_at: r.decided_at,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    building: extras.building || null,
    place: extras.place || null
  };
}

// GET /api/map-reviews
async function listReviews(req, res) {
  try {
    const status = String(req.query.status || 'PENDING').toUpperCase();
    const filter = {};
    if (['PENDING', 'APPROVED', 'REJECTED', 'MERGED', 'ALL'].includes(status) && status !== 'ALL') {
      filter.status = status;
    }
    const rows = await MapReviewRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit, 10) || 50, 100))
      .lean();

    const buildingIds = [...new Set(rows.map((r) => String(r.building_id)))];
    const placeIds = [...new Set(rows.map((r) => r.place_id).filter(Boolean).map(String))];
    const [buildings, places] = await Promise.all([
      Building.find({ _id: { $in: buildingIds } })
        .select('name status visibility place_id organization_id owner_user_id')
        .lean(),
      placeIds.length
        ? Place.find({ _id: { $in: placeIds } }).select('name verified status').lean()
        : []
    ]);
    const bMap = Object.fromEntries(buildings.map((b) => [String(b._id), b]));
    const pMap = Object.fromEntries(places.map((p) => [String(p._id), p]));

    return res.status(200).json({
      total: rows.length,
      reviews: rows.map((r) => serialize(r, {
        building: bMap[String(r.building_id)] || null,
        place: r.place_id ? (pMap[String(r.place_id)] || null) : null
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/map-reviews  { building_id, requested_visibility, note?, place_id? }
async function createReview(req, res) {
  try {
    const buildingId = assertObjectId(req.body?.building_id, 'building_id');
    const visibility = normalizeVisibility(req.body?.requested_visibility, '');
    if (!['COMMUNITY', 'OFFICIAL'].includes(visibility)) {
      return res.status(400).json({
        message: 'requested_visibility phải là COMMUNITY hoặc OFFICIAL',
        code: 'INVALID_VISIBILITY'
      });
    }

    // Demo plan: không gửi OFFICIAL
    if (visibility === 'OFFICIAL' && req.user.role !== 'SUPER_ADMIN') {
      const User = require('../models/User');
      const { assertCanRequestOfficial } = require('../services/personalPlanGates');
      const me = await User.findById(req.user.userId).select('plan plan_expires_at role').lean();
      if (me?.role === 'REGISTERED_USER' || !me?.role) {
        const offGate = assertCanRequestOfficial(me || { plan: 'FREE' });
        if (!offGate.ok) {
          return res.status(403).json({ message: offGate.message, code: offGate.code });
        }
      }
    }

    const building = await Building.findById(buildingId);
    if (!building) return res.status(404).json({ message: 'Không tìm thấy tòa nhà.' });

    // P3 — reputation gate (Super Admin bỏ qua)
    const repUser = await loadUserReputation(req.user.userId);
    if (req.user.role !== 'SUPER_ADMIN') {
      const gate = assertCanRequestCommunity(repUser);
      if (!gate.ok) {
        return res.status(403).json({
          message: gate.message,
          code: gate.code,
          trust_level: gate.level,
          trust_score: gate.score
        });
      }
    }
    const gate = req.user.role === 'SUPER_ADMIN'
      ? { ok: true, level: 5, score: 100 }
      : assertCanRequestCommunity(repUser);

    let placeId = req.body?.place_id || building.place_id || null;
    if (placeId) {
      assertObjectId(placeId, 'place_id');
      const place = await Place.findById(placeId).select('_id status').lean();
      if (!place) return res.status(400).json({ message: 'Place không tồn tại.' });
      if (place.status === 'LOCKED' || place.status === 'MERGED') {
        return res.status(400).json({ message: 'Place đang khóa/merge.' });
      }
    }

    const existing = await MapReviewRequest.findOne({
      building_id: buildingId,
      status: 'PENDING'
    }).lean();
    if (existing) {
      return res.status(409).json({
        message: 'Tòa nhà đã có yêu cầu đang chờ duyệt.',
        code: 'REVIEW_PENDING_EXISTS',
        review_id: existing._id
      });
    }

    const review = await MapReviewRequest.create({
      building_id: buildingId,
      place_id: placeId,
      requested_visibility: visibility,
      status: 'PENDING',
      submitted_by: req.user.userId,
      note: String(req.body?.note || '').slice(0, 1000)
    });

    // Level 5 → auto approve COMMUNITY (OFFICIAL vẫn cần Super)
    if (visibility === 'COMMUNITY' && canAutoApproveCommunity(repUser)) {
      building.visibility = 'COMMUNITY';
      if (placeId && !building.place_id) building.place_id = placeId;
      if (building.status === 'DRAFT') building.status = 'PUBLISHED';
      await building.save();
      review.status = 'APPROVED';
      review.reviewer_id = req.user.userId;
      review.decided_at = new Date();
      review.note = (review.note ? review.note + ' | ' : '') + 'AUTO_APPROVE trust L5';
      await review.save();
      await adjustTrustScore(req.user.userId, 2, 'auto_approve_community');

      logActivity({
        user_id: req.user.userId,
        action: 'MAP_REVIEW_AUTO_APPROVE',
        target_type: 'building',
        target_id: String(buildingId),
        target: building.name,
        details: { review_id: String(review._id), trust_level: gate.level },
        ip_address: req.ip || ''
      });

      return res.status(201).json({
        message: 'Trust Level 5: đã tự duyệt COMMUNITY.',
        auto_approved: true,
        review: serialize(review, { building }),
        trust_level: gate.level
      });
    }

    logActivity({
      user_id: req.user.userId,
      action: 'MAP_REVIEW_SUBMIT',
      target_type: 'building',
      target_id: String(buildingId),
      target: building.name,
      details: { review_id: String(review._id), requested_visibility: visibility, trust_level: gate.level },
      ip_address: req.ip || ''
    });

    return res.status(201).json({
      message: 'Đã gửi yêu cầu duyệt bản đồ.',
      review: serialize(review, { building }),
      trust_level: gate.level
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Đã có yêu cầu chờ duyệt cho tòa nhà này.', code: 'REVIEW_PENDING_EXISTS' });
    }
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/map-reviews/:id/approve
async function approveReview(req, res) {
  try {
    assertObjectId(req.params.id, 'review id');
    const review = await MapReviewRequest.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Không tìm thấy yêu cầu.' });
    if (review.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu không còn ở trạng thái chờ duyệt.', code: 'NOT_PENDING' });
    }

    const building = await Building.findById(review.building_id);
    if (!building) return res.status(404).json({ message: 'Tòa nhà không còn tồn tại.' });

    building.visibility = review.requested_visibility;
    if (review.place_id && !building.place_id) {
      building.place_id = review.place_id;
    }
    // Duyệt cộng đồng: nếu còn DRAFT thì xuất bản luôn (P1 đơn giản)
    if (building.status === 'DRAFT') {
      building.status = 'PUBLISHED';
    }
    await building.save();

    review.status = 'APPROVED';
    review.reviewer_id = req.user.userId;
    review.decided_at = new Date();
    await review.save();

    if (review.submitted_by) {
      await adjustTrustScore(review.submitted_by, 5, 'review_approved');
    }

    logActivity({
      user_id: req.user.userId,
      action: 'MAP_REVIEW_APPROVE',
      target_type: 'building',
      target_id: String(building._id),
      target: building.name,
      details: {
        review_id: String(review._id),
        visibility: building.visibility,
        status: building.status
      },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã duyệt. Visibility đã cập nhật' + (building.status === 'PUBLISHED' ? ' và xuất bản.' : '.'),
      review: serialize(review, { building })
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/map-reviews/:id/reject  { reason? }
async function rejectReview(req, res) {
  try {
    assertObjectId(req.params.id, 'review id');
    const review = await MapReviewRequest.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Không tìm thấy yêu cầu.' });
    if (review.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu không còn ở trạng thái chờ duyệt.', code: 'NOT_PENDING' });
    }

    review.status = 'REJECTED';
    review.reject_reason = String(req.body?.reason || '').slice(0, 1000);
    review.reviewer_id = req.user.userId;
    review.decided_at = new Date();
    await review.save();

    if (review.submitted_by) {
      await adjustTrustScore(review.submitted_by, -3, 'review_rejected');
    }

    logActivity({
      user_id: req.user.userId,
      action: 'MAP_REVIEW_REJECT',
      target_type: 'building',
      target_id: String(review.building_id),
      target: String(review.building_id),
      details: { review_id: String(review._id), reason: review.reject_reason },
      ip_address: req.ip || ''
    });

    return res.status(200).json({ message: 'Đã từ chối yêu cầu.', review: serialize(review) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/map-reviews/:id/merge-stub  { target_place_id }
// P4: nếu building đã có Place khác → gọi mergePlaces (engine); không thì gắn place.
async function mergeStubReview(req, res) {
  try {
    assertObjectId(req.params.id, 'review id');
    const targetPlaceId = assertObjectId(req.body?.target_place_id, 'target_place_id');

    const review = await MapReviewRequest.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Không tìm thấy yêu cầu.' });
    if (review.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu không còn PENDING.', code: 'NOT_PENDING' });
    }

    const place = await Place.findById(targetPlaceId).select('_id status name').lean();
    if (!place) return res.status(404).json({ message: 'Place đích không tồn tại.' });
    if (place.status === 'LOCKED' || place.status === 'MERGED') {
      return res.status(400).json({ message: 'Place đích không gắn được.' });
    }

    const building = await Building.findById(review.building_id);
    if (!building) return res.status(404).json({ message: 'Tòa nhà không tồn tại.' });

    let mergeSummary = null;
    const sourcePlaceId = building.place_id ? String(building.place_id) : null;
    const targetIdStr = String(place._id);

    if (sourcePlaceId && sourcePlaceId !== targetIdStr) {
      const { mergePlaces } = require('../services/placeMergeEngine');
      mergeSummary = await mergePlaces(sourcePlaceId, targetIdStr, {
        preferVerifiedGps: true
      });
    }

    building.place_id = place._id;
    building.visibility = review.requested_visibility;
    if (building.status === 'DRAFT') building.status = 'PUBLISHED';
    // Ma trận: COMMUNITY cần PUBLISHED — đã ép ở trên
    await building.save();

    review.status = 'MERGED';
    review.merge_target_place_id = place._id;
    review.place_id = place._id;
    review.reviewer_id = req.user.userId;
    review.decided_at = new Date();
    await review.save();

    logActivity({
      user_id: req.user.userId,
      action: mergeSummary ? 'MAP_REVIEW_MERGE_ENGINE' : 'MAP_REVIEW_MERGE_STUB',
      target_type: 'place',
      target_id: String(place._id),
      target: place.name,
      details: {
        review_id: String(review._id),
        building_id: String(building._id),
        merge_summary: mergeSummary || null
      },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: mergeSummary
        ? 'Đã merge Place nguồn vào đích + gắn tòa nhà.'
        : 'Đã gắn tòa nhà vào Place đích.',
      review: serialize(review, { building, place }),
      place_merge: mergeSummary
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

module.exports = {
  listReviews,
  createReview,
  approveReview,
  rejectReview,
  mergeStubReview,
  MAP_VISIBILITY_VALUES
};
