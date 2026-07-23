// ============================================
// Place Registry PHASE 1 — helpers (slug, enums)
// ============================================

const PLACE_OWNER_TYPES = Object.freeze(['PLATFORM', 'ORGANIZATION', 'PERSONAL', 'UNCLAIMED']);
const PLACE_PUBLICATION_STATUS = Object.freeze(['DRAFT', 'PUBLIC', 'UNLISTED', 'ARCHIVED']);

function slugifyPlaceName(name) {
  const base = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'place';
}

/**
 * Tạo slug unique: name-slug + optional short suffix.
 */
async function ensureUniquePlaceSlug(Place, name, excludeId = null) {
  const base = slugifyPlaceName(name);
  let candidate = base;
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const filter = { slug: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    const exists = await Place.exists(filter);
    if (!exists) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
    if (n > 200) {
      candidate = `${base}-${Date.now().toString(36)}`;
      return candidate;
    }
  }
}

function normalizeOwnerType(value, fallback = 'UNCLAIMED') {
  const v = String(value || '').trim().toUpperCase();
  return PLACE_OWNER_TYPES.includes(v) ? v : fallback;
}

function normalizePublicationStatus(value, fallback = 'PUBLIC') {
  const v = String(value || '').trim().toUpperCase();
  return PLACE_PUBLICATION_STATUS.includes(v) ? v : fallback;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = {
  PLACE_OWNER_TYPES,
  PLACE_PUBLICATION_STATUS,
  slugifyPlaceName,
  ensureUniquePlaceSlug,
  normalizeOwnerType,
  normalizePublicationStatus,
  haversineMeters
};
