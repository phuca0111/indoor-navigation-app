// Phase 6 — Analytics: aggregate realtime từ ActivityLog / Invoice / Organization
const ActivityLog = require('../models/ActivityLog');
const Invoice = require('../models/Invoice');
const Organization = require('../models/Organization');
const OrganizationRegistration = require('../models/OrganizationRegistration');
const User = require('../models/User');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Draft = require('../models/Draft');
const MapVersion = require('../models/MapVersion');
const QrScanLog = require('../models/QrScanLog');
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const OrganizationPlanHistory = require('../models/OrganizationPlanHistory');
const { getOrgQuotaSnapshot } = require('../utils/overQuotaLock');

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '1y': 365, '365d': 365 };

function parseRange(range, customFrom, customTo) {
  if (String(range) === 'custom' && customFrom && customTo) {
    const start = new Date(`${customFrom}T00:00:00`);
    const end = new Date(`${customTo}T23:59:59.999`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
      const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
      return { days, start, end, range: 'custom' };
    }
  }
  const days = RANGE_DAYS[String(range || '30d')] || 30;
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { days, start, end, range: days === 365 ? '1y' : `${days}d` };
}

function dateKey(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptySeries(start, end) {
  const out = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    out.push({ date: dateKey(cur), count: 0, amount: 0 });
    cur.setDate(cur.getDate() + 1);
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
    return { role, orgId: null };
  }
  if (role === 'ORG_ADMIN') {
    const orgId = req.user.organization_id;
    if (!orgId) {
      const err = new Error('Tài khoản ORG_ADMIN chưa được gán tổ chức.');
      err.status = 403;
      throw err;
    }
    return { role, orgId };
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
    const users = await User.find({ organization_id: orgId }).select('_id').lean();
    const userIds = users.map((u) => u._id);
    match.$or = [
      { organization_id: orgId },
      ...(userIds.length ? [{ user_id: { $in: userIds } }] : [])
    ];
  }

  const rows = await ActivityLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  return rows;
}

async function paidByDay({ start, end, orgId }) {
  const match = {
    status: 'PAID',
    $or: [
      { paid_at: { $gte: start, $lte: end } },
      { paid_at: null, updatedAt: { $gte: start, $lte: end } }
    ]
  };
  if (orgId) match.organization_id = orgId;

  return Invoice.aggregate([
    { $match: match },
    {
      $addFields: {
        paidDay: { $ifNull: ['$paid_at', '$updatedAt'] }
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
          $dateToString: { format: '%Y-%m-%d', date: '$paidDay' }
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

  return Invoice.aggregate([
    { $match: match },
    {
      $addFields: {
        paidDay: { $ifNull: ['$paid_at', '$updatedAt'] }
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
          $dateToString: { format: '%Y-%m', date: '$paidDay' }
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
    const org = await Organization.findById(orgId).select('plan').lean();
    const plan = String(org?.plan || 'FREE').toUpperCase();
    return {
      FREE: plan === 'FREE' ? 1 : 0,
      PRO: plan === 'PRO' ? 1 : 0,
      ENTERPRISE: plan === 'ENTERPRISE' ? 1 : 0
    };
  }
  const rows = await Organization.aggregate([
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
  const previousStart = new Date(end);
  previousStart.setDate(previousStart.getDate() - (days - 1));
  previousStart.setHours(0, 0, 0, 0);
  return { start: previousStart, end };
}

async function countCreatedByDay(Model, { start, end, orgId, orgField = 'organization_id', dateField = 'createdAt', match = {} }) {
  const filter = {
    ...match,
    [dateField]: { $gte: start, $lte: end }
  };
  if (orgId) filter[orgField] = orgId;
  return Model.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` } },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

async function qrScansByDay({ start, end, buildingIds }) {
  const match = { scanned_at: { $gte: start, $lte: end } };
  if (buildingIds) match.building_id = { $in: buildingIds };
  return QrScanLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$scanned_at' } },
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
      { paid_at: null, updatedAt: { $gte: start, $lte: end } }
    ]
  };
  if (orgId) match.organization_id = orgId;
  return Invoice.aggregate([
    { $match: match },
    { $addFields: { paidDay: { $ifNull: ['$paid_at', '$updatedAt'] } } },
    { $match: { paidDay: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $ifNull: ['$plan', 'KHAC'] },
        amount: { $sum: '$amount' },
        invoice_count: { $sum: 1 },
        organizations: { $addToSet: '$organization_id' }
      }
    },
    { $sort: { amount: -1 } }
  ]);
}

async function buildSubscriptionMetrics(orgId) {
  const orgMatch = orgId ? { _id: orgId } : {};
  const [organizations, plans, subscriptions] = await Promise.all([
    Organization.find(orgMatch).select('_id plan createdAt').lean(),
    Plan.find({}).select('code name price_vnd period_days').lean(),
    Subscription.find({
      ...(orgId ? { organization_id: orgId } : {}),
      is_current: true,
      status: { $in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD'] }
    }).select('organization_id plan status').lean()
  ]);
  const planMap = Object.fromEntries(plans.map((plan) => [String(plan.code).toUpperCase(), plan]));
  let mrr = 0;
  subscriptions.forEach((subscription) => {
    if (subscription.status === 'TRIALING') return;
    const plan = planMap[String(subscription.plan || '').toUpperCase()];
    if (!plan) return;
    mrr += (Number(plan.price_vnd) || 0) * (30 / Math.max(1, Number(plan.period_days) || 30));
  });
  const distribution = {};
  organizations.forEach((org) => {
    const code = String(org.plan || 'FREE').toUpperCase();
    distribution[code] = (distribution[code] || 0) + 1;
  });
  return {
    distribution,
    mrr: Math.round(mrr),
    arr: Math.round(mrr * 12),
    subscriptions,
    organization_count: organizations.length
  };
}

async function buildSubscriptionTrend({ start, end, orgId, empty }) {
  const [historyRows, organizationRows] = await Promise.all([
    OrganizationPlanHistory.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          ...(orgId ? { organization_id: orgId } : {})
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            plan: { $toUpper: '$to_plan' }
          },
          count: { $sum: 1 }
        }
      }
    ]),
    Organization.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          ...(orgId ? { _id: orgId } : {})
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            plan: { $toUpper: { $ifNull: ['$plan', 'FREE'] } }
          },
          count: { $sum: 1 }
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
    values[key] = (values[key] || 0) + (Number(row.count) || 0);
  });
  return Object.fromEntries([...plans].map((plan) => [
    plan,
    empty.map((row) => ({ date: row.date, count: values[`${plan}:${row.date}`] || 0 }))
  ]));
}

async function buildTopOrganizations({ start, end, orgId }) {
  const invoiceMatch = {
    status: 'PAID',
    $or: [
      { paid_at: { $gte: start, $lte: end } },
      { paid_at: null, updatedAt: { $gte: start, $lte: end } }
    ]
  };
  if (orgId) invoiceMatch.organization_id = orgId;
  const activityMatch = {
    action: { $in: ['LOGIN', 'PUBLISH_MAP'] },
    createdAt: { $gte: start, $lte: end }
  };
  if (orgId) activityMatch.organization_id = orgId;

  const [revenueRows, activityRows] = await Promise.all([
    Invoice.aggregate([
      { $match: invoiceMatch },
      { $group: { _id: '$organization_id', revenue: { $sum: '$amount' } } }
    ]),
    ActivityLog.find(activityMatch)
      .select('action organization_id user_id')
      .lean()
  ]);
  const missingUserIds = [...new Set(
    activityRows.filter((row) => !row.organization_id && row.user_id).map((row) => String(row.user_id))
  )];
  const users = missingUserIds.length
    ? await User.find({ _id: { $in: missingUserIds } }).select('_id organization_id').lean()
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
    ? await Organization.find({ _id: { $in: ids } }).select('name plan').lean()
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
  const [publishRows, qrRows] = await Promise.all([
    MapVersion.aggregate([
      { $match: mapMatch },
      { $group: { _id: '$building_id', publishes: { $sum: 1 } } }
    ]),
    QrScanLog.aggregate([
      { $match: qrMatch },
      { $group: { _id: '$building_id', qr_scans: { $sum: 1 } } }
    ])
  ]);
  const metrics = {};
  publishRows.forEach((row) => {
    if (row._id) metrics[String(row._id)] = { publishes: row.publishes, qr_scans: 0 };
  });
  qrRows.forEach((row) => {
    if (!row._id) return;
    const key = String(row._id);
    if (!metrics[key]) metrics[key] = { publishes: 0, qr_scans: 0 };
    metrics[key].qr_scans = row.qr_scans;
  });
  const ids = Object.keys(metrics);
  const buildings = ids.length
    ? await Building.find({ _id: { $in: ids } }).select('name organization_id').lean()
    : [];
  return buildings.map((building) => ({
    id: String(building._id),
    name: building.name,
    organization_id: building.organization_id,
    navigation_requests: null,
    ...metrics[String(building._id)]
  })).sort((a, b) => (b.publishes - a.publishes) || (b.qr_scans - a.qr_scans)).slice(0, 10);
}

async function buildOverview({ role, orgId, range, from, to }) {
  const { days, start, end, range: normalizedRange } = parseRange(range, from, to);
  const empty = emptySeries(start, end);
  const previous = previousPeriod(start, days);
  const buildingDocs = orgId
    ? await Building.find({ organization_id: orgId }).select('_id').lean()
    : null;
  const buildingIds = buildingDocs ? buildingDocs.map((building) => building._id) : null;

  const [
    loginRows,
    publishRows,
    paidDayRows,
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
    planRevenueRows,
    subscriptionMetrics,
    subscriptionTrend,
    topOrganizations,
    topBuildings
  ] = await Promise.all([
    countActivityByDay({ action: 'LOGIN', start, end, orgId }),
    countActivityByDay({ action: 'PUBLISH_MAP', start, end, orgId }),
    paidByDay({ start, end, orgId }),
    paidByMonth({ start, end, orgId }),
    buildPlanDistribution(orgId),
    qrScansByDay({ start, end, buildingIds }),
    countCreatedByDay(Organization, {
      start, end,
      match: orgId ? { _id: orgId } : {}
    }),
    countCreatedByDay(Building, { start, end, orgId }),
    countCreatedByDay(User, { start, end, orgId }),
    countCreatedByDay(Floor, {
      start, end,
      ...(buildingIds ? { orgField: 'building_id', orgId: { $in: buildingIds } } : {})
    }),
    countActivityByDay({ action: 'LOGIN', start: previous.start, end: previous.end, orgId }),
    countActivityByDay({ action: 'PUBLISH_MAP', start: previous.start, end: previous.end, orgId }),
    paidByDay({ start: previous.start, end: previous.end, orgId }),
    revenueByPlan({ start, end, orgId }),
    buildSubscriptionMetrics(orgId),
    buildSubscriptionTrend({ start, end, orgId, empty }),
    buildTopOrganizations({ start, end, orgId }),
    buildTopBuildings({ start, end, buildingIds })
  ]);

  const login_series = fillSeries(empty, loginRows);
  const publish_series = fillSeries(empty, publishRows);
  const paid_series = fillSeries(empty, paidDayRows, 'amount');
  const qr_series = fillSeries(empty, qrRows);
  const org_growth = fillSeries(empty, orgGrowthRows);
  const building_growth = fillSeries(empty, buildingGrowthRows);
  const user_growth = fillSeries(empty, userGrowthRows);
  const map_growth = fillSeries(empty, mapGrowthRows);

  const totals = {
    logins: login_series.reduce((s, r) => s + r.count, 0),
    publishes: publish_series.reduce((s, r) => s + r.count, 0),
    paid_invoices: paid_series.reduce((s, r) => s + r.count, 0),
    paid_amount: paid_series.reduce((s, r) => s + (r.amount || 0), 0)
  };
  const previousTotals = {
    logins: previousLoginRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
    publishes: previousPublishRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
    paid_invoices: previousPaidRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
    paid_amount: previousPaidRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  };
  const changes = {
    logins: deltaPct(totals.logins, previousTotals.logins),
    publishes: deltaPct(totals.publishes, previousTotals.publishes),
    paid_invoices: deltaPct(totals.paid_invoices, previousTotals.paid_invoices),
    paid_amount: deltaPct(totals.paid_amount, previousTotals.paid_amount)
  };
  const payingOrgIds = new Set();
  planRevenueRows.forEach((row) => (row.organizations || []).forEach((id) => payingOrgIds.add(String(id))));
  const arpu = payingOrgIds.size ? Math.round(totals.paid_amount / payingOrgIds.size) : 0;

  const [registrations, approvedRegistrations, expiringOrgs, draftCount] = await Promise.all([
    OrganizationRegistration.countDocuments({
      createdAt: { $gte: start, $lte: end },
      ...(orgId ? { organization_id: orgId } : {})
    }),
    OrganizationRegistration.countDocuments({
      status: 'APPROVED',
      createdAt: { $gte: start, $lte: end },
      ...(orgId ? { organization_id: orgId } : {})
    }),
    Organization.countDocuments({
      ...(orgId ? { _id: orgId } : {}),
      plan_expires_at: { $gte: new Date(), $lte: new Date(Date.now() + 14 * 86400000) }
    }),
    Draft.countDocuments(buildingIds ? { building_id: { $in: buildingIds } } : {})
  ]);

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
    const org = await Organization.findById(orgId).lean();
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
    scope: role === 'SUPER_ADMIN' ? 'platform' : 'organization',
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
      qr_scan: qr_series,
      navigation: empty.map((row) => ({ ...row, available: false }))
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
      organization_count: (row.organizations || []).length
    })),
    subscription: {
      distribution: subscriptionMetrics.distribution,
      mrr: subscriptionMetrics.mrr,
      arr: subscriptionMetrics.arr,
      arpu,
      organization_count: subscriptionMetrics.organization_count,
      trend: subscriptionTrend
    },
    conversion_funnel: {
      registrations,
      approved: approvedRegistrations,
      paid_organizations: payingOrgIds.size,
      enterprise: Number(subscriptionMetrics.distribution.ENTERPRISE) || 0
    },
    rankings: {
      organizations: topOrganizations,
      buildings: topBuildings,
      plans: planRevenueRows.map((row) => ({
        plan: row._id,
        revenue: row.amount || 0,
        invoice_count: row.invoice_count || 0,
        organization_count: (row.organizations || []).length
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

  if (role === 'SUPER_ADMIN') {
    const [graceOrgs, expiredOrgs, pendingRegs] = await Promise.all([
      Organization.find({ billing_status: 'GRACE_PERIOD' })
        .select('name slug plan billing_status grace_ends_at plan_expires_at')
        .limit(50)
        .lean(),
      Organization.find({ billing_status: 'EXPIRED' })
        .select('name slug plan billing_status plan_expires_at')
        .limit(50)
        .lean(),
      OrganizationRegistration.countDocuments({ status: 'PENDING' })
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
    const sampleOrgs = await Organization.find({ is_active: { $ne: false } })
      .select('name plan billing_status')
      .limit(40)
      .lean();
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
    const org = await Organization.findById(orgId);
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
