const TENANT_ROLES = new Set(['ORG_ADMIN', 'BUILDING_ADMIN']);

function deny(status, code, message) {
  return { ok: false, status, code, message };
}

function evaluateAuthenticationEligibility({ user, organization = null, member = null, quotaLocked = false }) {
  if (!user || user.is_active === false) {
    return deny(403, 'USER_INACTIVE', 'Không thể đăng nhập vào tài khoản này.');
  }
  if (!TENANT_ROLES.has(user.role)) return { ok: true };
  if (!user.organization_id) {
    return deny(403, 'ORG_MISSING', 'Tài khoản chưa được gán tổ chức.');
  }
  if (!organization || organization.is_active === false) {
    return deny(403, 'ORG_INACTIVE', 'Tổ chức đã bị vô hiệu hóa.');
  }
  if (member && member.status !== 'ACTIVE') {
    return deny(403, 'MEMBER_INACTIVE', 'Tư cách thành viên tổ chức không hoạt động.');
  }
  if (quotaLocked) {
    return deny(
      403,
      'OVER_QUOTA_USER_LOCKED',
      'Tài khoản bị khóa do vượt hạn mức gói. Liên hệ ORG Admin hoặc nâng cấp PRO.'
    );
  }
  return { ok: true };
}

module.exports = { evaluateAuthenticationEligibility, TENANT_ROLES };
