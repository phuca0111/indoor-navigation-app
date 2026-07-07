const Organization = require('../models/Organization');

/**
 * Kiểm tra org của user còn hoạt động (ORG_ADMIN / BUILDING_ADMIN).
 * SUPER_ADMIN luôn pass.
 */
async function assertUserOrgActive(user) {
  if (!user || user.role === 'SUPER_ADMIN') {
    return { ok: true };
  }
  if (!['ORG_ADMIN', 'BUILDING_ADMIN'].includes(user.role)) {
    return { ok: true };
  }
  if (!user.organization_id) {
    return { ok: false, message: 'Tài khoản chưa được gán tổ chức.', code: 'ORG_MISSING' };
  }
  const org = await Organization.findById(user.organization_id).select('is_active name').lean();
  if (!org) {
    return { ok: false, message: 'Tổ chức không tồn tại.', code: 'ORG_NOT_FOUND' };
  }
  if (!org.is_active) {
    return {
      ok: false,
      message: `Tổ chức "${org.name}" đã bị tạm dừng. Vui lòng liên hệ Super Admin.`,
      code: 'ORG_INACTIVE'
    };
  }
  return { ok: true };
}

module.exports = { assertUserOrgActive };
