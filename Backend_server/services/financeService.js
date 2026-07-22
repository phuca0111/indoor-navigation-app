// Finance Dashboard KPI (Super / Finance Admin) — Phase 7 read repository
const financeRead = require('../repositories/financeReadRepository');

/** Đồng bộ với financeReports / overview — bucket theo ngày giờ VN */
const REPORT_TZ = process.env.REPORT_TIMEZONE || 'Asia/Ho_Chi_Minh';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function monthKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

async function sumPaidAmount(start, end) {
  const rows = await financeRead.aggregateInvoices([
    {
      $match: {
        status: 'PAID',
        $or: [
          { paid_at: { $gte: start, $lte: end } },
          { paid_at: null, updatedAt: { $gte: start, $lte: end } }
        ]
      }
    },
    {
      $group: {
        _id: null,
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  const legacy = {
    amount: rows[0]?.amount || 0,
    count: rows[0]?.count || 0
  };
  const { isLedgerReadV2, ledgerTotals } = require('./ledgerReadService');
  if (!isLedgerReadV2()) return legacy;
  const ledger = await ledgerTotals(start, end);
  return { amount: ledger.revenue, count: ledger.revenue_count };
}

async function sumExpenseAmount(start, end) {
  // C1 — tổng chi = tổng dòng sổ (EXPENSE + REVERSAL âm)
  const rows = await financeRead.aggregateExpenseLedger([
    {
      $match: {
        expense_date: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: null,
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  const legacy = {
    amount: rows[0]?.amount || 0,
    count: rows[0]?.count || 0
  };
  const { isLedgerReadV2, ledgerTotals } = require('./ledgerReadService');
  if (!isLedgerReadV2()) return legacy;
  const ledger = await ledgerTotals(start, end);
  return { amount: ledger.expense, count: ledger.expense_count };
}

async function revenueByMonth(monthsBack = 12) {
  const end = endOfDay();
  const start = startOfMonth();
  start.setMonth(start.getMonth() - (monthsBack - 1));

  const rows = await financeRead.aggregateInvoices([
    {
      $match: {
        status: 'PAID',
        $or: [
          { paid_at: { $gte: start, $lte: end } },
          { paid_at: null, updatedAt: { $gte: start, $lte: end } }
        ]
      }
    },
    {
      $addFields: {
        paidDay: { $ifNull: ['$paid_at', '$updatedAt'] }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m', date: '$paidDay', timezone: REPORT_TZ }
        },
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const map = Object.fromEntries(rows.map((r) => [r._id, r]));
  const out = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = monthKey(cursor);
    out.push({
      month: key,
      amount: map[key]?.amount || 0,
      count: map[key]?.count || 0
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

async function revenueByPlan() {
  const rows = await financeRead.aggregateInvoices([
    { $match: { status: 'PAID' } },
    {
      $group: {
        _id: { $ifNull: ['$plan', 'UNKNOWN'] },
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
  const out = {};
  rows.forEach((r) => {
    out[r._id] = { amount: r.amount || 0, count: r.count || 0 };
  });
  return out;
}

async function expenseByCategory(start, end) {
  const rows = await financeRead.aggregateExpenseLedger([
    { $match: { expense_date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: '$category',
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { amount: -1 } }
  ]);
  return rows.map((r) => ({
    category: r._id || 'OTHER',
    amount: r.amount || 0,
    count: r.count || 0
  }));
}

async function orgBillingSnapshot() {
  const orgs = await financeRead.listOrganizationsForBilling(
      'name slug plan billing_status is_active plan_expires_at grace_ends_at plan_started_at createdAt'
    );

  const counts = {
    total: orgs.length,
    active: 0,
    free_trial: 0,
    paid_plans: 0,
    grace: 0,
    expired: 0,
    inactive: 0
  };

  const now = Date.now();
  const soonMs = 7 * 24 * 60 * 60 * 1000;
  const expiring_soon = [];

  for (const org of orgs) {
    if (org.is_active === false) {
      counts.inactive += 1;
      continue;
    }
    counts.active += 1;
    const plan = String(org.plan || 'FREE').toUpperCase();
    const billing = String(org.billing_status || 'ACTIVE').toUpperCase();
    if (plan === 'FREE') counts.free_trial += 1;
    else counts.paid_plans += 1;
    if (billing === 'GRACE_PERIOD') counts.grace += 1;
    if (billing === 'EXPIRED') counts.expired += 1;

    if (org.plan_expires_at) {
      const exp = new Date(org.plan_expires_at).getTime();
      if (exp >= now && exp <= now + soonMs) {
        expiring_soon.push({
          _id: org._id,
          name: org.name,
          plan: org.plan,
          billing_status: org.billing_status,
          plan_expires_at: org.plan_expires_at
        });
      }
    }
  }

  expiring_soon.sort(
    (a, b) => new Date(a.plan_expires_at) - new Date(b.plan_expires_at)
  );

  return { counts, expiring_soon: expiring_soon.slice(0, 20), orgs };
}

async function pendingInvoices(limit = 20) {
  return financeRead.findInvoices({ status: 'OPEN' }, {
    sort: { due_at: 1, createdAt: -1 },
    limit,
    populate: { path: 'organization_id', select: 'name slug plan' }
  });
}

async function recentFinanceActivity(limit = 15) {
  const [paid, expenses] = await Promise.all([
    financeRead.findInvoices({ status: 'PAID' }, {
      sort: { paid_at: -1, updatedAt: -1 },
      limit,
      populate: { path: 'organization_id', select: 'name' }
    }),
    financeRead.findExpenses({ voided_at: null }, {
      sort: { expense_date: -1, createdAt: -1 },
      limit
    })
  ]);

  const events = [];
  paid.forEach((inv) => {
    const isPersonal =
      !inv.organization_id ||
      inv.metadata?.scope === 'personal' ||
      String(inv.external_ref || '').startsWith('PERSONAL-');
    const personalLabel = inv.metadata?.user_email
      ? `Cá nhân (${inv.metadata.user_email})`
      : 'Cá nhân';
    events.push({
      type: 'PAID',
      at: inv.paid_at || inv.updatedAt,
      amount: inv.amount,
      label: `Hóa đơn ${inv.invoice_number || inv._id}`,
      org_name: inv.organization_id?.name || (isPersonal ? personalLabel : ''),
      meta: { invoice_id: inv._id, plan: inv.plan, scope: isPersonal ? 'personal' : 'org' }
    });
  });
  expenses.forEach((ex) => {
    events.push({
      type: 'EXPENSE',
      at: ex.expense_date || ex.createdAt,
      amount: ex.amount,
      label: `${ex.category}${ex.vendor ? ' · ' + ex.vendor : ''}`,
      org_name: '',
      meta: { expense_id: ex._id, category: ex.category }
    });
  });

  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  return events.slice(0, limit);
}

async function getFinanceOverview(opts = {}) {
  let asOf = new Date();
  if (opts.date) {
    const raw = String(opts.date).trim();
    // YYYY-MM-DD → local day (tránh lệch UTC)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (m) {
      asOf = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
    } else {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) asOf = parsed;
    }
  }

  const dayStart = startOfDay(asOf);
  const dayEnd = endOfDay(asOf);
  const monthStart = startOfMonth(asOf);
  const yearStart = startOfYear(asOf);
  const dateKey = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, '0')}-${String(asOf.getDate()).padStart(2, '0')}`;

  const [
    revDay,
    revMonth,
    revYear,
    expDay,
    expMonth,
    expYear,
    byMonth,
    byPlan,
    expCats,
    orgSnap,
    pending,
    activity
  ] = await Promise.all([
    sumPaidAmount(dayStart, dayEnd),
    sumPaidAmount(monthStart, dayEnd),
    sumPaidAmount(yearStart, dayEnd),
    sumExpenseAmount(dayStart, dayEnd),
    sumExpenseAmount(monthStart, dayEnd),
    sumExpenseAmount(yearStart, dayEnd),
    revenueByMonth(12),
    revenueByPlan(),
    expenseByCategory(monthStart, dayEnd),
    orgBillingSnapshot(),
    pendingInvoices(15),
    recentFinanceActivity(20)
  ]);

  const profit_day = (revDay.amount || 0) - (expDay.amount || 0);
  const profit_month = (revMonth.amount || 0) - (expMonth.amount || 0);
  const profit_year = (revYear.amount || 0) - (expYear.amount || 0);

  return {
    currency: 'VND',
    generated_at: new Date().toISOString(),
    as_of_date: dateKey,
    kpi: {
      revenue_day: revDay.amount,
      revenue_today: revDay.amount,
      expense_day: expDay.amount,
      profit_day,
      paid_invoices_day: revDay.count,
      expense_count_day: expDay.count,
      revenue_month: revMonth.amount,
      revenue_year: revYear.amount,
      paid_invoices_today: revDay.count,
      paid_invoices_month: revMonth.count,
      expense_month: expMonth.amount,
      expense_year: expYear.amount,
      profit_month,
      profit_year,
      server_cost_month: expMonth.amount,
      pending_invoices: pending.length,
      orgs_total: orgSnap.counts.total,
      orgs_active: orgSnap.counts.active,
      orgs_free: orgSnap.counts.free_trial,
      orgs_paid: orgSnap.counts.paid_plans,
      orgs_grace: orgSnap.counts.grace,
      orgs_expired: orgSnap.counts.expired
    },
    charts: {
      revenue_by_month: byMonth,
      revenue_by_plan: byPlan,
      expense_by_category: expCats
    },
    expiring_soon: orgSnap.expiring_soon,
    pending_invoices: pending.map((inv) => ({
      _id: inv._id,
      invoice_number: inv.invoice_number,
      amount: inv.amount,
      plan: inv.plan,
      due_at: inv.due_at,
      createdAt: inv.createdAt,
      organization: inv.organization_id
        ? {
            _id: inv.organization_id._id,
            name: inv.organization_id.name,
            slug: inv.organization_id.slug
          }
        : null
    })),
    recent_activity: activity
  };
}

async function listOrgsForBilling(filter = {}) {
  const { counts, orgs } = await orgBillingSnapshot();
  let list = orgs;
  const status = String(filter.status || '').toUpperCase();
  if (status === 'EXPIRED') {
    list = list.filter((o) => String(o.billing_status).toUpperCase() === 'EXPIRED');
  } else if (status === 'GRACE' || status === 'GRACE_PERIOD') {
    list = list.filter((o) => String(o.billing_status).toUpperCase() === 'GRACE_PERIOD');
  } else if (status === 'FREE') {
    list = list.filter((o) => String(o.plan || 'FREE').toUpperCase() === 'FREE');
  } else if (status === 'PAID') {
    list = list.filter((o) => String(o.plan || 'FREE').toUpperCase() !== 'FREE');
  } else if (status === 'INACTIVE') {
    list = list.filter((o) => o.is_active === false);
  }

  const invoiceAgg = await financeRead.aggregateInvoices([
    {
      $group: {
        _id: '$organization_id',
        invoice_count: { $sum: 1 },
        open_count: {
          $sum: { $cond: [{ $eq: ['$status', 'OPEN'] }, 1, 0] }
        },
        paid_amount: {
          $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, '$amount', 0] }
        }
      }
    }
  ]);
  const invMap = Object.fromEntries(invoiceAgg.map((r) => [String(r._id), r]));

  return {
    counts,
    organizations: list.map((o) => {
      const inv = invMap[String(o._id)] || {};
      return {
        _id: o._id,
        name: o.name,
        slug: o.slug,
        plan: o.plan,
        billing_status: o.billing_status,
        is_active: o.is_active !== false,
        plan_expires_at: o.plan_expires_at,
        grace_ends_at: o.grace_ends_at,
        invoice_count: inv.invoice_count || 0,
        open_invoices: inv.open_count || 0,
        paid_amount: inv.paid_amount || 0
      };
    })
  };
}

module.exports = {
  getFinanceOverview,
  listOrgsForBilling,
  sumPaidAmount,
  sumExpenseAmount,
  startOfDay,
  endOfDay,
  startOfMonth,
  startOfYear
};
