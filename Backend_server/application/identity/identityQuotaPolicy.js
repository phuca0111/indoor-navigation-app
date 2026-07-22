const identity = require('../../repositories/identityRepository');
const {
  normalizePlanCode,
  getPlanLimits,
  isPaidPlan
} = require('../../services/planCatalog');
const { assertOrgCapability } = require('../../utils/orgBillingGates');
const { normalizeBillingStatus } = require('../../utils/billingConstants');

async function evaluateCreateUserQuota(organization) {
  if (!organization) {
    return { ok: false, message: 'Organization không tồn tại.', code: 'ORG_MISSING' };
  }
  const capability = assertOrgCapability(organization, 'canAddUser');
  if (!capability.ok) return capability;
  const plan = normalizePlanCode(organization.plan);
  const limits = getPlanLimits(plan);
  if (limits.maxUsers == null) return { ok: true, plan, limits };
  const users = await identity.listActiveTenantUsersInQuotaOrder(organization._id);
  if (users.length >= limits.maxUsers) {
    return {
      ok: false,
      code: 'QUOTA_USERS',
      message: `Gói ${plan} chỉ cho phép tối đa ${limits.maxUsers} tài khoản đang hoạt động.`,
      usage: { used: users.length, limit: limits.maxUsers, plan }
    };
  }
  return {
    ok: true,
    plan,
    limits,
    usage: { used: users.length, limit: limits.maxUsers }
  };
}

async function isIdentityQuotaLocked(userId, organization) {
  if (!organization || !userId) return false;
  const billing = normalizeBillingStatus(organization.billing_status);
  if (billing === 'GRACE_PERIOD' || billing === 'EXPIRED' || billing === 'ARCHIVED') return false;
  if (isPaidPlan(organization.plan) && billing === 'ACTIVE') return false;
  const limits = getPlanLimits(normalizePlanCode(organization.plan));
  if (limits.maxUsers == null) return false;
  const users = await identity.listActiveTenantUsersInQuotaOrder(organization._id);
  if (users.length <= limits.maxUsers) return false;
  return !users.slice(0, limits.maxUsers).some((user) => String(user._id) === String(userId));
}

module.exports = { evaluateCreateUserQuota, isIdentityQuotaLocked };
