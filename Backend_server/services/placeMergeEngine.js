// ============================================
// Map Governance P2 — Merge Engine (Place → Place)
// Source bị MERGED; buildings chuyển sang Target; gộp aliases/GPS/owner.
// ============================================

const Place = require('../models/Place');
const Building = require('../models/Building');

const CHANGEABLE_FIELDS = ['name', 'aliases', 'latitude', 'longitude', 'address', 'category', 'notes'];

function uniqAliases(list) {
  return [...new Set(
    (list || [])
      .map((a) => String(a || '').trim())
      .filter(Boolean)
  )].slice(0, 40);
}

/**
 * Merge source Place vào target Place (target sống, source → MERGED).
 * @returns summary
 */
async function mergePlaces(sourceId, targetId, options = {}) {
  if (String(sourceId) === String(targetId)) {
    const err = new Error('Source và target phải khác nhau.');
    err.status = 400;
    err.code = 'SAME_PLACE';
    throw err;
  }

  const [source, target] = await Promise.all([
    Place.findById(sourceId),
    Place.findById(targetId)
  ]);
  if (!source) {
    const err = new Error('Place nguồn không tồn tại.');
    err.status = 404;
    err.code = 'SOURCE_NOT_FOUND';
    throw err;
  }
  if (!target) {
    const err = new Error('Place đích không tồn tại.');
    err.status = 404;
    err.code = 'TARGET_NOT_FOUND';
    throw err;
  }
  if (source.status === 'MERGED' || source.status === 'LOCKED') {
    const err = new Error('Place nguồn đã khóa/merge.');
    err.status = 400;
    err.code = 'SOURCE_NOT_MERGEABLE';
    throw err;
  }
  if (target.status === 'MERGED' || target.status === 'LOCKED') {
    const err = new Error('Place đích không nhận merge.');
    err.status = 400;
    err.code = 'TARGET_NOT_MERGEABLE';
    throw err;
  }

  const preferVerifiedGps = options.preferVerifiedGps !== false;
  const markVerified = options.markVerified === true || target.verified || source.verified;

  // Aliases: union + tên source nếu khác target
  const aliases = uniqAliases([
    ...(target.aliases || []),
    ...(source.aliases || []),
    source.name !== target.name ? source.name : null
  ]);
  target.aliases = aliases;

  // GPS: ưu tiên place đã verified; nếu cả hai verified giữ target
  if (preferVerifiedGps) {
    if (!target.verified && source.verified) {
      target.latitude = source.latitude;
      target.longitude = source.longitude;
      if (!target.address && source.address) target.address = source.address;
    } else if (
      (!target.latitude && !target.longitude) &&
      (source.latitude || source.longitude)
    ) {
      target.latitude = source.latitude;
      target.longitude = source.longitude;
    }
  }

  if (!target.category && source.category) target.category = source.category;
  if (!target.address && source.address) target.address = source.address;

  // Owner: giữ target nếu có; không thì lấy source
  if (!target.owner_org_id && source.owner_org_id) {
    target.owner_org_id = source.owner_org_id;
  }
  if (markVerified) target.verified = true;
  if (target.status === 'DRAFT') target.status = 'ACTIVE';

  await target.save();

  const moved = await Building.updateMany(
    { place_id: source._id },
    { $set: { place_id: target._id } }
  );

  source.status = 'MERGED';
  source.notes = [
    source.notes || '',
    `[MERGED into ${target._id} at ${new Date().toISOString()}]`
  ].filter(Boolean).join('\n').slice(0, 1000);
  await source.save();

  const buildingCount = await Building.countDocuments({
    place_id: target._id,
    is_active: { $ne: false }
  });

  return {
    source_place_id: source._id,
    target_place_id: target._id,
    buildings_moved: moved.modifiedCount || 0,
    target_aliases: target.aliases,
    target_owner_org_id: target.owner_org_id,
    target_verified: !!target.verified,
    target_building_count: buildingCount
  };
}

/**
 * Áp dụng proposed_changes lên Place (sau khi duyệt CHANGE).
 */
async function applyPlaceChanges(place, proposed) {
  if (!proposed || typeof proposed !== 'object') return place;
  if (proposed.name !== undefined) {
    const name = String(proposed.name || '').trim();
    if (name) place.name = name;
  }
  if (proposed.aliases !== undefined) {
    if (Array.isArray(proposed.aliases)) place.aliases = uniqAliases(proposed.aliases);
    else if (typeof proposed.aliases === 'string') {
      place.aliases = uniqAliases(proposed.aliases.split(/[,;\n]/));
    }
  }
  if (proposed.latitude !== undefined) place.latitude = Number(proposed.latitude) || 0;
  if (proposed.longitude !== undefined) place.longitude = Number(proposed.longitude) || 0;
  if (proposed.address !== undefined) place.address = String(proposed.address || '').slice(0, 500);
  if (proposed.category !== undefined) place.category = String(proposed.category || '').slice(0, 80);
  if (proposed.notes !== undefined) place.notes = String(proposed.notes || '').slice(0, 1000);
  await place.save();
  return place;
}

function pickProposedChanges(body) {
  if (!body || typeof body !== 'object') return null;
  const out = {};
  CHANGEABLE_FIELDS.forEach((k) => {
    if (body[k] !== undefined) out[k] = body[k];
  });
  return Object.keys(out).length ? out : null;
}

module.exports = {
  mergePlaces,
  applyPlaceChanges,
  pickProposedChanges,
  CHANGEABLE_FIELDS,
  uniqAliases
};
