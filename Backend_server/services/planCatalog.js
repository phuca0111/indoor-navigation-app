// Phase 9.3 — Plan catalog service (cache + seed + CRUD helpers)
const Plan = require('../models/Plan');

const FALLBACK_LIMITS = {
  FREE: { maxBuildings: 2, maxUsers: 5 },
  PRO: { maxBuildings: 20, maxUsers: 50 },
  BUSINESS: { maxBuildings: 50, maxUsers: 100 },
  ENTERPRISE: { maxBuildings: null, maxUsers: null }
};

const FALLBACK_PRICES = {
  FREE: 0,
  PRO: 990000,
  BUSINESS: 2490000,
  ENTERPRISE: 4990000
};

const FALLBACK_PERIOD_DAYS = 30;
const PLAN_CODE_RE = /^[A-Z][A-Z0-9_]{1,31}$/;

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
    is_personal: true,
    is_organization: false,
    show_on_landing: true,
    personal_max_buildings: 1,
    personal_max_floors_per_building: 2,
    personal_max_maps: 3,
    personal_max_qr: 20,
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
    is_personal: true,
    is_organization: false,
    show_on_landing: true,
    personal_max_buildings: 20,
    personal_max_floors_per_building: null,
    personal_max_maps: null,
    personal_max_qr: null,
    sort_order: 20,
    features: ['20 tòa nhà', '50 tài khoản']
  },
  {
    code: 'BUSINESS',
    name: 'Business',
    description: 'Gói tổ chức: cộng tác nhóm, nhiều tòa & tài khoản',
    price_vnd: 2490000,
    period_days: 30,
    max_buildings: 50,
    max_users: 100,
    is_personal: false,
    is_organization: true,
    show_on_landing: true,
    sort_order: 25,
    features: ['50 tòa nhà', '100 tài khoản', 'Cộng tác nhóm', 'Quản lý hóa đơn']
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Gói doanh nghiệp không giới hạn cơ bản',
    price_vnd: 4990000,
    period_days: 30,
    max_buildings: null,
    max_users: null,
    is_personal: false,
    is_organization: true,
    show_on_landing: true,
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
  const existing = await Plan.find({}).select('code is_personal is_organization show_on_landing').lean();
  const existingCodes = new Set(existing.map((p) => String(p.code).toUpperCase()));
  // Chỉ chèn các gói mặc định còn THIẾU — không ghi đè gói đã có/đã chỉnh.
  const missing = DEFAULT_SEED.filter((p) => !existingCodes.has(String(p.code).toUpperCase()));
  if (missing.length) {
    await Plan.insertMany(missing);
  }

  // Backfill trường audience + Personal Workspace cho các gói seed đã tồn tại
  // nhưng chưa có cờ (nâng cấp schema). An toàn vì đây là trường mới.
  const needBackfill = existing.filter((p) => p.is_personal == null || p.is_organization == null);
  for (const p of needBackfill) {
    const seed = DEFAULT_SEED.find((s) => s.code === String(p.code).toUpperCase());
    if (!seed) continue;
    const $set = {};
    if (p.is_personal == null && seed.is_personal != null) {
      $set.is_personal = !!seed.is_personal;
      if (seed.is_personal) {
        $set.personal_max_buildings = seed.personal_max_buildings ?? null;
        $set.personal_max_floors_per_building = seed.personal_max_floors_per_building ?? null;
        $set.personal_max_maps = seed.personal_max_maps ?? null;
        $set.personal_max_qr = seed.personal_max_qr ?? null;
      }
    }
    if (p.is_organization == null && seed.is_organization != null) {
      $set.is_organization = !!seed.is_organization;
    }
    if (seed.show_on_landing != null) $set.show_on_landing = !!seed.show_on_landing;
    if (Object.keys($set).length) {
      await Plan.updateOne({ code: seed.code }, { $set });
    }
  }

  // Gói tùy chỉnh chưa có flag: mặc định show_on_landing=true; is_organization nếu không phải personal
  await Plan.updateMany(
    { show_on_landing: { $exists: false } },
    { $set: { show_on_landing: true } }
  );
  await Plan.updateMany(
    { is_organization: { $exists: false }, is_personal: { $ne: true } },
    { $set: { is_organization: true } }
  );
  await Plan.updateMany(
    { is_organization: { $exists: false }, is_personal: true },
    { $set: { is_organization: false } }
  );

  await refreshPlanCache();
  return { seeded: missing.length > 0, inserted: missing.length, count: existing.length + missing.length };
}

function normalizePlanCode(plan) {
  const p = String(plan || 'FREE').toUpperCase().trim();
  if (!p) return 'FREE';
  if (cacheByCode && cacheByCode[p]) return p;
  if (FALLBACK_LIMITS[p]) return p;
  // Giữ mã tùy chỉnh đã gán cho org (kể cả khi tạm thiếu trong cache)
  if (PLAN_CODE_RE.test(p)) return p;
  return 'FREE';
}

function planExistsInCatalog(plan) {
  const code = String(plan || '').toUpperCase().trim();
  if (!code) return false;
  if (cacheByCode && cacheByCode[code]) return true;
  return !!FALLBACK_LIMITS[code];
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

/**
 * Giới hạn Personal Workspace cho một mã gói, đọc từ catalog.
 * Trả về null nếu gói không phải gói cá nhân hoặc chưa có trong cache
 * (để nơi gọi fallback về bảng hardcode cũ).
 */
function getPersonalPlanLimits(plan) {
  const code = String(plan || '').toUpperCase().trim();
  const doc = cacheByCode && cacheByCode[code];
  if (!doc || doc.is_personal !== true) return null;
  const num = (v) => (v == null ? null : Number(v));
  return {
    maxBuildings: num(doc.personal_max_buildings),
    maxFloorsPerBuilding: num(doc.personal_max_floors_per_building),
    maxMaps: num(doc.personal_max_maps),
    maxQr: num(doc.personal_max_qr)
  };
}

/** Danh sách mã gói dành cho Personal Workspace. */
function getPersonalPlanCodes({ activeOnly = false, paidOnly = false } = {}) {
  if (!cacheByCode) return paidOnly ? ['PRO'] : ['FREE', 'PRO'];
  return Object.keys(cacheByCode).filter((code) => {
    const doc = cacheByCode[code];
    if (!doc || doc.is_personal !== true) return false;
    if (activeOnly && doc.is_active === false) return false;
    if (paidOnly && !((Number(doc.price_vnd) || 0) > 0)) return false;
    return true;
  });
}

/** Danh sách mã gói dành cho tổ chức (tạo org / nâng cấp org). */
function getOrganizationPlanCodes({ activeOnly = false, paidOnly = true } = {}) {
  if (!cacheByCode) return ['BUSINESS', 'ENTERPRISE'];
  return Object.keys(cacheByCode).filter((code) => {
    const doc = cacheByCode[code];
    if (!doc || doc.is_organization !== true) return false;
    if (activeOnly && doc.is_active === false) return false;
    if (paidOnly && !((Number(doc.price_vnd) || 0) > 0)) return false;
    return true;
  });
}

/**
 * REGISTERED_USER có gói cá nhân trả phí còn hiệu lực hay không
 * (điều kiện để hiện nút tạo tổ chức → ORG_ADMIN).
 */
function hasActivePaidPersonalPlan(userLike) {
  const plan = String(userLike?.plan || 'FREE').toUpperCase();
  if (!plan || plan === 'FREE' || !isPaidPlan(plan)) return false;
  // Nếu gói cá nhân có hạn: phải còn hiệu lực
  if (userLike?.plan_expires_at) {
    const exp = new Date(userLike.plan_expires_at);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() <= Date.now()) return false;
  }
  return true;
}

function getPlanPeriodDays(plan) {
  const code = normalizePlanCode(plan);
  const doc = cacheByCode && cacheByCode[code];
  if (doc && doc.period_days) return Number(doc.period_days) || FALLBACK_PERIOD_DAYS;
  return FALLBACK_PERIOD_DAYS;
}

/** Gói trả phí = có giá > 0 trong catalog/fallback (FREE luôn false). */
function isPaidPlan(plan) {
  const code = String(plan || '').toUpperCase().trim();
  if (!code || code === 'FREE') return false;
  return getPlanPrice(code) > 0;
}

function getKnownPlanCodes({ activeOnly = false } = {}) {
  const codes = new Set(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']);
  if (cacheByCode) {
    Object.keys(cacheByCode).forEach((code) => {
      const doc = cacheByCode[code];
      if (activeOnly && doc && doc.is_active === false) return;
      codes.add(code);
    });
  }
  return Array.from(codes);
}

function getPaidPlanCodes({ activeOnly = false } = {}) {
  return getKnownPlanCodes({ activeOnly }).filter((code) => isPaidPlan(code));
}

/**
 * @param {string} plan
 * @param {{ mustExist?: boolean, mustBePaid?: boolean, mustBeActive?: boolean }} [opts]
 */
async function assertPlanCode(plan, opts = {}) {
  await ensureDefaultPlans();
  const code = String(plan || '').toUpperCase().trim();
  if (!PLAN_CODE_RE.test(code)) {
    throw Object.assign(new Error('Mã gói không hợp lệ.'), { status: 400 });
  }
  const doc = cacheByCode && cacheByCode[code];
  const exists = !!doc || !!FALLBACK_LIMITS[code];
  if (opts.mustExist !== false && !exists) {
    throw Object.assign(new Error('Gói không tồn tại trong danh mục.'), { status: 400 });
  }
  if (opts.mustBeActive && doc && doc.is_active === false) {
    throw Object.assign(new Error('Gói đang ngừng bán.'), { status: 400 });
  }
  if (opts.mustBePaid && !isPaidPlan(code)) {
    throw Object.assign(new Error('plan phải là gói trả phí trong danh mục.'), { status: 400 });
  }
  return code;
}

async function listPlans({ activeOnly = false } = {}) {
  await ensureDefaultPlans();
  const filter = activeOnly ? { is_active: true } : {};
  return Plan.find(filter).sort({ sort_order: 1, code: 1 }).lean();
}

module.exports = {
  FALLBACK_LIMITS,
  FALLBACK_PRICES,
  PLAN_CODE_RE,
  refreshPlanCache,
  ensureDefaultPlans,
  normalizePlanCode,
  planExistsInCatalog,
  getPlanLimits,
  getPlanPrice,
  getPersonalPlanLimits,
  getPersonalPlanCodes,
  getOrganizationPlanCodes,
  hasActivePaidPersonalPlan,
  getPlanPeriodDays,
  isPaidPlan,
  getKnownPlanCodes,
  getPaidPlanCodes,
  assertPlanCode,
  listPlans,
  DEFAULT_SEED
};
