// Phase 9.3 — Plan catalog service (cache + seed + CRUD helpers)
const Plan = require('../models/Plan');

const FALLBACK_LIMITS = {
  FREE: { maxBuildings: 2, maxUsers: 5 },
  PRO: { maxBuildings: 20, maxUsers: 50 },
  ENTERPRISE: { maxBuildings: null, maxUsers: null }
};

const FALLBACK_PRICES = {
  FREE: 0,
  PRO: 990000,
  ENTERPRISE: 4990000
};

const FALLBACK_PERIOD_DAYS = 30;

/** @type {Record<string, object>|null} */
let cacheByCode = null;

const DEFAULT_SEED = [
  {
    code: 'FREE',
    name: 'Free / Trial',
    description: 'Gói dùng thử',
    price_vnd: 0,
    period_days: 30,
    max_buildings: 2,
    max_users: 5,
    sort_order: 10,
    features: ['2 tòa nhà', '5 tài khoản']
  },
  {
    code: 'PRO',
    name: 'Professional',
    description: 'Gói chuyên nghiệp',
    price_vnd: 990000,
    period_days: 30,
    max_buildings: 20,
    max_users: 50,
    sort_order: 20,
    features: ['20 tòa nhà', '50 tài khoản']
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Gói doanh nghiệp không giới hạn cơ bản',
    price_vnd: 4990000,
    period_days: 30,
    max_buildings: null,
    max_users: null,
    sort_order: 30,
    features: ['Không giới hạn tòa/user (theo chính sách)']
  }
];

async function refreshPlanCache() {
  const rows = await Plan.find({}).lean();
  const map = {};
  rows.forEach((p) => {
    map[String(p.code).toUpperCase()] = p;
  });
  cacheByCode = map;
  return map;
}

async function ensureDefaultPlans() {
  const count = await Plan.countDocuments();
  if (count > 0) {
    await refreshPlanCache();
    return { seeded: false, count };
  }
  await Plan.insertMany(DEFAULT_SEED);
  await refreshPlanCache();
  return { seeded: true, count: DEFAULT_SEED.length };
}

function normalizePlanCode(plan) {
  const p = String(plan || 'FREE').toUpperCase();
  if (cacheByCode && cacheByCode[p]) return p;
  if (FALLBACK_LIMITS[p]) return p;
  return 'FREE';
}

function getPlanLimits(plan) {
  const code = normalizePlanCode(plan);
  const doc = cacheByCode && cacheByCode[code];
  if (doc) {
    return {
      maxBuildings: doc.max_buildings == null ? null : Number(doc.max_buildings),
      maxUsers: doc.max_users == null ? null : Number(doc.max_users)
    };
  }
  return FALLBACK_LIMITS[code] || FALLBACK_LIMITS.FREE;
}

function getPlanPrice(plan) {
  const code = normalizePlanCode(plan);
  const doc = cacheByCode && cacheByCode[code];
  if (doc) return Number(doc.price_vnd) || 0;
  return FALLBACK_PRICES[code] ?? 0;
}

function getPlanPeriodDays(plan) {
  const code = normalizePlanCode(plan);
  const doc = cacheByCode && cacheByCode[code];
  if (doc && doc.period_days) return Number(doc.period_days) || FALLBACK_PERIOD_DAYS;
  return FALLBACK_PERIOD_DAYS;
}

async function listPlans({ activeOnly = false } = {}) {
  await ensureDefaultPlans();
  const filter = activeOnly ? { is_active: true } : {};
  return Plan.find(filter).sort({ sort_order: 1, code: 1 }).lean();
}

module.exports = {
  FALLBACK_LIMITS,
  FALLBACK_PRICES,
  refreshPlanCache,
  ensureDefaultPlans,
  normalizePlanCode,
  getPlanLimits,
  getPlanPrice,
  getPlanPeriodDays,
  listPlans,
  DEFAULT_SEED
};
