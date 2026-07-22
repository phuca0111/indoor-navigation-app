/**
 * B1 — unit: permission catalog + role matrix
 */
const {
  P,
  permissionsForRole,
  roleHasPermission,
  roleHasAnyPermission
} = require('../../utils/permissions');

describe('B1 permissions catalog', () => {
  test('SUPER_ADMIN có * và pass mọi permission', () => {
    expect(permissionsForRole('SUPER_ADMIN')).toEqual([P.ALL]);
    expect(roleHasPermission('SUPER_ADMIN', P.FINANCE_ACCESS)).toBe(true);
    expect(roleHasPermission('SUPER_ADMIN', P.PLATFORM_CMS_MANAGE)).toBe(true);
    expect(roleHasPermission('SUPER_ADMIN', P.PLATFORM_ORGS_MANAGE)).toBe(true);
  });

  test('FINANCE_ADMIN có finance, không có CMS/orgs', () => {
    expect(roleHasPermission('FINANCE_ADMIN', P.FINANCE_ACCESS)).toBe(true);
    expect(roleHasPermission('FINANCE_ADMIN', P.PLATFORM_CMS_MANAGE)).toBe(false);
    expect(roleHasPermission('FINANCE_ADMIN', P.PLATFORM_ORGS_MANAGE)).toBe(false);
    expect(roleHasPermission('FINANCE_ADMIN', P.PLATFORM_CONTACTS_MANAGE)).toBe(false);
  });

  test('ORG_ADMIN có billing/org users, không finance.access', () => {
    expect(roleHasPermission('ORG_ADMIN', P.ORG_USERS_MANAGE)).toBe(true);
    expect(roleHasPermission('ORG_ADMIN', P.BILLING_ORG_CHECKOUT)).toBe(true);
    expect(roleHasPermission('ORG_ADMIN', P.FINANCE_ACCESS)).toBe(false);
    expect(roleHasPermission('ORG_ADMIN', P.PLATFORM_CMS_MANAGE)).toBe(false);
  });

  test('BUILDING_ADMIN không finance / cms', () => {
    expect(roleHasPermission('BUILDING_ADMIN', P.BUILDINGS_MANAGE)).toBe(true);
    expect(roleHasPermission('BUILDING_ADMIN', P.FINANCE_ACCESS)).toBe(false);
    expect(roleHasPermission('BUILDING_ADMIN', P.PLATFORM_CMS_MANAGE)).toBe(false);
  });

  test('REGISTERED_USER có buildings.create + billing.personal', () => {
    expect(roleHasPermission('REGISTERED_USER', P.BUILDINGS_CREATE)).toBe(true);
    expect(roleHasPermission('REGISTERED_USER', P.BILLING_PERSONAL)).toBe(true);
    expect(roleHasPermission('REGISTERED_USER', P.FINANCE_ACCESS)).toBe(false);
  });

  test('roleHasAnyPermission ORG hoặc PLATFORM users', () => {
    expect(roleHasAnyPermission('ORG_ADMIN', [P.PLATFORM_USERS_MANAGE, P.ORG_USERS_MANAGE])).toBe(true);
    expect(roleHasAnyPermission('BUILDING_ADMIN', [P.PLATFORM_USERS_MANAGE, P.ORG_USERS_MANAGE])).toBe(false);
  });

  test('role lạ → không quyền', () => {
    expect(permissionsForRole('HACKER')).toEqual([]);
    expect(roleHasPermission('HACKER', P.FINANCE_ACCESS)).toBe(false);
  });

  test('matrix identity/map mới giữ quyền tương đương legacy', () => {
    for (const role of ['ORG_ADMIN', 'BUILDING_ADMIN', 'REGISTERED_USER']) {
      expect(roleHasPermission(role, P.BUILDING_READ)).toBe(true);
      expect(roleHasPermission(role, P.MAP_DRAFT_EDIT)).toBe(true);
      expect(roleHasPermission(role, P.BUILDING_PUBLISH)).toBe(true);
      expect(roleHasPermission(role, P.STORAGE_ASSET_WRITE)).toBe(true);
      expect(roleHasPermission(role, P.MAP_VERSION_ROLLBACK)).toBe(true);
      expect(roleHasPermission(role, P.SEARCH_READ)).toBe(true);
      expect(roleHasPermission(role, P.IDENTITY_SESSION_REVOKE)).toBe(true);
    }
    expect(roleHasPermission('ORG_ADMIN', P.ORG_MEMBERS_MANAGE)).toBe(true);
    expect(roleHasPermission('BUILDING_ADMIN', P.ORG_MEMBERS_MANAGE)).toBe(false);
  });
});
