// ============================================
// Map Governance P2 — Ownership / Change Request
// ============================================

const mongoose = require('mongoose');
const PlaceOwnershipRequest = require('../models/PlaceOwnershipRequest');
const Place = require('../models/Place');
const Organization = require('../models/Organization');
const ActivityLog = require('../models/ActivityLog');
const { applyPlaceChanges, pickProposedChanges } = require('../services/placeMergeEngine');

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
    type: r.type,
    place_id: r.place_id,
    organization_id: r.organization_id,
    from_organization_id: r.from_organization_id,
    proposed_changes: r.proposed_changes,
    status: r.status,
    note: r.note || '',
    reject_reason: r.reject_reason || '',
    submitted_by: r.submitted_by,
    reviewer_id: r.reviewer_id,
    decided_at: r.decided_at,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    place: extras.place || null,
    organization: extras.organization || null
  };
}

async function listOwnership(req, res) {
  try {
    const status = String(req.query.status || 'PENDING').toUpperCase();
    const type = String(req.query.type || '').toUpperCase();
    const filter = {};
    if (['PENDING', 'APPROVED', 'REJECTED'].includes(status)) filter.status = status;
    if (['CLAIM', 'CHANGE', 'TRANSFER'].includes(type)) filter.type = type;

    const rows = await PlaceOwnershipRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit, 10) || 50, 100))
      .lean();

    const placeIds = [...new Set(rows.map((r) => String(r.place_id)))];
    const orgIds = [...new Set(rows.flatMap((r) => [r.organization_id, r.from_organization_id].filter(Boolean).map(String)))];
    const [places, orgs] = await Promise.all([
      Place.find({ _id: { $in: placeIds } }).select('name verified owner_org_id status').lean(),
      orgIds.length ? Organization.find({ _id: { $in: orgIds } }).select('name slug').lean() : []
    ]);
    const pMap = Object.fromEntries(places.map((p) => [String(p._id), p]));
    const oMap = Object.fromEntries(orgs.map((o) => [String(o._id), o]));

    return res.status(200).json({
      total: rows.length,
      requests: rows.map((r) => serialize(r, {
        place: pMap[String(r.place_id)] || null,
        organization: r.organization_id ? (oMap[String(r.organization_id)] || null) : null
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

/**
 * POST body:
 * type: CLAIM | CHANGE | TRANSFER
 * place_id, organization_id?, proposed_changes?, note?
 */
async function createOwnership(req, res) {
  try {
    const type = String(req.body?.type || '').toUpperCase();
    if (!['CLAIM', 'CHANGE', 'TRANSFER'].includes(type)) {
      return res.status(400).json({ message: 'type phải là CLAIM | CHANGE | TRANSFER', code: 'INVALID_TYPE' });
    }
    const placeId = assertObjectId(req.body?.place_id, 'place_id');
    const place = await Place.findById(placeId);
    if (!place) return res.status(404).json({ message: 'Không tìm thấy Place.' });
    if (place.status === 'LOCKED' || place.status === 'MERGED') {
      return res.status(400).json({ message: 'Place đang khóa/merge.' });
    }

    let organization_id = req.body?.organization_id || null;
    if (organization_id) {
      assertObjectId(organization_id, 'organization_id');
      const org = await Organization.findById(organization_id).select('_id').lean();
      if (!org) return res.status(400).json({ message: 'Organization không tồn tại.' });
    }

    if (type === 'CLAIM') {
      if (!organization_id) {
        return res.status(400).json({ message: 'CLAIM cần organization_id.' });
      }
      if (place.owner_org_id && String(place.owner_org_id) === String(organization_id)) {
        return res.status(400).json({
          message: 'Tổ chức đã là chủ Place này.',
          code: 'ALREADY_OWNER'
        });
      }
      // Có owner khác → phải TRANSFER, không CLAIM trực tiếp
      if (place.owner_org_id) {
        return res.status(400).json({
          message: 'Place đã có chủ. Dùng type=TRANSFER hoặc Change Request.',
          code: 'PLACE_HAS_OWNER'
        });
      }
    }

    if (type === 'TRANSFER') {
      if (!organization_id) {
        return res.status(400).json({ message: 'TRANSFER cần organization_id (org nhận).' });
      }
      if (!place.owner_org_id) {
        return res.status(400).json({ message: 'Place chưa có chủ — dùng CLAIM.', code: 'NO_OWNER' });
      }
    }

    let proposed_changes = null;
    if (type === 'CHANGE') {
      proposed_changes = pickProposedChanges(req.body?.proposed_changes || req.body);
      if (!proposed_changes) {
        return res.status(400).json({ message: 'CHANGE cần proposed_changes (name/aliases/gps…).' });
      }
      // Place có owner: không sửa trực tiếp — phải qua request (đúng product)
      // Super Admin vẫn tạo request để audit
    }

    if (type === 'CLAIM') {
      const existing = await PlaceOwnershipRequest.findOne({
        place_id: placeId,
        type: 'CLAIM',
        status: 'PENDING'
      }).lean();
      if (existing) {
        return res.status(409).json({
          message: 'Đã có CLAIM đang chờ duyệt cho Place này.',
          code: 'CLAIM_PENDING',
          request_id: existing._id
        });
      }
    }

    const doc = await PlaceOwnershipRequest.create({
      type,
      place_id: placeId,
      organization_id: organization_id || null,
      from_organization_id: type === 'TRANSFER' ? place.owner_org_id : null,
      proposed_changes,
      status: 'PENDING',
      submitted_by: req.user.userId,
      note: String(req.body?.note || '').slice(0, 1000)
    });

    logActivity({
      user_id: req.user.userId,
      action: 'PLACE_OWNERSHIP_SUBMIT',
      target_type: 'place',
      target_id: String(placeId),
      target: place.name,
      details: { type, request_id: String(doc._id) },
      ip_address: req.ip || ''
    });

    return res.status(201).json({
      message: 'Đã tạo yêu cầu ownership/change.',
      request: serialize(doc, { place })
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Đã có yêu cầu CLAIM chờ duyệt.', code: 'CLAIM_PENDING' });
    }
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

async function approveOwnership(req, res) {
  try {
    assertObjectId(req.params.id, 'request id');
    const doc = await PlaceOwnershipRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy yêu cầu.' });
    if (doc.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu không còn PENDING.', code: 'NOT_PENDING' });
    }

    const place = await Place.findById(doc.place_id);
    if (!place) return res.status(404).json({ message: 'Place không còn tồn tại.' });

    if (doc.type === 'CLAIM' || doc.type === 'TRANSFER') {
      if (!doc.organization_id) {
        return res.status(400).json({ message: 'Thiếu organization_id trên yêu cầu.' });
      }
      place.owner_org_id = doc.organization_id;
      if (req.body?.verified !== false) place.verified = true;
      if (place.status === 'DRAFT') place.status = 'ACTIVE';
      await place.save();
    } else if (doc.type === 'CHANGE') {
      await applyPlaceChanges(place, doc.proposed_changes);
    }

    doc.status = 'APPROVED';
    doc.reviewer_id = req.user.userId;
    doc.decided_at = new Date();
    await doc.save();

    logActivity({
      user_id: req.user.userId,
      action: 'PLACE_OWNERSHIP_APPROVE',
      target_type: 'place',
      target_id: String(place._id),
      target: place.name,
      details: { type: doc.type, request_id: String(doc._id) },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã duyệt yêu cầu.',
      request: serialize(doc, { place }),
      place
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

async function rejectOwnership(req, res) {
  try {
    assertObjectId(req.params.id, 'request id');
    const doc = await PlaceOwnershipRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy yêu cầu.' });
    if (doc.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu không còn PENDING.', code: 'NOT_PENDING' });
    }
    doc.status = 'REJECTED';
    doc.reject_reason = String(req.body?.reason || '').slice(0, 1000);
    doc.reviewer_id = req.user.userId;
    doc.decided_at = new Date();
    await doc.save();
    return res.status(200).json({ message: 'Đã từ chối.', request: serialize(doc) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

/**
 * Super Admin gán owner trực tiếp (không qua queue).
 * PATCH /api/place-ownership/places/:placeId/owner  { organization_id|null, verified? }
 */
async function setPlaceOwner(req, res) {
  try {
    assertObjectId(req.params.placeId, 'place id');
    const place = await Place.findById(req.params.placeId);
    if (!place) return res.status(404).json({ message: 'Không tìm thấy Place.' });

    if (req.body?.organization_id === null || req.body?.organization_id === '') {
      place.owner_org_id = null;
    } else {
      assertObjectId(req.body.organization_id, 'organization_id');
      const org = await Organization.findById(req.body.organization_id).select('_id').lean();
      if (!org) return res.status(400).json({ message: 'Organization không tồn tại.' });
      place.owner_org_id = req.body.organization_id;
    }
    if (req.body?.verified !== undefined) place.verified = !!req.body.verified;
    await place.save();

    logActivity({
      user_id: req.user.userId,
      action: 'PLACE_SET_OWNER',
      target_type: 'place',
      target_id: String(place._id),
      target: place.name,
      details: { owner_org_id: place.owner_org_id, verified: place.verified },
      ip_address: req.ip || ''
    });

    return res.status(200).json({ message: 'Đã cập nhật chủ Place.', place });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

module.exports = {
  listOwnership,
  createOwnership,
  approveOwnership,
  rejectOwnership,
  setPlaceOwner
};
