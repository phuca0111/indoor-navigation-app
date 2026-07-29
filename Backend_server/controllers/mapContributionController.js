// ============================================
// Đóng góp cộng đồng — Platform moderation API
// ============================================

const mongoose = require('mongoose');
const MapContribution = require('../models/MapContribution');
const Place = require('../models/Place');
const Building = require('../models/Building');
const ActivityLog = require('../models/ActivityLog');
const { CONTRIBUTION_TYPES, MAP_SCOPES } = MapContribution;

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

function serialize(doc) {
  const c = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: c._id,
    type: c.type,
    map_scope: c.map_scope || 'OUTDOOR',
    title: c.title,
    description: c.description || '',
    poi_kind: c.poi_kind || '',
    place_id: c.place_id || null,
    building_id: c.building_id || null,
    floor_number: c.floor_number == null ? null : c.floor_number,
    latitude: c.latitude,
    longitude: c.longitude,
    indoor_x: c.indoor_x,
    indoor_y: c.indoor_y,
    status: c.status,
    submitted_by: c.submitted_by,
    reviewer_id: c.reviewer_id || null,
    reject_reason: c.reject_reason || '',
    decided_at: c.decided_at || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  };
}

/** POST /api/map-contributions — user gửi đề xuất */
async function createContribution(req, res) {
  try {
    const type = String(req.body?.type || 'ADD_POI').toUpperCase();
    if (!CONTRIBUTION_TYPES.includes(type)) {
      return res.status(400).json({
        message: 'type phải là ADD_POI | FIX_LOCATION | FIX_INFO | OTHER',
        code: 'INVALID_TYPE'
      });
    }
    let map_scope = String(req.body?.map_scope || 'OUTDOOR').toUpperCase();
    if (!MAP_SCOPES.includes(map_scope)) {
      return res.status(400).json({
        message: 'map_scope phải là OUTDOOR | INDOOR',
        code: 'INVALID_MAP_SCOPE'
      });
    }
    // Indoor đề xuất cần building; outdoor nên có place (khuyến nghị)
    if (map_scope === 'INDOOR' && !req.body?.building_id) {
      return res.status(400).json({
        message: 'Đề xuất INDOOR cần building_id.',
        code: 'BUILDING_REQUIRED'
      });
    }
    const title = String(req.body?.title || '').trim();
    if (!title || title.length < 2) {
      return res.status(400).json({ message: 'Thiếu tiêu đề đề xuất.', code: 'TITLE_REQUIRED' });
    }

    let place_id = req.body?.place_id || null;
    let building_id = req.body?.building_id || null;
    if (place_id) {
      assertObjectId(place_id, 'place_id');
      const p = await Place.findById(place_id).select('_id').lean();
      if (!p) return res.status(404).json({ message: 'Place không tồn tại.' });
    }
    if (building_id) {
      assertObjectId(building_id, 'building_id');
      const b = await Building.findById(building_id).select('_id place_id').lean();
      if (!b) return res.status(404).json({ message: 'Tòa nhà không tồn tại.' });
      if (!place_id && b.place_id) place_id = b.place_id;
    }

    const lat = req.body?.latitude != null ? Number(req.body.latitude) : null;
    const lng = req.body?.longitude != null ? Number(req.body.longitude) : null;

    const doc = await MapContribution.create({
      type,
      map_scope,
      title: title.slice(0, 200),
      description: String(req.body?.description || '').slice(0, 2000),
      poi_kind: String(req.body?.poi_kind || '').slice(0, 80),
      place_id: place_id || null,
      building_id: building_id || null,
      floor_number: req.body?.floor_number != null && Number.isFinite(Number(req.body.floor_number))
        ? Number(req.body.floor_number)
        : null,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      indoor_x: req.body?.indoor_x != null ? Number(req.body.indoor_x) : null,
      indoor_y: req.body?.indoor_y != null ? Number(req.body.indoor_y) : null,
      status: 'PENDING',
      submitted_by: req.user.userId
    });

    logActivity({
      user_id: req.user.userId,
      action: 'MAP_CONTRIBUTION_CREATE',
      target_type: 'map_contribution',
      target_id: String(doc._id),
      target: doc.title,
      details: { type: doc.type, map_scope: doc.map_scope, poi_kind: doc.poi_kind },
      ip_address: req.ip || ''
    });

    return res.status(201).json({
      message: 'Đã gửi đề xuất. Chờ kiểm duyệt.',
      contribution: serialize(doc)
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

/** GET /api/map-contributions — admin: hàng đợi; user: của mình */
async function listContributions(req, res) {
  try {
    const status = String(req.query.status || '').trim().toUpperCase();
    const filter = {};
    if (['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      filter.status = status;
    } else if (status === 'QUEUE' || !status) {
      if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'MAP_MODERATOR') {
        filter.status = 'PENDING';
      }
    }

    const isMod = req.user.role === 'SUPER_ADMIN' || req.user.role === 'MAP_MODERATOR';
    if (!isMod) {
      filter.submitted_by = req.user.userId;
    } else if (req.query.mine === '1') {
      filter.submitted_by = req.user.userId;
    }

    if (req.query.type) {
      const t = String(req.query.type).toUpperCase();
      if (CONTRIBUTION_TYPES.includes(t)) filter.type = t;
    }
    if (req.query.map_scope) {
      const sc = String(req.query.map_scope).toUpperCase();
      if (MAP_SCOPES.includes(sc)) filter.map_scope = sc;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const rows = await MapContribution.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      total: rows.length,
      contributions: rows.map(serialize)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

/** POST /api/map-contributions/:id/approve — Platform duyệt (không tự sửa Editor) */
async function approveContribution(req, res) {
  try {
    assertObjectId(req.params.id, 'contribution id');
    const doc = await MapContribution.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy đề xuất.' });
    if (doc.status !== 'PENDING') {
      return res.status(409).json({
        message: 'Đề xuất không còn chờ duyệt.',
        code: 'NOT_PENDING',
        status: doc.status
      });
    }

    doc.status = 'APPROVED';
    doc.reviewer_id = req.user.userId;
    doc.decided_at = new Date();
    doc.reject_reason = '';
    await doc.save();

    logActivity({
      user_id: req.user.userId,
      action: 'MAP_CONTRIBUTION_APPROVE',
      target_type: 'map_contribution',
      target_id: String(doc._id),
      target: doc.title,
      details: {
        type: doc.type,
        note: 'Platform duyệt — áp dụng vào map thuộc Editor (thủ công).'
      },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã duyệt đề xuất. Áp dụng vào bản đồ trong Editor (không tự vẽ).',
      contribution: serialize(doc)
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

/** POST /api/map-contributions/:id/reject — body: { reason? } */
async function rejectContribution(req, res) {
  try {
    assertObjectId(req.params.id, 'contribution id');
    const doc = await MapContribution.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy đề xuất.' });
    if (doc.status !== 'PENDING') {
      return res.status(409).json({
        message: 'Đề xuất không còn chờ duyệt.',
        code: 'NOT_PENDING',
        status: doc.status
      });
    }

    const reason = String(req.body?.reason || req.body?.reject_reason || '').slice(0, 1000);
    doc.status = 'REJECTED';
    doc.reviewer_id = req.user.userId;
    doc.decided_at = new Date();
    doc.reject_reason = reason || 'Từ chối';
    await doc.save();

    logActivity({
      user_id: req.user.userId,
      action: 'MAP_CONTRIBUTION_REJECT',
      target_type: 'map_contribution',
      target_id: String(doc._id),
      target: doc.title,
      details: { type: doc.type, reason: doc.reject_reason },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã từ chối đề xuất.',
      contribution: serialize(doc)
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

module.exports = {
  createContribution,
  listContributions,
  approveContribution,
  rejectContribution
};
