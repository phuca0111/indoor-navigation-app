// ============================================
// Map Governance P0 — Visibility bản đồ
// Tách khỏi status kỹ thuật DRAFT / PUBLISHED trên Building.
// ============================================

const MAP_VISIBILITY = Object.freeze({
  PRIVATE: 'PRIVATE',
  UNLISTED: 'UNLISTED',
  COMMUNITY: 'COMMUNITY',
  OFFICIAL: 'OFFICIAL'
});

const MAP_VISIBILITY_VALUES = Object.freeze(Object.values(MAP_VISIBILITY));

const PLACE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
  MERGED: 'MERGED'
});

const PLACE_STATUS_VALUES = Object.freeze(Object.values(PLACE_STATUS));

/**
 * Bản đồ có được liệt kê trong tìm kiếm cộng đồng không.
 * Chỉ PUBLISHED + COMMUNITY|OFFICIAL.
 */
function isCommunitySearchable(building) {
  if (!building) return false;
  if (building.status !== 'PUBLISHED') return false;
  if (building.is_active === false) return false;
  const v = building.visibility || MAP_VISIBILITY.PRIVATE;
  return v === MAP_VISIBILITY.COMMUNITY || v === MAP_VISIBILITY.OFFICIAL;
}

/**
 * Bản đồ có thể mở bằng link trực tiếp (kể cả UNLISTED) khi đã PUBLISHED.
 */
function isLinkAccessible(building) {
  if (!building) return false;
  if (building.status !== 'PUBLISHED') return false;
  if (building.is_active === false) return false;
  const v = building.visibility || MAP_VISIBILITY.PRIVATE;
  return v !== MAP_VISIBILITY.PRIVATE;
}

function normalizeVisibility(value, fallback = MAP_VISIBILITY.PRIVATE) {
  const v = String(value || '').trim().toUpperCase();
  return MAP_VISIBILITY_VALUES.includes(v) ? v : fallback;
}

function normalizePlaceStatus(value, fallback = PLACE_STATUS.ACTIVE) {
  const v = String(value || '').trim().toUpperCase();
  return PLACE_STATUS_VALUES.includes(v) ? v : fallback;
}

/** COMMUNITY / OFFICIAL chỉ hợp lệ khi Building đã PUBLISHED. */
function requiresPublishedStatus(visibility) {
  const v = normalizeVisibility(visibility, MAP_VISIBILITY.PRIVATE);
  return v === MAP_VISIBILITY.COMMUNITY || v === MAP_VISIBILITY.OFFICIAL;
}

/**
 * Ma trận status × visibility.
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function assertVisibilityAllowedForStatus(status, visibility) {
  const v = normalizeVisibility(visibility, MAP_VISIBILITY.PRIVATE);
  if (requiresPublishedStatus(v) && status !== 'PUBLISHED') {
    return {
      ok: false,
      code: 'VISIBILITY_REQUIRES_PUBLISHED',
      message: 'COMMUNITY/OFFICIAL chỉ được đặt khi Building.status = PUBLISHED.'
    };
  }
  return { ok: true };
}

/**
 * Khi hạ status xuống DRAFT (hoặc khác PUBLISHED), hạ visibility community về PRIVATE.
 * @returns {{ visibility: string, downgraded: boolean }}
 */
function visibilityAfterStatusChange(nextStatus, currentVisibility) {
  const v = normalizeVisibility(currentVisibility, MAP_VISIBILITY.PRIVATE);
  if (nextStatus !== 'PUBLISHED' && requiresPublishedStatus(v)) {
    return { visibility: MAP_VISIBILITY.PRIVATE, downgraded: true };
  }
  return { visibility: v, downgraded: false };
}

/** Mongo filter cho list/search/nearest cộng đồng (public). */
function communityPublicMongoFilter(extra = {}) {
  return {
    status: 'PUBLISHED',
    is_active: { $ne: false },
    visibility: { $in: [MAP_VISIBILITY.COMMUNITY, MAP_VISIBILITY.OFFICIAL] },
    ...extra
  };
}

module.exports = {
  MAP_VISIBILITY,
  MAP_VISIBILITY_VALUES,
  PLACE_STATUS,
  PLACE_STATUS_VALUES,
  isCommunitySearchable,
  isLinkAccessible,
  normalizeVisibility,
  normalizePlaceStatus,
  requiresPublishedStatus,
  assertVisibilityAllowedForStatus,
  visibilityAfterStatusChange,
  communityPublicMongoFilter
};
