// ============================================
// Soft-require Place: gắn / tạo Place khi tạo Building
// ============================================

const Place = require('../models/Place');
const { PLACE_STATUS } = require('../utils/mapVisibility');

/**
 * Resolve place_id cho building mới.
 * - Có place_id hợp lệ → dùng
 * - Không có → auto tạo Place từ name/GPS (soft-require)
 * - skip_auto_place (chỉ Super) → null
 */
async function resolvePlaceIdForNewBuilding({
  placeId,
  skipAutoPlace,
  actorRole,
  name,
  address,
  lat,
  lng,
  organizationId,
  actorUserId,
  session
}) {
  if (placeId) {
    const place = await Place.findById(placeId)
      .select('_id status')
      .session(session || null)
      .lean();
    if (!place) {
      const err = new Error('Place không tồn tại.');
      err.status = 400;
      err.code = 'PLACE_NOT_FOUND';
      throw err;
    }
    if (place.status === 'LOCKED' || place.status === 'MERGED') {
      const err = new Error('Place đang khóa/merge.');
      err.status = 400;
      err.code = 'PLACE_NOT_ATTACHABLE';
      throw err;
    }
    return { place_id: place._id, auto_created: false };
  }

  if (skipAutoPlace === true) {
    if (actorRole !== 'SUPER_ADMIN') {
      const err = new Error('skip_auto_place chỉ dành cho Super Admin.');
      err.status = 403;
      err.code = 'SKIP_PLACE_FORBIDDEN';
      throw err;
    }
    return { place_id: null, auto_created: false };
  }

  const [created] = await Place.create([{
    name: String(name || 'Unnamed Place').trim().slice(0, 200) || 'Unnamed Place',
    address: String(address || '').trim().slice(0, 500),
    latitude: Number(lat) || 0,
    longitude: Number(lng) || 0,
    status: PLACE_STATUS.ACTIVE,
    owner_org_id: organizationId || null,
    created_by: actorUserId || null,
    notes: 'Auto-created khi tạo Building (soft-require Place)'
  }], session ? { session } : undefined);

  return { place_id: created._id, auto_created: true };
}

module.exports = { resolvePlaceIdForNewBuilding };
