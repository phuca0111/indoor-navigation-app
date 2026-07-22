const identity = require('../../repositories/identityRepository');
const sessions = require('../../repositories/sessionRepository');
const memberships = require('../../repositories/membershipRepository');
const { EffectivePrincipal, TENANT_ROLES } = require('./EffectivePrincipal');
const { evaluateAuthenticationEligibility } = require('./authenticationEligibilityPolicy');
const { isIdentityQuotaLocked } = require('./identityQuotaPolicy');

function membershipReadMode() {
  const value = String(process.env.IDENTITY_MEMBERSHIP_READ_SOURCE || '').toLowerCase();
  if (['legacy', 'prefer-member', 'member'].includes(value)) {
    if (value === 'member' &&
        String(process.env.IDENTITY_MEMBERSHIP_BACKFILL_VERIFIED || '').toLowerCase() !== 'true') {
      throw Object.assign(
        new Error('Không thể cutover member trước khi backfill được verify.'),
        { status: 503, code: 'MEMBERSHIP_BACKFILL_NOT_VERIFIED' }
      );
    }
    return value;
  }
  return String(process.env.IDENTITY_MEMBER_DUAL_READ || 'true').toLowerCase() === 'false'
    ? 'legacy'
    : 'prefer-member';
}

async function resolveEffectivePrincipal(claims, { now = new Date() } = {}) {
  if (!claims?.userId) {
    throw Object.assign(new Error('JWT thiếu userId.'), { status: 401, code: 'TOKEN_INVALID' });
  }
  if (claims.sid && !await sessions.hasActiveFamily(claims.userId, claims.sid, now)) {
    throw Object.assign(new Error('Phiên đăng nhập đã bị thu hồi.'), {
      status: 401,
      code: 'SESSION_REVOKED'
    });
  }

  const user = await identity.findUserById(claims.userId);
  if (!user) {
    throw Object.assign(new Error('Tài khoản không tồn tại.'), {
      status: 403,
      code: 'USER_INACTIVE'
    });
  }
  if ((Number(claims.sv) || 0) !== (Number(user.session_version) || 0)) {
    throw Object.assign(new Error('Phiên đăng nhập đã bị thu hồi.'), {
      status: 401,
      code: 'SESSION_REVOKED'
    });
  }

  let member = null;
  const mode = membershipReadMode();
  if (TENANT_ROLES.has(user.role) && mode !== 'legacy' && user.organization_id) {
    member = await memberships.findMembership(user._id, user.organization_id);
    if (mode === 'member' && !member) {
      throw Object.assign(new Error('Chưa có membership đã backfill.'), {
        status: 403,
        code: 'MEMBERSHIP_NOT_MIGRATED'
      });
    }
  }

  const effectiveRole = member?.role || user.role;
  const organizationId = member?.organization_id || user.organization_id;
  const organization = organizationId
    ? await identity.findOrganizationById(organizationId)
    : null;
  const quotaLocked = organization && TENANT_ROLES.has(effectiveRole)
    ? await isIdentityQuotaLocked(user._id, organization)
    : false;
  const eligibility = evaluateAuthenticationEligibility({
    user: { ...user, role: effectiveRole, organization_id: organizationId },
    organization,
    member,
    quotaLocked
  });
  if (!eligibility.ok) {
    throw Object.assign(new Error(eligibility.message), eligibility);
  }

  return new EffectivePrincipal({
    userId: user._id,
    role: effectiveRole,
    organizationId,
    buildingIds: member?.building_ids || user.assigned_buildings || [],
    sessionId: claims.sid,
    sessionVersion: user.session_version,
    tokenId: claims.jti
  });
}

module.exports = { resolveEffectivePrincipal, membershipReadMode };
