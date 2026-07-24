// ============================================
// Place Registry helpers — DELEGATE sang placePlatform (canonical)
// Giữ export cũ để không breaking import; PUBLIC→PUBLISHED alias.
// ============================================

const placePlatform = require('./placePlatform');

/** @deprecated dùng OWNER_TYPE từ placePlatform; giữ alias legacy */
const PLACE_OWNER_TYPES = Object.freeze([
  'PLATFORM',
  'ORGANIZATION',
  'PERSONAL',
  'UNCLAIMED',
  'COMMUNITY',
  'SYSTEM'
]);

/** @deprecated dùng PUBLICATION_STATUS; giữ PUBLIC/UNLISTED alias query */
const PLACE_PUBLICATION_STATUS = Object.freeze([
  'DRAFT',
  'PUBLIC',
  'PUBLISHED',
  'UNLISTED',
  'PENDING',
  'ARCHIVED'
]);

const slugifyPlaceName = placePlatform.slugifyPlaceName;
const ensureUniquePlaceSlug = placePlatform.ensureUniquePlaceSlug;
const normalizeOwnerType = placePlatform.normalizeOwnerType;
const normalizePublicationStatus = placePlatform.normalizePublicationStatus;

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
