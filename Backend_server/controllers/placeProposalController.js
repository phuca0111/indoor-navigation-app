// ============================================
// Place Proposal API — PHASE 2 Business Flow
// ============================================

const PlaceProposal = require('../models/PlaceProposal');
const Place = require('../models/Place');
const ActivityLog = require('../models/ActivityLog');
const { validatePlaceProposal } = require('../services/placeProposalValidation');
const {
  ensureUniquePlaceSlug,
  normalizeOwnerType,
  normalizePublicationStatus
} = require('../utils/placeRegistry');

function logActivity(data) {
  ActivityLog.create(data).catch(() => {});
}

function serialize(doc) {
  if (!doc) return null;
  const p = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: p._id,
    name: p.name,
    latitude: p.latitude,
    longitude: p.longitude,
    address: p.address || '',
    category: p.category || '',
    description: p.description || '',
    image_url: p.image_url || '',
    source: p.source || '',
    status: p.status,
    submitted_by: p.submitted_by,
    duplicate_score: p.duplicate_score || 0,
    risk_score: p.risk_score || 0,
    validation: p.validation || null,
    duplicate_place_id: p.duplicate_place_id || null,
    place_id: p.place_id || null,
    reviewer_id: p.reviewer_id || null,
    reject_reason: p.reject_reason || '',
    decided_at: p.decided_at || null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

// POST /api/place-proposals — user đã login
async function createProposal(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);

    const validation = await validatePlaceProposal({
      name,
      latitude,
      longitude,
      address: req.body?.address,
      category: req.body?.category,
      image_url: req.body?.image_url,
      aliases: req.body?.aliases
    });

    if (!validation.ok) {
      return res.status(400).json({
        message: validation.errors.join(' '),
        code: 'PROPOSAL_INVALID',
        validation
      });
    }

    let status = 'PENDING';
    if (validation.recommendation === 'MARK_DUPLICATE') {
      status = 'DUPLICATE';
    }

    const proposal = await PlaceProposal.create({
      name,
      latitude,
      longitude,
      address: String(req.body?.address || '').slice(0, 500),
      category: String(req.body?.category || '').slice(0, 80),
      description: String(req.body?.description || '').slice(0, 2000),
      image_url: String(req.body?.image_url || '').slice(0, 500),
      source: String(req.body?.source || '').slice(0, 200),
      status,
      submitted_by: req.user.userId,
      duplicate_score: validation.duplicate_score,
      risk_score: validation.risk_score,
      validation: {
        recommendation: validation.recommendation,
        errors: validation.errors,
        details: validation.details
      },
      duplicate_place_id: validation.duplicate_place_id || null
    });

    logActivity({
      user_id: req.user.userId,
      action: 'PLACE_PROPOSAL_CREATE',
      target_type: 'place_proposal',
      target_id: String(proposal._id),
      target: proposal.name,
      details: {
        status: proposal.status,
        duplicate_score: proposal.duplicate_score,
        risk_score: proposal.risk_score
      },
      ip_address: req.ip || ''
    });

    return res.status(201).json({
      message: status === 'DUPLICATE'
        ? 'Đề xuất trùng Place hiện có — đưa vào hàng đợi Duplicate.'
        : 'Đã gửi đề xuất Place. Chờ kiểm duyệt.',
      proposal: serialize(proposal),
      validation
    });
  } catch (error) {
    console.error('createProposal:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/place-proposals — Super: all; user: own
async function listProposals(req, res) {
  try {
    const status = String(req.query.status || '').trim().toUpperCase();
    const filter = {};
    if (['PENDING', 'APPROVED', 'REJECTED', 'DUPLICATE'].includes(status)) {
      filter.status = status;
    } else if (status === 'QUEUE') {
      filter.status = { $in: ['PENDING', 'DUPLICATE'] };
    }

    if (req.user.role !== 'SUPER_ADMIN') {
      filter.submitted_by = req.user.userId;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const rows = await PlaceProposal.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      total: rows.length,
      proposals: rows.map(serialize)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/place-proposals/:id
async function getProposal(req, res) {
  try {
    const row = await PlaceProposal.findById(req.params.id).lean();
    if (!row) return res.status(404).json({ message: 'Không tìm thấy đề xuất.' });
    if (
      req.user.role !== 'SUPER_ADMIN' &&
      String(row.submitted_by) !== String(req.user.userId)
    ) {
      return res.status(403).json({ message: 'Không có quyền xem đề xuất này.' });
    }
    return res.status(200).json({ proposal: serialize(row) });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/place-proposals/validate — dry-run validation (auth)
async function validateOnly(req, res) {
  try {
    const validation = await validatePlaceProposal({
      name: req.body?.name,
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
      address: req.body?.address,
      category: req.body?.category,
      image_url: req.body?.image_url,
      aliases: req.body?.aliases
    });
    return res.status(200).json({ validation });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/place-proposals/:id/approve — Super Admin → sinh Place
async function approveProposal(req, res) {
  try {
    const proposal = await PlaceProposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Không tìm thấy đề xuất.' });
    if (!['PENDING', 'DUPLICATE'].includes(proposal.status)) {
      return res.status(400).json({
        message: 'Đề xuất không còn chờ duyệt.',
        code: 'NOT_PENDING'
      });
    }

    // DUPLICATE: mặc định không tạo mới trừ force=true
    if (proposal.status === 'DUPLICATE' && !(req.body?.force === true || req.body?.force === '1')) {
      return res.status(409).json({
        message: 'Đề xuất bị đánh dấu trùng. Gửi force=true để vẫn tạo Place mới, hoặc reject.',
        code: 'PROPOSAL_DUPLICATE',
        duplicate_place_id: proposal.duplicate_place_id
      });
    }

    const slug = await ensureUniquePlaceSlug(Place, proposal.name);
    const place = await Place.create({
      name: proposal.name,
      slug,
      latitude: proposal.latitude,
      longitude: proposal.longitude,
      address: proposal.address || '',
      category: proposal.category || '',
      radius: Math.min(Math.max(Number(req.body?.radius) || 80, 10), 5000),
      notes: proposal.description || '',
      owner_type: normalizeOwnerType(req.body?.owner_type, 'UNCLAIMED'),
      publication_status: normalizePublicationStatus(req.body?.publication_status, 'PUBLIC'),
      status: 'ACTIVE',
      created_by: proposal.submitted_by,
      verification_status: 'UNVERIFIED'
    });

    proposal.status = 'APPROVED';
    proposal.place_id = place._id;
    proposal.reviewer_id = req.user.userId;
    proposal.decided_at = new Date();
    await proposal.save();

    logActivity({
      user_id: req.user.userId,
      action: 'PLACE_PROPOSAL_APPROVE',
      target_type: 'place',
      target_id: String(place._id),
      target: place.name,
      details: { proposal_id: String(proposal._id) },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã duyệt đề xuất và tạo Place.',
      proposal: serialize(proposal),
      place: {
        _id: place._id,
        name: place.name,
        slug: place.slug
      }
    });
  } catch (error) {
    console.error('approveProposal:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Slug Place trùng.', code: 'SLUG_CONFLICT' });
    }
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/place-proposals/:id/reject
async function rejectProposal(req, res) {
  try {
    const proposal = await PlaceProposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Không tìm thấy đề xuất.' });
    if (!['PENDING', 'DUPLICATE'].includes(proposal.status)) {
      return res.status(400).json({
        message: 'Đề xuất không còn chờ duyệt.',
        code: 'NOT_PENDING'
      });
    }

    proposal.status = 'REJECTED';
    proposal.reject_reason = String(req.body?.reason || req.body?.reject_reason || '').slice(0, 1000);
    proposal.reviewer_id = req.user.userId;
    proposal.decided_at = new Date();
    await proposal.save();

    logActivity({
      user_id: req.user.userId,
      action: 'PLACE_PROPOSAL_REJECT',
      target_type: 'place_proposal',
      target_id: String(proposal._id),
      target: proposal.name,
      details: { reason: proposal.reject_reason },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã từ chối đề xuất.',
      proposal: serialize(proposal)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

module.exports = {
  createProposal,
  listProposals,
  getProposal,
  validateOnly,
  approveProposal,
  rejectProposal
};
