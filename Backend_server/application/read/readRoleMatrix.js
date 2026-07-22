/**
 * Role matrix for Phase 7 read APIs — characterization lock.
 * Permission codes still enforced by middleware; this matrix documents
 * which scopes each role may resolve to.
 */
const { SCOPES } = require('./QueryScope');

const READ_ROLE_MATRIX = Object.freeze({
  SUPER_ADMIN: Object.freeze({
    platformStats: [SCOPES.SYSTEM],
    analytics: [SCOPES.SYSTEM, SCOPES.ORGANIZATION],
    financeReports: [SCOPES.SYSTEM],
    financeOverview: [SCOPES.SYSTEM],
    funnel: [SCOPES.SYSTEM, SCOPES.ORGANIZATION],
    dashboard: [SCOPES.SYSTEM],
    search: [SCOPES.SYSTEM]
  }),
  FINANCE_ADMIN: Object.freeze({
    platformStats: [],
    analytics: [SCOPES.SYSTEM, SCOPES.ORGANIZATION],
    financeReports: [SCOPES.SYSTEM],
    financeOverview: [SCOPES.SYSTEM],
    funnel: [SCOPES.SYSTEM, SCOPES.ORGANIZATION],
    dashboard: [SCOPES.SYSTEM],
    search: [SCOPES.SYSTEM]
  }),
  ORG_ADMIN: Object.freeze({
    platformStats: [SCOPES.ORGANIZATION],
    analytics: [SCOPES.ORGANIZATION],
    financeReports: [],
    financeOverview: [],
    funnel: [SCOPES.ORGANIZATION],
    dashboard: [SCOPES.ORGANIZATION],
    search: [SCOPES.ORGANIZATION]
  }),
  BUILDING_ADMIN: Object.freeze({
    platformStats: [SCOPES.BUILDINGS],
    analytics: [],
    financeReports: [],
    financeOverview: [],
    funnel: [],
    dashboard: [SCOPES.BUILDINGS],
    search: [SCOPES.BUILDINGS]
  }),
  REGISTERED_USER: Object.freeze({
    platformStats: [],
    analytics: [],
    financeReports: [],
    financeOverview: [],
    funnel: [],
    dashboard: [],
    search: [SCOPES.PERSONAL, SCOPES.BUILDINGS]
  })
});

function assertRoleMayUse(role, surface, scopeType) {
  const allowed = READ_ROLE_MATRIX[role]?.[surface] || [];
  if (!allowed.includes(scopeType)) {
    throw Object.assign(new Error('Không có quyền đọc với phạm vi này.'), {
      status: 403,
      code: 'READ_SCOPE_DENIED'
    });
  }
}

module.exports = { READ_ROLE_MATRIX, assertRoleMayUse };
