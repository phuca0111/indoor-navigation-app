// ============================================
// Phase 5.1 — Giới hạn tài nguyên theo Organization.plan
// Chưa cổng thanh toán: chỉ enforce quota (FREE / PRO / ENTERPRISE).
// ============================================

const Building = require('../models/Building');
const User = require('../models/User');
const Floor = require('../models/Floor');
const QrCode = require('../models/QrCode');

/** null = không giới hạn */
const PLAN_LIMITS = {
  FREE: { maxBuildings: 2, maxUsers: 5 },
  PRO: { maxBuildings: 20, maxUsers: 50 },
  BUSINESS: { maxBuildings: 50, maxUsers: 100 },
  ENTERPRISE: { maxBuildings: null, maxUsers: null }
};

/**
 * Hạn mức cho Personal Workspace (REGISTERED_USER) — TÁCH RIÊNG khỏi quota Organization.
 * FREE/PRO là gói cá nhân; BUSINESS/ENTERPRISE là gói tổ chức (không dùng bảng này).
 * null = không giới hạn.
 */
const PERSONAL_PLAN_LIMITS = {
  FREE: { maxBuildings: 1, maxFloorsPerBuilding: 2, maxMaps: 3, maxQr: 20 },
  PRO:  { maxBuildings: 20, maxFloorsPerBuilding: null, maxMaps: null, maxQr: null }
};

function getPersonalPlanLimits(plan) {
  const code = String(plan || 'FREE').toUpperCase();
  // Ưu tiên đọc từ catalog (data-driven) để gói cá nhân mới tự có quota.
  try {
    const { getPersonalPlanLimits: fromCatalog } = require('../services/planCatalog');
    const limits = fromCatalog(code);
    if (limits) return limits;
  } catch (_) { /* ignore, fallback bảng cũ */ }
  return PERSONAL_PLAN_LIMITS[code] || PERSONAL_PLAN_LIMITS.FREE;
}

const {
  normalizePlanCode,
  getPlanLimits: getPlanLimitsFromCatalog
} = require('../services/planCatalog');

function normalizePlan(plan) {
  return normalizePlanCode(plan);
}

function getPlanLimits(plan) {
  return getPlanLimitsFromCatalog(plan);
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
  const { assertOrgCapability } = require('./orgBillingGates');
  const { refreshOrgBillingStatus } = require('./overQuotaLock');
  await refreshOrgBillingStatus(organization);
  const gate = assertOrgCapability(organization, 'canCreateBuilding');
  if (!gate.ok) return gate;

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
        `(hiện có ${used}). Nâng gói hoặc vô hiệu hóa tòa khác.`,
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
  const { assertOrgCapability } = require('./orgBillingGates');
  const { refreshOrgBillingStatus } = require('./overQuotaLock');
  await refreshOrgBillingStatus(organization);
  const gate = assertOrgCapability(organization, 'canAddUser');
  if (!gate.ok) return gate;

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

/**
 * Đếm tòa active trong Personal Workspace của 1 user (REGISTERED_USER).
 */
async function countActiveBuildingsByOwner(ownerUserId) {
  return Building.countDocuments({
    owner_user_id: ownerUserId,
    is_active: { $ne: false }
  });
}

/**
 * Quota tạo tòa cho Personal Workspace — dựa trên User.plan (bảng PERSONAL_PLAN_LIMITS).
 * @param {{ _id: any, plan?: string }} user
 */
async function assertCanCreateBuildingForUser(user) {
  if (!user) {
    return { ok: false, message: 'Tài khoản không tồn tại.', code: 'USER_MISSING' };
  }
  const { hasActivePaidPersonalPlan } = require('../services/planCatalog');
  const planActive = hasActivePaidPersonalPlan(user);
  const plan = planActive
    ? String(user.plan || 'FREE').toUpperCase()
    : 'FREE';
  const limits = getPersonalPlanLimits(plan);
  if (limits.maxBuildings == null) {
    return { ok: true, plan, limits };
  }
  const used = await countActiveBuildingsByOwner(user._id);
  if (used >= limits.maxBuildings) {
    return {
      ok: false,
      code: 'QUOTA_BUILDINGS',
      message:
        `Gói ${plan} chỉ cho phép tối đa ${limits.maxBuildings} tòa nhà ` +
        `(hiện có ${used}). Nâng cấp gói để tạo thêm.`,
      usage: { used, limit: limits.maxBuildings, plan }
    };
  }
  return { ok: true, plan, limits, usage: { used, limit: limits.maxBuildings } };
}

/**
 * Quota thêm tầng cho tòa nhà trong Personal Workspace.
 * @param {{ plan?: string, plan_expires_at?: Date }} user
 * @param {{ total_floors?: number }} building
 */
function assertCanAddFloorForUser(user, building) {
  const { hasActivePaidPersonalPlan } = require('../services/planCatalog');
  const plan = hasActivePaidPersonalPlan(user)
    ? String(user?.plan || 'FREE').toUpperCase()
    : 'FREE';
  const limits = getPersonalPlanLimits(plan);
  if (limits.maxFloorsPerBuilding == null) {
    return { ok: true, plan, limits };
  }
  const current = Number(building?.total_floors) || 0;
  if (current >= limits.maxFloorsPerBuilding) {
    return {
      ok: false,
      code: 'QUOTA_FLOORS',
      message:
        `Gói ${plan} chỉ cho phép tối đa ${limits.maxFloorsPerBuilding} tầng/tòa ` +
        `(hiện có ${current}). Nâng cấp gói để thêm tầng.`,
      usage: { used: current, limit: limits.maxFloorsPerBuilding, plan }
    };
  }
  return { ok: true, plan, limits, usage: { used: current, limit: limits.maxFloorsPerBuilding } };
}

/**
 * Quota Map (số tầng đã publish) + QR (số điểm neo) cho Personal Workspace khi PUBLISH.
 * Chỉ áp dụng cho building cá nhân (owner_user_id != null, organization_id == null).
 * Trả { ok, code, message } — caller chặn trước khi ghi Floor/QR nếu !ok.
 */
async function assertPersonalMapQrQuota(buildingId, floorNum, mapData) {
  const building = await Building.findById(buildingId)
    .select('owner_user_id organization_id')
    .lean();
  // Không phải workspace cá nhân → bỏ qua (quota tổ chức xử lý riêng)
  if (!building || building.organization_id || !building.owner_user_id) {
    return { ok: true };
  }

  const owner = await User.findById(building.owner_user_id).select('plan plan_expires_at').lean();
  const { hasActivePaidPersonalPlan } = require('../services/planCatalog');
  const planLabel = hasActivePaidPersonalPlan(owner)
    ? String(owner?.plan || 'FREE').toUpperCase()
    : 'FREE';
  const limits = getPersonalPlanLimits(planLabel);
  if (limits.maxMaps == null && limits.maxQr == null) {
    return { ok: true };
  }

  const ownerBuildingIds = await Building.find({ owner_user_id: building.owner_user_id })
    .distinct('_id');

  // ----- Map: số tầng đã publish trong toàn workspace -----
  if (limits.maxMaps != null) {
    const isNewFloor = !(await Floor.exists({ building_id: buildingId, floor_number: floorNum }));
    if (isNewFloor) {
      const publishedFloors = await Floor.countDocuments({ building_id: { $in: ownerBuildingIds } });
      if (publishedFloors >= limits.maxMaps) {
        return {
          ok: false,
          code: 'QUOTA_MAPS',
          message: `Gói ${planLabel} chỉ cho phép tối đa ${limits.maxMaps} bản đồ. Nâng cấp gói để xuất bản thêm.`,
          usage: { used: publishedFloors, limit: limits.maxMaps }
        };
      }
    }
  }

  // ----- QR: tổng số điểm neo QR trong toàn workspace -----
  if (limits.maxQr != null) {
    const anchors = Array.isArray(mapData?.qr_anchors) ? mapData.qr_anchors : [];
    const newQrCount = anchors.filter(a => a && (a.qr_id || a.serial || a.qr_code)).length;
    const otherFloorsQr = await QrCode.countDocuments({
      building_id: { $in: ownerBuildingIds },
      $nor: [{ building_id: buildingId, floor_number: floorNum }]
    });
    const total = otherFloorsQr + newQrCount;
    if (total > limits.maxQr) {
      return {
        ok: false,
        code: 'QUOTA_QR',
        message: `Gói ${planLabel} chỉ cho phép tối đa ${limits.maxQr} mã QR (bản đồ này sẽ nâng tổng lên ${total}). Nâng cấp gói hoặc giảm bớt điểm QR.`,
        usage: { used: otherFloorsQr, adding: newQrCount, limit: limits.maxQr }
      };
    }
  }

  return { ok: true };
}

module.exports = {
  PLAN_LIMITS,
  PERSONAL_PLAN_LIMITS,
  normalizePlan,
  getPlanLimits,
  getPersonalPlanLimits,
  countActiveBuildings,
  countActiveUsers,
  assertCanCreateBuilding,
  assertCanCreateUser,
  countActiveBuildingsByOwner,
  assertCanCreateBuildingForUser,
  assertCanAddFloorForUser,
  assertPersonalMapQrQuota
};
