/**
 * RBAC Permission catalog (Phase 1-perm / B1)
 * Role → danh sách permission code. SUPER_ADMIN có '*'.
 * Route/UI kiểm tra permission, không chỉ so sánh chuỗi role.
 */

const P = {
  ALL: '*',
  PLATFORM_USERS_MANAGE: 'platform.users.manage',
  PLATFORM_ORGS_MANAGE: 'platform.orgs.manage',
  PLATFORM_REGISTRATIONS_MANAGE: 'platform.registrations.manage',
  PLATFORM_LOGS_READ: 'platform.logs.read',
  PLATFORM_CMS_MANAGE: 'platform.cms.manage',
  PLATFORM_CONTACTS_MANAGE: 'platform.contacts.manage',
  PLATFORM_MODERATION_MANAGE: 'platform.moderation.manage',
  FINANCE_ACCESS: 'finance.access',
  FINANCE_SETTINGS: 'finance.settings',
  BILLING_ORG_READ: 'billing.org.read',
  BILLING_ORG_CHECKOUT: 'billing.org.checkout',
  BILLING_PERSONAL: 'billing.personal',
  ORG_USERS_MANAGE: 'org.users.manage',
  BUILDINGS_CREATE: 'buildings.create',
  BUILDINGS_MANAGE: 'buildings.manage',
  BUILDING_READ: 'building.read',
  BUILDING_WRITE: 'building.write',
  BUILDING_PUBLISH: 'building.publish',
  MAP_DRAFT_EDIT: 'map.draft.edit',
  MAP_VERSION_ROLLBACK: 'map.version.rollback',
  STORAGE_ASSET_WRITE: 'storage.asset.write',
  SEARCH_READ: 'search.read',
  IDENTITY_SESSION_READ: 'identity.session.read',
  IDENTITY_SESSION_REVOKE: 'identity.session.revoke',
  IDENTITY_PROFILE_WRITE: 'identity.profile.write',
  ORG_MEMBERS_READ: 'identity.members.read',
  ORG_MEMBERS_MANAGE: 'identity.members.manage',
  ORG_DEPARTMENTS_MANAGE: 'identity.departments.manage',
  OVERVIEW_READ: 'overview.read',
  ANALYTICS_READ: 'analytics.read',
  // GĐ2–5 Place Registry / Proposal / Moderation
  PLACE_READ_PUBLIC: 'place.read.public',
  PLACE_PROPOSE: 'place.propose',
  PLACE_CLAIM: 'place.claim',
  PLACE_REPORT: 'place.report',
  PLACE_REVIEW: 'place.review',
  PLACE_MANAGE: 'place.manage',
  PLACE_MODERATE: 'place.moderate',
  PLACE_VALIDATE: 'place.validate'
};

/** @type {Record<string, string[]>} */
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [P.ALL],
  FINANCE_ADMIN: [
    P.FINANCE_ACCESS,
    P.FINANCE_SETTINGS,
    P.OVERVIEW_READ,
    P.ANALYTICS_READ,
    P.BILLING_ORG_READ,
    P.PLATFORM_LOGS_READ,
    P.SEARCH_READ,
    P.IDENTITY_SESSION_READ,
    P.IDENTITY_SESSION_REVOKE,
    P.IDENTITY_PROFILE_WRITE
  ],
  MARKETING_MANAGER: [
    P.PLATFORM_CMS_MANAGE,
    P.SEARCH_READ,
    P.IDENTITY_SESSION_READ,
    P.IDENTITY_SESSION_REVOKE,
    P.IDENTITY_PROFILE_WRITE
  ],
  ORG_ADMIN: [
    P.ORG_USERS_MANAGE,
    P.BILLING_ORG_READ,
    P.BILLING_ORG_CHECKOUT,
    P.BUILDINGS_CREATE,
    P.BUILDINGS_MANAGE,
    P.PLATFORM_LOGS_READ,
    P.OVERVIEW_READ,
    P.ANALYTICS_READ,
    P.BUILDING_READ,
    P.BUILDING_WRITE,
    P.BUILDING_PUBLISH,
    P.MAP_DRAFT_EDIT,
    P.MAP_VERSION_ROLLBACK,
    P.STORAGE_ASSET_WRITE,
    P.SEARCH_READ,
    P.IDENTITY_SESSION_READ,
    P.IDENTITY_SESSION_REVOKE,
    P.IDENTITY_PROFILE_WRITE,
    P.ORG_MEMBERS_READ,
    P.ORG_MEMBERS_MANAGE,
    P.ORG_DEPARTMENTS_MANAGE,
    P.PLACE_READ_PUBLIC,
    P.PLACE_PROPOSE,
    P.PLACE_CLAIM,
    P.PLACE_REPORT,
    P.PLACE_REVIEW
  ],
  BUILDING_ADMIN: [
    P.BUILDINGS_MANAGE,
    P.OVERVIEW_READ,
    P.ANALYTICS_READ,
    P.BUILDING_READ,
    P.BUILDING_WRITE,
    P.BUILDING_PUBLISH,
    P.MAP_DRAFT_EDIT,
    P.MAP_VERSION_ROLLBACK,
    P.STORAGE_ASSET_WRITE,
    P.SEARCH_READ,
    P.IDENTITY_SESSION_READ,
    P.IDENTITY_SESSION_REVOKE,
    P.IDENTITY_PROFILE_WRITE,
    P.PLACE_READ_PUBLIC,
    P.PLACE_PROPOSE,
    P.PLACE_CLAIM,
    P.PLACE_REPORT,
    P.PLACE_REVIEW
  ],
  MAP_MODERATOR: [
    P.PLACE_READ_PUBLIC,
    P.PLACE_PROPOSE,
    P.PLACE_CLAIM,
    P.PLACE_REPORT,
    P.PLACE_REVIEW,
    P.PLACE_MODERATE,
    P.PLACE_VALIDATE,
    P.PLACE_MANAGE,
    P.PLATFORM_MODERATION_MANAGE,
    P.SEARCH_READ,
    P.OVERVIEW_READ,
    P.IDENTITY_SESSION_READ,
    P.IDENTITY_SESSION_REVOKE,
    P.IDENTITY_PROFILE_WRITE
  ],
  REGISTERED_USER: [
    P.BUILDINGS_CREATE,
    P.BUILDINGS_MANAGE,
    P.BILLING_PERSONAL,
    P.OVERVIEW_READ,
    P.BUILDING_READ,
    P.BUILDING_WRITE,
    P.BUILDING_PUBLISH,
    P.MAP_DRAFT_EDIT,
    P.MAP_VERSION_ROLLBACK,
    P.STORAGE_ASSET_WRITE,
    P.SEARCH_READ,
    P.IDENTITY_SESSION_READ,
    P.IDENTITY_SESSION_REVOKE,
    P.IDENTITY_PROFILE_WRITE,
    P.PLACE_READ_PUBLIC,
    P.PLACE_PROPOSE,
    P.PLACE_CLAIM,
    P.PLACE_REPORT,
    P.PLACE_REVIEW
  ]
};

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

/**
 * @param {string} role
 * @returns {string[]}
 */
function permissionsForRole(role) {
  const key = normalizeRole(role);
  const list = ROLE_PERMISSIONS[key];
  return Array.isArray(list) ? list.slice() : [];
}

/**
 * @param {string} role
 * @param {string} permission
 */
function roleHasPermission(role, permission) {
  if (!permission) return false;
  const perms = permissionsForRole(role);
  if (perms.includes(P.ALL)) return true;
  return perms.includes(permission);
}

/**
 * @param {string} role
 * @param {string[]} permissions — cần ít nhất một
 */
function roleHasAnyPermission(role, permissions) {
  if (!Array.isArray(permissions) || !permissions.length) return false;
  return permissions.some((p) => roleHasPermission(role, p));
}

/**
 * @param {string} role
 * @param {string[]} permissions — cần tất cả
 */
function roleHasAllPermissions(role, permissions) {
  if (!Array.isArray(permissions) || !permissions.length) return false;
  return permissions.every((p) => roleHasPermission(role, p));
}

module.exports = {
  P,
  PERMISSIONS: P,
  ROLE_PERMISSIONS,
  permissionsForRole,
  roleHasPermission,
  roleHasAnyPermission,
  roleHasAllPermissions
};
