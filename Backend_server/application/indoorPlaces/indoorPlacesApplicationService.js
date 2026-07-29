// ============================================
// Indoor places — engagement phòng / POI trong nhà
// ============================================

const mongoose = require('mongoose');
const Building = require('../../models/Building');
const Floor = require('../../models/Floor');
const IndoorReview = require('../../models/IndoorReview');
const IndoorReport = require('../../models/IndoorReport');
const IndoorFavorite = require('../../models/IndoorFavorite');
const MapModerationReport = require('../../models/MapModerationReport');
const {
  PLACE_REPORT_STATUS,
  normalizeReportReason
} = require('../../utils/placePlatform');

const ENTITY_KINDS = ['ROOM', 'POI'];

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  err.code = 'NOT_FOUND';
  return err;
}

function badRequest(message, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.status = 400;
  err.code = code;
  return err;
}

function assertObjectId(id, label = 'id') {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw badRequest(`${label} không hợp lệ.`, 'INVALID_ID');
  }
  return String(id);
}

function normalizeKind(kind) {
  const k = String(kind || '').trim().toUpperCase();
  if (!ENTITY_KINDS.includes(k)) {
    throw badRequest('entity_kind phải là ROOM | POI', 'INVALID_KIND');
  }
  return k;
}

function idsEqual(a, b) {
  return String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
}

/**
 * Tìm room/poi có tên trên Floor.map_data.
 * @returns {{ name, typeLabel, entity }}
 */
async function resolveTarget({ buildingId, floorNumber, entityKind, entityId, entityName }) {
  assertObjectId(buildingId, 'building_id');
  const kind = normalizeKind(entityKind);
  const eid = String(entityId || '').trim();
  if (!eid) throw badRequest('Thiếu entity_id.', 'ENTITY_ID_REQUIRED');

  const floor = Number(floorNumber);
  if (!Number.isFinite(floor)) throw badRequest('floor_number không hợp lệ.', 'INVALID_FLOOR');

  const building = await Building.findById(buildingId).select('_id name place_id').lean();
  if (!building) throw notFound('Không tìm thấy tòa nhà.');

  const floorDoc = await Floor.findOne({ building_id: buildingId, floor_number: floor })
    .select('map_data floor_number')
    .lean();
  if (!floorDoc) throw notFound('Không tìm thấy tầng.');

  const map = floorDoc.map_data || {};
  let entity = null;
  let typeLabel = kind === 'ROOM' ? 'Phòng' : 'Tiện ích';
  const wantName = String(entityName || '').trim().toLowerCase();

  if (kind === 'ROOM') {
    const rooms = Array.isArray(map.rooms) ? map.rooms : [];
    entity = rooms.find((r) => idsEqual(r?.id, eid)) || null;
    if (!entity && wantName) {
      entity = rooms.find((r) => String(r?.name || '').trim().toLowerCase() === wantName) || null;
    }
    if (entity?.room_type) typeLabel = String(entity.room_type);
    else if (entity?.type) typeLabel = String(entity.type);
  } else {
    const pois = Array.isArray(map.pois) ? map.pois : [];
    entity = pois.find((p) => idsEqual(p?.id, eid)) || null;
    if (!entity && wantName) {
      entity = pois.find((p) => String(p?.name || '').trim().toLowerCase() === wantName) || null;
    }
    if (entity?.poi_type) typeLabel = String(entity.poi_type);
    else if (entity?.poiType) typeLabel = String(entity.poiType);
    else if (entity?.type) typeLabel = String(entity.type);
  }

  if (!entity) throw notFound(kind === 'ROOM' ? 'Không tìm thấy phòng.' : 'Không tìm thấy POI.');

  const name = String(entity.name || '').trim();
  if (!name) {
    throw badRequest(
      'Chỉ hỗ trợ phòng/POI có tên. Corridor hoặc mục trống tên không thể đánh giá.',
      'NAME_REQUIRED'
    );
  }

  // Chuẩn hóa entity_id theo map (tránh lệch Int/String khi lưu review)
  const resolvedId = entity.id != null ? String(entity.id).trim() : eid;

  return {
    building_id: String(building._id),
    building_name: building.name || '',
    place_id: building.place_id ? String(building.place_id) : null,
    floor_number: floor,
    entity_kind: kind,
    entity_id: resolvedId,
    name,
    type_label: typeLabel,
    description: String(entity.description || '').slice(0, 2000) || ''
  };
}

function targetFilter(t) {
  return {
    building_id: t.building_id,
    floor_number: t.floor_number,
    entity_kind: t.entity_kind,
    entity_id: t.entity_id
  };
}

async function getTargetSummary({ buildingId, floorNumber, entityKind, entityId, entityName, userId }) {
  const t = await resolveTarget({ buildingId, floorNumber, entityKind, entityId, entityName });
  const filter = { ...targetFilter(t), is_active: true };
  const reviews = await IndoorReview.find(filter).select('rating').lean();
  const ratingCount = reviews.length;
  const ratingAvg = ratingCount
    ? Math.round((reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / ratingCount) * 10) / 10
    : null;

  let isFavorite = false;
  let myRating = null;
  if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
    const fav = await IndoorFavorite.findOne({
      user_id: userId,
      ...targetFilter(t)
    }).select('_id').lean();
    isFavorite = !!fav;
    const mine = await IndoorReview.findOne({
      user_id: userId,
      ...targetFilter(t),
      is_active: true
    }).select('rating comment').lean();
    if (mine) myRating = { rating: mine.rating, comment: mine.comment || '' };
  }

  return {
    ...t,
    rating_avg: ratingAvg,
    rating_count: ratingCount,
    is_favorite: isFavorite,
    my_review: myRating
  };
}

async function listReviews({ buildingId, floorNumber, entityKind, entityId, entityName, limit = 20 }) {
  const t = await resolveTarget({ buildingId, floorNumber, entityKind, entityId, entityName });
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const rows = await IndoorReview.find({ ...targetFilter(t), is_active: true })
    .sort({ updatedAt: -1 })
    .limit(lim)
    .populate('user_id', 'email full_name')
    .lean();
  return {
    total: rows.length,
    reviews: rows.map((r) => ({
      _id: r._id,
      rating: r.rating,
      comment: r.comment || '',
      user: r.user_id
        ? {
          id: r.user_id._id,
          email: r.user_id.email,
          full_name: r.user_id.full_name
        }
        : null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }))
  };
}

async function upsertReview({
  buildingId,
  floorNumber,
  entityKind,
  entityId,
  entityName,
  userId,
  rating,
  comment
}) {
  assertObjectId(userId, 'userId');
  const t = await resolveTarget({ buildingId, floorNumber, entityKind, entityId, entityName });
  const stars = Math.round(Number(rating));
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    throw badRequest('Rating phải từ 1–5.', 'INVALID_RATING');
  }

  const doc = await IndoorReview.findOneAndUpdate(
    { user_id: userId, ...targetFilter(t) },
    {
      $set: {
        rating: stars,
        comment: String(comment || '').slice(0, 2000),
        is_active: true,
        building_id: t.building_id,
        floor_number: t.floor_number,
        entity_kind: t.entity_kind,
        entity_id: t.entity_id
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
}

async function createReport({
  buildingId,
  floorNumber,
  entityKind,
  entityId,
  entityName,
  userId,
  reasonCode,
  detail
}) {
  assertObjectId(userId, 'userId');
  const t = await resolveTarget({ buildingId, floorNumber, entityKind, entityId, entityName });
  const reason = normalizeReportReason(reasonCode);

  const report = await IndoorReport.create({
    building_id: t.building_id,
    floor_number: t.floor_number,
    entity_kind: t.entity_kind,
    entity_id: t.entity_id,
    entity_name: t.name,
    reason_code: reason,
    detail: String(detail || '').slice(0, 2000),
    status: PLACE_REPORT_STATUS.OPEN,
    reported_by: userId
  });

  const modAllowed = ['SPAM', 'INAPPROPRIATE', 'DUPLICATE', 'COPYRIGHT', 'WRONG_LOCATION', 'OTHER'];
  const modReason = modAllowed.includes(reason) ? reason : 'OTHER';
  await MapModerationReport.create({
    target_type: 'BUILDING',
    target_id: String(t.building_id),
    reason_code: modReason,
    detail: `[IndoorReport:${reason}] ${t.entity_kind} ${t.entity_id} “${t.name}” T${t.floor_number}: ${String(detail || '').slice(0, 1600)}`,
    status: 'OPEN',
    reported_by: userId
  }).catch(() => {});

  return report;
}

async function addFavorite({ buildingId, floorNumber, entityKind, entityId, entityName, userId }) {
  assertObjectId(userId, 'userId');
  const t = await resolveTarget({ buildingId, floorNumber, entityKind, entityId, entityName });
  const doc = await IndoorFavorite.findOneAndUpdate(
    { user_id: userId, ...targetFilter(t) },
    {
      $set: {
        entity_name: t.name,
        building_id: t.building_id,
        floor_number: t.floor_number,
        entity_kind: t.entity_kind,
        entity_id: t.entity_id
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

async function removeFavorite({ buildingId, floorNumber, entityKind, entityId, entityName, userId }) {
  assertObjectId(userId, 'userId');
  const t = await resolveTarget({ buildingId, floorNumber, entityKind, entityId, entityName });
  await IndoorFavorite.deleteOne({ user_id: userId, ...targetFilter(t) });
  return { ok: true };
}

async function listMyFavorites(userId, { limit = 50 } = {}) {
  assertObjectId(userId, 'userId');
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const rows = await IndoorFavorite.find({ user_id: userId })
    .sort({ updatedAt: -1 })
    .limit(lim)
    .populate('building_id', 'name')
    .lean();
  return {
    total: rows.length,
    favorites: rows.map((f) => ({
      _id: f._id,
      building_id: f.building_id?._id || f.building_id,
      building_name: f.building_id?.name || '',
      floor_number: f.floor_number,
      entity_kind: f.entity_kind,
      entity_id: f.entity_id,
      entity_name: f.entity_name || '',
      createdAt: f.createdAt,
      updatedAt: f.updatedAt
    }))
  };
}

async function adminListIndoorReports({ status, reasonCode, limit = 50 } = {}) {
  const filter = {};
  const st = String(status || 'OPEN').toUpperCase();
  if (st && st !== 'ALL') filter.status = st;
  if (reasonCode) filter.reason_code = String(reasonCode).toUpperCase();
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const rows = await IndoorReport.find(filter)
    .sort({ createdAt: -1 })
    .limit(lim)
    .populate('building_id', 'name')
    .populate('reported_by', 'email full_name')
    .lean();

  return {
    total: rows.length,
    reports: rows.map((r) => ({
      _id: r._id,
      scope: 'INDOOR',
      building_id: r.building_id?._id || r.building_id,
      building_name: r.building_id?.name || '',
      floor_number: r.floor_number,
      entity_kind: r.entity_kind,
      entity_id: r.entity_id,
      entity_name: r.entity_name || '',
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

async function closeIndoorReport(id, { userId, status, note }) {
  assertObjectId(id, 'id');
  assertObjectId(userId, 'userId');
  const st = String(status || 'RESOLVED').toUpperCase();
  const allowed = ['RESOLVED', 'DISMISSED', 'CLOSED'];
  if (!allowed.includes(st)) throw badRequest('status phải là RESOLVED | DISMISSED', 'INVALID_STATUS');
  const finalStatus = st === 'CLOSED' ? PLACE_REPORT_STATUS.RESOLVED : st;

  const report = await IndoorReport.findByIdAndUpdate(
    id,
    {
      status: finalStatus,
      resolved_by: userId,
      resolved_at: new Date(),
      resolver_note: String(note || '').slice(0, 1000)
    },
    { new: true }
  );
  if (!report) throw notFound('Không tìm thấy báo cáo.');
  return report;
}

function mapIndoorReviewAdminRow(r) {
  const u = r.user_id && typeof r.user_id === 'object' ? r.user_id : null;
  const b = r.building_id && typeof r.building_id === 'object' ? r.building_id : null;
  const placeLabel = [
    b?.name || '',
    r.entity_kind === 'POI' ? 'POI' : 'Phòng',
    r.entity_name || r.entity_id,
    'T' + r.floor_number
  ].filter(Boolean).join(' · ');
  return {
    _id: r._id,
    scope: 'INDOOR',
    building_id: b?._id || r.building_id,
    building_name: b?.name || '',
    floor_number: r.floor_number,
    entity_kind: r.entity_kind,
    entity_id: r.entity_id,
    entity_name: r.entity_name || '',
    place_label: placeLabel,
    user_id: u?._id || r.user_id,
    rating: r.rating,
    comment: r.comment || '',
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
    place: {
      id: String(b?._id || r.building_id || ''),
      name: placeLabel,
      slug: '',
      category: r.entity_kind || ''
    }
  };
}

/** Admin — danh sách đánh giá phòng/POI. */
async function adminListIndoorReviews({
  q,
  includeInactive = false,
  buildingId,
  limit = 50,
  skip = 0
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const sk = Math.max(Number(skip) || 0, 0);
  const filter = {};
  if (buildingId) {
    assertObjectId(buildingId, 'building_id');
    filter.building_id = buildingId;
  }
  if (!includeInactive) {
    filter.is_active = { $ne: false };
  }
  const keyword = String(q || '').trim();
  if (keyword) {
    filter.comment = { $regex: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  const [total, rows] = await Promise.all([
    IndoorReview.countDocuments(filter),
    IndoorReview.find(filter)
      .sort({ updatedAt: -1 })
      .skip(sk)
      .limit(lim)
      .populate('user_id', 'full_name email')
      .populate('building_id', 'name')
      .lean()
  ]);

  return { total, reviews: rows.map((r) => mapIndoorReviewAdminRow(r)) };
}

async function adminDeactivateIndoorReview(reviewId) {
  assertObjectId(reviewId);
  const doc = await IndoorReview.findById(reviewId);
  if (!doc) throw notFound('Không tìm thấy đánh giá trong nhà.');
  if (doc.is_active === false) return doc;
  doc.is_active = false;
  await doc.save();
  return doc;
}

async function adminActivateIndoorReview(reviewId) {
  assertObjectId(reviewId);
  const doc = await IndoorReview.findById(reviewId);
  if (!doc) throw notFound('Không tìm thấy đánh giá trong nhà.');
  if (doc.is_active !== false) return doc;
  doc.is_active = true;
  await doc.save();
  return doc;
}

async function adminListIndoorFavorites({ limit = 50, skip = 0, buildingId } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const sk = Math.max(Number(skip) || 0, 0);
  const filter = {};
  if (buildingId) {
    assertObjectId(buildingId, 'building_id');
    filter.building_id = buildingId;
  }
  const [total, rows] = await Promise.all([
    IndoorFavorite.countDocuments(filter),
    IndoorFavorite.find(filter)
      .sort({ createdAt: -1 })
      .skip(sk)
      .limit(lim)
      .populate('user_id', 'full_name email')
      .populate('building_id', 'name')
      .lean()
  ]);

  return {
    total,
    favorites: rows.map((f) => {
      const u = f.user_id && typeof f.user_id === 'object' ? f.user_id : null;
      const b = f.building_id && typeof f.building_id === 'object' ? f.building_id : null;
      const placeLabel = [
        b?.name || '',
        f.entity_kind === 'POI' ? 'POI' : 'Phòng',
        f.entity_name || f.entity_id,
        'T' + f.floor_number
      ].filter(Boolean).join(' · ');
      return {
        _id: f._id,
        scope: 'INDOOR',
        createdAt: f.createdAt,
        user_id: u?._id || f.user_id,
        user: u
          ? {
              id: String(u._id),
              full_name: u.full_name || '',
              email: u.email || ''
            }
          : null,
        place: {
          id: String(b?._id || f.building_id || ''),
          name: placeLabel,
          slug: '',
          category: f.entity_kind || ''
        }
      };
    })
  };
}

async function adminRemoveIndoorFavorite(id) {
  assertObjectId(id);
  const doc = await IndoorFavorite.findByIdAndDelete(id);
  if (!doc) throw notFound('Không tìm thấy yêu thích trong nhà.');
  return doc;
}

module.exports = {
  resolveTarget,
  getTargetSummary,
  listReviews,
  upsertReview,
  createReport,
  addFavorite,
  removeFavorite,
  listMyFavorites,
  adminListIndoorReports,
  closeIndoorReport,
  adminListIndoorReviews,
  adminDeactivateIndoorReview,
  adminActivateIndoorReview,
  adminListIndoorFavorites,
  adminRemoveIndoorFavorite,
  ENTITY_KINDS
};
