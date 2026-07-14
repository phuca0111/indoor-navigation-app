// Phase 6 — Analytics: aggregate realtime từ ActivityLog / Invoice / Organization
const ActivityLog = require('../models/ActivityLog');
const Invoice = require('../models/Invoice');
const Organization = require('../models/Organization');
const OrganizationRegistration = require('../models/OrganizationRegistration');
const User = require('../models/User');
const { getOrgQuotaSnapshot } = require('../utils/overQuotaLock');

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

function parseRange(range) {
  const days = RANGE_DAYS[String(range || '30d')] || 30;
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { days, start, end };
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

async function buildOverview({ role, orgId, range }) {
  const { days, start, end } = parseRange(range);
  const empty = emptySeries(start, end);

  const [loginRows, publishRows, paidDayRows, paidMonthRows, plan_distribution] = await Promise.all([
    countActivityByDay({ action: 'LOGIN', start, end, orgId }),
    countActivityByDay({ action: 'PUBLISH_MAP', start, end, orgId }),
    paidByDay({ start, end, orgId }),
    paidByMonth({ start, end, orgId }),
    buildPlanDistribution(orgId)
  ]);

  const login_series = fillSeries(empty, loginRows);
  const publish_series = fillSeries(empty, publishRows);
  const paid_series = fillSeries(empty, paidDayRows, 'amount');

  const totals = {
    logins: login_series.reduce((s, r) => s + r.count, 0),
    publishes: publish_series.reduce((s, r) => s + r.count, 0),
    paid_invoices: paid_series.reduce((s, r) => s + r.count, 0),
    paid_amount: paid_series.reduce((s, r) => s + (r.amount || 0), 0)
  };

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
    range: `${days}d`,
    period: { start: start.toISOString(), end: end.toISOString() },
    organization,
    plan_distribution,
    totals,
    series: {
      login: login_series,
      publish: publish_series,
      paid: paid_series
    },
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

async function buildTimeseries({ role, orgId, metric, range }) {
  const { days, start, end } = parseRange(range);
  const empty = emptySeries(start, end);
  const m = String(metric || 'login').toLowerCase();

  let rows;
  if (m === 'publish') {
    rows = await countActivityByDay({ action: 'PUBLISH_MAP', start, end, orgId });
    return {
      metric: 'publish',
      range: `${days}d`,
      series: fillSeries(empty, rows)
    };
  }
  if (m === 'paid') {
    rows = await paidByDay({ start, end, orgId });
    return {
      metric: 'paid',
      range: `${days}d`,
      series: fillSeries(empty, rows, 'amount')
    };
  }
  rows = await countActivityByDay({ action: 'LOGIN', start, end, orgId });
  return {
    metric: 'login',
    range: `${days}d`,
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
