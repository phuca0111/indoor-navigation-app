const { QueryScope } = require('./QueryScope');
const { assertRoleMayUse } = require('./readRoleMatrix');
const { runReadVersioned } = require('./readRollout');
const {
  buildReportSummary,
  buildRevenueExpenseProjectStats,
  exportCsv,
  exportFormatted
} = require('../../services/financeReports');
const {
  getFinanceOverview,
  listOrgsForBilling
} = require('../../services/financeService');

function resolveFinanceSystemScope(user) {
  const role = user?.role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE_ADMIN') {
    throw Object.assign(new Error('Không có quyền xem báo cáo tài chính.'), {
      status: 403
    });
  }
  const scope = QueryScope.system({ actorRole: role });
  assertRoleMayUse(role, 'financeReports', scope.type);
  return scope;
}

async function getReportSummaryForUser(user, range) {
  resolveFinanceSystemScope(user);
  return runReadVersioned({
    surface: 'financeReports',
    sampleKey: `summary:${user?.role}`,
    legacyFn: () => buildReportSummary(range),
    v2Fn: () => buildReportSummary(range)
  });
}

async function exportReportForUser(user, kind, format, range) {
  resolveFinanceSystemScope(user);
  if (String(format || 'csv').toLowerCase() === 'csv') {
    return exportCsv(kind, range);
  }
  return exportFormatted(kind, format, range);
}

async function getFinanceOverviewForUser(user, opts) {
  const role = user?.role;
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE_ADMIN') {
    throw Object.assign(new Error('Không có quyền xem tổng quan tài chính.'), {
      status: 403
    });
  }
  const scope = QueryScope.system({ actorRole: role });
  assertRoleMayUse(role, 'financeOverview', scope.type);
  return runReadVersioned({
    surface: 'financeOverview',
    sampleKey: `overview:${user?.role}`,
    legacyFn: () => getFinanceOverview(opts),
    v2Fn: () => getFinanceOverview(opts)
  });
}

async function listBillingOrgsForUser(user, filter) {
  resolveFinanceSystemScope(user);
  return listOrgsForBilling(filter);
}

module.exports = {
  getReportSummaryForUser,
  exportReportForUser,
  getFinanceOverviewForUser,
  listBillingOrgsForUser,
  buildRevenueExpenseProjectStats
};
