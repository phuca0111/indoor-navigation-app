// ============================================
// Phase 5.3 — Soft lock khi hết gói / vượt quota FREE
// Grace 7 ngày sau hạ gói PRO→FREE, sau đó khóa tòa vượt hạn mức.
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

const GRACE_PERIOD_DAYS = 7;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
// Khi Super Admin chuyển sang PRO/ENTERPRISE (chưa có cổng thanh toán thật),
// dùng thời hạn mặc định để UI có thể hiển thị "đến ngày ...".
const PAID_PLAN_DEFAULT_DAYS = 30;
const PAID_PLANS = ['PRO', 'ENTERPRISE'];
const VALID_BILLING_STATUSES = ['ACTIVE', 'GRACE_PERIOD', 'EXPIRED'];
const OBJECT_ID_HEX = /^[a-f\d]{24}$/i;

function toValidObjectIdString(id) {
  if (id == null || id === '') return null;
  const s = String(id).trim();
  if (s === 'undefined' || s === 'null') return null;
  return OBJECT_ID_HEX.test(s) ? s : null;
}

function isPaidPlan(plan) {
  return PAID_PLANS.includes(normalizePlan(plan));
}

function normalizeBillingStatus(status) {
  const s = String(status || 'ACTIVE').toUpperCase();
  return VALID_BILLING_STATUSES.includes(s) ? s : 'ACTIVE';
}

/**
 * Cập nhật GRACE_PERIOD → EXPIRED nếu đã quá hạn (mutates org nếu cần save).
 * Phase 5.6: ưu tiên refresh theo Subscription hiện hành (source of truth).
 */
async function refreshOrgBillingStatus(org) {
  if (!org) return org;
  const now = Date.now();

  // Phase 5.6 — nếu có subscription hiện hành, sync từ đó.
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

  // Fallback (org chưa có bản ghi Subscription): dùng plan_expires_at trên Organization.
  if (
    isPaidPlan(org.plan) &&
    org.plan_expires_at &&
    new Date(org.plan_expires_at).getTime() <= now
  ) {
    org.billing_status = 'EXPIRED';
    org.plan = 'FREE';
    org.grace_ends_at = null;
    if (typeof org.save === 'function') {
      await org.save();
    }
    return org;
  }

  if (
    org.billing_status === 'GRACE_PERIOD' &&
    org.grace_ends_at &&
    new Date(org.grace_ends_at).getTime() <= now
  ) {
    org.billing_status = 'EXPIRED';
    if (typeof org.save === 'function') {
      await org.save();
    }
  }
  return org;
}

/**
 * Có áp dụng khóa tòa vượt quota không.
 * FREE (kể cả ACTIVE) + hết grace → khóa phần vượt; PRO/ENTERPRISE ACTIVE → không khóa.
 */
function shouldEnforceOverQuotaLock(org) {
  if (!org) return false;
  const billing = normalizeBillingStatus(org.billing_status);
  if (billing === 'GRACE_PERIOD') return false;
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

  return {
    plan,
    billing_status: normalizeBillingStatus(org.billing_status),
    grace_ends_at: graceEndsAt,
    grace_days_left: graceDaysLeft,
    plan_started_at: org.plan_started_at || null,
    plan_expires_at: org.plan_expires_at || null,
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
  const locked = await isBuildingQuotaLocked(buildingId, organization);
  if (!locked) return { ok: true };
  return {
    ok: false,
    code: 'OVER_QUOTA_LOCKED',
    message:
      'Tòa nhà này bị khóa do vượt hạn mức gói sau khi hết thời gian gia hạn. ' +
      'Vô hiệu hóa bớt tòa hoặc nâng cấp gói PRO/ENTERPRISE.'
  };
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
  assertUserWritable
};
