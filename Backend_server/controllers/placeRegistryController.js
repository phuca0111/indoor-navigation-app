/**
 * GĐ2–3 Controllers: Registry public + claim/report/review + proposals.
 */
const mongoose = require('mongoose');
const Place = require('../models/Place');
const PlaceProposal = require('../models/PlaceProposal');
const PlaceReview = require('../models/PlaceReview');
const PlaceOwnershipRequest = require('../models/PlaceOwnershipRequest');
const MapModerationReport = require('../models/MapModerationReport');
const {
  listPublicPlaces,
  getPublicPlace,
  searchPlaces,
  serializeRegistryPlace
} = require('../application/placeRegistry/placeRegistryApplicationService');
const { validatePlaceProposal } = require('../services/placeValidationEngine');
const {
  PROPOSAL_STATUS,
  PUBLICATION_STATUS,
  OWNER_TYPE,
  VALIDATION_RISK,
  MODERATION_ROUTE
} = require('../utils/placePlatform');
const { roleHasPermission, P } = require('../utils/permissions');

function userIdOf(req) {
  return req.user?.userId || req.user?.id || req.user?._id || null;
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

function canModerate(user) {
  return user && roleHasPermission(user.role, P.PLACE_MODERATE);
}

// —— Registry ——

async function listPlacesRegistry(req, res) {
  try {
    // MAP_MOD / SUPER: giữ list admin cũ (filter status, mọi publication)
    if (canModerate(req.user)) {
      const PlaceCtrl = require('./placeController');
      return PlaceCtrl.listPlaces(req, res);
    }
    const result = await listPublicPlaces({
      q: req.query.q,
      category: req.query.category,
      limit: req.query.limit,
      skip: req.query.skip
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('listPlacesRegistry:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Lỗi máy chủ.' });
  }
}

async function getPlaceRegistry(req, res) {
  try {
    assertObjectId(req.params.id, 'place id');
    if (canModerate(req.user)) {
      const PlaceCtrl = require('./placeController');
      return PlaceCtrl.getPlace(req, res);
    }
    const result = await getPublicPlace(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || 'Lỗi máy chủ.',
      code: error.code
    });
  }
}

async function searchPlacesRegistry(req, res) {
  try {
    const result = await searchPlaces(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    console.error('searchPlacesRegistry:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

async function reportPlace(req, res) {
  try {
    const placeId = assertObjectId(req.body.place_id || req.body.target_id, 'place_id');
    const place = await Place.findById(placeId).lean();
    if (!place) return res.status(404).json({ message: 'Không tìm thấy Place.' });

    const doc = await MapModerationReport.create({
      target_type: 'PLACE',
      target_id: placeId,
      reason_code: String(req.body.reason_code || 'OTHER').toUpperCase(),
      detail: String(req.body.detail || req.body.reason || '').slice(0, 2000),
      status: 'OPEN',
      reported_by: userIdOf(req)
    });
    return res.status(201).json({ report: doc });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function claimPlace(req, res) {
  try {
    const placeId = assertObjectId(req.body.place_id, 'place_id');
    const orgId = assertObjectId(req.body.organization_id, 'organization_id');
    const place = await Place.findById(placeId);
    if (!place) return res.status(404).json({ message: 'Không tìm thấy Place.' });

    const existing = await PlaceOwnershipRequest.findOne({
      place_id: placeId,
      type: 'CLAIM',
      status: 'PENDING'
    });
    if (existing) {
      return res.status(409).json({ message: 'Đã có claim đang chờ duyệt.', code: 'CLAIM_EXISTS', claim: existing });
    }

    place.verification_status = 'CLAIM_PENDING';
    await place.save();

    const claim = await PlaceOwnershipRequest.create({
      type: 'CLAIM',
      place_id: placeId,
      organization_id: orgId,
      status: 'PENDING',
      submitted_by: userIdOf(req),
      note: String(req.body.note || '').slice(0, 1000)
    });
    return res.status(201).json({ claim });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Đã có claim đang chờ duyệt.', code: 'CLAIM_EXISTS' });
    }
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function reviewPlace(req, res) {
  try {
    const placeId = assertObjectId(req.body.place_id, 'place_id');
    const rating = Number(req.body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'rating phải từ 1 đến 5.' });
    }
    const userId = userIdOf(req);
    const doc = await PlaceReview.findOneAndUpdate(
      { place_id: placeId, user_id: userId },
      {
        place_id: placeId,
        user_id: userId,
        rating,
        comment: String(req.body.comment || '').slice(0, 2000),
        is_active: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.status(201).json({ review: doc });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

// —— Proposals ——

function serializeProposal(doc) {
  const p = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: p._id,
    proposed_name: p.proposed_name,
    latitude: p.latitude,
    longitude: p.longitude,
    category: p.category,
    address: p.address,
    description: p.description,
    photos: p.photos || [],
    status: p.status,
    risk: p.risk,
    route_hint: p.route_hint,
    validation_snapshot: p.validation_snapshot,
    resulting_place_id: p.resulting_place_id,
    reject_reason: p.reject_reason || '',
    escalated: !!p.escalated,
    created_by: p.created_by,
    reviewer_id: p.reviewer_id,
    decided_at: p.decided_at,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

async function createProposal(req, res) {
  try {
    const name = String(req.body.proposed_name || req.body.name || '').trim();
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    if (!name) return res.status(400).json({ message: 'Thiếu proposed_name.' });
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ message: 'latitude/longitude không hợp lệ.' });
    }

    const snapshot = await validatePlaceProposal({
      proposed_name: name,
      latitude,
      longitude,
      category: req.body.category || '',
      aliases: req.body.aliases || [],
      boundary: req.body.boundary || null
    });

    // AUTO + LOW: vẫn tạo proposal SUBMITTED nhưng route AUTO (moderator có thể bulk)
    // Không tự tạo Place — Create ≠ Publish / Proposal ≠ Place
    const status = req.body.as_draft === true
      ? PROPOSAL_STATUS.DRAFT
      : PROPOSAL_STATUS.SUBMITTED;

    const doc = await PlaceProposal.create({
      proposed_name: name,
      latitude,
      longitude,
      category: String(req.body.category || '').slice(0, 80),
      address: String(req.body.address || '').slice(0, 500),
      description: String(req.body.description || '').slice(0, 2000),
      photos: Array.isArray(req.body.photos) ? req.body.photos.slice(0, 10) : [],
      created_by: userIdOf(req),
      status,
      validation_snapshot: snapshot,
      risk: snapshot.risk,
      route_hint: snapshot.routeHint,
      escalated: snapshot.risk === VALIDATION_RISK.HIGH && snapshot.routeHint === MODERATION_ROUTE.ESCALATE
    });

    return res.status(201).json({
      proposal: serializeProposal(doc),
      validation: snapshot
    });
  } catch (error) {
    console.error('createProposal:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function listProposals(req, res) {
  try {
    const filter = {};
    const mine = req.query.mine === '1' || !canModerate(req.user);
    if (mine) {
      filter.created_by = userIdOf(req);
    }
    if (req.query.status) {
      filter.status = String(req.query.status).toUpperCase();
    } else if (!mine) {
      filter.status = { $in: [PROPOSAL_STATUS.SUBMITTED, PROPOSAL_STATUS.IN_REVIEW] };
    }
    if (req.query.risk) filter.risk = String(req.query.risk).toUpperCase();

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const rows = await PlaceProposal.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return res.status(200).json({
      total: rows.length,
      proposals: rows.map(serializeProposal)
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function approveProposal(req, res) {
  try {
    assertObjectId(req.params.id, 'proposal id');
    const proposal = await PlaceProposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Không tìm thấy Proposal.' });
    if (![PROPOSAL_STATUS.SUBMITTED, PROPOSAL_STATUS.IN_REVIEW].includes(proposal.status)) {
      return res.status(409).json({ message: 'Proposal không ở trạng thái duyệt được.', status: proposal.status });
    }

    const place = await Place.create({
      name: proposal.proposed_name,
      latitude: proposal.latitude,
      longitude: proposal.longitude,
      category: proposal.category,
      address: proposal.address,
      notes: proposal.description,
      created_by: proposal.created_by,
      status: 'ACTIVE',
      publication_status: PUBLICATION_STATUS.PUBLISHED,
      owner_type: OWNER_TYPE.COMMUNITY,
      verification_status: 'UNVERIFIED'
    });

    proposal.status = PROPOSAL_STATUS.APPROVED;
    proposal.resulting_place_id = place._id;
    proposal.reviewer_id = userIdOf(req);
    proposal.decided_at = new Date();
    await proposal.save();

    return res.status(200).json({
      proposal: serializeProposal(proposal),
      place: serializeRegistryPlace(place)
    });
  } catch (error) {
    console.error('approveProposal:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function rejectProposal(req, res) {
  try {
    assertObjectId(req.params.id, 'proposal id');
    const proposal = await PlaceProposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Không tìm thấy Proposal.' });
    if (![PROPOSAL_STATUS.SUBMITTED, PROPOSAL_STATUS.IN_REVIEW].includes(proposal.status)) {
      return res.status(409).json({ message: 'Proposal không ở trạng thái từ chối được.' });
    }
    proposal.status = PROPOSAL_STATUS.REJECTED;
    proposal.reject_reason = String(req.body.reason || req.body.reject_reason || '').slice(0, 1000);
    proposal.reviewer_id = userIdOf(req);
    proposal.decided_at = new Date();
    await proposal.save();
    return res.status(200).json({ proposal: serializeProposal(proposal) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function previewValidation(req, res) {
  try {
    const snapshot = await validatePlaceProposal({
      proposed_name: req.body.proposed_name || req.body.name,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      category: req.body.category,
      aliases: req.body.aliases,
      boundary: req.body.boundary
    });
    return res.status(200).json({ validation: snapshot });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  listPlacesRegistry,
  getPlaceRegistry,
  searchPlacesRegistry,
  reportPlace,
  claimPlace,
  reviewPlace,
  createProposal,
  listProposals,
  approveProposal,
  rejectProposal,
  previewValidation
};
