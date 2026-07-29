/**
 * GĐ2 — Place Registry Service (public list / get / search).
 */
const mongoose = require('mongoose');
const Place = require('../../models/Place');
const Building = require('../../models/Building');
const {
  isPlacePubliclyListed,
  placePublicMongoFilter,
  OWNER_TYPE,
  PUBLICATION_STATUS
} = require('../../utils/placePlatform');
const { haversineMeters } = require('../../services/placeDuplicateDetection');

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "10.74, 106.61" hoặc "10.74 106.61" */
function parseLatLngPair(raw) {
  const t = String(raw || '').trim();
  const m = t.match(/^(-?\d+(?:[.,]\d+)?)\s*[,;\s]+\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if (!m) return null;
  let lat = Number(String(m[1]).replace(',', '.'));
  let lng = Number(String(m[2]).replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lng >= 8 && lng <= 24 && lat >= 100 && lat <= 120) {
    const swap = lat;
    lat = lng;
    lng = swap;
  }
  return { lat, lng };
}

function isPartialCoordToken(q) {
  return /^-?\d+(\.\d+)?$/.test(String(q || '').trim().replace(',', '.'));
}

/** Text tìm Place: tên, alias, địa chỉ, slug, danh mục, mô tả, ghi chú, tọa độ. */
function placeTextSearchOr(q) {
  const raw = String(q || '').trim();
  if (!raw) return null;
  const re = new RegExp(escapeRegex(raw), 'i');
  const clauses = [
    { name: re },
    { aliases: re },
    { address: re },
    { category: re },
    { slug: re },
    { description: re },
    { notes: re }
  ];
  if (isPartialCoordToken(raw)) {
    const token = raw.replace(',', '.');
    clauses.push(
      { $expr: { $regexMatch: { input: { $toString: '$latitude' }, regex: escapeRegex(token) } } },
      { $expr: { $regexMatch: { input: { $toString: '$longitude' }, regex: escapeRegex(token) } } }
    );
  }
  return { $or: clauses };
}

function serializeRegistryPlace(doc, extras = {}) {
  if (!doc) return null;
  const p = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: p._id,
    name: p.name,
    slug: p.slug || '',
    aliases: p.aliases || [],
    latitude: p.latitude,
    longitude: p.longitude,
    radius: p.radius != null ? p.radius : 80,
    address: p.address || '',
    category: p.category || '',
    description: p.description || '',
    publication_status: p.publication_status || null,
    owner_type: p.owner_type || OWNER_TYPE.UNCLAIMED,
    verification_status: p.verification_status || 'UNVERIFIED',
    verified: !!p.verified,
    status: p.status,
    distance_m: extras.distance_m != null ? extras.distance_m : undefined,
    building_count: extras.building_count,
    has_published_indoor: extras.has_published_indoor === true
  };
}

async function buildingStatsByPlaceIds(placeIds) {
  if (!placeIds.length) return {};
  const rows = await Building.aggregate([
    { $match: { place_id: { $in: placeIds }, is_active: { $ne: false } } },
    {
      $group: {
        _id: '$place_id',
        count: { $sum: 1 },
        published: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ['$workspace_status', 'PUBLISHED'] },
                  { $eq: ['$status', 'PUBLISHED'] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
  const map = {};
  rows.forEach((r) => {
    map[String(r._id)] = { count: r.count, published: r.published };
  });
  return map;
}

async function listPublicPlaces({ q, category, limit = 50, skip = 0 } = {}) {
  const filter = placePublicMongoFilter();
  if (category) {
    filter.$and.push({ category: new RegExp(escapeRegex(category), 'i') });
  }
  const qRaw = String(q || '').trim();
  const coordPair = parseLatLngPair(qRaw);
  if (coordPair) {
    // Query là cặp tọa độ → tìm Place gần (~400 m)
    const deg = 400 / 111000;
    filter.$and.push({
      latitude: { $gte: coordPair.lat - deg, $lte: coordPair.lat + deg },
      longitude: { $gte: coordPair.lng - deg, $lte: coordPair.lng + deg }
    });
  } else {
    const textOr = placeTextSearchOr(qRaw);
    if (textOr) filter.$and.push(textOr);
  }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const sk = Math.max(parseInt(skip, 10) || 0, 0);
  let rows = await Place.find(filter).sort({ updatedAt: -1 }).skip(sk).limit(coordPair ? 80 : lim).lean();
  if (coordPair) {
    rows = rows
      .map((r) => ({
        r,
        d: haversineMeters(coordPair.lat, coordPair.lng, r.latitude, r.longitude)
      }))
      .filter((x) => x.d <= 400)
      .sort((a, b) => a.d - b.d)
      .slice(0, lim)
      .map((x) => x.r);
  }
  const total = coordPair ? rows.length : await Place.countDocuments(filter);
  const stats = await buildingStatsByPlaceIds(rows.map((r) => r._id));
  return {
    total,
    places: rows.map((r) => serializeRegistryPlace(r, {
      building_count: stats[String(r._id)]?.count || 0,
      has_published_indoor: (stats[String(r._id)]?.published || 0) > 0,
      distance_m: coordPair
        ? Math.round(haversineMeters(coordPair.lat, coordPair.lng, r.latitude, r.longitude))
        : undefined
    }))
  };
}

async function getPublicPlace(id) {
  let place = null;
  if (mongoose.Types.ObjectId.isValid(String(id))) {
    place = await Place.findById(id).lean();
  }
  if (!place) {
    place = await Place.findOne({ slug: String(id).trim() }).lean();
  }
  if (!place || !isPlacePubliclyListed(place)) {
    const err = new Error('Không tìm thấy Place công khai.');
    err.status = 404;
    err.code = 'PLACE_NOT_FOUND';
    throw err;
  }
  const buildings = await Building.find({
    place_id: place._id,
    is_active: { $ne: false },
    $or: [{ workspace_status: 'PUBLISHED' }, { status: 'PUBLISHED' }]
  })
    .select('name status workspace_status visibility total_floors gps_location')
    .lean();
  return {
    place: serializeRegistryPlace(place, {
      building_count: buildings.length,
      has_published_indoor: buildings.length > 0
    }),
    indoor_workspaces: buildings
  };
}

/**
 * Search text + near GPS.
 * body: { q?, category?, lat?, lng?, radius_m?, limit? }
 */
async function searchPlaces(body = {}) {
  const lat = Number(body.lat ?? body.latitude);
  const lng = Number(body.lng ?? body.longitude);
  const radius = Math.min(Math.max(Number(body.radius_m) || 2000, 50), 50000);
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

  const base = await listPublicPlaces({
    q: body.q || body.query || '',
    category: body.category || '',
    limit: body.limit || 50,
    skip: 0
  });

  if (!hasGps) return { ...base, search_mode: 'text' };

  // Nới bbox rồi lọc Haversine
  const deg = radius / 111000;
  const filter = placePublicMongoFilter({
    latitude: { $gte: lat - deg, $lte: lat + deg },
    longitude: { $gte: lng - deg, $lte: lng + deg }
  });
  if (body.category) {
    filter.$and.push({
      category: new RegExp(String(body.category).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    });
  }
  if (body.q || body.query) {
    const textOr = placeTextSearchOr(body.q || body.query);
    if (textOr) filter.$and.push(textOr);
  }

  const rows = await Place.find(filter).limit(200).lean();
  const withDist = rows
    .map((r) => ({
      row: r,
      distance_m: Math.round(haversineMeters(lat, lng, r.latitude, r.longitude))
    }))
    .filter((x) => x.distance_m <= radius)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, Math.min(Math.max(parseInt(body.limit, 10) || 50, 1), 100));

  const stats = await buildingStatsByPlaceIds(withDist.map((x) => x.row._id));
  return {
    total: withDist.length,
    search_mode: 'geo',
    center: { lat, lng },
    radius_m: radius,
    places: withDist.map((x) => serializeRegistryPlace(x.row, {
      distance_m: x.distance_m,
      building_count: stats[String(x.row._id)]?.count || 0,
      has_published_indoor: (stats[String(x.row._id)]?.published || 0) > 0
    }))
  };
}

module.exports = {
  serializeRegistryPlace,
  listPublicPlaces,
  getPublicPlace,
  searchPlaces,
  PUBLICATION_STATUS
};
