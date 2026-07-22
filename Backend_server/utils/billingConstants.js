// Vòng đời billing tổ chức (ACTIVE → GRACE → EXPIRED → ARCHIVED)
const GRACE_PERIOD_DAYS = Number(process.env.BILLING_GRACE_DAYS) || 15;
const ARCHIVE_AFTER_EXPIRED_DAYS = Number(process.env.BILLING_ARCHIVE_DAYS) || 90;
const PAID_PLAN_DEFAULT_DAYS = Number(process.env.BILLING_DEFAULT_PERIOD_DAYS) || 30;

const VALID_BILLING_STATUSES = ['ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'ARCHIVED'];

function normalizeBillingStatus(status) {
  const s = String(status || 'ACTIVE').toUpperCase();
  return VALID_BILLING_STATUSES.includes(s) ? s : 'ACTIVE';
}

module.exports = {
  GRACE_PERIOD_DAYS,
  ARCHIVE_AFTER_EXPIRED_DAYS,
  PAID_PLAN_DEFAULT_DAYS,
  VALID_BILLING_STATUSES,
  GRACE_PERIOD_MS: GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  ARCHIVE_AFTER_EXPIRED_MS: ARCHIVE_AFTER_EXPIRED_DAYS * 24 * 60 * 60 * 1000,
  normalizeBillingStatus
};
