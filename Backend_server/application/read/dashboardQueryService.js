const { QueryScope } = require('./QueryScope');
const { assertRoleMayUse } = require('./readRoleMatrix');
const { runReadVersioned } = require('./readRollout');
const { buildOverviewDashboard } = require('../../services/overviewDashboardService');

function resolveDashboardScope(user) {
  const role = user?.role;
  if (role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN') {
    const scope = QueryScope.system({ actorRole: role });
    assertRoleMayUse(role, 'dashboard', scope.type);
    return scope;
  }
  if (role === 'ORG_ADMIN') {
    if (!user.organization_id) {
      throw Object.assign(new Error('Tài khoản ORG_ADMIN chưa được gán tổ chức.'), {
        status: 403,
        code: 'TENANT_SCOPE_REQUIRED'
      });
    }
    const scope = QueryScope.organization(user.organization_id, { actorRole: role });
    assertRoleMayUse(role, 'dashboard', scope.type);
    return scope;
  }
  if (role === 'BUILDING_ADMIN') {
    const scope = QueryScope.buildings([], {
      organizationId: user.organization_id || null,
      actorRole: role
    });
    assertRoleMayUse(role, 'dashboard', scope.type);
    return scope;
  }
  throw Object.assign(new Error('Không có quyền xem overview dashboard.'), {
    status: 403
  });
}

async function resolveDashboardScopeAsync(user) {
  const role = user?.role;
  if (role !== 'BUILDING_ADMIN') return resolveDashboardScope(user);
  const platformStats = require('../../repositories/platformStatsReadRepository');
  const profile = await platformStats.findUserAssignedBuildings(user.userId);
  const assignedIds = (profile?.assigned_buildings || []).map(String);
  const scope = QueryScope.buildings(assignedIds, {
    organizationId: profile?.organization_id || user.organization_id || null,
    actorRole: role
  });
  assertRoleMayUse(role, 'dashboard', scope.type);
  return scope;
}

async function getOverviewDashboard(opts = {}) {
  const scope = await resolveDashboardScopeAsync(opts.user || {});
  return runReadVersioned({
    surface: 'dashboard',
    sampleKey: `${scope.type}:${opts.user?.role}:${opts.range || '1m'}`,
    legacyFn: () => buildOverviewDashboard(opts),
    v2Fn: () => buildOverviewDashboard({ ...opts, queryScope: scope.toJSON() })
  });
}

module.exports = {
  resolveDashboardScope,
  resolveDashboardScopeAsync,
  getOverviewDashboard
};
