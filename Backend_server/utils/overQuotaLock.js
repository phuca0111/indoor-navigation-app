// ============================================
// Phase 5.3 — Soft lock khi hết gói / vượt quota
// Grace 15 ngày sau hết hạn gói trả phí; sau đó EXPIRED; 90 ngày → ARCHIVED.
// ============================================

const Building = require('../models/Building');
const User = require('../models/User');
const Organization = require('../models/Organization');
const {
  normalizePlan,
  getPlanLimits,
  countActiveBuildings,
  countActiveUsers
} = require('./planQuota');
const { isPaidPlan: isPaidPlanFromCatalog } = require('../services/planCatalog');
const {
  GRACE_PERIOD_DAYS,
  GRACE_PERIOD_MS,
  PAID_PLAN_DEFAULT_DAYS,
  ARCHIVE_AFTER_EXPIRED_MS,
  VALID_BILLING_STATUSES,
  normalizeBillingStatus
} = require('./billingConstants');
const { assertOrgCapability, getOrgBillingCapabilities } = require('./orgBillingGates');

/** @deprecated dùng isPaidPlan() từ planCatalog — giữ alias test cũ */
const PAID_PLANS = ['PRO', 'ENTERPRISE'];
const OBJECT_ID_HEX = /^[a-f\d]{24}$/i;

function toValidObjectIdString(id) {
  if (id == null || id === '') return null;
  const s = String(id).trim();
  if (s === 'undefined' || s === 'null') return null;
  return OBJECT_ID_HEX.test(s) ? s : null;
}

function isPaidPlan(plan) {
  return isPaidPlanFromCatalog(normalizePlan(plan));
}

/**
 * Cập nhật lifecycle billing (mutates org nếu cần save).
 * Phase 5.6: ưu tiên refresh theo Subscription hiện hành (source of truth).
 */
async function refreshOrgBillingStatus(org) {
  if (!org) return org;
  const now = Date.now();

  try {
    const {
      getCurrentSubscription,
      refreshSubscriptionStatus
    } = require('../services/subscriptionLifecycle');
    const subscription = await getCurrentSubscription(org._id);
    if (subscription) {
      await refreshSubscriptionStatus(org, subscription);
      return org;
    }
  } catch (e) {
    console.warn('refreshOrgBillingStatus.subscription:', e.message);
  }

  // Fallback (org chưa có Subscription): lifecycle trên Organization fields
  if (org.billing_status === 'ARCHIVED') {
    return org;
  }

  if (org.billing_status === 'EXPIRED') {
    const expiredAt = org.billing_expired_at
      ? new Date(org.billing_expired_at).getTime()
      : (org.plan_expires_at ? new Date(org.plan_expires_at).getTime() : null);
    if (expiredAt && expiredAt + ARCHIVE_AFTER_EXPIRED_MS <= now) {
      org.billing_status = 'ARCHIVED';
      org.archived_at = org.archived_at || new Date();
      if (typeof org.save === 'function') await org.save();
    }
    return org;
  }

  if (
    org.billing_status === 'GRACE_PERIOD' &&
    org.grace_ends_at &&
    new Date(org.grace_ends_at).getTime() <= now
  ) {
    org.billing_status = 'EXPIRED';
    org.grace_ends_at = null;
    org.billing_expired_at = org.billing_expired_at || new Date();
    if (typeof org.save === 'function') await org.save();
    return org;
  }

  // Paid ACTIVE hết hạn → vào GRACE (không nhảy thẳng EXPIRED)
  if (
    (org.billing_status === 'ACTIVE' || !org.billing_status) &&
    isPaidPlan(org.plan) &&
    org.plan_expires_at &&
    new Date(org.plan_expires_at).getTime() <= now
  ) {
    org.billing_status = 'GRACE_PERIOD';
    org.grace_ends_at = new Date(now + GRACE_PERIOD_MS);
    if (typeof org.save === 'function') await org.save();
    return org;
  }

  return org;
}

/**
 * Khóa soft-quota chỉ khi org đang ACTIVE trên gói giới hạn (FREE / hạ gói)
 * và không còn trong grace. EXPIRED/ARCHIVED dùng ma trận quyền (orgBillingGates).
 */
function shouldEnforceOverQuotaLock(org) {
  if (!org) return false;
  const billing = normalizeBillingStatus(org.billing_status);
  if (billing === 'GRACE_PERIOD' || billing === 'EXPIRED' || billing === 'ARCHIVED') return false;
  if (isPaidPlan(org.plan) && billing === 'ACTIVE') return false;
  return true;
}

/**
 * Lấy danh sách _id tòa active được giữ (ưu tiên tòa tạo sớm nhất).
 */
async function getAllowedActiveBuildingIds(organizationId, maxBuildings) {
  if (maxBuildings == null) return null;
  const buildings = await Building.find({
    organization_id: organizationId,
    is_active: { $ne: false }
  })
    .sort({ createdAt: 1, _id: 1 })
    .select('_id')
    .lean();
  return buildings.slice(0, maxBuildings).map((b) => String(b._id));
}

async function isBuildingQuotaLocked(buildingId, organization) {
  if (!organization || !buildingId) return false;
  await refreshOrgBillingStatus(organization);
  if (!shouldEnforceOverQuotaLock(organization)) return false;

  const limits = getPlanLimits(organization.plan);
  if (limits.maxBuildings == null) return false;

  const used = await countActiveBuildings(organization._id);
  if (used <= limits.maxBuildings) return false;

  const allowed = await getAllowedActiveBuildingIds(organization._id, limits.maxBuildings);
  return !allowed.includes(String(buildingId));
}

/**
 * Lấy danh sách user ORG/BA active được giữ (ưu tiên ORG_ADMIN, sau đó tạo sớm nhất).
 */
async function getAllowedActiveUserIds(organizationId, maxUsers) {
  if (maxUsers == null) return null;
  const users = await User.find({
    organization_id: organizationId,
    is_active: { $ne: false },
    role: { $in: ['ORG_ADMIN', 'BUILDING_ADMIN'] }
  })
    .sort({ createdAt: 1, _id: 1 })
    .select('_id role')
    .lean();

  const orgAdmins = users.filter((u) => u.role === 'ORG_ADMIN');
  const buildingAdmins = users.filter((u) => u.role === 'BUILDING_ADMIN');
  const ordered = [...orgAdmins, ...buildingAdmins];
  return ordered.slice(0, maxUsers).map((u) => String(u._id));
}

async function isUserQuotaLocked(userId, organization) {
  if (!organization || !userId) return false;
  await refreshOrgBillingStatus(organization);
  if (!shouldEnforceOverQuotaLock(organization)) return false;

  const limits = getPlanLimits(organization.plan);
  if (limits.maxUsers == null) return false;

  const used = await countActiveUsers(organization._id);
  if (used <= limits.maxUsers) return false;

  const allowed = await getAllowedActiveUserIds(organization._id, limits.maxUsers);
  return !allowed.includes(String(userId));
}

/**
 * Gắn quota_locked cho danh sách user (cùng org hoặc nhiều org).
 */
async function annotateUsersQuotaLock(organization, users) {
  if (!organization || !Array.isArray(users) || !users.length) {
    return users;
  }
  await refreshOrgBillingStatus(organization);
  if (!shouldEnforceOverQuotaLock(organization)) {
    return users.map((u) => ({ ...u, quota_locked: false }));
  }

  const limits = getPlanLimits(organization.plan);
  if (limits.maxUsers == null) {
    return users.map((u) => ({ ...u, quota_locked: false }));
  }

  const allowed = await getAllowedActiveUserIds(organization._id, limits.maxUsers);
  const allowedSet = new Set(allowed);
  return users.map((u) => {
    if (!['ORG_ADMIN', 'BUILDING_ADMIN'].includes(u.role)) {
      return { ...u, quota_locked: false };
    }
    const active = u.is_active !== false;
    const locked = active && !allowedSet.has(String(u._id));
    return { ...u, quota_locked: locked };
  });
}

async function annotateUsersQuotaLockForList(users) {
  if (!Array.isArray(users) || !users.length) return users;
  const orgIds = [...new Set(users.map((u) => toValidObjectIdString(u.organization_id)).filter(Boolean))];
  if (!orgIds.length) {
    return users.map((u) => ({ ...u, quota_locked: false }));
  }

  const orgs = await Organization.find({ _id: { $in: orgIds } });
  const orgMap = Object.fromEntries(orgs.map((o) => [String(o._id), o]));
  const byOrg = {};
  users.forEach((u) => {
    const key = toValidObjectIdString(u.organization_id) || '';
    if (!byOrg[key]) byOrg[key] = [];
    byOrg[key].push(u);
  });

  const result = [];
  for (const [orgKey, list] of Object.entries(byOrg)) {
    const org = orgMap[orgKey];
    if (org && orgKey) {
      result.push(...(await annotateUsersQuotaLock(org, list)));
    } else {
      result.push(...list.map((u) => ({ ...u, quota_locked: false })));
    }
  }
  return result;
}

/**
 * Gắn quota_locked cho danh sách building (cùng org).
 */
async function annotateBuildingsQuotaLock(organization, buildings) {
  if (!organization || !Array.isArray(buildings) || !buildings.length) {
    return buildings;
  }
  await refreshOrgBillingStatus(organization);
  if (!shouldEnforceOverQuotaLock(organization)) {
    return buildings.map((b) => ({ ...b, quota_locked: false }));
  }

  const limits = getPlanLimits(organization.plan);
  if (limits.maxBuildings == null) {
    return buildings.map((b) => ({ ...b, quota_locked: false }));
  }

  const allowed = await getAllowedActiveBuildingIds(organization._id, limits.maxBuildings);
  const allowedSet = new Set(allowed);
  return buildings.map((b) => {
    const active = b.is_active !== false;
    const locked = active && !allowedSet.has(String(b._id));
    return { ...b, quota_locked: locked };
  });
}

/**
 * Snapshot quota + billing cho dashboard / API.
 */
async function getOrgQuotaSnapshot(org) {
  if (!org) return null;
  await refreshOrgBillingStatus(org);

  const plan = normalizePlan(org.plan);
  const limits = getPlanLimits(plan);

  const [buildingsUsed, usersUsed] = await Promise.all([
    countActiveBuildings(org._id),
    countActiveUsers(org._id)
  ]);

  let lockedBuildings = 0;
  let lockedUsers = 0;
  if (shouldEnforceOverQuotaLock(org) && limits.maxBuildings != null && buildingsUsed > limits.maxBuildings) {
    lockedBuildings = buildingsUsed - limits.maxBuildings;
  }
  if (shouldEnforceOverQuotaLock(org) && limits.maxUsers != null && usersUsed > limits.maxUsers) {
    lockedUsers = usersUsed - limits.maxUsers;
  }

  const graceEndsAt = org.grace_ends_at ? new Date(org.grace_ends_at) : null;
  let graceDaysLeft = null;
  if (org.billing_status === 'GRACE_PERIOD' && graceEndsAt) {
    graceDaysLeft = Math.max(0, Math.ceil((graceEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  }

  const capabilities = getOrgBillingCapabilities(org);

  return {
    plan,
    billing_status: normalizeBillingStatus(org.billing_status),
    grace_ends_at: graceEndsAt,
    grace_days_left: graceDaysLeft,
    grace_period_days: GRACE_PERIOD_DAYS,
    billing_expired_at: org.billing_expired_at || null,
    archived_at: org.archived_at || null,
    plan_started_at: org.plan_started_at || null,
    plan_expires_at: org.plan_expires_at || null,
    capabilities,
    capabilities_message: capabilities.message,
    buildings: {
      used: buildingsUsed,
      limit: limits.maxBuildings,
      locked: lockedBuildings,
      over: limits.maxBuildings != null && buildingsUsed > limits.maxBuildings
    },
    users: {
      used: usersUsed,
      limit: limits.maxUsers,
      locked: lockedUsers,
      over: limits.maxUsers != null && usersUsed > limits.maxUsers
    },
    enforcement_active: shouldEnforceOverQuotaLock(org)
  };
}

/**
 * Khi Super Admin đổi plan — bật grace hoặc reset billing.
 * Phase 5.6: đồng bộ tạo/expire Subscription tương ứng.
 */
async function handlePlanChangeBilling(org, oldPlan, newPlan, options = {}) {
  const wasPaid = isPaidPlan(oldPlan);
  const nowPaid = isPaidPlan(newPlan);

  if (nowPaid) {
    org.billing_status = 'ACTIVE';
    org.grace_ends_at = null;
    // Khi lên PRO/ENTERPRISE (dù trước đó đã bị EXPIRED),
    // luôn reset mốc gói để UI không báo "đã hết" từ lần trước.
    org.plan_started_at = new Date();
    org.plan_expires_at = new Date(Date.now() + PAID_PLAN_DEFAULT_DAYS * 24 * 60 * 60 * 1000);

    try {
      const { activateOrRenewSubscription } = require('../services/subscriptionLifecycle');
      await activateOrRenewSubscription({
        org,
        plan: newPlan,
        periodStart: org.plan_started_at,
        periodEnd: org.plan_expires_at,
        amount: 0,
        note: options.note || `Super Admin đổi gói ${oldPlan} → ${newPlan}`,
        createdBy: options.changedBy || null,
        provider: 'MANUAL',
        recordHistory: false
      });
    } catch (e) {
      console.warn('handlePlanChangeBilling.activateSubscription:', e.message);
    }
    return;
  }

  if (wasPaid && !nowPaid) {
    // Super Admin hạ gói thủ công → khóa quota ngay (ACTIVE), không grace 7 ngày.
    // Grace chỉ dùng khi cổng thanh toán hết hạn (Phase 5.5+).
    org.billing_status = 'ACTIVE';
    org.grace_ends_at = null;
    org.plan_expires_at = new Date();

    try {
      const { expireCurrentSubscription } = require('../services/subscriptionLifecycle');
      await expireCurrentSubscription(org, {
        createdBy: options.changedBy || null,
        note: options.note || `Super Admin hạ gói ${oldPlan} → ${newPlan}`,
        source: 'MANUAL_SUPER_ADMIN',
        recordHistory: false
      });
      // Giữ ACTIVE để khóa quota ngay theo chính sách hạ gói thủ công.
      org.billing_status = 'ACTIVE';
      if (typeof org.save === 'function') await org.save();
    } catch (e) {
      console.warn('handlePlanChangeBilling.expireSubscription:', e.message);
    }
    return;
  }

  org.billing_status = 'ACTIVE';
  org.grace_ends_at = null;
}

async function assertUserWritable(userId, organization) {
  const locked = await isUserQuotaLocked(userId, organization);
  if (!locked) return { ok: true };
  return {
    ok: false,
    code: 'OVER_QUOTA_USER_LOCKED',
    message:
      'Tài khoản bị khóa do vượt hạn mức gói. Vô hiệu hóa tài khoản không dùng hoặc nâng cấp PRO/ENTERPRISE.'
  };
}

/**
 * @returns {{ ok: true } | { ok: false, message: string, code: string }}
 */
async function assertBuildingWritable(buildingId, organization) {
  if (organization) {
    await refreshOrgBillingStatus(organization);
    const gate = assertOrgCapability(organization, 'canEdit');
    if (!gate.ok) return gate;
  }
  const locked = await isBuildingQuotaLocked(buildingId, organization);
  if (!locked) return { ok: true };
  // OVER LIMIT: vẫn cho xem/sửa — chỉ chặn tạo mới ở assertCanCreate*
  return { ok: true, over_quota: true };
}

async function assertBuildingCanUploadCad(buildingId, organization) {
  if (organization) {
    await refreshOrgBillingStatus(organization);
    const gate = assertOrgCapability(organization, 'canUploadCad');
    if (!gate.ok) return gate;
  }
  return assertBuildingWritable(buildingId, organization);
}

module.exports = {
  GRACE_PERIOD_DAYS,
  PAID_PLAN_DEFAULT_DAYS,
  PAID_PLANS,
  VALID_BILLING_STATUSES,
  isPaidPlan,
  normalizeBillingStatus,
  refreshOrgBillingStatus,
  shouldEnforceOverQuotaLock,
  getAllowedActiveBuildingIds,
  getAllowedActiveUserIds,
  isBuildingQuotaLocked,
  isUserQuotaLocked,
  annotateBuildingsQuotaLock,
  annotateUsersQuotaLock,
  annotateUsersQuotaLockForList,
  getOrgQuotaSnapshot,
  handlePlanChangeBilling,
  assertBuildingWritable,
  assertBuildingCanUploadCad,
  assertUserWritable
};
