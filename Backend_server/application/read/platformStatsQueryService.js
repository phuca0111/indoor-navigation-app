const { getOrgQuotaSnapshot } = require('../../utils/overQuotaLock');
const platformStats = require('../../repositories/platformStatsReadRepository');
const { QueryScope } = require('./QueryScope');
const { assertRoleMayUse } = require('./readRoleMatrix');
const { runReadVersioned } = require('./readRollout');

function resolvePlatformStatsScope(user) {
  const role = user?.role;
  if (role === 'SUPER_ADMIN') {
    const scope = QueryScope.system({ actorRole: role });
    assertRoleMayUse(role, 'platformStats', scope.type);
    return scope;
  }
  if (role === 'ORG_ADMIN') {
    if (!user.organization_id) {
      throw Object.assign(new Error('Tài khoản ORG_ADMIN chưa được gán tổ chức.'), {
        status: 403
      });
    }
    const scope = QueryScope.organization(user.organization_id, { actorRole: role });
    assertRoleMayUse(role, 'platformStats', scope.type);
    return scope;
  }
  if (role === 'BUILDING_ADMIN') {
    // Building IDs được materialize trong buildPlatformStatsDto (async).
    const scope = QueryScope.buildings([], {
      organizationId: user.organization_id || null,
      actorRole: role
    });
    assertRoleMayUse(role, 'platformStats', scope.type);
    return scope;
  }
  throw Object.assign(new Error('Không có quyền xem thống kê.'), { status: 403 });
}

async function buildPlatformStatsDto(user, scope) {
  if (scope.isSystem) {
    const [orgTotal, orgActive, orgInactive, pendingRegs, pro, enterprise] = await Promise.all([
      platformStats.countOrganizations({}),
      platformStats.countOrganizations({ is_active: { $ne: false } }),
      platformStats.countOrganizations({ is_active: false }),
      platformStats.countPendingRegistrations(),
      platformStats.countOrganizations({ plan: 'PRO', is_active: { $ne: false } }),
      platformStats.countOrganizations({ plan: 'ENTERPRISE', is_active: { $ne: false } })
    ]);
    const [buildings, users, floors, activeUsersToday] = await Promise.all([
      platformStats.getBuildingStats({}),
      platformStats.getUserStats({}),
      platformStats.getFloorStats(null),
      platformStats.countActiveUsersToday({})
    ]);
    return {
      scope: 'platform',
      organizations: {
        total: orgTotal,
        active: orgActive,
        inactive: orgInactive,
        paid: pro + enterprise,
        pro,
        enterprise
      },
      buildings,
      floors,
      users,
      active_users_today: activeUsersToday,
      registrations: { pending: pendingRegs }
    };
  }

  if (scope.type === 'ORGANIZATION') {
    const orgId = scope.organizationId;
    const orgDoc = await platformStats.findOrganizationById(orgId);
    const orgFilter = { organization_id: orgId };
    const [buildings, users, floors, activeUsersToday, quota] = await Promise.all([
      platformStats.getBuildingStats(orgFilter),
      platformStats.getUserStats(orgFilter),
      platformStats.getFloorStats(orgFilter),
      platformStats.countActiveUsersToday(orgFilter),
      getOrgQuotaSnapshot(orgDoc)
    ]);
    return {
      scope: 'organization',
      organization: orgDoc
        ? {
          id: String(orgDoc._id),
          name: orgDoc.name,
          slug: orgDoc.slug,
          plan: orgDoc.plan || 'FREE',
          is_active: orgDoc.is_active !== false,
          billing_status: orgDoc.billing_status || 'ACTIVE',
          grace_ends_at: orgDoc.grace_ends_at || null
        }
        : { id: String(orgId) },
      buildings,
      floors,
      users,
      active_users_today: activeUsersToday,
      quota
    };
  }

  if (scope.type === 'BUILDINGS') {
    const profile = await platformStats.findUserAssignedBuildings(user.userId);
    const assignedIds = (profile?.assigned_buildings || []).map(String);
    const orgFilter = assignedIds.length
      ? { _id: { $in: assignedIds }, organization_id: profile.organization_id }
      : { _id: null };
    const orgDoc = profile?.organization_id
      ? await platformStats.findOrganizationById(profile.organization_id)
      : null;
    const [buildings, floors, quota] = await Promise.all([
      platformStats.getBuildingStats(orgFilter),
      platformStats.getFloorStats(orgFilter),
      orgDoc ? getOrgQuotaSnapshot(orgDoc) : null
    ]);
    return {
      scope: 'assigned',
      organization: orgDoc
        ? {
          id: String(orgDoc._id),
          name: orgDoc.name,
          plan: orgDoc.plan || 'FREE',
          billing_status: orgDoc.billing_status || 'ACTIVE'
        }
        : null,
      buildings: {
        ...buildings,
        assigned: assignedIds.length
      },
      floors,
      quota
    };
  }

  throw Object.assign(new Error('Không có quyền xem thống kê.'), { status: 403 });
}

async function getPlatformStatsForUser(user) {
  const scope = resolvePlatformStatsScope(user);
  return runReadVersioned({
    surface: 'platformStats',
    sampleKey: `${user?.role}:${user?.userId || ''}`,
    legacyFn: () => buildPlatformStatsDto(user, scope),
    v2Fn: () => buildPlatformStatsDto(user, scope)
  });
}

module.exports = {
  resolvePlatformStatsScope,
  buildPlatformStatsDto,
  getPlatformStatsForUser,
  // Re-export helpers used by dashboard bundle (avoid Service→Controller)
  getBuildingStats: platformStats.getBuildingStats,
  getUserStats: platformStats.getUserStats,
  getFloorStats: platformStats.getFloorStats,
  countActiveUsersToday: platformStats.countActiveUsersToday
};
