const { roleHasPermission, P } = require('../../utils/permissions');

const SEARCH_TYPES = [
  'organization', 'building', 'user', 'place', 'floor', 'room', 'poi',
  'invoice', 'article', 'media'
];

function normalizeTypes(types) {
  if (!Array.isArray(types) || !types.length) return SEARCH_TYPES;
  return [...new Set(types.map((item) => String(item).trim().toLowerCase()))]
    .filter((item) => SEARCH_TYPES.includes(item));
}

function allowedTypes(actor, requested) {
  const requestedSet = new Set(normalizeTypes(requested));
  const byRole = {
    SUPER_ADMIN: SEARCH_TYPES,
    FINANCE_ADMIN: ['organization', 'invoice'],
    ORG_ADMIN: ['building', 'user', 'place', 'floor', 'room', 'poi', 'invoice'],
    BUILDING_ADMIN: ['building', 'place', 'floor', 'room', 'poi'],
    REGISTERED_USER: ['building', 'place', 'floor', 'room', 'poi']
  };
  const permitted = new Set(byRole[actor.role] || []);
  if (roleHasPermission(actor.role, P.PLATFORM_CMS_MANAGE)) {
    permitted.add('article');
    permitted.add('media');
  }
  return [...requestedSet].filter((type) => permitted.has(type));
}

async function buildScope(actor, actorData, repository) {
  if (actor.role === 'SUPER_ADMIN') {
    return { platform: true, organizationId: null, buildingIds: null };
  }
  if (actor.role === 'ORG_ADMIN' && actorData?.organization_id) {
    return {
      platform: false,
      organizationId: actorData.organization_id,
      buildingIds: await repository.buildingIds({
        organization_id: actorData.organization_id
      })
    };
  }
  if (actor.role === 'BUILDING_ADMIN') {
    return {
      platform: false,
      organizationId: actorData?.organization_id || null,
      buildingIds: actorData?.assigned_buildings || []
    };
  }
  if (actor.role === 'REGISTERED_USER') {
    return {
      platform: false,
      organizationId: actorData?.organization_id || null,
      buildingIds: await repository.buildingIds({ owner_user_id: actorData?._id })
    };
  }
  return { platform: false, organizationId: actorData?.organization_id || null, buildingIds: [] };
}

function projectionScopeFilter(scope) {
  if (scope.platform) return {};
  return {
    $or: [
      { visibility: 'PUBLIC' },
      ...(scope.organizationId ? [{ organization_id: scope.organizationId }] : []),
      ...(scope.buildingIds?.length ? [{ building_id: { $in: scope.buildingIds } }] : [])
    ]
  };
}

module.exports = { SEARCH_TYPES, normalizeTypes, allowedTypes, buildScope, projectionScopeFilter };
