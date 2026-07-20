/**
 * AD15/AD16 — Bundle Overview Dashboard
 * (range year/custom, health, QR nav, KPI delta/sparkline)
 */
const Organization = require('../models/Organization');
const OrganizationPlanHistory = require('../models/OrganizationPlanHistory');
const User = require('../models/User');
const OrganizationRegistration = require('../models/OrganizationRegistration');
const ActivityLog = require('../models/ActivityLog');
const QrScanLog = require('../models/QrScanLog');
const {
  getBuildingStats,
  getUserStats,
  getFloorStats,
  countActiveUsersToday
} = require('../controllers/platformStatsController');
const { getOrgQuotaSnapshot } = require('../utils/overQuotaLock');
const { buildAlerts } = require('./analyticsService');
const { buildReportSummary, buildRevenueExpenseProjectStats } = require('./financeReports');
const { listOrgsForBilling } = require('./financeService');
const { buildSystemHealth } = require('./systemHealthService');

function dateKey(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDay(raw, endOf) {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw).trim());
  if (!m) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    endOf ? 23 : 0,
    endOf ? 59 : 0,
    endOf ? 59 : 0,
    endOf ? 999 : 0
  );
}

function parseOverviewRange(range, from, to) {
  const customStart = parseDay(from, false);
  const customEnd = parseDay(to, true);
  if (customStart && customEnd && customStart <= customEnd) {
    const days = Math.max(1, Math.round((customEnd - customStart) / 86400000) + 1);
    return {
      key: 'custom',
      days,
      start: customStart,
      end: customEnd,
      from: dateKey(customStart),
      to: dateKey(customEnd)
    };
  }

  const r = String(range || '30d').toLowerCase();
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);

  if (r === 'today' || r === '1d') {
    start.setHours(0, 0, 0, 0);
    return { key: 'today', days: 1, start, end, from: dateKey(start), to: dateKey(end) };
  }
  if (r === 'month' || r === 'mtd') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    return { key: 'month', days, start, end, from: dateKey(start), to: dateKey(end) };
  }
  if (r === 'year' || r === 'ytd') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    return { key: 'year', days, start, end, from: dateKey(start), to: dateKey(end) };
  }
  const days = { '7d': 7, '30d': 30, '90d': 90 }[r] || 30;
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { key: `${days}d`, days, start, end, from: dateKey(start), to: dateKey(end) };
}

function previousPeriod(start, end) {
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - ms);
  prevStart.setHours(0, 0, 0, 0);
  prevEnd.setHours(23, 59, 59, 999);
  return { start: prevStart, end: prevEnd };
}

function pctDelta(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c === 0 ? 0 : 100;
  return Math.round(((c - p) / Math.abs(p)) * 1000) / 10;
}

function emptySeries(start, end) {
  const out = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  // Cap daily series length for year/custom dài
  const maxPoints = 120;
  const totalDays = Math.max(1, Math.round((last - cur) / 86400000) + 1);
  const step = totalDays > maxPoints ? Math.ceil(totalDays / maxPoints) : 1;
  while (cur <= last) {
    out.push({ date: dateKey(cur), count: 0 });
    cur.setDate(cur.getDate() + step);
  }
  if (!out.length || out[out.length - 1].date !== dateKey(last)) {
    out.push({ date: dateKey(last), count: 0 });
  }
  return out;
}

function fillSeries(empty, rows) {
  const map = Object.fromEntries(empty.map((r) => [r.date, { ...r }]));
  rows.forEach((row) => {
    const key = row._id;
    if (map[key]) {
      map[key].count = (map[key].count || 0) + (row.count || 0);
      return;
    }
    // bucket into nearest previous bucket for stepped series
    const keys = Object.keys(map).sort();
    let target = keys[0];
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] <= key) target = keys[i];
      else break;
    }
    if (target) map[target].count = (map[target].count || 0) + (row.count || 0);
  });
  return Object.keys(map).sort().map((k) => map[k]);
}

async function settle(fn) {
  try {
    const data = await fn();
    return { status: 'ready', data };
  } catch (err) {
    return { status: 'error', message: err.message || 'Lỗi', data: null };
  }
}

function emptyPlanCounter(extraKeys = []) {
  const { getKnownPlanCodes } = require('./planCatalog');
  const map = {};
  getKnownPlanCodes().forEach((code) => {
    map[code] = 0;
  });
  (extraKeys || []).forEach((key) => {
    const code = String(key || '').toUpperCase();
    if (code) map[code] = 0;
  });
  if (map.FREE == null) map.FREE = 0;
  return map;
}

function ensurePlanKey(map, plan) {
  const code = String(plan || 'FREE').toUpperCase();
  if (map[code] == null) map[code] = 0;
  return code;
}

async function buildPlanDistribution(orgId, start, end) {
  const { ensureDefaultPlans } = require('./planCatalog');
  await ensureDefaultPlans();

  const dist = emptyPlanCounter();
  const active = emptyPlanCounter();
  const grace = emptyPlanCounter();
  const expired = emptyPlanCounter();

  if (orgId) {
    const org = await Organization.findById(orgId).select('plan is_active billing_status').lean();
    const plan = ensurePlanKey(dist, org?.plan);
    ensurePlanKey(active, plan);
    ensurePlanKey(grace, plan);
    ensurePlanKey(expired, plan);
    dist[plan] = 1;
    const billing = String(org?.billing_status || 'ACTIVE').toUpperCase();
    const accountOn = org?.is_active !== false;
    if (accountOn && billing === 'ACTIVE') active[plan] = 1;
    else if (accountOn && billing === 'GRACE_PERIOD') grace[plan] = 1;
    else expired[plan] = 1;
  } else {
    const rows = await Organization.aggregate([
      {
        $group: {
          _id: { $ifNull: ['$plan', 'FREE'] },
          count: { $sum: 1 },
          active: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$is_active', false] },
                    { $eq: [{ $ifNull: ['$billing_status', 'ACTIVE'] }, 'ACTIVE'] }
                  ]
                },
                1,
                0
              ]
            }
          },
          grace: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$is_active', false] },
                    { $eq: ['$billing_status', 'GRACE_PERIOD'] }
                  ]
                },
                1,
                0
              ]
            }
          },
          expired: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$is_active', false] },
                    { $eq: ['$billing_status', 'EXPIRED'] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);
    rows.forEach((row) => {
      const plan = ensurePlanKey(dist, row._id);
      ensurePlanKey(active, plan);
      ensurePlanKey(grace, plan);
      ensurePlanKey(expired, plan);
      dist[plan] = row.count || 0;
      active[plan] = row.active || 0;
      grace[plan] = row.grace || 0;
      expired[plan] = row.expired || 0;
    });

    // Cộng tài khoản cá nhân (REGISTERED_USER) trả phí còn hạn vào phân bố gói
    const now = new Date();
    const personalRows = await User.aggregate([
      {
        $match: {
          role: 'REGISTERED_USER',
          plan: { $nin: [null, '', 'FREE'] },
          plan_expires_at: { $gt: now }
        }
      },
      {
        $group: {
          _id: { $ifNull: ['$plan', 'FREE'] },
          count: { $sum: 1 }
        }
      }
    ]);
    personalRows.forEach((row) => {
      const plan = ensurePlanKey(dist, row._id);
      ensurePlanKey(active, plan);
      const n = row.count || 0;
      dist[plan] = (dist[plan] || 0) + n;
      active[plan] = (active[plan] || 0) + n;
    });
  }

  if (!(start instanceof Date) || !(end instanceof Date)) {
    return { ...dist, active, grace, expired };
  }

  const historyMatch = { createdAt: { $gte: start, $lte: end } };
  if (orgId) historyMatch.organization_id = orgId;
  const orgMatch = { createdAt: { $gte: start, $lte: end } };
  if (orgId) orgMatch._id = orgId;

  const [histories, createdOrgs] = await Promise.all([
    OrganizationPlanHistory.find(historyMatch)
      .select('organization_id from_plan to_plan createdAt')
      .sort({ createdAt: 1 })
      .lean(),
    Organization.find(orgMatch).select('_id plan createdAt').lean()
  ]);

  const validPlan = (value) => ensurePlanKey(dist, value);
  const historiesByOrg = new Map();
  histories.forEach((row) => {
    const key = String(row.organization_id || '');
    if (!historiesByOrg.has(key)) historiesByOrg.set(key, []);
    historiesByOrg.get(key).push(row);
  });

  const events = [];
  createdOrgs.forEach((org) => {
    const firstChange = (historiesByOrg.get(String(org._id)) || [])[0];
    const initialPlan = validPlan(firstChange?.from_plan || org.plan);
    events.push({ date: org.createdAt, plan: initialPlan, delta: 1 });
  });
  histories.forEach((row) => {
    const fromPlan = validPlan(row.from_plan);
    const toPlan = validPlan(row.to_plan);
    if (fromPlan === toPlan) return;
    events.push({ date: row.createdAt, plan: fromPlan, delta: -1 });
    events.push({ date: row.createdAt, plan: toPlan, delta: 1 });
  });

  const planKeys = Object.keys(dist);
  const deltas = emptyPlanCounter(planKeys);
  events.forEach((event) => {
    ensurePlanKey(deltas, event.plan);
    deltas[event.plan] += event.delta;
  });

  const buckets = emptySeries(start, end);
  const bucketKeys = buckets.map((row) => row.date);
  const bucketEvents = Object.fromEntries(
    bucketKeys.map((key) => [key, emptyPlanCounter(planKeys)])
  );
  events.forEach((event) => {
    const key = dateKey(event.date);
    let target = bucketKeys[0];
    for (let index = 0; index < bucketKeys.length; index++) {
      if (bucketKeys[index] <= key) target = bucketKeys[index];
      else break;
    }
    if (target) {
      ensurePlanKey(bucketEvents[target], event.plan);
      bucketEvents[target][event.plan] += event.delta;
    }
  });

  const running = {};
  const series = {};
  planKeys.forEach((plan) => {
    running[plan] = Math.max(0, (dist[plan] || 0) - (deltas[plan] || 0));
    series[plan] = [];
  });
  bucketKeys.forEach((key) => {
    planKeys.forEach((plan) => {
      running[plan] = Math.max(0, running[plan] + (bucketEvents[key][plan] || 0));
      series[plan].push({ date: key, count: running[plan] });
    });
  });

  const newSubscriptions = fillSeries(
    buckets,
    createdOrgs.reduce((rows, org) => {
      const key = dateKey(org.createdAt);
      const row = rows.find((item) => item._id === key);
      if (row) row.count += 1;
      else rows.push({ _id: key, count: 1 });
      return rows;
    }, [])
  );
  const newByPlan = emptyPlanCounter(planKeys);
  events.forEach((event) => {
    if (event.delta > 0) {
      ensurePlanKey(newByPlan, event.plan);
      newByPlan[event.plan] += 1;
    }
  });

  // Nâng cấp cá nhân trong kỳ (PersonalPayment PAID) — hiện ở cột «Mới trong kỳ»
  if (!orgId) {
    try {
      const PersonalPayment = require('../models/PersonalPayment');
      const personalPaid = await PersonalPayment.aggregate([
        {
          $match: {
            status: 'PAID',
            purpose: 'UPGRADE',
            paid_at: { $gte: start, $lte: end }
          }
        },
        { $group: { _id: { $ifNull: ['$plan', 'PRO'] }, count: { $sum: 1 } } }
      ]);
      personalPaid.forEach((row) => {
        const plan = validPlan(row._id);
        ensurePlanKey(newByPlan, plan);
        ensurePlanKey(deltas, plan);
        const n = row.count || 0;
        newByPlan[plan] += n;
        deltas[plan] += n;
      });
    } catch (_) { /* ignore */ }
  }

  const upgrades = {
    freeToPro: 0,
    proToEnterprise: 0,
    freeToEnterprise: 0,
    total: 0
  };
  const { getPlanPrice } = require('./planCatalog');
  const planRank = (code) => {
    if (code === 'FREE') return 0;
    return getPlanPrice(code) > 0 ? 1 + Math.min(getPlanPrice(code) / 1e9, 1) : 0;
  };
  histories.forEach((row) => {
    const fromPlan = validPlan(row.from_plan);
    const toPlan = validPlan(row.to_plan);
    if (planRank(toPlan) <= planRank(fromPlan)) return;
    upgrades.total += 1;
    if (fromPlan === 'FREE' && toPlan === 'PRO') upgrades.freeToPro += 1;
    if (fromPlan === 'PRO' && toPlan === 'ENTERPRISE') upgrades.proToEnterprise += 1;
    if (fromPlan === 'FREE' && toPlan === 'ENTERPRISE') upgrades.freeToEnterprise += 1;
  });

  return {
    ...dist,
    active,
    grace,
    expired,
    deltas,
    series,
    newSubscriptions,
    newByPlan,
    upgrades,
    planKeys
  };
}

/**
 * Super Admin — chăm sóc khách: sắp hết hạn / Grace / Expired / Archived + doanh thu treo (MRR gói).
 */
async function buildBillingCare() {
  const { getPlanPrice, isPaidPlan } = require('./planCatalog');
  const now = Date.now();
  const in15d = new Date(now + 15 * 24 * 60 * 60 * 1000);

  const [expiringSoon, grace, expired, archived] = await Promise.all([
    Organization.find({
      is_active: { $ne: false },
      billing_status: 'ACTIVE',
      plan_expires_at: { $ne: null, $gte: new Date(now), $lte: in15d }
    }).select('name slug plan plan_expires_at billing_status').sort({ plan_expires_at: 1 }).limit(20).lean(),
    Organization.find({
      is_active: { $ne: false },
      billing_status: 'GRACE_PERIOD'
    }).select('name slug plan grace_ends_at plan_expires_at billing_status').sort({ grace_ends_at: 1 }).limit(20).lean(),
    Organization.find({
      billing_status: 'EXPIRED'
    }).select('name slug plan plan_expires_at billing_expired_at billing_status').sort({ billing_expired_at: -1 }).limit(20).lean(),
    Organization.find({
      billing_status: 'ARCHIVED'
    }).select('name slug plan archived_at billing_status').sort({ archived_at: -1 }).limit(20).lean()
  ]);

  const suspendedOrgs = [...grace, ...expired, ...archived];
  let suspendedMrr = 0;
  suspendedOrgs.forEach((o) => {
    if (isPaidPlan(o.plan)) suspendedMrr += getPlanPrice(o.plan) || 0;
  });

  return {
    counts: {
      expiring_soon: expiringSoon.length,
      grace: grace.length,
      expired: expired.length,
      archived: archived.length
    },
    // Ước lượng doanh thu treo = tổng giá/tháng các org đang Grace/Expired/Archived
    suspended_mrr_vnd: suspendedMrr,
    lists: {
      expiring_soon: expiringSoon,
      grace,
      expired,
      archived
    }
  };
}

// AD25 — Doanh thu theo gói + KPI MRR/ARR/Renew/Churn cho widget Gói đăng ký
async function buildSubscriptionInsights(start, end) {
  const { getPlanPrice, ensureDefaultPlans, isPaidPlan } = require('./planCatalog');
  const Invoice = require('../models/Invoice');
  const OrganizationBillingEvent = require('../models/OrganizationBillingEvent');
  await ensureDefaultPlans();

  const revenue = emptyPlanCounter();
  let revenueTotal = 0;
  if (start instanceof Date && end instanceof Date) {
    const revenueRows = await Invoice.aggregate([
      {
        $match: {
          status: 'PAID',
          $or: [
            { paid_at: { $gte: start, $lte: end } },
            { paid_at: null, createdAt: { $gte: start, $lte: end } }
          ]
        }
      },
      {
        $group: {
          _id: { $ifNull: ['$plan', 'UNKNOWN'] },
          amount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    revenueRows.forEach((row) => {
      const plan = ensurePlanKey(revenue, row._id);
      const amount = Number(row.amount) || 0;
      revenueTotal += amount;
      revenue[plan] += amount;
    });
  }

  // MRR: tổng giá gói của org trả phí đang hiệu lực
  const activeOrgs = await Organization.find({
    is_active: { $ne: false },
    billing_status: { $in: ['ACTIVE', 'GRACE_PERIOD'] },
    plan: { $ne: 'FREE' }
  }).select('plan').lean();
  let mrr = 0;
  let paidNow = 0;
  activeOrgs.forEach((org) => {
    if (!isPaidPlan(org.plan)) return;
    paidNow += 1;
    mrr += getPlanPrice(org.plan) || 0;
  });

  // Cộng thêm gói CÁ NHÂN (REGISTERED_USER) trả phí còn hiệu lực để MRR khớp doanh thu.
  const now = new Date();
  const paidPersonalUsers = await User.find({
    role: 'REGISTERED_USER',
    plan: { $ne: 'FREE' },
    plan_expires_at: { $gt: now }
  }).select('plan').lean();
  let personalMrr = 0;
  let personalPaid = 0;
  paidPersonalUsers.forEach((u) => {
    if (!isPaidPlan(u.plan)) return;
    personalPaid += 1;
    personalMrr += getPlanPrice(u.plan) || 0;
  });
  mrr += personalMrr;
  paidNow += personalPaid;
  const arr = mrr * 12;

  let renewals = 0;
  let churned = 0;
  if (start instanceof Date && end instanceof Date) {
    [renewals, churned] = await Promise.all([
      OrganizationBillingEvent.countDocuments({
        event_type: 'SUBSCRIPTION_RENEWED',
        payment_status: 'PAID',
        createdAt: { $gte: start, $lte: end }
      }),
      OrganizationBillingEvent.countDocuments({
        event_type: 'SUBSCRIPTION_EXPIRED',
        createdAt: { $gte: start, $lte: end }
      })
    ]);
  }
  const renewBase = renewals + churned;
  const renewRate = renewBase > 0 ? Math.round((renewals / renewBase) * 100) : null;
  const churnBase = paidNow + churned;
  const churnRate = churnBase > 0 ? Math.round((churned / churnBase) * 1000) / 10 : 0;

  return {
    revenue,
    revenueTotal,
    kpi: { mrr, arr, paid: paidNow, renewals, churned, renewRate, churnRate }
  };
}

async function buildOrgGrowthSeries(start, end) {
  const empty = emptySeries(start, end);
  const rows = await Organization.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 }
      }
    }
  ]);
  return fillSeries(empty, rows);
}

async function sumOrgCreated(start, end) {
  return Organization.countDocuments({ createdAt: { $gte: start, $lte: end } });
}

async function countActiveUsersBetween(orgFilter, start, end) {
  return User.countDocuments({
    ...(orgFilter || {}),
    role: { $ne: 'SUPER_ADMIN' },
    last_login: { $gte: start, $lte: end }
  });
}

async function buildHourlyLoginSeries(orgFilter) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const match = {
    action: 'LOGIN',
    createdAt: { $gte: start, $lte: end }
  };

  if (orgFilter?.organization_id) {
    const users = await User.find({ organization_id: orgFilter.organization_id })
      .select('_id')
      .lean();
    match.user_id = { $in: users.map((u) => u._id) };
  }

  const rows = await ActivityLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $hour: {
            date: '$createdAt',
            timezone: 'Asia/Ho_Chi_Minh'
          }
        },
        count: { $sum: 1 }
      }
    }
  ]);
  const byHour = Object.fromEntries(rows.map((r) => [Number(r._id), r.count || 0]));
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    count: byHour[hour] || 0
  }));
}

async function buildNavigationActivity(start, end, buildingIds) {
  const match = { scanned_at: { $gte: start, $lte: end } };
  if (buildingIds?.length) match.building_id = { $in: buildingIds };

  const empty = emptySeries(start, end);
  const [total, rows, distinctQr] = await Promise.all([
    QrScanLog.countDocuments(match),
    QrScanLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$scanned_at' } },
          count: { $sum: 1 }
        }
      }
    ]),
    QrScanLog.distinct('qr_code', match)
  ]);

  return {
    sessions: total,
    qr_scans: total,
    completed_routes: 0,
    unique_qr: (distinctQr || []).length,
    series: fillSeries(empty, rows),
    note: 'Sessions ≈ lượt quét QR (GET /api/qr). Completed routes chưa có từ app.'
  };
}

async function buildRecentActivities({ role, orgId, assignedBuildingIds, limit = 10 }) {
  const filter = {};
  if (role === 'ORG_ADMIN' && orgId) {
    const users = await User.find({ organization_id: orgId }).select('_id').lean();
    filter.user_id = { $in: users.map((u) => u._id) };
  } else if (role === 'BUILDING_ADMIN') {
    if (!assignedBuildingIds?.length) return [];
    filter.$or = [
      { target_id: { $in: assignedBuildingIds.map(String) } },
      { 'details.building_id': { $in: assignedBuildingIds.map(String) } }
    ];
  }
  const logs = await ActivityLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('user_id', 'email full_name role')
    .lean();
  return logs.map((l) => ({
    id: String(l._id),
    action: l.action,
    target: l.target || '',
    target_id: l.target_id || '',
    createdAt: l.createdAt,
    user: l.user_id
      ? {
          email: l.user_id.email,
          full_name: l.user_id.full_name,
          role: l.user_id.role
        }
      : null
  }));
}

async function buildPlatformKpi() {
  const [orgTotal, orgActive, orgInactive, pendingRegs, pro, enterprise] = await Promise.all([
    Organization.countDocuments({}),
    Organization.countDocuments({ is_active: { $ne: false } }),
    Organization.countDocuments({ is_active: false }),
    OrganizationRegistration.countDocuments({ status: 'PENDING' }),
    Organization.countDocuments({ plan: 'PRO', is_active: { $ne: false } }),
    Organization.countDocuments({ plan: 'ENTERPRISE', is_active: { $ne: false } })
  ]);
  const [buildings, users, floors, activeUsersToday] = await Promise.all([
    getBuildingStats({}),
    getUserStats({}),
    getFloorStats(null),
    countActiveUsersToday({})
  ]);
  return {
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

async function buildOrgKpi(orgId) {
  const orgDoc = await Organization.findById(orgId);
  const orgFilter = { organization_id: orgId };
  const [buildings, users, floors, activeUsersToday, quota] = await Promise.all([
    getBuildingStats(orgFilter),
    getUserStats(orgFilter),
    getFloorStats(orgFilter),
    countActiveUsersToday(orgFilter),
    getOrgQuotaSnapshot(orgDoc)
  ]);
  const org = orgDoc ? orgDoc.toObject() : null;
  return {
    organization: org
      ? {
          id: String(org._id),
          name: org.name,
          plan: org.plan || 'FREE',
          is_active: org.is_active !== false,
          billing_status: org.billing_status || 'ACTIVE'
        }
      : { id: String(orgId) },
    buildings,
    floors,
    users,
    active_users_today: activeUsersToday,
    quota
  };
}

async function buildAssignedKpi(userId) {
  const user = await User.findById(userId).select('assigned_buildings organization_id').lean();
  const assignedIds = (user?.assigned_buildings || []).map(String);
  const orgFilter = assignedIds.length
    ? { _id: { $in: assignedIds }, organization_id: user.organization_id }
    : { _id: null };
  const orgDoc = user?.organization_id
    ? await Organization.findById(user.organization_id)
    : null;
  const [buildings, floors, quota] = await Promise.all([
    getBuildingStats(orgFilter),
    getFloorStats(orgFilter),
    orgDoc ? getOrgQuotaSnapshot(orgDoc) : null
  ]);
  return {
    buildings: { ...buildings, assigned: assignedIds.length },
    floors,
    active_users_today: null,
    quota,
    assigned_building_ids: assignedIds
  };
}

async function buildTopOrganizations(limit = 5) {
  const { organizations } = await listOrgsForBilling({});
  return [...organizations]
    .sort((a, b) => (Number(b.paid_amount) || 0) - (Number(a.paid_amount) || 0))
    .slice(0, limit)
    .map((o) => ({
      id: String(o._id),
      name: o.name,
      plan: o.plan || 'FREE',
      billing_status: o.billing_status || 'ACTIVE',
      paid_amount: o.paid_amount || 0,
      invoice_count: o.invoice_count || 0,
      open_invoices: o.open_invoices || 0
    }));
}

async function attachKpiInsights(kpiWidget, { start, end, orgFilter }) {
  if (kpiWidget.status !== 'ready' || !kpiWidget.data) return;
  const prev = previousPeriod(start, end);
  const yesterdayStart = new Date();
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const [orgsNow, orgsPrev, usersYday, growthSeries, hourlyUsers] = await Promise.all([
    sumOrgCreated(start, end),
    sumOrgCreated(prev.start, prev.end),
    countActiveUsersBetween(orgFilter || {}, yesterdayStart, yesterdayEnd),
    orgFilter ? Promise.resolve([]) : buildOrgGrowthSeries(start, end),
    buildHourlyLoginSeries(orgFilter || {})
  ]);

  const usersToday = kpiWidget.data.active_users_today || 0;
  kpiWidget.data.deltas = {
    orgs_new: {
      current: orgsNow,
      previous: orgsPrev,
      pct: pctDelta(orgsNow, orgsPrev)
    },
    active_users_today: {
      current: usersToday,
      previous: usersYday,
      pct: pctDelta(usersToday, usersYday)
    }
  };
  if (kpiWidget.data.revenue) {
    const prevRev = await buildReportSummary({
      from: dateKey(prev.start),
      to: dateKey(prev.end)
    });
    kpiWidget.data.deltas.revenue = {
      current: kpiWidget.data.revenue.amount || 0,
      previous: prevRev.revenue || 0,
      pct: pctDelta(kpiWidget.data.revenue.amount || 0, prevRev.revenue || 0)
    };
  }
  const orgGrowthValues = (growthSeries || []).map((r) => r.count || 0);
  const newOrgTotal = orgGrowthValues.reduce((sum, n) => sum + n, 0);
  let runningOrgTotal = Math.max(
    0,
    Number(kpiWidget.data.organizations?.active || 0) - newOrgTotal
  );
  const cumulativeOrgGrowth = orgGrowthValues.map((n) => {
    runningOrgTotal += n;
    return runningOrgTotal;
  });
  kpiWidget.data.sparklines = {
    org_growth: cumulativeOrgGrowth,
    users_hourly: hourlyUsers.map((r) => r.count || 0)
  };
  kpiWidget.data.hourly_users = hourlyUsers;
}

/**
 * @param {{ user: object, range?: string, from?: string, to?: string,
 *   subscription_range?: string, subscription_from?: string, subscription_to?: string }} opts
 */
async function buildOverviewDashboard(opts = {}) {
  const user = opts.user || {};
  const role = user.role;
  const { key, days, start, end, from, to } = parseOverviewRange(opts.range, opts.from, opts.to);
  const fromStr = from;
  const toStr = to;

  // Bộ lọc riêng cho widget «Tổng quan gói đăng ký» — không ảnh hưởng Tăng trưởng tổ chức
  const hasSubRange = opts.subscription_range != null && String(opts.subscription_range).trim() !== '';
  const subParsed = hasSubRange
    ? parseOverviewRange(opts.subscription_range, opts.subscription_from, opts.subscription_to)
    : { key, days, start, end, from, to };
  const subStart = subParsed.start;
  const subEnd = subParsed.end;

  const base = {
    range: key,
    days,
    period: { start: start.toISOString(), end: end.toISOString(), from: fromStr, to: toStr },
    subscription_range: subParsed.key,
    subscription_days: subParsed.days,
    subscription_period: {
      start: subStart.toISOString(),
      end: subEnd.toISOString(),
      from: subParsed.from,
      to: subParsed.to
    }
  };

  if (role === 'SUPER_ADMIN') {
    const [
      kpi,
      org_growth,
      revenue_expense,
      map_publish,
      subscription,
      top_organizations,
      recent_activities,
      recent_alerts,
      navigation_activity,
      system_health,
      billing_care
    ] = await Promise.all([
      settle(buildPlatformKpi),
      settle(async () => ({ series: await buildOrgGrowthSeries(start, end) })),
      settle(async () => {
        const [summary, chart] = await Promise.all([
          buildReportSummary({ from: fromStr, to: toStr }),
          buildRevenueExpenseProjectStats()
        ]);
        return { ...summary, ...chart };
      }),
      settle(async () => {
        const buildings = await getBuildingStats({});
        return {
          published: buildings.published,
          draft: buildings.draft,
          inactive: buildings.inactive,
          total_active: buildings.total_active
        };
      }),
      settle(async () => {
        const [dist, insights] = await Promise.all([
          buildPlanDistribution(null, subStart, subEnd),
          buildSubscriptionInsights(subStart, subEnd)
        ]);
        return { ...dist, ...insights };
      }),
      settle(() => buildTopOrganizations(5)),
      settle(() => buildRecentActivities({ role, limit: 10 })),
      settle(async () => {
        const { alerts } = await buildAlerts({ role: 'SUPER_ADMIN', orgId: null });
        return { alerts: (alerts || []).slice(0, 8), count: (alerts || []).length };
      }),
      settle(() => buildNavigationActivity(start, end, null)),
      settle(buildSystemHealth),
      settle(buildBillingCare)
    ]);

    if (kpi.status === 'ready' && revenue_expense.status === 'ready') {
      kpi.data.revenue = {
        amount: revenue_expense.data.revenue || 0,
        expense: revenue_expense.data.expense || 0,
        profit: revenue_expense.data.profit || 0,
        currency: 'VND'
      };
    }
    await attachKpiInsights(kpi, { start, end, orgFilter: null });

    return {
      ...base,
      scope: 'platform',
      widgets: {
        kpi,
        org_growth,
        revenue_expense,
        navigation_activity,
        map_publish,
        subscription,
        top_organizations,
        billing_care,
        system_health,
        recent_activities,
        recent_alerts
      }
    };
  }

  if (role === 'ORG_ADMIN') {
    const orgId = user.organization_id;
    if (!orgId) {
      const err = new Error('Tài khoản ORG_ADMIN chưa được gán tổ chức.');
      err.status = 403;
      throw err;
    }

    const Building = require('../models/Building');
    const buildingIds = (await Building.find({ organization_id: orgId }).select('_id').lean()).map((b) => b._id);

    const [
      kpi,
      map_publish,
      subscription,
      recent_activities,
      recent_alerts,
      navigation_activity,
      system_health
    ] = await Promise.all([
      settle(() => buildOrgKpi(orgId)),
      settle(async () => {
        const buildings = await getBuildingStats({ organization_id: orgId });
        return {
          published: buildings.published,
          draft: buildings.draft,
          inactive: buildings.inactive,
          total_active: buildings.total_active
        };
      }),
      settle(() => buildPlanDistribution(orgId, subStart, subEnd)),
      settle(() => buildRecentActivities({ role, orgId, limit: 10 })),
      settle(async () => {
        const { alerts } = await buildAlerts({ role: 'ORG_ADMIN', orgId });
        return { alerts: (alerts || []).slice(0, 8), count: (alerts || []).length };
      }),
      settle(() => buildNavigationActivity(start, end, buildingIds)),
      settle(buildSystemHealth)
    ]);

    await attachKpiInsights(kpi, { start, end, orgFilter: { organization_id: orgId } });

    return {
      ...base,
      scope: 'organization',
      widgets: {
        kpi,
        org_growth: {
          status: 'unavailable',
          message: 'Biểu đồ tăng trưởng tổ chức chỉ dành cho Super Admin.',
          data: null
        },
        revenue_expense: {
          status: 'unavailable',
          message: 'Thu–chi nền tảng chỉ dành cho Super / Finance Admin.',
          data: null
        },
        navigation_activity,
        map_publish,
        subscription,
        top_organizations: {
          status: 'unavailable',
          message: 'Top tổ chức chỉ dành cho Super Admin.',
          data: null
        },
        billing_care: {
          status: 'unavailable',
          message: 'Chăm sóc gói tổ chức chỉ dành cho Super Admin.',
          data: null
        },
        system_health,
        recent_activities,
        recent_alerts
      }
    };
  }

  if (role === 'BUILDING_ADMIN') {
    const kpi = await settle(() => buildAssignedKpi(user.userId));
    const assignedIds = kpi.data?.assigned_building_ids || [];
    const map_publish = await settle(async () => {
      const orgFilter = assignedIds.length
        ? { _id: { $in: assignedIds } }
        : { _id: null };
      const buildings = await getBuildingStats(orgFilter);
      return {
        published: buildings.published,
        draft: buildings.draft,
        inactive: buildings.inactive,
        total_active: buildings.total_active
      };
    });
    const recent_activities = await settle(() =>
      buildRecentActivities({ role, assignedBuildingIds: assignedIds, limit: 10 })
    );
    const navigation_activity = await settle(() =>
      buildNavigationActivity(start, end, assignedIds)
    );
    const system_health = await settle(buildSystemHealth);

    return {
      ...base,
      scope: 'assigned',
      widgets: {
        kpi,
        org_growth: { status: 'unavailable', message: 'Không áp dụng cho Building Admin.', data: null },
        revenue_expense: { status: 'unavailable', message: 'Không áp dụng cho Building Admin.', data: null },
        navigation_activity,
        map_publish,
        subscription: { status: 'unavailable', message: 'Không áp dụng cho Building Admin.', data: null },
        top_organizations: { status: 'unavailable', message: 'Không áp dụng cho Building Admin.', data: null },
        billing_care: { status: 'unavailable', message: 'Không áp dụng cho Building Admin.', data: null },
        system_health,
        recent_activities,
        recent_alerts: {
          status: 'unavailable',
          message: 'Cảnh báo billing không áp dụng cho Building Admin.',
          data: null
        }
      }
    };
  }

  const err = new Error('Không có quyền xem Tổng quan.');
  err.status = 403;
  throw err;
}

module.exports = {
  parseOverviewRange,
  buildOverviewDashboard
};
