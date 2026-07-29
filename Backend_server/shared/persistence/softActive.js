/**
 * Quy ước soft-active dùng chung cho entity tenant (Building, User, Organization, Plan…).
 * Không ghi DB — chỉ helper filter/update cho repository mới / đã migrate.
 *
 * Convention (v2):
 * - `is_active !== false` = đang hoạt động (thiếu field cũng coi là active — tương thích data cũ).
 * - Soft-delete = set `is_active: false` (không xóa document).
 * - CMS / Search dùng `deleted_at` / `deleted` riêng — xem dataDomainRegistry.
 */

function activeFilter(extra = {}) {
  return { is_active: { $ne: false }, ...extra };
}

function inactiveFilter(extra = {}) {
  return { is_active: false, ...extra };
}

function isActiveEntity(doc) {
  if (!doc) return false;
  return doc.is_active !== false;
}

/** Payload soft-delete chuẩn — không $unset field khác. */
function softDeactivateSet(extra = {}) {
  return { $set: { is_active: false, ...extra } };
}

function softActivateSet(extra = {}) {
  return { $set: { is_active: true, ...extra } };
}

module.exports = {
  activeFilter,
  inactiveFilter,
  isActiveEntity,
  softDeactivateSet,
  softActivateSet
};
