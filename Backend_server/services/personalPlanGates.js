/**
 * My Maps / Demo plan gates — Personal Workspace (REGISTERED_USER).
 * DB plan vẫn FREE/PRO; UI Demo = FREE (không migration enum).
 *
 * Demo (FREE): 1 Workspace≈1 Building, 2 Floor, 20 QR, CAD/Export/Submit Community
 * — không Official, không Team/Org.
 */
const IndoorWorkspace = require('../models/IndoorWorkspace');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const QrCode = require('../models/QrCode');
const {
  getPersonalPlanLimits,
  hasActivePaidPersonalPlan,
  isPaidPlan
} = require('./planCatalog');
const { getPersonalPlanLimits: fallbackLimits } = require('../utils/planQuota');

/** UI brand map — không đổi mã DB */
const DISPLAY_PLAN = {
  FREE: { code: 'DEMO', label: 'Demo' },
  PRO: { code: 'CREATOR', label: 'Creator / Professional' }
};

function resolvePersonalPlanCode(userLike) {
  const raw = String(userLike?.plan || 'FREE').toUpperCase() || 'FREE';
  if (hasActivePaidPersonalPlan(userLike)) return raw;
  // Hết hạn / không trả phí → coi như Demo (FREE)
  if (!isPaidPlan(raw) || raw === 'FREE') return 'FREE';
  return 'FREE';
}

function displayPlanFor(code) {
  const c = String(code || 'FREE').toUpperCase();
  return DISPLAY_PLAN[c] || { code: c, label: c };
}

function limitsFor(userLike) {
  const code = resolvePersonalPlanCode(userLike);
  const fromCatalog = getPersonalPlanLimits(code);
  const base = fromCatalog || fallbackLimits(code) || {
    maxBuildings: 1,
    maxFloorsPerBuilding: 2,
    maxMaps: 3,
    maxQr: 20
  };
  // Phase 1: 1 Workspace = 1 Building Draft
  return {
    maxWorkspaces: base.maxBuildings,
    maxBuildings: base.maxBuildings,
    maxFloorsPerBuilding: base.maxFloorsPerBuilding,
    maxMaps: base.maxMaps,
    maxQr: base.maxQr
  };
}

function capabilitiesFor(userLike) {
  const code = resolvePersonalPlanCode(userLike);
  const isDemo = code === 'FREE';
  const paid = hasActivePaidPersonalPlan(userLike);
  return {
    canCad: true,
    canExport: true,
    canSubmitCommunity: true,
    canRequestOfficial: !isDemo && paid,
    canCreateOrg: paid,
    canInviteTeam: paid,
    label: isDemo ? 'Demo' : displayPlanFor(code).label
  };
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function assertCanRequestOfficial(userLike) {
  const caps = capabilitiesFor(userLike);
  if (caps.canRequestOfficial) return { ok: true };
  return {
    ok: false,
    code: 'PLAN_OFFICIAL_DENIED',
    message:
      'Gói Demo không gửi yêu cầu OFFICIAL. Hãy Submit COMMUNITY hoặc nâng gói Creator/Professional.'
  };
}

/**
 * Workspace kind OFFICIAL / ORG bị chặn trên Demo.
 */
function assertCanUseWorkspaceKind(userLike, kind) {
  const k = String(kind || '').toUpperCase();
  const caps = capabilitiesFor(userLike);
  if ((k === 'OFFICIAL' || k === 'ORG') && !caps.canRequestOfficial && !caps.canInviteTeam) {
    return {
      ok: false,
      code: 'PLAN_KIND_DENIED',
      message: `Gói Demo không tạo Workspace kiểu ${k}. Dùng COMMUNITY hoặc PERSONAL.`
    };
  }
  return { ok: true };
}

async function countUsage(userId) {
  if (!userId) {
    return { workspaces: 0, buildings: 0, floors: 0, qr: 0 };
  }
  const [workspaces, buildings, buildingIds] = await Promise.all([
    IndoorWorkspace.countDocuments({
      $or: [{ owner_user_id: userId }, { created_by: userId }]
    }),
    Building.countDocuments({
      owner_user_id: userId,
      is_active: { $ne: false }
    }),
    Building.find({ owner_user_id: userId, is_active: { $ne: false } })
      .select('_id')
      .lean()
  ]);
  const ids = buildingIds.map((b) => b._id);
  let floors = 0;
  let qr = 0;
  if (ids.length) {
    [floors, qr] = await Promise.all([
      Floor.countDocuments({ building_id: { $in: ids } }),
      QrCode.countDocuments({ building_id: { $in: ids } })
    ]);
  }
  return { workspaces, buildings, floors, qr };
}

/**
 * Gate tạo Workspace thêm (Phase 1 ≈ maxBuildings).
 */
async function assertCanCreateWorkspace(userLike) {
  const limits = limitsFor(userLike);
  if (limits.maxWorkspaces == null) return { ok: true, limits };
  const used = await IndoorWorkspace.countDocuments({
    $or: [
      { owner_user_id: userLike._id || userLike.userId },
      { created_by: userLike._id || userLike.userId }
    ]
  });
  if (used >= limits.maxWorkspaces) {
    return {
      ok: false,
      code: 'QUOTA_WORKSPACES',
      message:
        `Gói Demo chỉ cho phép ${limits.maxWorkspaces} Workspace ` +
        `(hiện có ${used}). Nâng gói để tạo thêm.`,
      usage: { used, limit: limits.maxWorkspaces, plan: resolvePersonalPlanCode(userLike) },
      limits
    };
  }
  return { ok: true, limits, usage: { used, limit: limits.maxWorkspaces } };
}

async function buildPlanSnapshot(userLike) {
  const code = resolvePersonalPlanCode(userLike);
  const display = displayPlanFor(code);
  const limits = limitsFor(userLike);
  const capabilities = capabilitiesFor(userLike);
  const usage = await countUsage(userLike._id || userLike.userId);
  return {
    plan: userLike.plan || 'FREE',
    effective_plan: code,
    display_plan: display.code,
    display_plan_label: display.label,
    plan_expires_at: userLike.plan_expires_at || null,
    limits,
    capabilities,
    usage
  };
}

module.exports = {
  DISPLAY_PLAN,
  resolvePersonalPlanCode,
  displayPlanFor,
  limitsFor,
  capabilitiesFor,
  assertCanRequestOfficial,
  assertCanUseWorkspaceKind,
  assertCanCreateWorkspace,
  countUsage,
  buildPlanSnapshot
};
