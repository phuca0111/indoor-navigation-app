// ============================================
// Map Governance P0 — Place CRUD (Super Admin)
// ============================================

const mongoose = require('mongoose');
const Place = require('../models/Place');
const Building = require('../models/Building');
const Organization = require('../models/Organization');
const ActivityLog = require('../models/ActivityLog');
const {
  normalizePlaceStatus,
  normalizeVisibility,
  MAP_VISIBILITY_VALUES,
  assertVisibilityAllowedForStatus
} = require('../utils/mapVisibility');
const {
  findDuplicatePlaces,
  scanDuplicatePairs,
  DEFAULT_THRESHOLD
} = require('../services/placeDuplicateDetection');
const {
  ensureUniquePlaceSlug,
  normalizeOwnerType,
  normalizePublicationStatus,
  haversineMeters,
  PLACE_OWNER_TYPES,
  PLACE_PUBLICATION_STATUS
} = require('../utils/placeRegistry');

function logActivity(data) {
  ActivityLog.create(data).catch(() => {});
}

function parseAliases(input) {
  if (Array.isArray(input)) {
    return input.map((a) => String(a || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split(/[,;\n]/).map((a) => a.trim()).filter(Boolean);
  }
  return [];
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

function serializePlace(doc, extras = {}) {
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
    boundary: p.boundary || null,
    owner_type: p.owner_type || 'UNCLAIMED',
    publication_status: p.publication_status || 'PUBLIC',
    verified: !!p.verified,
    verification_status: p.verification_status || (p.verified ? 'VERIFIED' : 'UNVERIFIED'),
    verification_note: p.verification_note || '',
    verified_at: p.verified_at || null,
    verified_by: p.verified_by || null,
    owner_org_id: p.owner_org_id || null,
    owner_org: extras.owner_org || null,
    owner_type: p.owner_type || null,
    publication_status: p.publication_status || null,
    status: p.status,
    notes: p.notes || '',
    created_by: p.created_by || null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    building_count: extras.building_count,
    distance_m: extras.distance_m
  };
}

async function buildingCountsByPlaceIds(placeIds) {
  if (!placeIds.length) return {};
  const rows = await Building.aggregate([
    { $match: { place_id: { $in: placeIds }, is_active: { $ne: false } } },
    { $group: { _id: '$place_id', count: { $sum: 1 } } }
  ]);
  const map = {};
  rows.forEach((r) => { map[String(r._id)] = r.count; });
  return map;
}

// GET /api/places
async function listPlaces(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    const status = req.query.status ? normalizePlaceStatus(req.query.status, '') : '';
    const verified = req.query.verified;
    const filter = {};
    if (status && ['DRAFT', 'ACTIVE', 'LOCKED', 'MERGED'].includes(status)) {
      filter.status = status;
    }
    if (req.query.publication_status) {
      const pub = normalizePublicationStatus(req.query.publication_status, '');
      if (PLACE_PUBLICATION_STATUS.includes(pub)) filter.publication_status = pub;
    }
    if (req.query.owner_type) {
      const ot = normalizeOwnerType(req.query.owner_type, '');
      if (PLACE_OWNER_TYPES.includes(ot)) filter.owner_type = ot;
    }
    if (verified === 'true') filter.verified = true;
    if (verified === 'false') filter.verified = false;
    if (q) {
      filter.$or = [
        { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { aliases: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { address: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { category: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
      ];
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

    const [rows, total] = await Promise.all([
      Place.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Place.countDocuments(filter)
    ]);

    const counts = await buildingCountsByPlaceIds(rows.map((r) => r._id));
    const orgIds = [...new Set(rows.map((r) => r.owner_org_id).filter(Boolean).map(String))];
    let orgMap = {};
    if (orgIds.length) {
      const orgs = await Organization.find({ _id: { $in: orgIds } }).select('name slug').lean();
      orgMap = Object.fromEntries(orgs.map((o) => [String(o._id), { _id: o._id, name: o.name, slug: o.slug }]));
    }

    return res.status(200).json({
      total,
      places: rows.map((r) => serializePlace(r, {
        building_count: counts[String(r._id)] || 0,
        owner_org: r.owner_org_id ? orgMap[String(r.owner_org_id)] || null : null
      }))
    });
  } catch (error) {
    console.error('listPlaces:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/places/:id
async function getPlace(req, res) {
  try {
    assertObjectId(req.params.id, 'place id');
    const place = await Place.findById(req.params.id).lean();
    if (!place) return res.status(404).json({ message: 'Không tìm thấy Place.' });

    const buildings = await Building.find({ place_id: place._id })
      .select('name status visibility address gps_location organization_id owner_user_id is_active total_floors')
      .lean();

    let owner_org = null;
    if (place.owner_org_id) {
      owner_org = await Organization.findById(place.owner_org_id).select('name slug').lean();
    }

    return res.status(200).json({
      place: serializePlace(place, { building_count: buildings.length, owner_org }),
      buildings
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/places
async function createPlace(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Thiếu tên Place.' });

    let owner_org_id = req.body?.owner_org_id || null;
    if (owner_org_id) {
      if (!mongoose.Types.ObjectId.isValid(owner_org_id)) {
        return res.status(400).json({ message: 'owner_org_id không hợp lệ.' });
      }
      const org = await Organization.findById(owner_org_id).select('_id').lean();
      if (!org) return res.status(400).json({ message: 'Organization không tồn tại.' });
    } else {
      owner_org_id = null;
    }

    const aliases = parseAliases(req.body?.aliases);
    const latitude = Number(req.body?.latitude) || 0;
    const longitude = Number(req.body?.longitude) || 0;
    const category = String(req.body?.category || '').slice(0, 80);
    const force = req.body?.force === true || req.body?.force === '1' || req.query?.force === '1';
    const threshold = Number(req.body?.threshold) || DEFAULT_THRESHOLD;

    // P1 — chặn tạo nếu nghi trùng (trừ khi force)
    const dup = await findDuplicatePlaces(
      { name, aliases, latitude, longitude, category },
      { threshold }
    );
    if (dup.suspected && !force) {
      return res.status(409).json({
        message: 'Có vẻ địa điểm đã tồn tại. Gửi lại với force=true nếu vẫn muốn tạo.',
        code: 'DUPLICATE_SUSPECTED',
        threshold: dup.threshold,
        duplicates: dup
      });
    }

    const place = await Place.create({
      name,
      slug: await ensureUniquePlaceSlug(Place, req.body?.slug || name),
      aliases,
      latitude,
      longitude,
      radius: Math.min(Math.max(Number(req.body?.radius) || 80, 10), 5000),
      address: String(req.body?.address || '').slice(0, 500),
      category,
      boundary: req.body?.boundary || null,
      owner_type: normalizeOwnerType(
        req.body?.owner_type,
        owner_org_id ? 'ORGANIZATION' : 'UNCLAIMED'
      ),
      publication_status: normalizePublicationStatus(req.body?.publication_status, 'PUBLIC'),
      verified: !!req.body?.verified,
      verification_status: req.body?.verified ? 'VERIFIED' : 'UNVERIFIED',
      owner_org_id,
      owner_type: owner_org_id ? 'ORGANIZATION' : (req.body?.owner_type || 'UNCLAIMED'),
      status: normalizePlaceStatus(req.body?.status, 'ACTIVE'),
      publication_status: req.body?.publication_status
        || (normalizePlaceStatus(req.body?.status, 'ACTIVE') === 'ACTIVE' ? 'PUBLISHED' : 'DRAFT'),
      notes: String(req.body?.notes || '').slice(0, 1000),
      created_by: req.user.userId
    });

    logActivity({
      user_id: req.user.userId,
      action: 'CREATE_PLACE',
      target_type: 'place',
      target_id: String(place._id),
      target: place.name,
      details: {
        category: place.category,
        verified: place.verified,
        force_create: !!force,
        duplicate_top: dup.top ? dup.top.similarity : null
      },
      ip_address: req.ip || ''
    });

    return res.status(201).json({
      message: force && dup.suspected
        ? 'Đã tạo Place (bỏ qua cảnh báo trùng).'
        : 'Đã tạo Place.',
      place: serializePlace(place, { building_count: 0 }),
      duplicates: dup.suspected ? dup : undefined
    });
  } catch (error) {
    console.error('createPlace:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/places/check-duplicates
async function checkDuplicates(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Thiếu tên để kiểm tra.' });
    const result = await findDuplicatePlaces(
      {
        name,
        aliases: parseAliases(req.body?.aliases),
        latitude: Number(req.body?.latitude) || 0,
        longitude: Number(req.body?.longitude) || 0,
        category: String(req.body?.category || '')
      },
      {
        excludeId: req.body?.exclude_id || null,
        threshold: Number(req.body?.threshold) || DEFAULT_THRESHOLD,
        limit: Number(req.body?.limit) || 20
      }
    );
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/places/duplicates/scan
async function scanDuplicates(req, res) {
  try {
    const result = await scanDuplicatePairs({
      threshold: Number(req.query.threshold) || DEFAULT_THRESHOLD,
      limit: Number(req.query.limit) || 50
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// PATCH /api/places/:id
async function updatePlace(req, res) {
  try {
    assertObjectId(req.params.id, 'place id');
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ message: 'Không tìm thấy Place.' });

    const body = req.body || {};
    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name) return res.status(400).json({ message: 'Tên Place không được để trống.' });
      place.name = name;
    }
    if (body.slug !== undefined) {
      place.slug = await ensureUniquePlaceSlug(Place, body.slug || place.name, place._id);
    } else if (body.name !== undefined) {
      // đổi tên → refresh slug nếu slug cũ trống hoặc auto từ tên cũ
      place.slug = await ensureUniquePlaceSlug(Place, place.name, place._id);
    }
    if (body.aliases !== undefined) place.aliases = parseAliases(body.aliases);
    if (body.latitude !== undefined) place.latitude = Number(body.latitude) || 0;
    if (body.longitude !== undefined) place.longitude = Number(body.longitude) || 0;
    if (body.radius !== undefined) {
      place.radius = Math.min(Math.max(Number(body.radius) || 80, 10), 5000);
    }
    if (body.address !== undefined) place.address = String(body.address || '').slice(0, 500);
    if (body.category !== undefined) place.category = String(body.category || '').slice(0, 80);
    if (body.boundary !== undefined) place.boundary = body.boundary;
    if (body.owner_type !== undefined) {
      place.owner_type = normalizeOwnerType(body.owner_type, place.owner_type || 'UNCLAIMED');
    }
    if (body.publication_status !== undefined) {
      place.publication_status = normalizePublicationStatus(
        body.publication_status,
        place.publication_status || 'PUBLIC'
      );
    }
    if (body.verified !== undefined) {
      place.verified = !!body.verified;
      if (place.verified) {
        place.verification_status = 'VERIFIED';
        place.verified_at = place.verified_at || new Date();
        place.verified_by = place.verified_by || req.user.userId;
      } else if (place.verification_status === 'VERIFIED') {
        place.verification_status = 'UNVERIFIED';
        place.verified_at = null;
        place.verified_by = null;
      }
    }
    if (body.verification_note !== undefined) {
      place.verification_note = String(body.verification_note || '').slice(0, 1000);
    }
    if (body.status !== undefined) place.status = normalizePlaceStatus(body.status, place.status);
    if (body.notes !== undefined) place.notes = String(body.notes || '').slice(0, 1000);

    if (body.owner_org_id !== undefined) {
      if (!body.owner_org_id) {
        place.owner_org_id = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(body.owner_org_id)) {
          return res.status(400).json({ message: 'owner_org_id không hợp lệ.' });
        }
        const org = await Organization.findById(body.owner_org_id).select('_id').lean();
        if (!org) return res.status(400).json({ message: 'Organization không tồn tại.' });
        place.owner_org_id = body.owner_org_id;
        if (!body.owner_type) place.owner_type = 'ORGANIZATION';
      }
    }

    await place.save();

    const count = await Building.countDocuments({ place_id: place._id, is_active: { $ne: false } });

    logActivity({
      user_id: req.user.userId,
      action: 'UPDATE_PLACE',
      target_type: 'place',
      target_id: String(place._id),
      target: place.name,
      details: {},
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã cập nhật Place.',
      place: serializePlace(place, { building_count: count })
    });
  } catch (error) {
    console.error('updatePlace:', error);
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/places/:id/verification  { action: request|approve|reject, note? }
async function resolvePlaceVerification(req, res) {
  try {
    assertObjectId(req.params.id, 'place id');
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!['request', 'approve', 'reject'].includes(action)) {
      return res.status(400).json({
        message: 'action phải là request | approve | reject',
        code: 'INVALID_VERIFICATION_ACTION'
      });
    }
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ message: 'Không tìm thấy Place.' });
    if (place.status === 'LOCKED' || place.status === 'MERGED') {
      return res.status(400).json({ message: 'Place không thể xác minh.', code: 'PLACE_NOT_VERIFIABLE' });
    }

    const note = String(req.body?.note || req.body?.verification_note || '').slice(0, 1000);
    if (note) place.verification_note = note;

    if (action === 'request') {
      place.verification_status = 'PENDING';
      place.verified = false;
    } else if (action === 'approve') {
      place.verification_status = 'VERIFIED';
      place.verified = true;
      place.verified_at = new Date();
      place.verified_by = req.user.userId;
    } else {
      place.verification_status = 'REJECTED';
      place.verified = false;
      place.verified_at = null;
      place.verified_by = req.user.userId;
    }
    await place.save();

    logActivity({
      user_id: req.user.userId,
      action: 'PLACE_VERIFICATION_' + action.toUpperCase(),
      target_type: 'place',
      target_id: String(place._id),
      target: place.name,
      details: { verification_status: place.verification_status, note: place.verification_note },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã cập nhật xác minh Place.',
      place: serializePlace(place)
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// DELETE /api/places/:id — soft lock + detach buildings
async function removePlace(req, res) {
  try {
    assertObjectId(req.params.id, 'place id');
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ message: 'Không tìm thấy Place.' });

    const hard = String(req.query.hard || '') === '1';
    const linked = await Building.countDocuments({ place_id: place._id });

    if (hard) {
      if (linked > 0) {
        return res.status(400).json({
          message: `Không thể xóa cứng: còn ${linked} Building gắn Place. Hãy detach trước.`,
          code: 'PLACE_HAS_BUILDINGS'
        });
      }
      await Place.deleteOne({ _id: place._id });
      logActivity({
        user_id: req.user.userId,
        action: 'DELETE_PLACE',
        target_type: 'place',
        target_id: String(place._id),
        target: place.name,
        details: { hard: true },
        ip_address: req.ip || ''
      });
      return res.status(200).json({ message: 'Đã xóa Place.' });
    }

    place.status = 'LOCKED';
    await place.save();
    await Building.updateMany({ place_id: place._id }, { $set: { place_id: null } });

    logActivity({
      user_id: req.user.userId,
      action: 'LOCK_PLACE',
      target_type: 'place',
      target_id: String(place._id),
      target: place.name,
      details: { detached_buildings: linked },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã khóa Place và gỡ liên kết Building.',
      detached_buildings: linked
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/places/:id/attach-building  { building_id, visibility? }
async function attachBuilding(req, res) {
  try {
    assertObjectId(req.params.id, 'place id');
    const place = await Place.findById(req.params.id).lean();
    if (!place) return res.status(404).json({ message: 'Không tìm thấy Place.' });
    if (place.status === 'LOCKED' || place.status === 'MERGED') {
      return res.status(400).json({ message: 'Place đang khóa/merge, không gắn Building mới.' });
    }

    const buildingId = req.body?.building_id;
    if (!buildingId || !mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({ message: 'Thiếu building_id hợp lệ.' });
    }

    const building = await Building.findById(buildingId);
    if (!building) return res.status(404).json({ message: 'Không tìm thấy Building.' });

    building.place_id = place._id;
    if (req.body?.visibility !== undefined) {
      const nextVis = normalizeVisibility(req.body.visibility, building.visibility || 'PRIVATE');
      const matrix = assertVisibilityAllowedForStatus(building.status, nextVis);
      if (!matrix.ok) {
        return res.status(400).json({ message: matrix.message, code: matrix.code });
      }
      building.visibility = nextVis;
    }
    await building.save();

    logActivity({
      user_id: req.user.userId,
      action: 'ATTACH_BUILDING_PLACE',
      target_type: 'place',
      target_id: String(place._id),
      target: place.name,
      details: { building_id: String(building._id), building_name: building.name },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã gắn Building vào Place.',
      building: {
        _id: building._id,
        name: building.name,
        place_id: building.place_id,
        visibility: building.visibility,
        status: building.status
      }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/places/:id/detach-building  { building_id }
async function detachBuilding(req, res) {
  try {
    assertObjectId(req.params.id, 'place id');
    const placeId = req.params.id;
    const buildingId = req.body?.building_id;
    if (!buildingId || !mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({ message: 'Thiếu building_id hợp lệ.' });
    }

    const building = await Building.findById(buildingId);
    if (!building) return res.status(404).json({ message: 'Không tìm thấy Building.' });
    if (!building.place_id || String(building.place_id) !== String(placeId)) {
      return res.status(400).json({ message: 'Building không thuộc Place này.' });
    }

    building.place_id = null;
    await building.save();

    return res.status(200).json({ message: 'Đã gỡ Building khỏi Place.', building_id: building._id });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// PATCH /api/places/buildings/:buildingId/visibility  { visibility }
async function updateBuildingVisibility(req, res) {
  try {
    assertObjectId(req.params.buildingId, 'building id');
    const visibility = normalizeVisibility(req.body?.visibility, '');
    if (!MAP_VISIBILITY_VALUES.includes(visibility)) {
      return res.status(400).json({
        message: 'visibility phải là PRIVATE | UNLISTED | COMMUNITY | OFFICIAL',
        code: 'INVALID_VISIBILITY'
      });
    }

    const building = await Building.findById(req.params.buildingId);
    if (!building) return res.status(404).json({ message: 'Không tìm thấy Building.' });

    const matrix = assertVisibilityAllowedForStatus(building.status, visibility);
    if (!matrix.ok) {
      return res.status(400).json({ message: matrix.message, code: matrix.code });
    }

    const from = building.visibility || 'PRIVATE';
    building.visibility = visibility;
    await building.save();

    logActivity({
      user_id: req.user.userId,
      action: 'UPDATE_BUILDING_VISIBILITY',
      target_type: 'building',
      target_id: String(building._id),
      target: building.name,
      details: { from, to: visibility },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã cập nhật visibility.',
      building: {
        _id: building._id,
        name: building.name,
        status: building.status,
        visibility: building.visibility,
        place_id: building.place_id
      }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/places/search — PUBLIC Place Registry search
async function searchPlacesPublic(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const lat = req.query.lat != null ? Number(req.query.lat) : null;
    const lng = req.query.lng != null ? Number(req.query.lng) : null;
    const radiusM = Number(req.query.radius_m) || 5000;

    const filter = {
      status: 'ACTIVE',
      publication_status: { $in: ['PUBLIC'] }
    };
    if (category) {
      filter.category = new RegExp(category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: new RegExp(safe, 'i') },
        { aliases: new RegExp(safe, 'i') },
        { address: new RegExp(safe, 'i') },
        { slug: new RegExp(safe, 'i') }
      ];
    }

    let rows = await Place.find(filter)
      .select('name slug aliases latitude longitude radius address category owner_type publication_status verification_status verified status')
      .limit(limit * 3)
      .lean();

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      rows = rows
        .map((p) => ({
          ...p,
          distance_m: haversineMeters(lat, lng, p.latitude || 0, p.longitude || 0)
        }))
        .filter((p) => p.distance_m <= radiusM)
        .sort((a, b) => a.distance_m - b.distance_m);
    }

    rows = rows.slice(0, limit);
    const counts = await buildingCountsByPlaceIds(rows.map((r) => r._id));

    return res.status(200).json({
      total: rows.length,
      places: rows.map((r) => serializePlace(r, {
        building_count: counts[String(r._id)] || 0,
        distance_m: r.distance_m
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/places/public/:idOrSlug — PUBLIC detail (chỉ PUBLIC + ACTIVE)
async function getPlacePublic(req, res) {
  try {
    const key = String(req.params.idOrSlug || '').trim();
    if (!key) return res.status(400).json({ message: 'Thiếu id hoặc slug.' });

    let place = null;
    if (mongoose.Types.ObjectId.isValid(key)) {
      place = await Place.findById(key).lean();
    }
    if (!place) {
      place = await Place.findOne({ slug: key }).lean();
    }
    if (!place) return res.status(404).json({ message: 'Không tìm thấy Place.' });
    if (place.status !== 'ACTIVE' || place.publication_status !== 'PUBLIC') {
      return res.status(404).json({ message: 'Place không công khai.', code: 'PLACE_NOT_PUBLIC' });
    }

    const indoorBuildings = await Building.find({
      place_id: place._id,
      status: 'PUBLISHED',
      is_active: { $ne: false },
      visibility: { $in: ['COMMUNITY', 'OFFICIAL'] }
    })
      .select('name visibility total_floors workspace_id status')
      .limit(20)
      .lean();

    let workspaces = [];
    try {
      const IndoorWorkspace = require('../models/IndoorWorkspace');
      workspaces = await IndoorWorkspace.find({
        place_id: place._id,
        status: { $in: ['ACTIVE', 'DRAFT'] }
      })
        .select('name kind status building_id is_current_published')
        .limit(20)
        .lean();
    } catch (_) {
      workspaces = [];
    }

    return res.status(200).json({
      place: serializePlace(place, { building_count: indoorBuildings.length }),
      has_indoor: indoorBuildings.length > 0,
      indoor_published_count: indoorBuildings.length,
      indoor_buildings: indoorBuildings,
      workspaces
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/places/meta/visibility — enum cho UI
async function getVisibilityMeta(_req, res) {
  return res.status(200).json({
    visibility: MAP_VISIBILITY_VALUES,
    place_status: ['DRAFT', 'ACTIVE', 'LOCKED', 'MERGED'],
    owner_types: PLACE_OWNER_TYPES,
    publication_status: PLACE_PUBLICATION_STATUS,
    matrix: {
      note: 'COMMUNITY/OFFICIAL chỉ có ý nghĩa tìm kiếm khi Building.status = PUBLISHED',
      PRIVATE: 'Chỉ owner / nội bộ',
      UNLISTED: 'Có link mới vào; không search cộng đồng',
      COMMUNITY: 'Search cộng đồng (sau review — P1)',
      OFFICIAL: 'Ưu tiên search / badge verified'
    }
  });
}

module.exports = {
  listPlaces,
  getPlace,
  createPlace,
  updatePlace,
  removePlace,
  attachBuilding,
  detachBuilding,
  updateBuildingVisibility,
  getVisibilityMeta,
  checkDuplicates,
  scanDuplicates,
  resolvePlaceVerification,
  searchPlacesPublic,
  getPlacePublic
};
