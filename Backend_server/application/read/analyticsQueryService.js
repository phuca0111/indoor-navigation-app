const { QueryScope } = require('./QueryScope');
const { assertRoleMayUse } = require('./readRoleMatrix');
const { runReadVersioned } = require('./readRollout');
const analytics = require('../../services/analyticsService');
const { getFunnel } = require('../../services/funnelService');
const analyticsRead = require('../../repositories/analyticsReadRepository');

async function resolveAnalyticsScope(req) {
  const legacy = await analytics.resolveOrgScope(req);
  if (legacy.scopeType === 'SYSTEM' || legacy.system) {
    const scope = QueryScope.system({
      actorRole: legacy.role,
      filterOrganizationId: legacy.orgId
    });
    assertRoleMayUse(req.user.role, 'analytics', scope.type);
    return { scope, legacy };
  }
  const scope = QueryScope.organization(legacy.orgId, { actorRole: legacy.role });
  assertRoleMayUse(req.user.role, 'analytics', scope.type);
  return { scope, legacy };
}

async function getOverview(req) {
  const { legacy } = await resolveAnalyticsScope(req);
  return runReadVersioned({
    surface: 'analyticsOverview',
    sampleKey: `${legacy.role}:${legacy.orgId || 'system'}:${req.query.range || ''}`,
    legacyFn: () => analytics.buildOverview({
      role: legacy.role,
      orgId: legacy.orgId,
      range: req.query.range,
      from: req.query.from,
      to: req.query.to,
      buildingId: req.query.building_id
    }),
    v2Fn: () => analytics.buildOverview({
      role: legacy.role,
      orgId: legacy.orgId,
      range: req.query.range,
      from: req.query.from,
      to: req.query.to,
      buildingId: req.query.building_id
    })
  });
}

async function getAlerts(req) {
  const { legacy } = await resolveAnalyticsScope(req);
  return analytics.buildAlerts({ role: legacy.role, orgId: legacy.orgId });
}

async function getTimeseries(req) {
  const { legacy } = await resolveAnalyticsScope(req);
  return analytics.buildTimeseries({
    role: legacy.role,
    orgId: legacy.orgId,
    metric: req.query.metric,
    range: req.query.range,
    from: req.query.from,
    to: req.query.to
  });
}

/**
 * Funnel scope fail-closed: non-system actors require organization_id.
 * Super/Finance may optionally filter; empty filter = SYSTEM.
 */
async function getConversionFunnel(req) {
  const role = req.user?.role;
  let organizationId = null;
  let scopeType = 'SYSTEM';

  if (role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN') {
    organizationId = req.query.organization_id || null;
    if (organizationId) scopeType = 'ORGANIZATION';
    else scopeType = 'SYSTEM';
  } else if (role === 'ORG_ADMIN') {
    organizationId = req.user?.organization_id || null;
    if (!organizationId) {
      throw Object.assign(new Error('Tài khoản ORG_ADMIN chưa được gán tổ chức.'), {
        status: 403,
        code: 'TENANT_SCOPE_REQUIRED'
      });
    }
    scopeType = 'ORGANIZATION';
  } else {
    throw Object.assign(new Error('Không có quyền xem funnel.'), { status: 403 });
  }

  assertRoleMayUse(role, 'funnel', scopeType);

  return getFunnel({
    organization_id: organizationId,
    from: req.query.from,
    to: req.query.to,
    system: scopeType === 'SYSTEM'
  });
}

module.exports = {
  resolveAnalyticsScope,
  getOverview,
  getAlerts,
  getTimeseries,
  getConversionFunnel,
  parseRange: analytics.parseRange,
  // used by dashboard
  buildAlerts: analytics.buildAlerts
};
