// Phase 5.7 — Giá gói mặc định (VND / tháng)
const PLAN_PRICES_VND = {
  PRO: 990000,
  ENTERPRISE: 4990000
};

const PLAN_PERIOD_DAYS = 30;

function getPlanPrice(plan) {
  const p = String(plan || '').toUpperCase();
  return PLAN_PRICES_VND[p] ?? 0;
}

module.exports = {
  PLAN_PRICES_VND,
  PLAN_PERIOD_DAYS,
  getPlanPrice
};
