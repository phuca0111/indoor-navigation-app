// Phase 5.7 + 9.3 — Giá gói: catalog DB (fallback hardcode)
const {
  getPlanPrice: getPriceFromCatalog,
  getPlanPeriodDays
} = require('../services/planCatalog');

/** Fallback hiển thị / test khi cache chưa seed */
const PLAN_PRICES_VND = {
  PRO: 990000,
  BUSINESS: 2490000,
  ENTERPRISE: 4990000
};

const PLAN_PERIOD_DAYS = 30;

function getPlanPrice(plan) {
  const n = getPriceFromCatalog(plan);
  if (n != null) return n;
  const p = String(plan || '').toUpperCase();
  return PLAN_PRICES_VND[p] ?? 0;
}

module.exports = {
  PLAN_PRICES_VND,
  PLAN_PERIOD_DAYS,
  getPlanPrice,
  getPlanPeriodDays
};
