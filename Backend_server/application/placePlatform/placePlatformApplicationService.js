/**
 * Place Platform — domain services (Service-first).
 * Tái dùng models hiện có; facade ổn định cho Hub / Outdoor / Community.
 */
const mongoose = require('mongoose');
const Place = require('../../models/Place');
const PlaceProposal = require('../../models/PlaceProposal');
const PlaceOwnershipRequest = require('../../models/PlaceOwnershipRequest');
const PlaceReview = require('../../models/PlaceReview');
const PlaceReport = require('../../models/PlaceReport');
const PlaceEvent = require('../../models/PlaceEvent');
const MapModerationReport = require('../../models/MapModerationReport');
const {
  ensureUniquePlaceSlug,
  normalizePublicationStatus,
  normalizeOwnerType,
  normalizeReportReason,
  normalizeClaimCategory,
  isPlacePubliclyListed,
  PUBLICATION_STATUS,
  PROPOSAL_STATUS,
  PLACE_REPORT_STATUS,
  PLACE_EVENT_TYPE_VALUES,
  VERIFICATION_STATUS
} = require('../../utils/placePlatform');

function badRequest(message, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.status = 400;
  err.code = code;
  return err;
}

function notFound(message, code = 'NOT_FOUND') {
  const err = new Error(message);
  err.status = 404;
  err.code = code;
  return err;
}

function assertObjectId(id, label = 'id') {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw badRequest(`${label} không hợp lệ.`, 'INVALID_ID');
  }
  return String(id);
}

function serializePlace(doc) {
  if (!doc) return null;
  const p = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: p._id,
    id: String(p._id),
    slug: p.slug || '',
    name: p.name,
    description: p.description || '',
    category: p.category || '',
    latitude: p.latitude,
    longitude: p.longitude,
    radius: p.radius != null ? p.radius : 80,
    boundary: p.boundary || null,
    address: p.address || '',
    aliases: p.aliases || [],
    status: p.status,
    publication_status: p.publication_status,
    verification_status: p.verification_status,
    owner_type: p.owner_type,
    owner_org_id: p.owner_org_id || null,
    created_by: p.created_by || null,
    approved_by: p.approved_by || null,
    verified: !!p.verified,
    view_count: Number(p.view_count) || 0,
    community_flags: {
      official: p.owner_type === 'SYSTEM' || p.owner_type === 'ORGANIZATION',
      community: p.owner_type === 'COMMUNITY',
      pending: p.publication_status === PUBLICATION_STATUS.PENDING
        || p.verification_status === VERIFICATION_STATUS.PENDING
        || p.verification_status === VERIFICATION_STATUS.CLAIM_PENDING,
      verified: p.verification_status === VERIFICATION_STATUS.VERIFIED || !!p.verified
    }
  };
}

/** Tăng view_count khi user mở Place (Outdoor / deep-link / Android). */
async function recordView(slugOrId) {
  const place = await getBySlugOrId(slugOrId, { publicOnly: true });
  const id = place._id || place.id;
  const updated = await Place.findByIdAndUpdate(
    id,
    { $inc: { view_count: 1 } },
    { new: true }
  )
    .select('view_count')
    .lean();
  return {
    ok: true,
    views: Number(updated?.view_count) || 0,
    place_id: String(id)
  };
}

// —— PlaceService ——

async function getBySlugOrId(key, { publicOnly = true } = {}) {
  if (!key) throw badRequest('Thiếu id hoặc slug.');
  let place = null;
  if (mongoose.Types.ObjectId.isValid(String(key))) {
    place = await Place.findById(key).lean();
  }
  if (!place) {
    place = await Place.findOne({ slug: String(key).trim().toLowerCase() }).lean();
  }
  if (!place && key) {
    place = await Place.findOne({ slug: String(key).trim() }).lean();
  }
  if (!place) throw notFound('Không tìm thấy Place.', 'PLACE_NOT_FOUND');
  if (publicOnly && !isPlacePubliclyListed(place)) {
    throw notFound('Không tìm thấy Place công khai.', 'PLACE_NOT_FOUND');
  }
  return serializePlace(place);
}

async function ensureSlugOnPlace(placeDoc) {
  if (placeDoc.slug) return placeDoc.slug;
  placeDoc.slug = await ensureUniquePlaceSlug(Place, placeDoc.name, placeDoc._id);
  await placeDoc.save();
  return placeDoc.slug;
}

async function createPlaceDraft(input, actorUserId) {
  const name = String(input.name || '').trim();
  if (!name) throw badRequest('Thiếu name.');
  const slug = await ensureUniquePlaceSlug(Place, input.slug || name);
  const place = await Place.create({
    name,
    slug,
    description: String(input.description || '').slice(0, 4000),
    category: String(input.category || '').slice(0, 80),
    latitude: Number(input.latitude) || 0,
    longitude: Number(input.longitude) || 0,
    radius: Math.min(Math.max(Number(input.radius) || 80, 10), 5000),
    boundary: input.boundary || null,
    address: String(input.address || '').slice(0, 500),
    aliases: Array.isArray(input.aliases) ? input.aliases : [],
    publication_status: normalizePublicationStatus(input.publication_status, PUBLICATION_STATUS.DRAFT),
    owner_type: normalizeOwnerType(input.owner_type, 'UNCLAIMED'),
    created_by: actorUserId || null,
    status: 'DRAFT'
  });
  return serializePlace(place);
}

// —— ProposalService ——

async function listProposalsByUser(userId, { limit = 50 } = {}) {
  assertObjectId(userId, 'userId');
  const rows = await PlaceProposal.find({ created_by: userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .lean();
  return { total: rows.length, proposals: rows };
}

async function getProposal(id) {
  assertObjectId(id);
  const doc = await PlaceProposal.findById(id).lean();
  if (!doc) throw notFound('Không tìm thấy proposal.');
  return doc;
}

// —— ClaimService ——

async function createClaim({ placeId, organizationId, category, note, userId }) {
  assertObjectId(placeId, 'place_id');
  assertObjectId(organizationId, 'organization_id');
  const place = await Place.findById(placeId);
  if (!place) throw notFound('Không tìm thấy Place.');

  const existing = await PlaceOwnershipRequest.findOne({
    place_id: placeId,
    type: 'CLAIM',
    status: 'PENDING'
  });
  if (existing) {
    const err = new Error('Đã có claim đang chờ duyệt.');
    err.status = 409;
    err.code = 'CLAIM_EXISTS';
    err.claim = existing;
    throw err;
  }

  place.verification_status = VERIFICATION_STATUS.CLAIM_PENDING;
  await place.save();

  const claim = await PlaceOwnershipRequest.create({
    type: 'CLAIM',
    place_id: placeId,
    organization_id: organizationId,
    claim_category: normalizeClaimCategory(category),
    status: 'PENDING',
    submitted_by: userId || null,
    note: String(note || '').slice(0, 1000)
  });
  return claim;
}

// —— ReportService ——

async function createReport({ placeId, reasonCode, detail, userId }) {
  assertObjectId(placeId, 'place_id');
  assertObjectId(userId, 'userId');
  const place = await Place.findById(placeId).lean();
  if (!place) throw notFound('Không tìm thấy Place.');

  const reason = normalizeReportReason(reasonCode);
  const report = await PlaceReport.create({
    place_id: placeId,
    reason_code: reason,
    detail: String(detail || '').slice(0, 2000),
    status: PLACE_REPORT_STATUS.OPEN,
    reported_by: userId
  });

  // Mirror sang moderation queue (governance)
  const modReason = ['SPAM', 'DUPLICATE'].includes(reason) ? reason : 'OTHER';
  await MapModerationReport.create({
    target_type: 'PLACE',
    target_id: String(placeId),
    reason_code: modReason,
    detail: `[${reason}] ${String(detail || '').slice(0, 1900)}`,
    status: 'OPEN',
    reported_by: userId
  }).catch(() => {});

  try {
    const community = require('../community/communityApplicationService');
    await community.addPoints(userId, 5, 'reports');
  } catch (_) { /* ignore */ }

  return report;
}

async function listReportsByUser(userId, { limit = 50 } = {}) {
  assertObjectId(userId, 'userId');
  const rows = await PlaceReport.find({ reported_by: userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .lean();
  return { total: rows.length, reports: rows };
}

async function closeReport(reportId, { resolverId, note, status = PLACE_REPORT_STATUS.CLOSED } = {}) {
  assertObjectId(reportId);
  const doc = await PlaceReport.findById(reportId);
  if (!doc) throw notFound('Không tìm thấy report.');
  doc.status = status === PLACE_REPORT_STATUS.DISMISSED
    ? PLACE_REPORT_STATUS.DISMISSED
    : PLACE_REPORT_STATUS.CLOSED;
  doc.resolved_by = resolverId || null;
  doc.resolved_at = new Date();
  doc.resolver_note = String(note || '').slice(0, 1000);
  await doc.save();
  return doc;
}

// —— ReviewService ——

async function upsertReview({ placeId, userId, rating, comment }) {
  assertObjectId(placeId, 'place_id');
  assertObjectId(userId, 'userId');
  const r = Number(rating);
  if (!Number.isFinite(r) || r < 1 || r > 5) throw badRequest('Rating phải từ 1–5.');
  const place = await Place.findById(placeId).lean();
  if (!place) throw notFound('Không tìm thấy Place.');

  const doc = await PlaceReview.findOneAndUpdate(
    { place_id: placeId, user_id: userId },
    {
      $set: {
        rating: Math.round(r),
        comment: String(comment || '').slice(0, 2000),
        is_active: true
      },
      $setOnInsert: { helpful_count: 0 }
    },
    { upsert: true, returnDocument: 'after', new: true }
  );

  try {
    const community = require('../community/communityApplicationService');
    await community.addPoints(userId, 10, 'reviews');
  } catch (_) { /* ignore */ }

  return doc;
}

async function listReviewsByUser(userId, { limit = 50 } = {}) {
  assertObjectId(userId, 'userId');
  const rows = await PlaceReview.find({ user_id: userId, is_active: { $ne: false } })
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .lean();
  return { total: rows.length, reviews: rows };
}

async function markReviewHelpful(reviewId) {
  assertObjectId(reviewId);
  const doc = await PlaceReview.findByIdAndUpdate(
    reviewId,
    { $inc: { helpful_count: 1 } },
    { returnDocument: 'after', new: true }
  );
  if (!doc) throw notFound('Không tìm thấy review.');
  return doc;
}

// —— EventService (stub) ——

async function listActiveEvents(placeId) {
  assertObjectId(placeId, 'place_id');
  const now = new Date();
  const rows = await PlaceEvent.find({
    place_id: placeId,
    is_active: true,
    $or: [
      { ends_at: null },
      { ends_at: { $gte: now } }
    ]
  })
    .sort({ starts_at: 1 })
    .lean();
  return { total: rows.length, events: rows };
}

async function createEventStub(input, userId) {
  assertObjectId(input.place_id, 'place_id');
  const type = String(input.type || '').toUpperCase();
  if (!PLACE_EVENT_TYPE_VALUES.includes(type)) {
    throw badRequest('Loại event không hợp lệ.', 'INVALID_EVENT_TYPE');
  }
  const place = await Place.findById(input.place_id).lean();
  if (!place) throw notFound('Không tìm thấy Place.');
  const doc = await PlaceEvent.create({
    place_id: input.place_id,
    type,
    title: String(input.title || '').slice(0, 200),
    body: String(input.body || '').slice(0, 2000),
    starts_at: input.starts_at ? new Date(input.starts_at) : null,
    ends_at: input.ends_at ? new Date(input.ends_at) : null,
    created_by: userId || null
  });
  return doc;
}

module.exports = {
  serializePlace,
  getBySlugOrId,
  recordView,
  ensureSlugOnPlace,
  createPlaceDraft,
  listProposalsByUser,
  getProposal,
  createClaim,
  createReport,
  listReportsByUser,
  closeReport,
  upsertReview,
  listReviewsByUser,
  markReviewHelpful,
  listActiveEvents,
  createEventStub,
  PROPOSAL_STATUS
};
