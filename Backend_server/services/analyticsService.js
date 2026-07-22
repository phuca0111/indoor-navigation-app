// Phase 6 / Phase 7 — Analytics read via repository
const analyticsRead = require('../repositories/analyticsReadRepository');
const { getOrgQuotaSnapshot } = require('../utils/overQuotaLock');
const {
  parseAnalyticsRange,
  dateKey,
  REPORT_TZ,
  RANGE_DAYS
} = require('../application/read/readDateRange');

function isObjectIdString(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || ''));
}

function parseRange(range, customFrom, customTo) {
  return parseAnalyticsRange(range, customFrom, customTo);
}

function emptySeries(start, end) {
  const out = [];
  const cur = new Date(`${dateKey(start)}T00:00:00+07:00`);
  const last = new Date(`${dateKey(end)}T00:00:00+07:00`);
  while (cur.getTime() <= last.getTime()) {
    out.push({ date: dateKey(cur), count: 0, amount: 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function fillSeries(empty, rows, valueField = 'count') {
  const map = Object.fromEntries(empty.map((r) => [r.date, { ...r }]));
  rows.forEach((row) => {
    const key = row._id;
    if (!map[key]) return;
    if (valueField === 'amount') {
      map[key].amount = row.amount || 0;
      map[key].count = row.count || 0;
    } else {
      map[key].count = row.count || 0;
    }
  });
  return Object.keys(map)
    .sort()
    .map((k) => map[k]);
}

async function resolveOrgScope(req) {
  const role = req.user?.role;
  if (role === 'SUPER_ADMIN') {
    const qOrg = req.query?.organization_id;
    if (qOrg && isObjectIdString(qOrg)) {
      return {
        role,
        orgId: qOrg,
        filterOrgId: qOrg,
        scopeType: 'ORGANIZATION',
        system: false
      };
    }
    return {
      role,
      orgId: null,
      filterOrgId: null,
      scopeType: 'SYSTEM',
      system: true
    };
  }
  if (role === 'FINANCE_ADMIN') {
    const qOrg = req.query?.organization_id;
    if (qOrg && isObjectIdString(qOrg)) {
      return {
        role,
        orgId: qOrg,
        filterOrgId: qOrg,
        scopeType: 'ORGANIZATION',
        system: false
      };
    }
    // Explicit SYSTEM — không suy diễn ORGANIZATION từ user.organization_id
    return {
      role: 'FINANCE_ADMIN',
      orgId: null,
      filterOrgId: null,
      scopeType: 'SYSTEM',
      system: true
    };
  }
  if (role === 'ORG_ADMIN') {
    const orgId = req.user.organization_id;
    if (!orgId) {
      const err = new Error('Tài khoản ORG_ADMIN chưa được gán tổ chức.');
      err.status = 403;
      err.code = 'TENANT_SCOPE_REQUIRED';
      throw err;
    }
    return {
      role,
      orgId,
      filterOrgId: orgId,
      scopeType: 'ORGANIZATION',
      system: false
    };
  }
  const err = new Error('Không có quyền xem Phân tích.');
  err.status = 403;
  throw err;
}

async function countActivityByDay({ action, start, end, orgId }) {
  const match = {
    action,
    createdAt: { $gte: start, $lte: end }
  };

  if (orgId) {
    const users = await analyticsRead.findUsers({ organization_id: orgId }, { select: '_id' });
    const userIds = users.map((u) => u._id);
    match.$or = [
      { organization_id: orgId },
      ...(userIds.length ? [{ user_id: { $in: userIds } }] : [])
    ];
  }

  const rows = await analyticsRead.aggregateActivity([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: REPORT_TZ }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  return rows;
}

async function paidByDay({ start, end, orgId }) {
  if (String(process.env.ANALYTICS_REVENUE_V2_LEDGER || 'false') === 'true') {
    const match = {
      account_code: '4000_SUBSCRIPTION_REVENUE',
      side: 'CREDIT',
      occurred_at: { $gte: start, $lte: end }
    };
    if (orgId) match.organization_id = orgId;
    return analyticsRead.aggregateModel('LedgerEntry', [
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$occurred_at',
              timezone: REPORT_TZ
            }
          },
          count: { $sum: 1 },
          amount: { $sum: '$amount_minor' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
  }
  const match = {
    status: 'PAID',
    $or: [
      { paid_at: { $gte: start, $lte: end } },
      { paid_at: null, createdAt: { $gte: start, $lte: end } }
    ]
  };
  if (orgId) match.organization_id = orgId;

  return analyticsRead.aggregateInvoices([
    { $match: match },
    {
      $addFields: {
        paidDay: { $ifNull: ['$paid_at', '$createdAt'] }
      }
    },
    {
      $match: {
        paidDay: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$paidDay', timezone: REPORT_TZ }
        },
        count: { $sum: 1 },
        amount: { $sum: '$amount' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

async function paidByMonth({ start, end, orgId }) {
  const match = { status: 'PAID' };
  if (orgId) match.organization_id = orgId;

  return analyticsRead.aggregateInvoices([
    { $match: match },
    {
      $addFields: {
        paidDay: { $ifNull: ['$paid_at', '$createdAt'] }
      }
    },
    {
      $match: {
        paidDay: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m', date: '$paidDay', timezone: REPORT_TZ }
        },
        count: { $sum: 1 },
        amount: { $sum: '$amount' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

async function expenseByDay({ start, end }) {
  return analyticsRead.aggregateModel('Expense', [
    { $match: { expense_date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$expense_date',
            timezone: REPORT_TZ
          }
        },
        count: { $sum: 1 },
        amount: { $sum: '$amount' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

async function buildPlanDistribution(orgId) {
  if (orgId) {
    const org = await analyticsRead.findOrganizationById(orgId, 'plan');
    const plan = String(org?.plan || 'FREE').toUpperCase();
    return {
      FREE: plan === 'FREE' ? 1 : 0,
      PRO: plan === 'PRO' ? 1 : 0,
      ENTERPRISE: plan === 'ENTERPRISE' ? 1 : 0
    };
  }
  const rows = await analyticsRead.aggregateOrganizations([
    { $group: { _id: { $ifNull: ['$plan', 'FREE'] }, count: { $sum: 1 } } }
  ]);
  const dist = { FREE: 0, PRO: 0, ENTERPRISE: 0 };
  rows.forEach((r) => {
    const p = String(r._id || 'FREE').toUpperCase();
    if (dist[p] != null) dist[p] = r.count;
  });
  return dist;
}

function deltaPct(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur === 0 ? 0 : 100;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function previousPeriod(start, days) {
  const end = new Date(start.getTime() - 1);
  const previousStart = new Date(start.getTime() - days * 86400000);
  return { start: previousStart, end };
}

async function countCreatedByDay(modelName, { start, end, orgId, orgField = 'organization_id', dateField = 'createdAt', match = {} }) {
  const filter = {
    ...match,
    [dateField]: { $gte: start, $lte: end }
  };
  if (orgId) filter[orgField] = orgId;
  return analyticsRead.aggregateModel(modelName, [
    { $match: filter },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: `$${dateField}`,
            timezone: REPORT_TZ
          }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

async function qrScansByDay({ start, end, buildingIds }) {
  const match = { scanned_at: { $gte: start, $lte: end } };
  if (buildingIds) match.building_id = { $in: buildingIds };
  return analyticsRead.aggregateModel('QrScanLog', [
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$scanned_at',
            timezone: REPORT_TZ
          }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

async function revenueByPlan({ start, end, orgId }) {
  const match = {
    status: 'PAID',
    $or: [
      { paid_at: { $gte: start, $lte: end } },
      { paid_at: null, createdAt: { $gte: start, $lte: end } }
    ]
  };
  if (orgId) match.organization_id = orgId;
  return analyticsRead.aggregateInvoices([
    { $match: match },
    { $addFields: { paidDay: { $ifNull: ['$paid_at', '$createdAt'] } } },
    { $match: { paidDay: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $ifNull: ['$plan', 'KHAC'] },
        amount: { $sum: '$amount' },
        invoice_count: { $sum: 1 },
        organizations: { $addToSet: '$organization_id' },
        personal_users: { $addToSet: '$metadata.user_id' }
      }
    },
    { $sort: { amount: -1 } }
  ]);
}

async function buildSubscriptionMetrics(orgId) {
  const orgMatch = orgId ? { _id: orgId } : {};
  const [organizations, plans, subscriptions, personalUsers] = await Promise.all([
    analyticsRead.findOrganizations(orgMatch, { select: '_id plan createdAt' }),
    analyticsRead.findPlans({}, { select: 'code name price_vnd period_days' }),
    analyticsRead.findSubscriptions({
      ...(orgId ? { organization_id: orgId } : {}),
      is_current: true,
      status: { $in: ['ACTIVE', 'GRACE_PERIOD'] }
    }, { select: 'organization_id plan status current_period_end' }),
    orgId
      ? Promise.resolve([])
      : analyticsRead.findUsers({
        role: 'REGISTERED_USER',
        is_active: { $ne: false },
        plan: { $nin: [null, '', 'FREE'] },
        $or: [
          { plan_expires_at: null },
          { plan_expires_at: { $gte: new Date() } }
        ]
      }, { select: '_id plan' })
  ]);
  const planMap = Object.fromEntries(plans.map((plan) => [String(plan.code).toUpperCase(), plan]));
  let mrr = 0;
  const recurringCustomers = new Set();
  [...subscriptions, ...personalUsers].forEach((subscription) => {
    const code = String(subscription.plan || '').toUpperCase();
    const plan = planMap[code];
    if (!plan) return;
    const monthlyValue = (Number(plan.price_vnd) || 0) *
      (30 / Math.max(1, Number(plan.period_days) || 30));
    if (monthlyValue <= 0) return;
    mrr += monthlyValue;
    recurringCustomers.add(subscription.organization_id
      ? `org:${subscription.organization_id}`
      : `user:${subscription._id}`);
  });
  const distribution = {};
  organizations.forEach((org) => {
    const code = String(org.plan || 'FREE').toUpperCase();
    distribution[code] = (distribution[code] || 0) + 1;
  });
  personalUsers.forEach((user) => {
    const code = String(user.plan || 'FREE').toUpperCase();
    distribution[code] = (distribution[code] || 0) + 1;
  });
  return {
    distribution,
    mrr: Math.round(mrr),
    arr: Math.round(mrr * 12),
    subscriptions,
    organization_count: organizations.length,
    personal_paid_count: personalUsers.length,
    recurring_customer_count: recurringCustomers.size
  };
}

async function buildSubscriptionTrend({ start, end, orgId, empty }) {
  const [historyRows, organizationRows] = await Promise.all([
    analyticsRead.aggregateModel('OrganizationPlanHistory', [
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          ...(orgId ? { organization_id: orgId } : {})
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: REPORT_TZ
              }
            },
            plan: { $toUpper: '$to_plan' }
          },
          organizations: { $addToSet: '$organization_id' }
        }
      }
    ]),
    analyticsRead.aggregateOrganizations([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          ...(orgId ? { _id: orgId } : {})
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: REPORT_TZ
              }
            },
            plan: { $toUpper: { $ifNull: ['$plan', 'FREE'] } }
          },
          organizations: { $addToSet: '$_id' }
        }
      }
    ])
  ]);
  const plans = new Set(['FREE', 'PRO', 'ENTERPRISE']);
  const values = {};
  [...historyRows, ...organizationRows].forEach((row) => {
    const plan = String(row._id?.plan || 'FREE').toUpperCase();
    const date = row._id?.date;
    if (!date) return;
    plans.add(plan);
    const key = `${plan}:${date}`;
    if (!values[key]) values[key] = new Set();
    (row.organizations || []).forEach((id) => values[key].add(String(id)));
  });
  return Object.fromEntries([...plans].map((plan) => [
    plan,
    empty.map((row) => ({
      date: row.date,
      count: values[`${plan}:${row.date}`]?.size || 0
    }))
  ]));
}

async function buildTopOrganizations({ start, end, orgId }) {
  const invoiceMatch = {
    status: 'PAID',
    $or: [
      { paid_at: { $gte: start, $lte: end } },
      { paid_at: null, createdAt: { $gte: start, $lte: end } }
    ]
  };
  if (orgId) invoiceMatch.organization_id = orgId;
  const activityMatch = {
    action: { $in: ['LOGIN', 'PUBLISH_MAP'] },
    createdAt: { $gte: start, $lte: end }
  };
  if (orgId) activityMatch.organization_id = orgId;

  const [revenueRows, activityRows] = await Promise.all([
    analyticsRead.aggregateInvoices([
      { $match: invoiceMatch },
      { $group: { _id: '$organization_id', revenue: { $sum: '$amount' } } }
    ]),
    analyticsRead.findActivity(activityMatch, { select: 'action organization_id user_id' })
  ]);
  const missingUserIds = [...new Set(
    activityRows.filter((row) => !row.organization_id && row.user_id).map((row) => String(row.user_id))
  )];
  const users = missingUserIds.length
    ? await analyticsRead.findUsers({ _id: { $in: missingUserIds } }, { select: '_id organization_id' })
    : [];
  const userOrg = Object.fromEntries(users.map((user) => [String(user._id), String(user.organization_id || '')]));
  const metrics = {};
  revenueRows.forEach((row) => {
    if (!row._id) return;
    metrics[String(row._id)] = { revenue: Number(row.revenue) || 0, logins: 0, publishes: 0 };
  });
  activityRows.forEach((row) => {
    const key = String(row.organization_id || userOrg[String(row.user_id)] || '');
    if (!key) return;
    if (!metrics[key]) metrics[key] = { revenue: 0, logins: 0, publishes: 0 };
    if (row.action === 'LOGIN') metrics[key].logins += 1;
    if (row.action === 'PUBLISH_MAP') metrics[key].publishes += 1;
  });
  const ids = Object.keys(metrics);
  const orgs = ids.length
    ? await analyticsRead.findOrganizations({ _id: { $in: ids } }, { select: 'name plan' })
    : [];
  return orgs.map((org) => ({
    id: String(org._id),
    name: org.name,
    plan: org.plan || 'FREE',
    ...metrics[String(org._id)]
  })).sort((a, b) => (b.revenue - a.revenue) || (b.publishes - a.publishes) || (b.logins - a.logins)).slice(0, 10);
}

async function buildTopBuildings({ start, end, buildingIds }) {
  const mapMatch = { published_at: { $gte: start, $lte: end } };
  const qrMatch = { scanned_at: { $gte: start, $lte: end } };
  if (buildingIds) {
    mapMatch.building_id = { $in: buildingIds };
    qrMatch.building_id = { $in: buildingIds };
  }
  const [publishRows, qrRows, navRows] = await Promise.all([
    analyticsRead.aggregateModel('MapVersion', [
      { $match: mapMatch },
      { $group: { _id: '$building_id', publishes: { $sum: 1 } } }
    ]),
    analyticsRead.aggregateModel('QrScanLog', [
      { $match: qrMatch },
      { $group: { _id: '$building_id', qr_scans: { $sum: 1 } } }
    ]),
    analyticsRead.navCompleteByBuilding({ start, end, buildingIds })
  ]);
  const metrics = {};
  publishRows.forEach((row) => {
    if (row._id) metrics[String(row._id)] = { publishes: row.publishes, qr_scans: 0, navigation_requests: 0 };
  });
  qrRows.forEach((row) => {
    if (!row._id) return;
    const key = String(row._id);
    if (!metrics[key]) metrics[key] = { publishes: 0, qr_scans: 0, navigation_requests: 0 };
    metrics[key].qr_scans = row.qr_scans;
  });
  navRows.forEach((row) => {
    if (!row._id) return;
    const key = String(row._id);
    if (!metrics[key]) metrics[key] = { publishes: 0, qr_scans: 0, navigation_requests: 0 };
    metrics[key].navigation_requests = row.navigation_requests || 0;
  });
  const ids = Object.keys(metrics);
  const buildings = ids.length
    ? await analyticsRead.findBuildings({ _id: { $in: ids } }, { select: 'name organization_id' })
    : [];
  return buildings.map((building) => ({
    id: String(building._id),
    name: building.name,
    organization_id: building.organization_id,
    ...metrics[String(building._id)]
  })).sort((a, b) =>
    (b.navigation_requests - a.navigation_requests) ||
    (b.publishes - a.publishes) ||
    (b.qr_scans - a.qr_scans)
  ).slice(0, 10);
}

async function buildOverview({ role, orgId, range, from, to, buildingId }) {
  const { days, start, end, range: normalizedRange } = parseRange(range, from, to);
  const empty = emptySeries(start, end);
  const previous = previousPeriod(start, days);
  let buildingIds = orgId
    ? await analyticsRead.findBuildingIds({ organization_id: orgId })
    : null;
  if (buildingId && isObjectIdString(buildingId)) {
    const requested = String(buildingId);
    if (buildingIds) {
      const allowed = buildingIds.map(String);
      if (!allowed.includes(requested)) {
        const err = new Error('building_id nằm ngoài phạm vi tổ chức.');
        err.status = 403;
        err.code = 'FOREIGN_BUILDING_ID';
        throw err;
      }
      buildingIds = buildingIds.filter((id) => String(id) === requested);
    } else if (role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN') {
      buildingIds = [buildingId];
    } else {
      const err = new Error('building_id nằm ngoài phạm vi được phép.');
      err.status = 403;
      err.code = 'FOREIGN_BUILDING_ID';
      throw err;
    }
  }

  const [
    loginRows,
    publishRows,
    paidDayRows,
    expenseDayRows,
    paidMonthRows,
    plan_distribution,
    qrRows,
    orgGrowthRows,
    buildingGrowthRows,
    userGrowthRows,
    mapGrowthRows,
    previousLoginRows,
    previousPublishRows,
    previousPaidRows,
    previousExpenseRows,
    planRevenueRows,
    subscriptionMetrics,
    subscriptionTrend,
    topOrganizations,
    topBuildings,
    navRows
  ] = await Promise.all([
    countActivityByDay({ action: 'LOGIN', start, end, orgId }),
    countActivityByDay({ action: 'PUBLISH_MAP', start, end, orgId }),
    paidByDay({ start, end, orgId }),
    (role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN') ? expenseByDay({ start, end }) : Promise.resolve([]),
    paidByMonth({ start, end, orgId }),
    buildPlanDistribution(orgId),
    qrScansByDay({ start, end, buildingIds }),
    countCreatedByDay('Organization', {
      start, end,
      match: orgId ? { _id: orgId } : {}
    }),
    countCreatedByDay('Building', { start, end, orgId }),
    countCreatedByDay('User', { start, end, orgId }),
    countCreatedByDay('Floor', {
      start, end,
      ...(buildingIds ? { orgField: 'building_id', orgId: { $in: buildingIds } } : {})
    }),
    countActivityByDay({ action: 'LOGIN', start: previous.start, end: previous.end, orgId }),
    countActivityByDay({ action: 'PUBLISH_MAP', start: previous.start, end: previous.end, orgId }),
    paidByDay({ start: previous.start, end: previous.end, orgId }),
    (role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN')
      ? expenseByDay({ start: previous.start, end: previous.end })
      : Promise.resolve([]),
    revenueByPlan({ start, end, orgId }),
    buildSubscriptionMetrics(orgId),
    buildSubscriptionTrend({ start, end, orgId, empty }),
    buildTopOrganizations({ start, end, orgId }),
    buildTopBuildings({ start, end, buildingIds }),
    analyticsRead.telemetryByDay({
      eventType: 'nav_complete',
      start,
      end,
      orgId,
      buildingIds,
      buildingId: buildingId || null
    })
  ]);

  const login_series = fillSeries(empty, loginRows);
  const publish_series = fillSeries(empty, publishRows);
  const paid_series = fillSeries(empty, paidDayRows, 'amount');
  const expense_series = fillSeries(empty, expenseDayRows, 'amount');
  const qr_series = fillSeries(empty, qrRows);
  const navigation_series = fillSeries(empty, navRows);
  const org_growth = fillSeries(empty, orgGrowthRows);
  const building_growth = fillSeries(empty, buildingGrowthRows);
  const user_growth = fillSeries(empty, userGrowthRows);
  const map_growth = fillSeries(empty, mapGrowthRows);

  const totals = {
    logins: login_series.reduce((s, r) => s + r.count, 0),
    publishes: publish_series.reduce((s, r) => s + r.count, 0),
    paid_invoices: paid_series.reduce((s, r) => s + r.count, 0),
    paid_amount: paid_series.reduce((s, r) => s + (r.amount || 0), 0),
    expense_amount: expense_series.reduce((s, r) => s + (r.amount || 0), 0),
    navigation_requests: navigation_series.reduce((s, r) => s + r.count, 0)
  };
  totals.profit_amount = totals.paid_amount - totals.expense_amount;
  const previousTotals = {
    logins: previousLoginRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
    publishes: previousPublishRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
    paid_invoices: previousPaidRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
    paid_amount: previousPaidRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    expense_amount: previousExpenseRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  };
  previousTotals.profit_amount = previousTotals.paid_amount - previousTotals.expense_amount;
  const changes = {
    logins: deltaPct(totals.logins, previousTotals.logins),
    publishes: deltaPct(totals.publishes, previousTotals.publishes),
    paid_invoices: deltaPct(totals.paid_invoices, previousTotals.paid_invoices),
    paid_amount: deltaPct(totals.paid_amount, previousTotals.paid_amount),
    expense_amount: deltaPct(totals.expense_amount, previousTotals.expense_amount),
    profit_amount: deltaPct(totals.profit_amount, previousTotals.profit_amount)
  };
  const payingCustomerIds = new Set();
  planRevenueRows.forEach((row) => {
    (row.organizations || []).filter(Boolean).forEach((id) => {
      payingCustomerIds.add(`org:${id}`);
    });
    (row.personal_users || []).filter(Boolean).forEach((id) => {
      payingCustomerIds.add(`user:${id}`);
    });
  });
  const arpu = payingCustomerIds.size
    ? Math.round(totals.paid_amount / payingCustomerIds.size)
    : 0;

  const [registrationRows, expiringOrgs, draftCount] = await Promise.all([
    analyticsRead.findRegistrations({
      createdAt: { $gte: start, $lte: end },
      ...(orgId ? { organization_id: orgId } : {})
    }, { select: 'status organization_id' }),
    analyticsRead.countOrganizations({
      ...(orgId ? { _id: orgId } : {}),
      plan_expires_at: { $gte: new Date(), $lte: new Date(Date.now() + 14 * 86400000) }
    }),
    analyticsRead.countDocuments('Draft', buildingIds ? { building_id: { $in: buildingIds } } : {})
  ]);
  const approvedRegistrationRows = registrationRows.filter((row) =>
    row.status === 'APPROVED' && row.organization_id
  );
  const approvedOrgIds = approvedRegistrationRows.map((row) => row.organization_id);
  const paidCohortOrgIds = approvedOrgIds.length
    ? await analyticsRead.distinctInvoiceField('organization_id', {
      status: 'PAID',
      organization_id: { $in: approvedOrgIds },
      $or: [
        { paid_at: { $lte: end } },
        { paid_at: null, createdAt: { $lte: end } }
      ]
    })
    : [];
  const enterpriseCohort = paidCohortOrgIds.length
    ? await analyticsRead.countOrganizations({
      _id: { $in: paidCohortOrgIds },
      plan: 'ENTERPRISE'
    })
    : 0;

  const insights = [];
  const insightFor = (metric, label) => {
    const value = changes[metric];
    insights.push({
      type: value > 0 ? 'positive' : (value < 0 ? 'negative' : 'neutral'),
      title: `${label} ${value > 0 ? 'tăng' : (value < 0 ? 'giảm' : 'không đổi')} ${Math.abs(value)}%`,
      metric,
      value
    });
  };
  insightFor('paid_amount', 'Doanh thu');
  insightFor('logins', 'Lượt đăng nhập');
  insightFor('publishes', 'Lượt xuất bản');
  insights.push({
    type: expiringOrgs > 0 ? 'warning' : 'neutral',
    title: expiringOrgs + ' tổ chức sắp hết hạn trong 14 ngày',
    metric: 'expiring',
    value: expiringOrgs
  });
  insights.push({
    type: draftCount > 0 ? 'warning' : 'positive',
    title: draftCount + ' bản nháp chưa xuất bản',
    metric: 'drafts',
    value: draftCount
  });

  let organization = null;
  if (orgId) {
    const org = await analyticsRead.findOrganizationById(orgId);
    if (org) {
      organization = {
        id: String(org._id),
        name: org.name,
        plan: org.plan || 'FREE',
        billing_status: org.billing_status || 'ACTIVE'
      };
    }
  }

  return {
    scope: (role === 'SUPER_ADMIN' || (role === 'FINANCE_ADMIN' && !orgId))
      ? 'platform'
      : 'organization',
    range: normalizedRange,
    period: { start: start.toISOString(), end: end.toISOString() },
    organization,
    plan_distribution,
    totals,
    previous_totals: previousTotals,
    changes,
    series: {
      login: login_series,
      publish: publish_series,
      paid: paid_series,
      revenue: paid_series,
      expense: expense_series,
      qr_scan: qr_series,
      navigation: navigation_series
    },
    growth: {
      organization: org_growth,
      building: building_growth,
      user: user_growth,
      map: map_growth
    },
    revenue_by_plan: planRevenueRows.map((row) => ({
      plan: row._id,
      amount: row.amount || 0,
      invoice_count: row.invoice_count || 0,
      organization_count: (row.organizations || []).filter(Boolean).length,
      personal_customer_count: (row.personal_users || []).filter(Boolean).length,
      customer_count: (row.organizations || []).filter(Boolean).length +
        (row.personal_users || []).filter(Boolean).length
    })),
    subscription: {
      distribution: subscriptionMetrics.distribution,
      mrr: subscriptionMetrics.mrr,
      arr: subscriptionMetrics.arr,
      arpu,
      organization_count: subscriptionMetrics.organization_count,
      personal_paid_count: subscriptionMetrics.personal_paid_count,
      recurring_customer_count: subscriptionMetrics.recurring_customer_count,
      trend: subscriptionTrend
    },
    conversion_funnel: {
      registrations: registrationRows.length,
      approved: approvedRegistrationRows.length,
      paid_organizations: paidCohortOrgIds.length,
      enterprise: enterpriseCohort,
      definition: 'registration_cohort'
    },
    rankings: {
      organizations: topOrganizations,
      buildings: topBuildings,
      plans: planRevenueRows.map((row) => ({
        plan: row._id,
        revenue: row.amount || 0,
        invoice_count: row.invoice_count || 0,
        organization_count: (row.organizations || []).filter(Boolean).length,
        personal_customer_count: (row.personal_users || []).filter(Boolean).length,
        customer_count: (row.organizations || []).filter(Boolean).length +
          (row.personal_users || []).filter(Boolean).length
      }))
    },
    insights,
    paid_by_month: paidMonthRows.map((r) => ({
      month: r._id,
      count: r.count,
      amount: r.amount || 0
    }))
  };
}

async function buildAlerts({ role, orgId }) {
  const alerts = [];

  if (role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN') {
    const [graceOrgs, expiredOrgs, pendingRegs] = await Promise.all([
      analyticsRead.findOrganizations({ billing_status: 'GRACE_PERIOD' }, { select: 'name slug plan billing_status grace_ends_at plan_expires_at', limit: 50 }),
      analyticsRead.findOrganizations({ billing_status: 'EXPIRED' }, { select: 'name slug plan billing_status plan_expires_at', limit: 50 }),
      analyticsRead.countDocuments('OrganizationRegistration', { status: 'PENDING' })
    ]);

    graceOrgs.forEach((o) => {
      alerts.push({
        type: 'GRACE',
        severity: 'warn',
        organization_id: String(o._id),
        title: o.name,
        message: 'Đang trong thời gian gia hạn' +
          (o.grace_ends_at ? ' đến ' + new Date(o.grace_ends_at).toLocaleDateString('vi-VN') : '')
      });
    });

    expiredOrgs.forEach((o) => {
      alerts.push({
        type: 'EXPIRED',
        severity: 'danger',
        organization_id: String(o._id),
        title: o.name,
        message: 'Gói đã hết hạn / EXPIRED'
      });
    });

    if (pendingRegs > 0) {
      alerts.push({
        type: 'PENDING_REGISTRATION',
        severity: 'info',
        organization_id: null,
        title: 'Hồ sơ đăng ký',
        message: pendingRegs + ' hồ sơ đang chờ duyệt'
      });
    }

    // Over-quota soft lock (sample up to 30 active orgs)
    const sampleOrgs = await analyticsRead.findOrganizations({ is_active: { $ne: false } }, { select: 'name plan billing_status', limit: 40 });
    for (const o of sampleOrgs) {
      try {
        const snap = await getOrgQuotaSnapshot(o);
        if (snap?.enforcement_active && ((snap.buildings?.locked || 0) > 0 || (snap.users?.locked || 0) > 0)) {
          alerts.push({
            type: 'OVER_QUOTA',
            severity: 'warn',
            organization_id: String(o._id),
            title: o.name,
            message:
              (snap.buildings?.locked || 0) + ' tòa khóa · ' +
              (snap.users?.locked || 0) + ' tài khoản khóa'
          });
        }
      } catch (_) { /* skip */ }
    }
  } else if (orgId) {
    const org = await analyticsRead.findOrganizationById(orgId);
    if (org) {
      if (String(org.billing_status).toUpperCase() === 'GRACE_PERIOD') {
        alerts.push({
          type: 'GRACE',
          severity: 'warn',
          organization_id: String(org._id),
          title: org.name,
          message: 'Tổ chức đang trong thời gian gia hạn — hãy gia hạn gói'
        });
      }
      if (String(org.billing_status).toUpperCase() === 'EXPIRED') {
        alerts.push({
          type: 'EXPIRED',
          severity: 'danger',
          organization_id: String(org._id),
          title: org.name,
          message: 'Gói đã hết hạn — nâng cấp để mở khóa hạn mức'
        });
      }
      const snap = await getOrgQuotaSnapshot(org);
      if (snap?.enforcement_active && ((snap.buildings?.locked || 0) > 0 || (snap.users?.locked || 0) > 0)) {
        alerts.push({
          type: 'OVER_QUOTA',
          severity: 'warn',
          organization_id: String(org._id),
          title: org.name,
          message:
            (snap.buildings?.locked || 0) + ' tòa khóa · ' +
            (snap.users?.locked || 0) + ' tài khoản khóa'
        });
      }
    }
  }

  return { alerts, count: alerts.length };
}

async function buildTimeseries({ role, orgId, metric, range, from, to }) {
  const { days, start, end, range: normalizedRange } = parseRange(range, from, to);
  const empty = emptySeries(start, end);
  const m = String(metric || 'login').toLowerCase();

  let rows;
  if (m === 'publish') {
    rows = await countActivityByDay({ action: 'PUBLISH_MAP', start, end, orgId });
    return {
      metric: 'publish',
      range: normalizedRange,
      series: fillSeries(empty, rows)
    };
  }
  if (m === 'paid') {
    rows = await paidByDay({ start, end, orgId });
    return {
      metric: 'paid',
      range: normalizedRange,
      series: fillSeries(empty, rows, 'amount')
    };
  }
  rows = await countActivityByDay({ action: 'LOGIN', start, end, orgId });
  return {
    metric: 'login',
    range: normalizedRange,
    series: fillSeries(empty, rows)
  };
}

module.exports = {
  parseRange,
  resolveOrgScope,
  buildOverview,
  buildAlerts,
  buildTimeseries,
  RANGE_DAYS
};
