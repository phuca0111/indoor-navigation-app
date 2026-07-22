/**
 * Ma trận quyền theo Organization.billing_status
 * ACTIVE → GRACE_PERIOD (15d) → EXPIRED → ARCHIVED (90d sau expire)
 */
const { GRACE_PERIOD_DAYS, normalizeBillingStatus } = require('./billingConstants');

const MESSAGES = {
  GRACE_PERIOD:
    `Gói đã hết hạn. Gia hạn trong ${GRACE_PERIOD_DAYS} ngày để tiếp tục sử dụng đầy đủ.`,
  EXPIRED:
    'Gói đã hết hạn gia hạn. Chỉ còn xem dữ liệu / Dashboard. Gia hạn để mở lại đầy đủ.',
  ARCHIVED:
    'Tổ chức đã lưu trữ. Gia hạn để khôi phục. Dữ liệu vẫn được giữ trong hệ thống.'
};

function getOrgBillingCapabilities(org) {
  const status = normalizeBillingStatus(org?.billing_status);
  const base = {
    status,
    canLogin: true,
    canView: true,
    canDashboard: true,
    canEdit: true,
    canPublish: true,
    canCreateBuilding: true,
    canAddUser: true,
    canUploadCad: true,
    canNavigation: true,
    canCreateQr: true,
    canPay: true,
    canExport: true,
    message: null
  };

  if (status === 'ACTIVE') return base;

  if (status === 'GRACE_PERIOD') {
    return {
      ...base,
      canPublish: false,
      canCreateBuilding: false,
      canAddUser: false,
      canUploadCad: false,
      message: MESSAGES.GRACE_PERIOD
    };
  }

  if (status === 'EXPIRED') {
    return {
      ...base,
      canEdit: false,
      canPublish: false,
      canCreateBuilding: false,
      canAddUser: false,
      canUploadCad: false,
      canNavigation: false,
      canCreateQr: false,
      message: MESSAGES.EXPIRED
    };
  }

  // ARCHIVED
  return {
    ...base,
    canView: true,
    canDashboard: true,
    canEdit: false,
    canPublish: false,
    canCreateBuilding: false,
    canAddUser: false,
    canUploadCad: false,
    canNavigation: false,
    canCreateQr: false,
    canExport: true,
    message: MESSAGES.ARCHIVED
  };
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, message: string, billing_status: string }}
 */
function assertOrgCapability(org, capability) {
  const caps = getOrgBillingCapabilities(org);
  if (caps[capability]) return { ok: true, capabilities: caps };
  return {
    ok: false,
    code: 'BILLING_' + caps.status,
    message: caps.message || 'Tổ chức không được phép thao tác này do trạng thái gói.',
    billing_status: caps.status,
    capabilities: caps
  };
}

module.exports = {
  getOrgBillingCapabilities,
  assertOrgCapability,
  BILLING_CAPABILITY_MESSAGES: MESSAGES
};
