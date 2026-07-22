/**
 * Shared timezone / date-range helpers for read models.
 * Default report timezone: Asia/Ho_Chi_Minh (+07:00).
 */
const REPORT_TZ = process.env.REPORT_TIMEZONE || 'Asia/Ho_Chi_Minh';
const RANGE_DAYS = Object.freeze({
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  '365d': 365
});

function dateKey(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(d));
}

function inclusiveCalendarDays(start, end) {
  const [startYear, startMonth, startDate] = dateKey(start).split('-').map(Number);
  const [endYear, endMonth, endDate] = dateKey(end).split('-').map(Number);
  const startDay = Date.UTC(startYear, startMonth - 1, startDate);
  const endDay = Date.UTC(endYear, endMonth - 1, endDate);
  return Math.max(1, Math.round((endDay - startDay) / 86400000) + 1);
}

function parseAnalyticsRange(range, customFrom, customTo) {
  if (String(range) === 'custom' && customFrom && customTo) {
    const start = new Date(`${customFrom}T00:00:00+07:00`);
    const end = new Date(`${customTo}T23:59:59.999+07:00`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
      const days = inclusiveCalendarDays(start, end);
      return { days, start, end, range: 'custom' };
    }
  }
  const days = RANGE_DAYS[String(range || '30d')] || 30;
  const today = dateKey(new Date());
  const end = new Date(`${today}T23:59:59.999+07:00`);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  start.setTime(new Date(`${dateKey(start)}T00:00:00+07:00`).getTime());
  return { days, start, end, range: days === 365 ? '1y' : `${days}d` };
}

function parseDayBound(raw, endOf = false) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
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
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Baseline contract for characterization / performance budgets. */
const READ_BASELINE = Object.freeze({
  timezone: REPORT_TZ,
  analyticsCustomExample: Object.freeze({
    from: '2026-07-01',
    to: '2026-07-03',
    startIso: '2026-06-30T17:00:00.000Z',
    endIso: '2026-07-03T16:59:59.999Z',
    days: 3
  }),
  queryBudgets: Object.freeze({
    platformStats: { maxQueries: 20, p95Ms: 1500, maxPayloadBytes: 32_000 },
    analyticsOverview: { maxQueries: 45, p95Ms: 4000, maxPayloadBytes: 250_000 },
    financeSummary: { maxQueries: 12, p95Ms: 2000, maxPayloadBytes: 16_000 },
    dashboardBundle: { maxQueries: 60, p95Ms: 6000, maxPayloadBytes: 400_000 }
  }),
  csv: Object.freeze({
    bom: '\uFEFF',
    lineEnding: '\r\n'
  })
});

module.exports = {
  REPORT_TZ,
  RANGE_DAYS,
  dateKey,
  inclusiveCalendarDays,
  parseAnalyticsRange,
  parseDayBound,
  READ_BASELINE
};
