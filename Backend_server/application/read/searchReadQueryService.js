/**
 * Phase 7 — Search read facade with QueryScope assert + shadow rollout.
 * Keeps Phase 6 provider/policy contracts intact.
 */
const { QueryScope, SCOPES } = require('./QueryScope');
const { assertRoleMayUse } = require('./readRoleMatrix');
const { runReadVersioned } = require('./readRollout');
const searchApplication = require('../search/searchApplicationService');
const searchRepository = require('../../repositories/searchRepository');

function mapRoleToSearchSurface(role) {
  if (role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN') return SCOPES.SYSTEM;
  if (role === 'ORG_ADMIN') return SCOPES.ORGANIZATION;
  if (role === 'BUILDING_ADMIN') return SCOPES.BUILDINGS;
  if (role === 'REGISTERED_USER') return SCOPES.PERSONAL;
  return null;
}

async function globalSearch(actor, rawQuery, rawLimit = 8, options = {}) {
  const role = actor?.role;
  const scopeType = mapRoleToSearchSurface(role);
  if (!scopeType) {
    throw Object.assign(new Error('Không có quyền tìm kiếm.'), { status: 403 });
  }
  assertRoleMayUse(role, 'search', scopeType);

  // Materialize QueryScope for audit/shadow metadata (fail-closed).
  if (scopeType === SCOPES.SYSTEM) {
    QueryScope.system({ actorRole: role });
  } else if (scopeType === SCOPES.ORGANIZATION) {
    const actorData = await searchRepository.actorData(actor.userId);
    QueryScope.organization(actorData?.organization_id, { actorRole: role });
  } else if (scopeType === SCOPES.BUILDINGS) {
    const actorData = await searchRepository.actorData(actor.userId);
    QueryScope.buildings(actorData?.assigned_buildings || [], {
      organizationId: actorData?.organization_id || null,
      actorRole: role
    });
  } else {
    QueryScope.personal(actor.userId, { actorRole: role });
  }

  return runReadVersioned({
    surface: 'search',
    sampleKey: `${scopeType}:${role}:${String(rawQuery || '').slice(0, 32)}`,
    legacyFn: () => searchApplication.globalSearch(actor, rawQuery, rawLimit, options),
    v2Fn: () => searchApplication.globalSearch(actor, rawQuery, rawLimit, {
      ...options,
      queryScopeType: scopeType
    })
  });
}

module.exports = { globalSearch, mapRoleToSearchSurface };
