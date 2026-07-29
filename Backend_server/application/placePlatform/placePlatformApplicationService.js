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
const UserFavorite = require('../../models/UserFavorite');
const User = require('../../models/User');
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

  // Mirror sang moderation queue (governance) — giữ reason đồng bộ nếu enum hỗ trợ
  const modAllowed = ['SPAM', 'INAPPROPRIATE', 'DUPLICATE', 'COPYRIGHT', 'WRONG_LOCATION', 'OTHER'];
  const modReason = modAllowed.includes(reason) ? reason : 'OTHER';
  await MapModerationReport.create({
    target_type: 'PLACE',
    target_id: String(placeId),
    reason_code: modReason,
    detail: `[PlaceReport:${reason}] ${String(detail || '').slice(0, 1800)}`,
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

/** Admin — hàng đợi báo cáo địa điểm (PlaceReport từ outdoor / Android) */
async function adminListPlaceReports({ status, reasonCode, placeId, limit = 50 } = {}) {
  const filter = {};
  const st = String(status || 'OPEN').toUpperCase();
  if (st && st !== 'ALL') filter.status = st;
  if (reasonCode) filter.reason_code = String(reasonCode).toUpperCase();
  if (placeId) {
    assertObjectId(placeId, 'place_id');
    filter.place_id = placeId;
  }
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const rows = await PlaceReport.find(filter)
    .sort({ createdAt: -1 })
    .limit(lim)
    .populate('place_id', 'name slug latitude longitude')
    .populate('reported_by', 'email full_name')
    .lean();

  return {
    total: rows.length,
    reports: rows.map((r) => ({
      _id: r._id,
      place_id: r.place_id?._id || r.place_id,
      place: r.place_id && r.place_id.name
        ? {
          _id: r.place_id._id,
          name: r.place_id.name,
          slug: r.place_id.slug || '',
          latitude: r.place_id.latitude,
          longitude: r.place_id.longitude
        }
        : null,
      reason_code: r.reason_code,
      detail: r.detail || '',
      status: r.status,
      reported_by: r.reported_by,
      resolved_by: r.resolved_by || null,
      resolved_at: r.resolved_at || null,
      resolver_note: r.resolver_note || '',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }))
  };
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

  // Trả shape giống list (có user) để app hiện ngay trên carousel
  await doc.populate('user_id', 'full_name email');
  const u = doc.user_id && typeof doc.user_id === 'object' ? doc.user_id : null;
  return {
    _id: doc._id,
    place_id: doc.place_id,
    user_id: u ? u._id : doc.user_id,
    rating: doc.rating,
    comment: doc.comment || '',
    helpful_count: doc.helpful_count || 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    user: u
      ? {
          id: String(u._id),
          full_name: u.full_name || '',
          email: u.email || ''
        }
      : null
  };
}

async function listReviewsByUser(userId, { limit = 50 } = {}) {
  assertObjectId(userId, 'userId');
  const rows = await PlaceReview.find({ user_id: userId, is_active: { $ne: false } })
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .lean();
  return { total: rows.length, reviews: rows };
}

/** Public — danh sách đánh giá theo Place (UI Google Maps style). */
async function listReviewsByPlace(placeId, { limit = 20 } = {}) {
  assertObjectId(placeId, 'place_id');
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const rows = await PlaceReview.find({ place_id: placeId, is_active: { $ne: false } })
    .sort({ updatedAt: -1 })
    .limit(lim)
    .populate('user_id', 'full_name email')
    .lean();
  const reviews = rows.map((r) => {
    const u = r.user_id && typeof r.user_id === 'object' ? r.user_id : null;
    return {
      _id: r._id,
      place_id: r.place_id,
      user_id: u ? u._id : r.user_id,
      rating: r.rating,
      comment: r.comment || '',
      helpful_count: r.helpful_count || 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: u
        ? {
            id: String(u._id),
            full_name: u.full_name || '',
            email: u.email || ''
          }
        : null
    };
  });
  return { total: reviews.length, reviews };
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

function mapReviewAdminRow(r) {
  const u = r.user_id && typeof r.user_id === 'object' ? r.user_id : null;
  const p = r.place_id && typeof r.place_id === 'object' ? r.place_id : null;
  return {
    _id: r._id,
    place_id: p ? p._id : r.place_id,
    user_id: u ? u._id : r.user_id,
    rating: r.rating,
    comment: r.comment || '',
    helpful_count: r.helpful_count || 0,
    is_active: r.is_active !== false,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    user: u
      ? {
          id: String(u._id),
          full_name: u.full_name || '',
          email: u.email || ''
        }
      : null,
    place: p
      ? {
          id: String(p._id),
          name: p.name || '',
          slug: p.slug || '',
          category: p.category || ''
        }
      : null
  };
}

/** Admin — danh sách đánh giá (lọc theo place / từ khóa comment). */
async function adminListReviews({
  placeId,
  q,
  includeInactive = false,
  limit = 50,
  skip = 0
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const sk = Math.max(Number(skip) || 0, 0);
  const filter = {};
  if (placeId) {
    assertObjectId(placeId, 'place_id');
    filter.place_id = placeId;
  }
  if (!includeInactive) {
    filter.is_active = { $ne: false };
  }
  const keyword = String(q || '').trim();
  if (keyword) {
    filter.comment = { $regex: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  const [total, rows] = await Promise.all([
    PlaceReview.countDocuments(filter),
    PlaceReview.find(filter)
      .sort({ updatedAt: -1 })
      .skip(sk)
      .limit(lim)
      .populate('user_id', 'full_name email')
      .populate('place_id', 'name slug category')
      .lean()
  ]);

  return { total, reviews: rows.map(mapReviewAdminRow) };
}

/** Admin — ẩn đánh giá (soft delete). */
async function adminDeactivateReview(reviewId) {
  assertObjectId(reviewId);
  const doc = await PlaceReview.findById(reviewId);
  if (!doc) throw notFound('Không tìm thấy review.');
  if (doc.is_active === false) return doc;
  doc.is_active = false;
  await doc.save();
  return doc;
}

/** Admin — hiện lại đánh giá. */
async function adminActivateReview(reviewId) {
  assertObjectId(reviewId);
  const doc = await PlaceReview.findById(reviewId);
  if (!doc) throw notFound('Không tìm thấy review.');
  if (doc.is_active !== false) return doc;
  doc.is_active = true;
  await doc.save();
  return doc;
}

/** Admin — danh sách yêu thích theo place (hoặc gần đây nếu không có place_id). */
async function adminListFavorites({ placeId, limit = 50, skip = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const sk = Math.max(Number(skip) || 0, 0);
  const filter = {};
  if (placeId) {
    assertObjectId(placeId, 'place_id');
    filter.place_id = placeId;
  }

  const [total, rows] = await Promise.all([
    UserFavorite.countDocuments(filter),
    UserFavorite.find(filter)
      .sort({ createdAt: -1 })
      .skip(sk)
      .limit(lim)
      .lean()
  ]);

  const userIds = [...new Set(rows.map((r) => String(r.user_id)).filter(Boolean))];
  const placeIds = [...new Set(rows.map((r) => String(r.place_id)).filter(Boolean))];
  const [users, places] = await Promise.all([
    userIds.length
      ? User.find({ _id: { $in: userIds } }).select('full_name email').lean()
      : [],
    placeIds.length
      ? Place.find({ _id: { $in: placeIds } }).select('name slug category').lean()
      : []
  ]);
  const userMap = {};
  users.forEach((u) => { userMap[String(u._id)] = u; });
  const placeMap = {};
  places.forEach((p) => { placeMap[String(p._id)] = p; });

  return {
    total,
    favorites: rows.map((r) => {
      const u = userMap[String(r.user_id)] || null;
      const p = placeMap[String(r.place_id)] || null;
      return {
        _id: r._id,
        user_id: r.user_id,
        place_id: r.place_id,
        createdAt: r.createdAt,
        user: u
          ? {
              id: String(u._id),
              full_name: u.full_name || '',
              email: u.email || ''
            }
          : null,
        place: p
          ? {
              id: String(p._id),
              name: p.name || '',
              slug: p.slug || '',
              category: p.category || ''
            }
          : null
      };
    })
  };
}

/** Admin — xóa bản ghi yêu thích. */
async function adminRemoveFavorite(favoriteId) {
  assertObjectId(favoriteId);
  const doc = await UserFavorite.findByIdAndDelete(favoriteId);
  if (!doc) throw notFound('Không tìm thấy yêu thích.');
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
  adminListPlaceReports,
  closeReport,
  upsertReview,
  listReviewsByUser,
  listReviewsByPlace,
  markReviewHelpful,
  adminListReviews,
  adminDeactivateReview,
  adminActivateReview,
  adminListFavorites,
  adminRemoveFavorite,
  listActiveEvents,
  createEventStub,
  PROPOSAL_STATUS
};
