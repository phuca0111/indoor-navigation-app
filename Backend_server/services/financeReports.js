// Phase 9.7 — Báo cáo thu/chi + export CSV
const financeRead = require('../repositories/financeReadRepository');
const { ACCOUNTS } = require('./unifiedLedger');
const { isLedgerReadV2 } = require('./ledgerReadService');

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

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (quoted && char === '"' && csv[i + 1] === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && csv[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  return rows;
}

async function exportFormatted(kind, format, range = {}) {
  const result = await exportCsv(kind, range);
  const matrix = parseCsv(result.csv);
  const headers = matrix.shift() || [];
  if (String(format).toLowerCase() === 'xlsx') {
    const { default: writeExcelFile } = await import('write-excel-file/node');
    const sheetData = [
      headers.map((value) => ({ value, fontWeight: 'bold' })),
      ...matrix.map((row) => row.map((value) => ({ value: String(value ?? '') })))
    ];
    const buffer = await writeExcelFile(sheetData, {
      sheet: 'Finance',
      columns: headers.map((header, index) => ({
        width: Math.min(
          40,
          Math.max(12, String(header).length + 2, ...matrix.map((row) => String(row[index] || '').length + 2))
        )
      }))
    }).toBuffer();
    return {
      filename: result.filename.replace(/\.csv$/i, '.xlsx'),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer
    };
  }
  if (String(format).toLowerCase() === 'pdf') {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    const chunks = [];
    const done = new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    doc.fontSize(16).text(`Finance export: ${kind}`, { underline: true });
    doc.moveDown().fontSize(8).text(headers.join(' | '));
    doc.moveDown(0.5);
    matrix.forEach((row) => {
      if (doc.y > 540) doc.addPage();
      doc.text(row.join(' | '), { ellipsis: true, width: 760 });
    });
    doc.end();
    return {
      filename: result.filename.replace(/\.csv$/i, '.pdf'),
      contentType: 'application/pdf',
      buffer: await done
    };
  }
  throw Object.assign(new Error('format chỉ hỗ trợ csv, xlsx, pdf.'), { status: 400 });
}

async function buildReportSummary({ from, to } = {}) {
  const start = parseDayBound(from, false) || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = parseDayBound(to, true) || new Date();

  const [rev, exp, pay] = await Promise.all([
    financeRead.aggregateInvoices([
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
    financeRead.aggregateExpenseLedger([
      { $match: { expense_date: { $gte: start, $lte: end } } },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    financeRead.aggregatePayments([
      {
        $match: {
          status: { $in: ['SUCCESS', 'REFUNDED'] },
          $or: [
            { paid_at: { $gte: start, $lte: end } },
            { paid_at: null, createdAt: { $gte: start, $lte: end } }
          ]
        }
      },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ])
  ]);

  const legacyRevenue = rev[0]?.amount || 0;
  const legacyExpense = exp[0]?.amount || 0;
  const {
    isLedgerReadV2,
    isShadowCompareEnabled,
    ledgerTotals,
    compareLegacyAndLedger
  } = require('./ledgerReadService');
  let ledger = null;
  if (isLedgerReadV2() || isShadowCompareEnabled()) {
    ledger = await ledgerTotals(start, end);
  }
  const revenue = isLedgerReadV2() ? ledger.revenue : legacyRevenue;
  const expense = isLedgerReadV2() ? ledger.expense : legacyExpense;
  const discrepancy = ledger
    ? compareLegacyAndLedger({ revenue: legacyRevenue, expense: legacyExpense }, ledger)
    : null;
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
    ,
    read_model: isLedgerReadV2() ? 'LEDGER_V2' : 'LEGACY',
    ledger_shadow_discrepancy: discrepancy,
    refunds: ledger?.refunds || 0
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
    const rows = await financeRead.findExpenses(q, { sort: { expense_date: -1 }, limit: 2000 });
    const headers = ['expense_date', 'category', 'vendor', 'amount', 'currency', 'note', 'voided_at'];
    const data = rows.map((r) => ({
      expense_date: r.expense_date ? new Date(r.expense_date).toISOString().slice(0, 10) : '',
      category: r.category || '',
      vendor: r.vendor || '',
      amount: r.amount || 0,
      currency: r.currency || 'VND',
      note: r.note || '',
      voided_at: r.voided_at ? new Date(r.voided_at).toISOString() : ''
    }));
    return { filename: 'expenses.csv', csv: toCsv(headers, data) };
  }

  if (k === 'ledger' || k === 'expense-ledger') {
    const q = {};
    if (start || end) {
      q.expense_date = {};
      if (start) q.expense_date.$gte = start;
      if (end) q.expense_date.$lte = end;
    }
    const rows = await financeRead.findExpenseLedger(q, { sort: { expense_date: -1, createdAt: -1 }, limit: 5000 });
    const headers = [
      'entry_type',
      'expense_date',
      'category',
      'vendor',
      'amount',
      'currency',
      'note',
      'idempotency_key',
      'expense_id'
    ];
    const data = rows.map((r) => ({
      entry_type: r.entry_type || '',
      expense_date: r.expense_date ? new Date(r.expense_date).toISOString().slice(0, 10) : '',
      category: r.category || '',
      vendor: r.vendor || '',
      amount: r.amount || 0,
      currency: r.currency || 'VND',
      note: r.note || '',
      idempotency_key: r.idempotency_key || '',
      expense_id: r.expense_id ? String(r.expense_id) : ''
    }));
    return { filename: 'expense-ledger.csv', csv: toCsv(headers, data) };
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
    const rows = await financeRead.findPayments(filter, {
      sort: { paid_at: -1 },
      limit: 2000,
      populate: { path: 'organization_id', select: 'name slug' }
    });
    const headers = ['paid_at', 'org', 'method', 'status', 'amount', 'external_ref', 'invoice_id'];
    const data = rows.map((r) => ({
      paid_at: r.paid_at ? new Date(r.paid_at).toISOString() : '',
      org:
        r.organization_id?.name ||
        (r.metadata?.scope === 'personal' || String(r.external_ref || '').startsWith('PERSONAL-')
          ? r.metadata?.user_email
            ? `Cá nhân (${r.metadata.user_email})`
            : 'Cá nhân'
          : ''),
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
  const rows = await financeRead.findInvoices(invFilter, {
      sort: { createdAt: -1 },
      limit: 2000,
      populate: { path: 'organization_id', select: 'name slug' }
    });
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
    org: r.organization_id?.name || (r.metadata?.scope === 'personal' ? 'Cá nhân' : ''),
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

const REPORT_TZ = process.env.REPORT_TIMEZONE || 'Asia/Ho_Chi_Minh';

async function aggregateRevenueByDay(start, end) {
  if (isLedgerReadV2()) {
    return financeRead.aggregateLedgerEntries([
      {
        $match: {
          account_code: { $in: [ACCOUNTS.REVENUE, ACCOUNTS.REFUNDS] },
          occurred_at: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$occurred_at', timezone: REPORT_TZ } },
          amount: {
            $sum: {
              $cond: [
                { $eq: ['$account_code', ACCOUNTS.REVENUE] },
                { $cond: [{ $eq: ['$side', 'CREDIT'] }, '$amount_minor', { $multiply: ['$amount_minor', -1] }] },
                { $cond: [{ $eq: ['$side', 'DEBIT'] }, { $multiply: ['$amount_minor', -1] }, '$amount_minor'] }
              ]
            }
          },
          count: { $sum: 1 }
        }
      }
    ]);
  }
  return financeRead.aggregateInvoices([
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
        day: { $ifNull: ['$paid_at', '$updatedAt'] }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$day', timezone: REPORT_TZ } },
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
}

async function aggregateExpenseByDay(start, end) {
  if (isLedgerReadV2()) {
    return financeRead.aggregateLedgerEntries([
      { $match: { account_code: ACCOUNTS.EXPENSE, occurred_at: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$occurred_at', timezone: REPORT_TZ } },
          amount: { $sum: { $cond: [{ $eq: ['$side', 'DEBIT'] }, '$amount_minor', { $multiply: ['$amount_minor', -1] }] } },
          count: { $sum: 1 }
        }
      }
    ]);
  }
  return financeRead.aggregateExpenseLedger([
    { $match: { expense_date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$expense_date', timezone: REPORT_TZ } },
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
}

async function aggregateRevenueByMonth(start, end) {
  if (isLedgerReadV2()) {
    const daily = await aggregateRevenueByDay(start, end);
    const grouped = {};
    daily.forEach((row) => {
      const key = String(row._id).slice(0, 7);
      grouped[key] = grouped[key] || { _id: key, amount: 0, count: 0 };
      grouped[key].amount += Number(row.amount) || 0;
      grouped[key].count += Number(row.count) || 0;
    });
    return Object.values(grouped);
  }
  return financeRead.aggregateInvoices([
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
        day: { $ifNull: ['$paid_at', '$updatedAt'] }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$day', timezone: REPORT_TZ } },
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
}

async function aggregateExpenseByMonth(start, end) {
  if (isLedgerReadV2()) {
    const daily = await aggregateExpenseByDay(start, end);
    const grouped = {};
    daily.forEach((row) => {
      const key = String(row._id).slice(0, 7);
      grouped[key] = grouped[key] || { _id: key, amount: 0, count: 0 };
      grouped[key].amount += Number(row.amount) || 0;
      grouped[key].count += Number(row.count) || 0;
    });
    return Object.values(grouped);
  }
  return financeRead.aggregateExpenseLedger([
    { $match: { expense_date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$expense_date', timezone: REPORT_TZ } },
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
}

function mapAmount(rows) {
  const m = {};
  (rows || []).forEach((r) => {
    m[r._id] = { amount: r.amount || 0, count: r.count || 0 };
  });
  return m;
}

function dateKeyLocal(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function monthKeyLocal(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

const DOW_VI = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const MONTH_LABEL_VI = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

function buildSeriesSummary(series) {
  let revenue = 0;
  let expense = 0;
  series.forEach((r) => {
    revenue += Number(r.revenue) || 0;
    expense += Number(r.expense) || 0;
  });
  return {
    revenue,
    expense,
    profit: revenue - expense,
    total: revenue + expense
  };
}

/** Thứ Hai đầu tuần (local) chứa ngày d */
function startOfWeekMonday(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const day = x.getDay(); // 0=CN
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

/**
 * Thu/Chi overview:
 * - today (Ngày): các ngày trong tuần hiện tại (T2→CN), ẩn ngày chưa tới
 * - weekly (Tuần): các tuần trong tháng hiện tại (Tuần 1…), có title tháng
 * - monthly (Tháng): các tháng từ T1 → tháng hiện tại (ẩn tháng tương lai)
 */
async function buildRevenueExpenseProjectStats() {
  const now = new Date();
  const todayStart = parseDayBound(dateKeyLocal(now), false);
  const todayEnd = parseDayBound(dateKeyLocal(now), true);
  const todayKey = dateKeyLocal(now);

  const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  const weekMon = startOfWeekMonday(todayStart);
  const weekSun = new Date(weekMon);
  weekSun.setDate(weekMon.getDate() + 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthLast = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthTitle = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
  const weekRangeTitle =
    `${weekMon.getDate()}/${weekMon.getMonth() + 1} – ${weekSun.getDate()}/${weekSun.getMonth() + 1}/${weekSun.getFullYear()}`;

  const [revDay, expDay] = await Promise.all([
    aggregateRevenueByDay(yearStart, todayEnd),
    aggregateExpenseByDay(yearStart, todayEnd)
  ]);
  const revDayMap = mapAmount(revDay);
  const expDayMap = mapAmount(expDay);

  // Ngày: đủ 7 cột T2→CN trong tuần hiện tại (ngày chưa tới = 0)
  const todaySeries = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekMon);
    d.setDate(weekMon.getDate() + i);
    const key = dateKeyLocal(d);
    const isFuture = key > todayKey;
    todaySeries.push({
      key,
      label: DOW_VI[d.getDay()],
      sublabel: `${d.getDate()}/${d.getMonth() + 1}`,
      revenue: isFuture ? 0 : (revDayMap[key]?.amount || 0),
      expense: isFuture ? 0 : (expDayMap[key]?.amount || 0),
      future: isFuture
    });
  }

  // Tuần: chỉ các tuần giao với tháng hiện tại, đến tuần đang chạy
  const weeklySeries = [];
  let cursor = startOfWeekMonday(monthStart);
  const currentWeekMonKey = dateKeyLocal(weekMon);
  let weekInMonth = 0;
  while (dateKeyLocal(cursor) <= currentWeekMonKey) {
    const mon = new Date(cursor);
    const sun = new Date(cursor);
    sun.setDate(cursor.getDate() + 6);
    // Bỏ tuần hoàn toàn trước/sau tháng
    if (sun < monthStart) {
      cursor.setDate(cursor.getDate() + 7);
      continue;
    }
    if (mon > monthLast) break;

    weekInMonth += 1;
    let revenue = 0;
    let expense = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      if (d < monthStart || d > monthLast) continue;
      const key = dateKeyLocal(d);
      if (key > todayKey) break;
      revenue += revDayMap[key]?.amount || 0;
      expense += expDayMap[key]?.amount || 0;
    }
    // Khoảng ngày thực tế của tuần trong tháng (có thể cắt đầu/cuối tháng)
    const rangeStart = mon < monthStart ? monthStart : mon;
    const rangeEndRaw = sun > monthLast ? monthLast : sun;
    const rangeEnd = rangeEndRaw > todayEnd ? todayStart : rangeEndRaw;
    weeklySeries.push({
      key: dateKeyLocal(mon),
      label: 'Tuần ' + weekInMonth,
      sublabel: `${rangeStart.getDate()}/${rangeStart.getMonth() + 1}–${rangeEnd.getDate()}/${rangeEnd.getMonth() + 1}`,
      revenue,
      expense
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  // Tháng: T1 → tháng hiện tại trong năm
  const monthlySeries = [];
  for (let m = 0; m <= now.getMonth(); m++) {
    const key = `${now.getFullYear()}-${String(m + 1).padStart(2, '0')}`;
    let revenue = 0;
    let expense = 0;
    Object.keys(revDayMap).forEach((dayKey) => {
      if (dayKey.startsWith(key)) revenue += revDayMap[dayKey]?.amount || 0;
    });
    Object.keys(expDayMap).forEach((dayKey) => {
      if (dayKey.startsWith(key)) expense += expDayMap[dayKey]?.amount || 0;
    });
    monthlySeries.push({
      key,
      label: MONTH_LABEL_VI[m],
      sublabel: String(now.getFullYear()),
      revenue,
      expense
    });
  }

  return {
    currency: 'VND',
    default_period: 'today',
    periods: {
      today: {
        summary: buildSeriesSummary(todaySeries.filter((r) => !r.future)),
        series: todaySeries,
        title: weekRangeTitle
      },
      weekly: {
        summary: buildSeriesSummary(weeklySeries),
        series: weeklySeries,
        title: monthTitle
      },
      monthly: {
        summary: buildSeriesSummary(monthlySeries),
        series: monthlySeries,
        title: `Năm ${now.getFullYear()}`
      }
    },
    meta: {
      week_start: dateKeyLocal(weekMon),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      month_title: monthTitle
    }
  };
}

module.exports = {
  buildReportSummary,
  buildRevenueExpenseProjectStats,
  exportCsv,
  exportFormatted,
  parseCsv,
  toCsv,
  parseDayBound
};
