// Phase 9.7 — Báo cáo thu/chi + export CSV
const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');

function parseDayBound(raw, endOf = false) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), endOf ? 23 : 0, endOf ? 59 : 0, endOf ? 59 : 0, endOf ? 999 : 0);
    return d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

async function buildReportSummary({ from, to } = {}) {
  const start = parseDayBound(from, false) || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = parseDayBound(to, true) || new Date();

  const [rev, exp, pay] = await Promise.all([
    Invoice.aggregate([
      {
        $match: {
          status: 'PAID',
          $or: [
            { paid_at: { $gte: start, $lte: end } },
            { paid_at: null, updatedAt: { $gte: start, $lte: end } }
          ]
        }
      },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    Expense.aggregate([
      { $match: { expense_date: { $gte: start, $lte: end } } },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    Payment.aggregate([
      {
        $match: {
          status: 'SUCCESS',
          $or: [
            { paid_at: { $gte: start, $lte: end } },
            { paid_at: null, createdAt: { $gte: start, $lte: end } }
          ]
        }
      },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ])
  ]);

  const revenue = rev[0]?.amount || 0;
  const expense = exp[0]?.amount || 0;
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    currency: 'VND',
    revenue,
    expense,
    profit: revenue - expense,
    paid_invoices: rev[0]?.count || 0,
    expense_rows: exp[0]?.count || 0,
    payments_success: pay[0]?.count || 0,
    payment_amount: pay[0]?.amount || 0
  };
}

async function exportCsv(kind, { from, to } = {}) {
  const start = parseDayBound(from, false);
  const end = parseDayBound(to, true);
  const k = String(kind || 'invoices').toLowerCase();

  if (k === 'expenses') {
    const q = {};
    if (start || end) {
      q.expense_date = {};
      if (start) q.expense_date.$gte = start;
      if (end) q.expense_date.$lte = end;
    }
    const rows = await Expense.find(q).sort({ expense_date: -1 }).limit(2000).lean();
    const headers = ['expense_date', 'category', 'vendor', 'amount', 'currency', 'note'];
    const data = rows.map((r) => ({
      expense_date: r.expense_date ? new Date(r.expense_date).toISOString().slice(0, 10) : '',
      category: r.category || '',
      vendor: r.vendor || '',
      amount: r.amount || 0,
      currency: r.currency || 'VND',
      note: r.note || ''
    }));
    return { filename: 'expenses.csv', csv: toCsv(headers, data) };
  }

  if (k === 'payments') {
    const q = {};
    if (start || end) {
      q.$or = [
        ...(start || end
          ? [
              {
                paid_at: {
                  ...(start ? { $gte: start } : {}),
                  ...(end ? { $lte: end } : {})
                }
              }
            ]
          : [])
      ];
    }
    const filter =
      start || end
        ? {
            $or: [
              {
                paid_at: {
                  ...(start ? { $gte: start } : {}),
                  ...(end ? { $lte: end } : {})
                }
              },
              {
                paid_at: null,
                createdAt: {
                  ...(start ? { $gte: start } : {}),
                  ...(end ? { $lte: end } : {})
                }
              }
            ]
          }
        : {};
    const rows = await Payment.find(filter)
      .sort({ paid_at: -1 })
      .limit(2000)
      .populate('organization_id', 'name slug')
      .lean();
    const headers = ['paid_at', 'org', 'method', 'status', 'amount', 'external_ref', 'invoice_id'];
    const data = rows.map((r) => ({
      paid_at: r.paid_at ? new Date(r.paid_at).toISOString() : '',
      org: r.organization_id?.name || '',
      method: r.method || '',
      status: r.status || '',
      amount: r.amount || 0,
      external_ref: r.external_ref || '',
      invoice_id: r.invoice_id ? String(r.invoice_id) : ''
    }));
    return { filename: 'payments.csv', csv: toCsv(headers, data) };
  }

  // invoices
  const invFilter = {};
  if (start || end) {
    invFilter.$or = [
      {
        paid_at: {
          ...(start ? { $gte: start } : {}),
          ...(end ? { $lte: end } : {})
        }
      },
      {
        paid_at: null,
        createdAt: {
          ...(start ? { $gte: start } : {}),
          ...(end ? { $lte: end } : {})
        }
      }
    ];
  }
  const rows = await Invoice.find(invFilter)
    .sort({ createdAt: -1 })
    .limit(2000)
    .populate('organization_id', 'name slug')
    .lean();
  const headers = [
    'invoice_number',
    'org',
    'plan',
    'status',
    'amount',
    'tax_amount',
    'discount_amount',
    'paid_at',
    'createdAt'
  ];
  const data = rows.map((r) => ({
    invoice_number: r.invoice_number || '',
    org: r.organization_id?.name || '',
    plan: r.plan || '',
    status: r.status || '',
    amount: r.amount || 0,
    tax_amount: r.tax_amount || 0,
    discount_amount: r.discount_amount || 0,
    paid_at: r.paid_at ? new Date(r.paid_at).toISOString() : '',
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : ''
  }));
  return { filename: 'invoices.csv', csv: toCsv(headers, data) };
}

module.exports = {
  buildReportSummary,
  exportCsv,
  parseDayBound
};
