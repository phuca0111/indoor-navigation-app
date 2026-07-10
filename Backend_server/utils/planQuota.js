// ============================================
// Phase 5.1 — Giới hạn tài nguyên theo Organization.plan
// Chưa cổng thanh toán: chỉ enforce quota (FREE / PRO / ENTERPRISE).
// ============================================

const Building = require('../models/Building');
const User = require('../models/User');

/** null = không giới hạn */
const PLAN_LIMITS = {
  FREE: { maxBuildings: 2, maxUsers: 5 },
  PRO: { maxBuildings: 20, maxUsers: 50 },
  ENTERPRISE: { maxBuildings: null, maxUsers: null }
};

function normalizePlan(plan) {
  const p = String(plan || 'FREE').toUpperCase();
  return PLAN_LIMITS[p] ? p : 'FREE';
}

function getPlanLimits(plan) {
  return PLAN_LIMITS[normalizePlan(plan)];
}

/**
 * Đếm tòa active thuộc org (is_active !== false).
 */
async function countActiveBuildings(organizationId) {
  return Building.countDocuments({
    organization_id: organizationId,
    is_active: { $ne: false }
  });
}

/**
 * Đếm user active thuộc org (không tính SUPER_ADMIN).
 */
async function countActiveUsers(organizationId) {
  return User.countDocuments({
    organization_id: organizationId,
    is_active: { $ne: false },
    role: { $in: ['ORG_ADMIN', 'BUILDING_ADMIN'] }
  });
}

/**
 * @returns {{ ok: true } | { ok: false, message: string, code: string, usage: object }}
 */
async function assertCanCreateBuilding(organization) {
  if (!organization) {
    return { ok: false, message: 'Organization không tồn tại.', code: 'ORG_MISSING' };
  }
  const plan = normalizePlan(organization.plan);
  const limits = getPlanLimits(plan);
  if (limits.maxBuildings == null) {
    return { ok: true, plan, limits };
  }
  const used = await countActiveBuildings(organization._id);
  if (used >= limits.maxBuildings) {
    return {
      ok: false,
      code: 'QUOTA_BUILDINGS',
      message:
        `Gói ${plan} chỉ cho phép tối đa ${limits.maxBuildings} tòa nhà đang hoạt động ` +
        `(hiện có ${used}). Nâng gói PRO/ENTERPRISE hoặc vô hiệu hóa tòa khác.`,
      usage: { used, limit: limits.maxBuildings, plan }
    };
  }
  return { ok: true, plan, limits, usage: { used, limit: limits.maxBuildings } };
}

/**
 * Tạo ORG_ADMIN / BUILDING_ADMIN trong org.
 * SUPER_ADMIN (organization_id null) → bỏ qua.
 */
async function assertCanCreateUser(organization) {
  if (!organization) {
    return { ok: false, message: 'Organization không tồn tại.', code: 'ORG_MISSING' };
  }
  const plan = normalizePlan(organization.plan);
  const limits = getPlanLimits(plan);
  if (limits.maxUsers == null) {
    return { ok: true, plan, limits };
  }
  const used = await countActiveUsers(organization._id);
  if (used >= limits.maxUsers) {
    return {
      ok: false,
      code: 'QUOTA_USERS',
      message:
        `Gói ${plan} chỉ cho phép tối đa ${limits.maxUsers} tài khoản (ORG/BA) đang hoạt động ` +
        `(hiện có ${used}). Nâng gói hoặc khóa tài khoản không dùng.`,
      usage: { used, limit: limits.maxUsers, plan }
    };
  }
  return { ok: true, plan, limits, usage: { used, limit: limits.maxUsers } };
}

module.exports = {
  PLAN_LIMITS,
  normalizePlan,
  getPlanLimits,
  countActiveBuildings,
  countActiveUsers,
  assertCanCreateBuilding,
  assertCanCreateUser
};
