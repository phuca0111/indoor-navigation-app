// ============================================================
// 1. CONFIG & CONSTANTS
// Dùng relative URL để dashboard gọi đúng backend trên cùng domain.
// Khi deploy lên Render, cùng domain nên không cần CORS.
const API_URL = '/api';

const PAGE_SIZE = 15;
const LOGS_PAGE_SIZE = 20;
const PLAN_LIMITS_UI = { FREE: { buildings: 2, users: 5 }, PRO: { buildings: 20, users: 50 } };

const VALID_DASHBOARD_TABS = new Set(['buildings', 'users', 'logs', 'organizations', 'billing', 'analytics', 'registrations', 'profile']);

function validatePasswordStrengthClient(password) {
  const errors = [];
  if (!password || password.length < 8) {
    errors.push('Mật khẩu phải có ít nhất 8 ký tự.');
    return errors;
  }
  if (!/[a-z]/.test(password)) errors.push('Mật khẩu phải chứa ít nhất 1 chữ thường.');
  if (!/[A-Z]/.test(password)) errors.push('Mật khẩu phải chứa ít nhất 1 chữ hoa.');
  if (!/\d/.test(password)) errors.push('Mật khẩu phải chứa ít nhất 1 số.');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt.');
  }
  return errors;
}

function validateFullNameClient(name) {
  const errors = [];
  const value = String(name || '').trim();
  if (!value) {
    errors.push('Họ tên là bắt buộc.');
    return errors;
  }
  if (value.length < 2) errors.push('Họ tên phải có ít nhất 2 ký tự.');
  if (/[0-9]/.test(value)) {
    errors.push('Họ tên không được chứa chữ số.');
  }
  if (!/^[\p{L}\s'.-]+$/u.test(value)) {
    errors.push('Họ tên chỉ được chứa chữ cái, khoảng trắng, dấu gạch ngang hoặc dấu nháy.');
  }
  const letters = value.match(/\p{L}/gu);
  if (!letters || letters.length < 2) errors.push('Họ tên phải có ít nhất 2 chữ cái.');
  return errors;
}

function dashboardTabHref(tab) {
  return '/admin/dashboard.html#' + encodeURIComponent(tab);
}

function sanitizeTabForRole(tab, role) {
  if (!role) return tab;
  if (role === 'BUILDING_ADMIN') {
    if (tab === 'users' || tab === 'logs' || tab === 'organizations') return 'buildings';
  }
  if (role === 'ORG_ADMIN' && tab === 'organizations') return 'buildings';
  if (role !== 'SUPER_ADMIN' && tab === 'registrations') return 'buildings';
  if (role === 'BUILDING_ADMIN' && tab === 'billing') return 'buildings';
  if (role === 'BUILDING_ADMIN' && tab === 'analytics') return 'buildings';
  return tab;
}

function resolveDashboardTab(name) {
  const raw = name && VALID_DASHBOARD_TABS.has(name) ? name : 'buildings';
  return sanitizeTabForRole(raw, currentUser?.role);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tdEllipsis(text, innerHtml) {
  const safe = escapeHtml(text || '');
  const body = innerHtml != null ? innerHtml : escapeHtml(text || '-');
  if (!safe) return '<td>-</td>';
  return '<td title="' + safe + '"><span class="cell-ellipsis">' + body + '</span></td>';
}

/** Phase 4.2b — hiển thị nhiều ORG_ADMIN trong bảng tổ chức */
function getOrgAdminsList(org) {
  if (Array.isArray(org.org_admins) && org.org_admins.length) return org.org_admins;
  if (org.org_admin) return [org.org_admin];
  return [];
}

function formatOrgAdminsCell(org) {
  const admins = getOrgAdminsList(org);
  if (!admins.length) return { plain: '', html: '—' };
  const plain = admins.map((a) => a.full_name || a.email || '?').join(', ');
  const html = '<div class="org-admins-cell">' + admins.map((a) => {
    const label = escapeHtml(a.full_name || a.email || '?');
    const locked = a.is_active === false ? '<span class="admin-inactive-tag">khóa</span>' : '';
    const tip = escapeHtml((a.full_name ? a.full_name + ' — ' : '') + (a.email || ''));
    return '<span class="org-admin-chip" title="' + tip + '">' + label + locked + '</span>';
  }).join('') + '</div>';
  return { plain, html };
}

/** Phase 4.2c — tòa PUBLISHED / DRAFT trong bảng tổ chức */
function getOrgQuotaOverHint(org) {
  if (!org) return '';
  const plan = String(org.plan || 'FREE').toUpperCase();
  const lim = PLAN_LIMITS_UI[plan] || PLAN_LIMITS_UI.FREE;
  const billing = String(org.billing_status || 'ACTIVE').toUpperCase();
  if (billing === 'GRACE_PERIOD') return 'Đang gia hạn';
  if (billing === 'ACTIVE' && (plan === 'PRO' || plan === 'ENTERPRISE')) return '';
  const parts = [];
  const b = Number(org.building_count) || 0;
  const u = Number(org.user_count) || 0;
  if (lim.buildings != null && b > lim.buildings) parts.push('tòa ' + b + '/' + lim.buildings);
  if (lim.users != null && u > lim.users) parts.push('tài khoản ' + u + '/' + lim.users);
  return parts.length ? 'Vượt hạn mức: ' + parts.join(' · ') : '';
}

function formatBuildingCountCell(org, orgId) {
  if (org.building_count == null) return '—';
  const total = Number(org.building_count) || 0;
  const pub = Number(org.building_published_count) || 0;
  const draft = Number(org.building_draft_count) || 0;
  const overHint = getOrgQuotaOverHint(org);
  const tip = 'Tổng ' + total + ' · Xuất bản ' + pub + ' · Nháp ' + draft + (overHint ? ' · ' + overHint : '');
  const warn = overHint ? ' obc-over' : '';
  return '<div class="org-building-counts' + warn + '" title="' + escapeHtml(tip) + '" onclick="jumpToBuildings(\'' + orgId + '\')" style="cursor:pointer;">' +
    '<div class="obc-total">' + total + (overHint ? ' <span class="obc-warn" title="' + escapeHtml(overHint) + '">⚠</span>' : '') + '</div>' +
    '<div class="obc-split">' +
      '<span class="obc-pub">' + pub + ' XB</span>' +
      '<span class="obc-sep">·</span>' +
      '<span class="obc-draft">' + draft + ' nháp</span>' +
    '</div></div>';
}

const PAGINATION_CONFIG = {
  buildings: {
    containerId: 'buildingsPagination',
    pageVar: '_buildingsPage',
    render: () => renderBuildingsFromCache()
  },
  users: {
    containerId: 'usersPagination',
    pageVar: '_usersPage',
    render: () => renderUsersFromCache()
  },
  organizations: {
    containerId: 'organizationsPagination',
    pageVar: '_organizationsPage',
    render: () => renderOrganizationsFromCache()
  }
};

function renderPagination(tabKey, totalItems, currentPage) {
  const cfg = PAGINATION_CONFIG[tabKey];
  if (!cfg) return;
  const container = document.getElementById(cfg.containerId);
  if (!container) return;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const page = Math.min(Math.max(1, currentPage), totalPages);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  let html = '<span class="page-info">Trang ' + page + '/' + totalPages + ' (' + totalItems + ' mục)</span> ';
  html += '<button type="button" data-page="' + prev + '"' + (page <= 1 ? ' disabled' : '') + '>&laquo;</button>';
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  for (let i = start; i <= end; i++) {
    if (i === page) {
      html += '<span class="page-info" style="background:#3498db;color:#fff;padding:6px 10px;border-radius:4px;">' + i + '</span>';
    } else {
      html += '<button type="button" data-page="' + i + '">' + i + '</button>';
    }
  }
  html += '<button type="button" data-page="' + next + '"' + (page >= totalPages ? ' disabled' : '') + '>&raquo;</button>';
  container.innerHTML = html;
  container.querySelectorAll('button[data-page]').forEach(btn => {
    btn.onclick = () => {
      window[cfg.pageVar] = parseInt(btn.getAttribute('data-page'), 10);
      cfg.render();
    };
  });
}

const WIDE_LAYOUT_TABS = new Set(['buildings', 'users', 'logs', 'organizations', 'billing', 'analytics', 'registrations']);

function applyDashboardLayout(tabName) {
  const root = document.querySelector('.dashboard-content');
  if (!root) return;
  if (WIDE_LAYOUT_TABS.has(tabName)) root.classList.add('wide-layout');
  else root.classList.remove('wide-layout');
}


let currentUser = null;
let allOrganizations = [];
// Wrapper cho fetch() tự động thêm Authorization header từ localStorage
function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const url = API_URL + endpoint;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }
  return fetch(url, {
    ...options,
    headers
  });
}
// ============================================================
// HELPER: Xóa toàn bộ auth data khỏi localStorage
// WHY: Đảm bảo logout/clear session hoàn toàn, không để token cũ.
function clearAuthStorage() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userId');
  localStorage.removeItem('authEvent');
  localStorage.removeItem('activeDashboardTab');
}

// ============================================================
// APPLY CURRENT USER TO UI
// WHY: Cập nhật toàn bộ UI header và tab visibility theo currentUser.
// ============================================================
function formatOrgBillingBadge(org) {
  if (!org) return '';
  const label = escapeHtml(formatPlanLabel(org));
  return '<span class="badge plan-badge plan-' + String(org.plan || 'FREE').toLowerCase() + '">' + label + '</span>';
}

function formatDetailUserStatus(u) {
  if (u.quota_locked) {
    return '<span class="status-badge inactive badge-quota-locked">Khóa hạn mức</span>';
  }
  if (u.is_active === false) {
    return '<span class="status-badge inactive">Đã khóa</span>';
  }
  return '<span class="status-badge active">Hoạt động</span>';
}

function formatBuildingStatusVi(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'PUBLISHED') return 'Đã xuất bản';
  if (s === 'DRAFT') return 'Bản nháp';
  return status || '—';
}

function formatDetailBuildingStatus(b) {
  const parts = [];
  if (b.is_active === false) parts.push('<span class="status-badge inactive">Vô hiệu</span>');
  if (b.quota_locked) parts.push('<span class="badge badge-quota-locked">Khóa hạn mức</span>');
  if (!parts.length) parts.push('<span class="status-badge active">' + escapeHtml(formatBuildingStatusVi(b.status || 'DRAFT')) + '</span>');
  else if (b.status) parts.push('<span class="org-detail-hint">' + escapeHtml(formatBuildingStatusVi(b.status)) + '</span>');
  return parts.join(' ');
}

function formatDetailQuotaBanner(quota, org) {
  if (!quota) return '';
  const parts = [];
  if (quota.buildings?.limit != null) {
    parts.push('Tòa đang dùng ' + quota.buildings.used + '/' + quota.buildings.limit);
  }
  if (quota.users?.limit != null) {
    parts.push('Tài khoản đang dùng ' + quota.users.used + '/' + quota.users.limit);
  }
  if (quota.buildings?.locked > 0) parts.push(quota.buildings.locked + ' tòa bị khóa');
  if (quota.users?.locked > 0) parts.push(quota.users.locked + ' tài khoản bị khóa');
  if (!parts.length) return '';

  let msg = parts.join(' · ');
  if (quota.billing_status === 'GRACE_PERIOD') {
    msg = '⏳ Gia hạn ' + (quota.grace_days_left != null ? quota.grace_days_left + ' ngày' : '') +
      ' — sau đó khóa phần vượt hạn mức. ' + msg;
  } else if (quota.enforcement_active && (quota.buildings?.locked > 0 || quota.users?.locked > 0)) {
    msg = '🔒 ' + msg + ' — cần giảm tài nguyên hoặc nâng gói Pro/Doanh nghiệp.';
  } else if (quota.buildings?.over || quota.users?.over) {
    msg = '⚠️ ' + msg + ' — đang vượt hạn mức gói ' + escapeHtml(formatPlanNameVi(org?.plan || 'FREE')) + '.';
  }

  const cls = (quota.enforcement_active && (quota.buildings?.locked > 0 || quota.users?.locked > 0))
    ? 'org-detail-quota-banner locked'
    : 'org-detail-quota-banner warn';
  return '<div class="' + cls + '">' + msg + '</div>';
}

function formatPlanExpiryLine(org, quota) {
  const started = org?.plan_started_at || quota?.plan_started_at;
  const expires = org?.plan_expires_at || quota?.plan_expires_at;
  if (!started && !expires) return '';
  let html = '<div class="org-detail-subscription">';
  if (started) {
    html += '<span>Gói từ: <strong>' + escapeHtml(formatDateTime(started)) + '</strong></span>';
  }
  if (expires) {
    const end = new Date(expires);
    const daysLeft = Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    const expired = daysLeft <= 0;
    html += ' · <span>Hết hạn: <strong>' + escapeHtml(formatDateTime(expires)) + '</strong>';
    if (!expired && isPaidPlanUi(org?.plan || quota?.plan)) {
      html += ' (còn ' + daysLeft + ' ngày)';
    } else if (expired) {
      html += ' <span class="obc-warn">(đã hết)</span>';
    }
    html += '</span>';
  }
  html += '</div>';
  return html;
}

function isPaidPlanUi(plan) {
  const p = String(plan || 'FREE').toUpperCase();
  return p === 'PRO' || p === 'ENTERPRISE';
}

function getBillingContextOrg(orgId) {
  if (_billingTabData && String(_billingTabOrgId) === String(orgId)) {
    return _billingTabData.organization || {};
  }
  if (_orgDetailData && String(_orgDetailId) === String(orgId)) {
    return _orgDetailData.organization || {};
  }
  return allOrganizations.find((o) => String(o._id) === String(orgId)) || {};
}

function resolveOrgBillingUiState(org, subscription, quota) {
  const billing = String(org?.billing_status || quota?.billing_status || 'ACTIVE').toUpperCase();
  const plan = String(org?.plan || 'FREE').toUpperCase();
  const subStatus = String(subscription?.status || '').toUpperCase();
  if (billing === 'GRACE_PERIOD') return 'GRACE';
  if (billing === 'EXPIRED' || subStatus === 'PAST_DUE' || subStatus === 'EXPIRED') return 'EXPIRED';
  if (isPaidPlanUi(plan) && billing === 'ACTIVE') return 'PAID_ACTIVE';
  return 'FREE';
}

const BILLING_UI_STATE_LABELS = {
  FREE: 'Gói Miễn phí',
  PAID_ACTIVE: 'Gói trả phí đang hoạt động',
  GRACE: 'Đang trong thời gian gia hạn',
  EXPIRED: 'Gói hết hạn / quá hạn thanh toán'
};

function renderOrgBillingActionPanel(oid, org, subscription, quota) {
  const state = resolveOrgBillingUiState(org, subscription, quota);
  const plan = String(org?.plan || 'FREE').toUpperCase();
  let actions = '';

  if (state === 'FREE' || state === 'EXPIRED') {
    actions += '<div class="org-sub-group">' +
      '<div class="org-sub-group-title">Kích hoạt gói trả phí</div>' +
      '<div class="org-plan-actions">' +
        '<button type="button" class="btn-create" onclick="activateOrgSubscriptionUi(\'' + oid + '\', \'PRO\')">Kích hoạt Pro</button>' +
        '<button type="button" class="btn-edit" onclick="activateOrgSubscriptionUi(\'' + oid + '\', \'ENTERPRISE\')">Kích hoạt Doanh nghiệp</button>' +
      '</div></div>';
  }

  if (state === 'PAID_ACTIVE' || state === 'GRACE') {
    actions += '<div class="org-sub-group">' +
      '<div class="org-sub-group-title">Chu kỳ gói</div>' +
      '<div class="org-plan-actions">' +
        '<button type="button" class="btn-create" onclick="extendOrganizationPlan(\'' + oid + '\', 30)">Gia hạn +30 ngày</button>' +
        '<button type="button" class="btn-edit" onclick="setOrganizationPlanExpiry(\'' + oid + '\')">Đặt ngày hết hạn</button>' +
        '<button type="button" class="btn-logout" onclick="clearOrganizationPlanExpiry(\'' + oid + '\')">Xóa hạn</button>' +
      '</div></div>';
  }

  if (state === 'PAID_ACTIVE') {
    const upgradeBtn = plan === 'PRO'
      ? '<button type="button" class="btn-edit" onclick="activateOrgSubscriptionUi(\'' + oid + '\', \'ENTERPRISE\')">Nâng lên Doanh nghiệp</button>'
      : '';
    actions += '<div class="org-sub-group">' +
      '<div class="org-sub-group-title">Xử lý gói đang dùng</div>' +
      '<div class="org-plan-actions">' +
        upgradeBtn +
        '<button type="button" class="btn-edit" style="background:#f39c12;color:#fff;" onclick="markOrganizationPaymentFailed(\'' + oid + '\')">Thanh toán thất bại</button>' +
        '<button type="button" class="btn-logout" onclick="markOrganizationSubscriptionExpired(\'' + oid + '\')">Hết hạn gói</button>' +
        '<button type="button" class="btn-logout" onclick="cancelOrgSubscriptionUi(\'' + oid + '\')">Hủy gói đăng ký</button>' +
      '</div></div>';
  }

  if (state === 'GRACE') {
    actions += '<div class="org-sub-group">' +
      '<div class="org-sub-group-title">Kết thúc gia hạn</div>' +
      '<div class="org-plan-actions">' +
        '<button type="button" class="btn-logout" onclick="forceExpireOrgQuota(\'' + oid + '\')">Khóa hạn mức ngay</button>' +
        '<button type="button" class="btn-edit" style="background:#f39c12;color:#fff;" onclick="markOrganizationPaymentFailed(\'' + oid + '\')">Thanh toán thất bại</button>' +
      '</div></div>';
  }

  return '<div class="org-subscription-manage billing-action-panel">' +
    '<div class="billing-state-badge billing-state-' + state.toLowerCase() + '">' +
      escapeHtml(BILLING_UI_STATE_LABELS[state] || state) +
    '</div>' +
    '<div class="org-sub-manage-hint">Chỉ hiển thị thao tác phù hợp trạng thái hiện tại. Hệ thống tự đồng bộ subscription → gói tổ chức.</div>' +
    actions +
    '<div class="billing-future-note">' +
      '<strong>Super Admin:</strong> xử lý ngoại lệ (gia hạn thủ công, hủy gói). ORG_ADMIN tự thanh toán qua tab này.' +
    '</div>' +
  '</div>';
}

function renderOrgBillingSnapshot(oid, org, quota, subscription) {
  const graceNote = String(org?.billing_status || '').toUpperCase() === 'GRACE_PERIOD' && org?.grace_ends_at
    ? ' <span class="org-detail-hint">(gia hạn đến ' + formatDateTime(org.grace_ends_at) + ')</span>'
    : '';
  const subHint = subscription
    ? '<div class="org-billing-snapshot-line">Gói đăng ký: <strong>' + escapeHtml(formatSubscriptionStatusVi(subscription.status)) + '</strong></div>'
    : '';
  return '<div class="org-billing-snapshot">' +
    '<div class="org-billing-snapshot-head"><h4>Gói & thanh toán</h4></div>' +
    '<div class="org-billing-snapshot-body">' +
      '<div class="org-billing-snapshot-line">' + formatOrgBillingBadge(org) + graceNote + '</div>' +
      formatPlanExpiryLine(org, quota) +
      subHint +
      '<p class="org-billing-snapshot-hint">Kích hoạt, gia hạn, hóa đơn và sự kiện thanh toán nằm ở tab <strong>Gói & Thanh toán</strong> — không trùng với màn hình này.</p>' +
      '<button type="button" class="btn-create org-billing-snapshot-btn" onclick="openBillingTabForOrg(\'' + oid + '\')">Mở quản lý gói & thanh toán →</button>' +
    '</div></div>';
}

/** @deprecated — dùng renderOrgBillingActionPanel trong tab Gói & Thanh toán */
function renderOrgSubscriptionManagePanel(oid, org) {
  return renderOrgBillingActionPanel(oid, org, null, null);
}

function formatPlanNameVi(plan) {
  const p = String(plan || '').toUpperCase();
  if (p === 'FREE') return 'Miễn phí';
  if (p === 'PRO') return 'Pro';
  if (p === 'ENTERPRISE') return 'Doanh nghiệp';
  return plan || '—';
}

function formatOrgPlanListBadge(org) {
  if (!org) return '';
  const plan = String(org.plan || 'FREE').toUpperCase();
  return '<span class="badge plan-badge plan-' + plan.toLowerCase() + '">' +
    'Gói ' + escapeHtml(formatPlanNameVi(plan)) + '</span>';
}

function formatOrgPlanListCell(org) {
  return '<div class="org-plan-list-cell">' + formatOrgPlanListBadge(org) + '</div>';
}

function formatBillingStatusVi(status) {
  const s = String(status || '').toUpperCase();
  const map = {
    ACTIVE: 'Đang hoạt động',
    GRACE_PERIOD: 'Đang gia hạn',
    EXPIRED: 'Hết hạn',
    PENDING: 'Chờ xử lý',
    PAID: 'Đã thanh toán',
    FAILED: 'Thất bại',
    REFUNDED: 'Đã hoàn tiền'
  };
  return map[s] || status || '—';
}

function formatSubscriptionStatusVi(status) {
  const s = String(status || '').toUpperCase();
  const map = {
    TRIALING: 'Dùng thử',
    ACTIVE: 'Đang hiệu lực',
    PAST_DUE: 'Quá hạn thanh toán',
    GRACE_PERIOD: 'Đang gia hạn',
    CANCELED: 'Đã hủy',
    EXPIRED: 'Hết hạn'
  };
  return map[s] || status || '—';
}

function formatInvoiceStatusVi(status) {
  const s = String(status || '').toUpperCase();
  const map = {
    DRAFT: 'Nháp',
    OPEN: 'Chờ thanh toán',
    PAID: 'Đã thanh toán',
    VOID: 'Đã hủy',
    UNCOLLECTIBLE: 'Không thu được'
  };
  return map[s] || status || '—';
}

function formatBillingEventTypeVi(type) {
  const t = String(type || '').toUpperCase();
  const map = {
    SUBSCRIPTION_PURCHASED: 'Mua gói',
    SUBSCRIPTION_RENEWED: 'Gia hạn gói',
    PAYMENT_FAILED: 'Thanh toán thất bại',
    SUBSCRIPTION_EXPIRED: 'Hết hạn gói',
    PAYMENT_REFUNDED: 'Hoàn tiền',
    MANUAL_ADJUSTMENT: 'Điều chỉnh thủ công'
  };
  return map[t] || type || '—';
}

function formatProviderVi(provider) {
  const p = String(provider || 'MANUAL').toUpperCase();
  const map = {
    MANUAL: 'Thủ công',
    STRIPE: 'Stripe',
    VNPAY: 'VNPay',
    MOMO: 'MoMo',
    OTHER: 'Khác'
  };
  return map[p] || provider || 'Thủ công';
}

function renderOrgPlanHistory(history) {
  if (!history || !history.length) {
    return '<p class="org-detail-empty">Chưa có lịch sử đổi gói.</p>';
  }
  return '<table class="org-detail-mini-table"><thead><tr><th>Thời gian</th><th>Gói</th><th>Thanh toán</th><th>Tòa/User</th><th>Ghi chú</th></tr></thead><tbody>' +
    history.map((h) => {
      const snap = h.snapshot || {};
      return '<tr><td>' + escapeHtml(formatDateTime(h.createdAt)) + '</td><td>' +
        escapeHtml(formatPlanNameVi(h.from_plan) + ' → ' + formatPlanNameVi(h.to_plan)) + '</td><td>' +
        escapeHtml(formatBillingStatusVi(h.from_billing_status) + ' → ' + formatBillingStatusVi(h.to_billing_status)) + '</td><td>' +
        (snap.buildings_active != null ? snap.buildings_active : '—') + ' / ' +
        (snap.users_active != null ? snap.users_active : '—') + '</td><td>' +
        escapeHtml(h.note || '') + '</td></tr>';
    }).join('') + '</tbody></table>';
}

function renderOrgBillingEvents(events) {
  if (!events || !events.length) {
    return '<p class="org-detail-empty">Chưa có sự kiện thanh toán.</p>';
  }
  return '<table class="org-detail-mini-table"><thead><tr><th>Thời gian</th><th>Loại</th><th>Trạng thái</th><th>Gói</th><th>Chu kỳ</th><th>Số tiền</th><th>Ghi chú</th></tr></thead><tbody>' +
    events.map((e) => {
      const plan = formatPlanNameVi(e.plan);
      const period = (e.period_start_at || e.period_end_at)
        ? (formatDateTime(e.period_start_at) + ' → ' + formatDateTime(e.period_end_at))
        : '—';
      const amount = (Number(e.amount || 0)).toLocaleString('vi-VN') + ' ' + (e.currency || 'VND');
      return '<tr><td>' + escapeHtml(formatDateTime(e.createdAt)) + '</td><td>' +
        escapeHtml(formatBillingEventTypeVi(e.event_type)) + '</td><td>' +
        escapeHtml(formatBillingStatusVi(e.payment_status)) + '</td><td>' +
        escapeHtml(plan) + '</td><td>' +
        escapeHtml(period) + '</td><td>' +
        escapeHtml(amount) + '</td><td>' +
        escapeHtml(e.note || '') + '</td></tr>';
    }).join('') + '</tbody></table>';
}

function renderCurrentSubscription(sub) {
  if (!sub) {
    return '<p class="org-detail-empty">Chưa có gói đăng ký hiện hành (đang dùng gói trên tổ chức).</p>';
  }
  const period = (sub.current_period_start || sub.current_period_end)
    ? (formatDateTime(sub.current_period_start) + ' → ' + formatDateTime(sub.current_period_end))
    : '—';
  return '<div class="org-life-grid">' +
    '<div class="org-life-card"><div class="org-life-k">Gói</div><div class="org-life-v">' + escapeHtml(formatPlanNameVi(sub.plan)) + '</div></div>' +
    '<div class="org-life-card"><div class="org-life-k">Trạng thái</div><div class="org-life-v">' + escapeHtml(formatSubscriptionStatusVi(sub.status)) + '</div></div>' +
    '<div class="org-life-card"><div class="org-life-k">Chu kỳ</div><div class="org-life-v">' + escapeHtml(period) + '</div></div>' +
    '<div class="org-life-card"><div class="org-life-k">Nguồn thanh toán</div><div class="org-life-v">' + escapeHtml(formatProviderVi(sub.provider)) +
      (sub.cancel_at_period_end ? ' · sẽ hủy cuối chu kỳ' : '') + '</div></div>' +
  '</div>';
}

function renderOrgInvoices(invoices) {
  if (!invoices || !invoices.length) {
    return '<p class="org-detail-empty">Chưa có hóa đơn.</p>';
  }
  return '<table class="org-detail-mini-table"><thead><tr><th>Số HĐ</th><th>Trạng thái</th><th>Gói</th><th>Số tiền</th><th>Chu kỳ</th><th>Thanh toán</th></tr></thead><tbody>' +
    invoices.map((inv) => {
      const amount = (Number(inv.amount || 0)).toLocaleString('vi-VN') + ' ' + (inv.currency || 'VND');
      const period = (inv.period_start || inv.period_end)
        ? (formatDateTime(inv.period_start) + ' → ' + formatDateTime(inv.period_end))
        : '—';
      return '<tr><td>' + escapeHtml(inv.invoice_number || '—') + '</td><td>' +
        escapeHtml(formatInvoiceStatusVi(inv.status)) + '</td><td>' +
        escapeHtml(formatPlanNameVi(inv.plan)) + '</td><td>' +
        escapeHtml(amount) + '</td><td>' +
        escapeHtml(period) + '</td><td>' +
        escapeHtml(formatDateTime(inv.paid_at)) + '</td></tr>';
    }).join('') + '</tbody></table>';
}

function renderLifecycleStats(stats) {
  if (!stats) return '<p class="org-detail-empty">Chưa có dữ liệu thống kê vòng đời.</p>';
  const dist = stats.plan_distribution || {};
  const act = stats.activity_counts || {};
  const billing = stats.billing_status_counts || {};
  const started = stats.current_cycle_started_at ? formatDateTime(stats.current_cycle_started_at) : '—';
  const expires = stats.current_cycle_expires_at ? formatDateTime(stats.current_cycle_expires_at) : '—';
  const lastActivity = stats.last_activity_at ? formatDateTime(stats.last_activity_at) : '—';
  return '<div class="org-life-grid">' +
    '<div class="org-life-card"><div class="org-life-k">Số lần đổi gói</div><div class="org-life-v">' + (stats.plan_changes_total || 0) + '</div></div>' +
    '<div class="org-life-card"><div class="org-life-k">Đăng ký gói trả phí</div><div class="org-life-v">' + (stats.paid_registrations_total || 0) + '</div></div>' +
    '<div class="org-life-card"><div class="org-life-k">Miễn phí / Pro / Doanh nghiệp</div><div class="org-life-v">' +
      (dist.FREE || 0) + ' / ' + (dist.PRO || 0) + ' / ' + (dist.ENTERPRISE || 0) + '</div></div>' +
    '<div class="org-life-card"><div class="org-life-k">Chu kỳ gói hiện tại</div><div class="org-life-v">' + started + ' → ' + expires + '</div></div>' +
    '<div class="org-life-card"><div class="org-life-k">Thanh toán (OK / Lỗi / Hết hạn)</div><div class="org-life-v">' +
      (billing.PAID || 0) + ' / ' + (billing.FAILED || 0) + ' / ' + (billing.EXPIRED || 0) + '</div></div>' +
    '<div class="org-life-card"><div class="org-life-k">Tạo tòa / xuất bản bản đồ</div><div class="org-life-v">' +
      (act.create_building || 0) + ' / ' + (act.publish_map || 0) + '</div></div>' +
    '<div class="org-life-card"><div class="org-life-k">Tạo tài khoản / khóa tài khoản</div><div class="org-life-v">' +
      (act.create_user || 0) + ' / ' + (act.deactivate_user || 0) + '</div></div>' +
    '<div class="org-life-card"><div class="org-life-k">Sửa tòa / khôi phục bản đồ</div><div class="org-life-v">' +
      (act.update_building || 0) + ' / ' + (act.rollback_map || 0) + '</div></div>' +
    '<div class="org-life-card"><div class="org-life-k">Đăng nhập gần nhất</div><div class="org-life-v">' +
      lastActivity + ' (tổng đăng nhập: ' + (act.login || 0) + ')</div></div>' +
  '</div>';
}

async function forceExpireOrgQuota(orgId) {
  // Phải hết hạn subscription + plan FREE — chỉ PATCH billing_status không đủ (subscription GRACE sẽ ghi đè).
  await markOrganizationSubscriptionExpired(orgId);
}

async function extendOrganizationPlan(orgId, days = 30) {
  const org = getBillingContextOrg(orgId);
  const now = Date.now();
  const currentEnd = org.plan_expires_at ? new Date(org.plan_expires_at).getTime() : 0;
  const base = currentEnd > now ? currentEnd : now;
  const next = new Date(base + days * 24 * 60 * 60 * 1000);
  await patchOrganization(
    orgId,
    { plan_expires_at: next.toISOString() },
    'Gia hạn gói thêm ' + days + ' ngày (đến ' + formatDateTime(next) + ')?'
  );
}

async function setOrganizationPlanExpiry(orgId) {
  const org = getBillingContextOrg(orgId);
  const suggest = org.plan_expires_at
    ? new Date(org.plan_expires_at).toISOString().slice(0, 16).replace('T', ' ')
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const raw = prompt('Nhập ngày giờ hết hạn (YYYY-MM-DD HH:mm):', suggest);
  if (!raw) return;
  const dt = new Date(String(raw).trim().replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) {
    alert('Định dạng ngày giờ không hợp lệ. Ví dụ: 2026-08-10 23:59');
    return;
  }
  await patchOrganization(orgId, { plan_expires_at: dt.toISOString() }, 'Cập nhật hạn gói thành ' + formatDateTime(dt) + '?');
}

async function clearOrganizationPlanExpiry(orgId) {
  const org = getBillingContextOrg(orgId);
  if (!org.plan_expires_at) {
    alert('Gói hiện không có ngày hết hạn để xóa.');
    return;
  }
  await patchOrganization(orgId, { plan_expires_at: null }, 'Xóa ngày hết hạn của gói hiện tại?');
}

async function createOrganizationBillingEvent(orgId, payload, confirmMsg) {
  if (!orgId || !payload) return false;
  if (confirmMsg && !confirm(confirmMsg)) return false;
  try {
    const res = await apiFetch('/organizations/' + orgId + '/billing-events', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert('Lỗi: ' + (d.message || 'HTTP ' + res.status));
      return false;
    }
    if (_orgDetailId && String(_orgDetailId) === String(orgId)) {
      await openOrgDetailModal(orgId);
    }
    if (_billingTabOrgId && String(_billingTabOrgId) === String(orgId)) {
      await loadBillingTab(orgId);
    }
    await fetchOrganizations();
    return true;
  } catch (e) {
    console.error('createOrganizationBillingEvent error:', e);
    alert('Lỗi kết nối khi ghi nhận sự kiện thanh toán.');
    return false;
  }
}

async function markOrganizationSubscriptionPaid(orgId, plan) {
  const p = String(plan || 'PRO').toUpperCase();
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await createOrganizationBillingEvent(orgId, {
    event_type: 'SUBSCRIPTION_RENEWED',
    payment_status: 'PAID',
    plan: p,
    amount: p === 'ENTERPRISE' ? 4990000 : 990000,
    currency: 'VND',
    period_start_at: now.toISOString(),
    period_end_at: end.toISOString(),
    note: 'Ghi nhận đã thanh toán từ bảng điều khiển'
  }, 'Xác nhận ghi nhận đã thanh toán cho gói ' + formatPlanNameVi(p) + '?');
}

async function markOrganizationPaymentFailed(orgId) {
  await createOrganizationBillingEvent(orgId, {
    event_type: 'PAYMENT_FAILED',
    payment_status: 'FAILED',
    note: 'Thanh toán thất bại (đánh dấu thủ công)'
  }, 'Xác nhận đánh dấu thanh toán thất bại cho tổ chức này?');
}

async function markOrganizationSubscriptionExpired(orgId) {
  await createOrganizationBillingEvent(orgId, {
    event_type: 'SUBSCRIPTION_EXPIRED',
    payment_status: 'EXPIRED',
    plan: 'FREE',
    note: 'Kết thúc gói trả phí (đánh dấu thủ công)'
  }, 'Xác nhận kết thúc gói trả phí và chuyển tổ chức về gói Miễn phí?');
}

async function activateOrgSubscriptionUi(orgId, plan) {
  const p = String(plan || 'PRO').toUpperCase();
  if (!confirm('Kích hoạt/gia hạn gói ' + formatPlanNameVi(p) + ' cho tổ chức này?')) return;
  try {
    const res = await apiFetch('/organizations/' + orgId + '/subscription/activate', {
      method: 'POST',
      body: JSON.stringify({
        plan: p,
        amount: p === 'ENTERPRISE' ? 4990000 : 990000,
        currency: 'VND',
        note: 'Kích hoạt gói từ bảng điều khiển'
      })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert('Lỗi: ' + (d.message || 'HTTP ' + res.status));
      return;
    }
    await refreshBillingOrgViews(orgId);
  } catch (e) {
    console.error('activateOrgSubscriptionUi error:', e);
    alert('Lỗi kết nối khi kích hoạt gói đăng ký.');
  }
}

async function cancelOrgSubscriptionUi(orgId) {
  if (!confirm('Hủy gói đăng ký hiện hành và chuyển tổ chức về gói Miễn phí ngay?')) return;
  try {
    const res = await apiFetch('/organizations/' + orgId + '/subscription/cancel', {
      method: 'POST',
      body: JSON.stringify({ immediate: true, note: 'Hủy gói từ bảng điều khiển' })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert('Lỗi: ' + (d.message || 'HTTP ' + res.status));
      return;
    }
    await refreshBillingOrgViews(orgId);
  } catch (e) {
    console.error('cancelOrgSubscriptionUi error:', e);
    alert('Lỗi kết nối khi hủy gói đăng ký.');
  }
}

function formatPlanLabel(org) {
  if (!org) return '';
  const plan = (org.plan || 'FREE').toUpperCase();
  const billing = (org.billing_status || 'ACTIVE').toUpperCase();
  if (billing === 'GRACE_PERIOD') {
    const end = org.grace_ends_at ? new Date(org.grace_ends_at) : null;
    const days = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : null;
    return 'Gói ' + formatPlanNameVi(plan) + ' · Đang gia hạn ' + (days != null ? days + ' ngày' : 'đang chờ');
  }
  if (billing === 'EXPIRED' && plan === 'FREE') {
    return 'Gói Miễn phí · Gói trả phí đã hết hạn';
  }
  return 'Gói ' + formatPlanNameVi(plan);
}

function quotaFallbackFromStats(stats) {
  if (!stats || stats.scope !== 'organization') return null;
  const plan = String(stats.organization?.plan || 'FREE').toUpperCase();
  const lim = PLAN_LIMITS_UI[plan] || PLAN_LIMITS_UI.FREE;
  const buildingsUsed = stats.buildings?.total_active || 0;
  const usersUsed = stats.users?.total || 0;
  const billing = String(stats.organization?.billing_status || 'ACTIVE').toUpperCase();
  const buildingsOver = lim.buildings != null && buildingsUsed > lim.buildings;
  const usersOver = lim.users != null && usersUsed > lim.users;
  const enforcement =
    billing !== 'GRACE_PERIOD' &&
    !(billing === 'ACTIVE' && (plan === 'PRO' || plan === 'ENTERPRISE'));
  return {
    plan,
    billing_status: billing,
    buildings: {
      used: buildingsUsed,
      limit: lim.buildings,
      over: buildingsOver,
      locked: enforcement && buildingsOver ? buildingsUsed - lim.buildings : 0
    },
    users: {
      used: usersUsed,
      limit: lim.users,
      over: usersOver,
      locked: enforcement && usersOver ? usersUsed - lim.users : 0
    },
    enforcement_active: enforcement && (buildingsOver || usersOver)
  };
}

function resolveQuotaFromStats(stats) {
  return stats?.quota || quotaFallbackFromStats(stats);
}

function updatePlanQuotaBadge(user, quotaFromStats) {
  const planBadge = document.getElementById('userPlanBadge');
  const quotaLine = document.getElementById('quotaAlertLine');
  const isTenant = user?.role === 'ORG_ADMIN' || user?.role === 'BUILDING_ADMIN';
  const org = user?.organization;

  if (planBadge) {
    if (isTenant && org) {
      planBadge.textContent = formatPlanLabel(org);
      planBadge.className = 'badge plan-badge plan-' + String(org.plan || 'FREE').toLowerCase();
      planBadge.style.display = '';
    } else {
      planBadge.style.display = 'none';
    }
  }

  if (!quotaLine) return;
  const quota = quotaFromStats || null;
  if (!isTenant) {
    quotaLine.style.display = 'none';
    quotaLine.textContent = '';
    return;
  }
  if (!quota) {
    quotaLine.style.display = 'none';
    quotaLine.textContent = '';
    return;
  }

  const parts = [];
  if (quota.buildings?.limit != null) {
    parts.push('Tòa ' + quota.buildings.used + '/' + quota.buildings.limit);
  }
  if (quota.users?.limit != null) {
    parts.push('Tài khoản ' + quota.users.used + '/' + quota.users.limit);
  }
  if (quota.buildings?.locked > 0) {
    parts.push(quota.buildings.locked + ' tòa bị khóa');
  }
  if (quota.users?.locked > 0) {
    parts.push(quota.users.locked + ' tài khoản bị khóa');
  }

  let msg = parts.length ? parts.join(' · ') : '';
  if (quota.billing_status === 'GRACE_PERIOD') {
    msg = '⚠️ ' + (msg ? msg + ' — ' : '') +
      'Sau khi hết gia hạn, tài nguyên vượt hạn mức Miễn phí sẽ bị khóa.';
  } else if (quota.enforcement_active && (quota.buildings?.locked > 0 || quota.users?.locked > 0)) {
    msg = '🔒 ' + (msg ? msg + ' — ' : '') +
      'Một số tòa/tài khoản bị khóa do vượt hạn mức. Giảm bớt hoặc nâng cấp gói.';
  } else if (quota.buildings?.over || quota.users?.over) {
    msg = '⚠️ ' + (msg ? msg + ' — ' : '') +
      'Đang vượt hạn mức gói. Tòa vượt hạn mức bị khóa (không vẽ/xuất bản). Vô hiệu hóa bớt hoặc nâng cấp Pro.';
  }

  if (msg) {
    quotaLine.textContent = msg;
    quotaLine.className = 'quota-alert-line' +
      (quota.enforcement_active && quota.buildings?.locked > 0 ? ' quota-alert-locked' : ' quota-alert-warn');
    quotaLine.style.display = '';
  } else {
    quotaLine.style.display = 'none';
    quotaLine.textContent = '';
  }
}

function applyCurrentUserToUI(user) {
  if (!user) return;
  currentUser = user;
  const emailEl = document.getElementById('userEmail');
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  if (emailEl) emailEl.textContent = user.email || '';
  if (nameEl) nameEl.textContent = user.full_name || user.email || 'User';
  if (roleEl) roleEl.textContent = user.role || '';

  const orgLine = document.getElementById('userOrgLine');
  const orgNameEl = document.getElementById('userOrgName');
  const isTenantUser = user.role === 'ORG_ADMIN' || user.role === 'BUILDING_ADMIN';
  if (orgLine && orgNameEl) {
    if (isTenantUser && user.organization_id) {
      seedOrgCacheFromUser(user);
      orgNameEl.textContent = getOrgName(user.organization_id);
      orgLine.style.display = '';
    } else {
      orgLine.style.display = 'none';
      orgNameEl.textContent = '—';
    }
  }

  localStorage.setItem('userEmail', user.email || '');
  localStorage.setItem('userRole', user.role || '');
  localStorage.setItem('userId', user._id || user.id || '');

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isOrgAdmin = user.role === 'ORG_ADMIN';
  document.querySelectorAll('.super-admin-only').forEach(el => {
    el.style.display = isSuperAdmin ? '' : 'none';
  });

  const usersBtn = document.querySelector('button[onclick*="users"]');
  const logsBtn = document.querySelector('button[onclick*="logs"]');
  const orgTabBtn = document.querySelector('button[onclick*="organizations"]');
  const billingTabBtn = document.querySelector('button[onclick*="billing"]');
  if (usersBtn) usersBtn.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  if (logsBtn) logsBtn.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  if (orgTabBtn) orgTabBtn.style.display = isSuperAdmin ? '' : 'none';
  if (billingTabBtn) billingTabBtn.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  const analyticsTabBtn = document.querySelector('button[onclick*="analytics"]');
  if (analyticsTabBtn) analyticsTabBtn.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';

  const btnAddUser = document.getElementById('btnAddUser');
  const btnAddBuilding = document.getElementById('btnAddBuilding');
  if (btnAddUser) btnAddUser.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  if (btnAddBuilding) btnAddBuilding.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  document.querySelectorAll('.building-restore-filter').forEach(el => {
    el.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  });

  const currentTab = document.querySelector('.tab-btn.active');
  if (currentTab && !isSuperAdmin) {
    const tabName = currentTab.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (tabName === 'organizations' || tabName === 'registrations') {
      switchTab('buildings');
    }
  }
  if (currentTab && !isSuperAdmin && !isOrgAdmin) {
    const tabName = currentTab.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (tabName === 'users' || tabName === 'logs') {
      switchTab('buildings');
    }
  }

  const tabNav = document.getElementById('tabNav');
  if (tabNav) tabNav.style.display = 'flex';

  updatePlanQuotaBadge(user, resolveQuotaFromStats(platformStatsCache));
}

// ============================================================
// SYNC CURRENT SESSION (Multi-tab sync)
// WHY: Kiểm tra token và fetch user info từ server để đảm bảo UI đúng.
// reason: 'initial-load' | 'storage-change' | 'tab-visible' | 'pageshow'
// ============================================================
async function syncCurrentSession(reason) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      clearAuthStorage();
      window.location.replace('/admin/index.html');
      return null;
    }
    const res = await apiFetch('/users/me');
    if (!res.ok) {
      clearAuthStorage();
      window.location.replace('/admin/index.html');
      return null;
    }
    currentUser = await res.json();
    seedOrgCacheFromUser(currentUser);
    applyCurrentUserToUI(currentUser);
    if (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'ORG_ADMIN') {
      const currentTab = document.querySelector('.tab-btn.active');
      const onclick = currentTab ? (currentTab.getAttribute('onclick') || '') : '';
      const match = onclick.match(/'([^']+)'/);
      const tabName = match ? match[1] : null;
      if (tabName === 'users' || tabName === 'logs' || tabName === 'organizations' || tabName === 'registrations') {
        switchTab('buildings');
      }
    }
    if (currentUser.role !== 'SUPER_ADMIN') {
      const currentTab = document.querySelector('.tab-btn.active');
      const onclick = currentTab ? (currentTab.getAttribute('onclick') || '') : '';
      const match = onclick.match(/'([^']+)'/);
      const tabName = match ? match[1] : null;
      if (tabName === 'organizations' || tabName === 'registrations') {
        switchTab('buildings');
      }
    }
    return currentUser;
  } catch (e) {
    console.error('[SessionSync] Failed:', e);
    clearAuthStorage();
    window.location.replace('/admin/index.html');
    return null;
  }
}
// LOGOUT HANDLER (Multi-tab safe)
// WHY: Clear localStorage và notify other tabs via authEvent.
// ============================================================
async function handleLogout() {
  const refreshToken = localStorage.getItem('refreshToken');
  const token = localStorage.getItem('token');
  try {
    // Luôn gọi API khi còn token hoặc refreshToken (tránh bỏ qua session chỉ có JWT)
    if (token || refreshToken) {
      await apiFetch('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshToken || undefined })
      });
    }
  } catch (e) {
    console.warn('Logout API failed, clearing client session anyway:', e);
  } finally {
    clearAuthStorage();
    // Set authEvent để các tab khác biết logout xảy ra
    try { localStorage.setItem('authEvent', String(Date.now())); } catch (_) {}
    window.location.replace('/admin/index.html');
  }
}

/** Phase 7 bậc B — thu hồi mọi refresh token rồi clear session tab này */
async function handleLogoutAll() {
  if (!confirm('Thu hồi mọi phiên đăng nhập của tài khoản này? Mọi trình duyệt / máy đang login admin sẽ phải đăng nhập lại.')) {
    return;
  }
  const msgEl = document.getElementById('logoutAllMessage');
  if (msgEl) {
    msgEl.style.display = 'none';
    msgEl.textContent = '';
  }
  try {
    const res = await apiFetch('/auth/logout-all', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (msgEl) {
        msgEl.textContent = data.message || ('HTTP ' + res.status);
        msgEl.style.display = 'block';
      } else {
        alert(data.message || 'Không thể đăng xuất mọi thiết bị.');
      }
      return;
    }
  } catch (e) {
    console.warn('logout-all failed:', e);
  } finally {
    clearAuthStorage();
    try { localStorage.setItem('authEvent', String(Date.now())); } catch (_) {}
    window.location.replace('/admin/index.html');
  }
}

// ============================================================
// DASHBOARD STARTUP INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await syncCurrentSession('initial-load');
  if (!currentUser) return;

  if (currentUser.role === 'SUPER_ADMIN') {
    fetchOrganizations();
  } else if (currentUser.role === 'ORG_ADMIN') {
    seedOrgCacheFromUser(currentUser);
  }

  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  const logoutAllBtn = document.getElementById('btnLogoutAll');
  if (logoutAllBtn) logoutAllBtn.addEventListener('click', handleLogoutAll);

  let initialTab = localStorage.getItem('activeDashboardTab') || 'buildings';
  const hashTab = (location.hash || '').replace(/^#/, '');
  if (hashTab && VALID_DASHBOARD_TABS.has(hashTab)) initialTab = hashTab;
  initialTab = sanitizeTabForRole(initialTab, currentUser.role);

  await switchTab(initialTab, { skipHistory: true });
  history.replaceState({ dashboardTab: initialTab }, '', dashboardTabHref(initialTab));
  window._dashboardHistoryReady = true;

  window.addEventListener('popstate', (e) => {
    const tab = resolveDashboardTab(
      (e.state && e.state.dashboardTab) || (location.hash || '').replace(/^#/, '') || 'buildings'
    );
    if (tab === window._currentDashboardTab) return;
    switchTab(tab, { fromPopstate: true });
  });

  initOrgTableSort();
  initBuildingTableSort();
  initUserTableSort();
  updateOrgSortIndicators();
  fetchPlatformStats();
});
// MULTI-TAB SYNC LISTENERS (Phase 7 — bật lại)
// ============================================================
window.addEventListener('storage', (event) => {
  if (['token', 'refreshToken', 'userEmail', 'userRole', 'userId', 'authEvent'].includes(event.key)) {
    syncCurrentSession('storage-change');
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    syncCurrentSession('tab-visible');
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    syncCurrentSession('pageshow');
  }
});

// ============================================================
// TAB SWITCHING
async function switchTab(name, options) {
  const opts = options || {};
  const tab = resolveDashboardTab(name);
  const prevTab = window._currentDashboardTab;

  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).style.display = 'block';
  const btns = document.querySelectorAll('.tab-btn');
  for (const btn of btns) {
    if (btn.getAttribute('onclick').includes("'" + tab + "'")) {
      btn.classList.add('active');
      break;
    }
  }

  window._currentDashboardTab = tab;
  localStorage.setItem('activeDashboardTab', tab);

  if (window._dashboardHistoryReady && !opts.skipHistory && !opts.fromPopstate && prevTab !== tab) {
    history.pushState({ dashboardTab: tab }, '', dashboardTabHref(tab));
  }

  applyDashboardLayout(tab);

  if (tab === 'buildings') {
    restoreBuildingFilters();
    initBuildingTableSort();
    await fetchBuildings();
    updateDashSortIndicators('buildingsTable', getBuildingTableSort);
  }
  if (tab === 'users') {
    restoreUserFilters();
    initUserTableSort();
    await fetchUsers();
    updateDashSortIndicators('usersTable', getUserTableSort);
  }
  if (tab === 'logs') await loadLogs();
  if (tab === 'profile') await loadProfile();
  if (tab === 'organizations') {
    restoreOrganizationFilters();
    initOrgTableSort();
    await fetchOrganizations();
    if (!allBuildings.length) await fetchBuildings();
    if (!allUsers.length) await fetchUsers();
    updateOrgSortIndicators();
  }
  if (tab === 'registrations') await fetchRegistrations();
  if (tab === 'billing') {
    const toolbar = document.querySelector('.billing-tab-toolbar');
    const intro = document.querySelector('.billing-tab-intro');
    if (currentUser?.role === 'ORG_ADMIN') {
      if (toolbar) toolbar.style.display = 'none';
      if (intro) intro.textContent = 'Xem gói hiện tại, hóa đơn và tự nâng cấp/gia hạn qua cổng thanh toán.';
      await loadMyBillingTab();
    } else {
      if (toolbar) toolbar.style.display = '';
      if (intro) intro.textContent = 'Quản lý subscription, hóa đơn và chu kỳ gói cho từng tổ chức. Hệ thống tự theo dõi hạn qua scheduler.';
      if (!allOrganizations.length) await fetchOrganizations();
      populateBillingOrgSelect();
      const preselect = opts.billingOrgId || _billingTabOrgId || document.getElementById('billingOrgSelect')?.value || '';
      const sel = document.getElementById('billingOrgSelect');
      if (sel && preselect) sel.value = preselect;
      await loadBillingTab(preselect || sel?.value);
    }
    const hashPaid = (window.location.hash || '').includes('paid=1');
    if (hashPaid) {
      setTimeout(() => alert('Thanh toán thành công! Gói đã được kích hoạt/gia hạn.'), 300);
      history.replaceState(history.state, '', dashboardTabHref('billing'));
    }
  }
  if (tab === 'analytics') {
    const intro = document.getElementById('analyticsIntro');
    if (intro) {
      intro.textContent = currentUser?.role === 'ORG_ADMIN'
        ? 'Mức dùng của tổ chức bạn (đăng nhập, xuất bản) và chi phí gói đã thanh toán. Chi tiết từng hóa đơn ở tab Gói & Thanh toán.'
        : 'Doanh thu nền tảng (tiền tổ chức trả cho hệ thống), hoạt động đăng nhập/xuất bản, phân bố gói và cảnh báo vận hành.';
    }
    await loadAnalyticsTab();
  }
}

// ============================================================
// BUILDINGS
let allBuildings = [];
let displayedBuildings = [];

function seedOrgCacheFromUser(user) {
  if (!user) return;
  const org = user.organization;
  const orgId = user.organization_id;
  if (!orgId) return;
  const id = String(orgId);
  const existing = allOrganizations.find((o) => String(o._id) === id);
  const entry = {
    _id: orgId,
    name: (org && org.name) || (existing && existing.name) || 'Tổ chức của tôi',
    slug: (org && org.slug) || (existing && existing.slug) || '',
    is_active: org ? org.is_active !== false : true,
    plan: (org && org.plan) || (existing && existing.plan) || 'FREE'
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    allOrganizations.push(entry);
  }
}

function getOrgName(orgId) {
  if (!orgId) return '—';
  const id = String(orgId);
  const org = allOrganizations.find((o) => String(o._id) === id);
  if (org?.name) return org.name;
  if (currentUser?.organization && String(currentUser.organization_id) === id) {
    return currentUser.organization.name || currentUser.organization.slug || 'Tổ chức của tôi';
  }
  if (currentUser?.role === 'ORG_ADMIN' && String(currentUser.organization_id) === id) {
    return currentUser.organization?.name || 'Tổ chức của tôi';
  }
  return id.slice(0, 8) + '…';
}

async function fetchBuildings() {
  const tbody = document.getElementById('buildingsList');
  if (currentUser?.role === 'SUPER_ADMIN' && allOrganizations.length === 0) {
    await fetchOrganizations();
  } else if (currentUser?.role === 'ORG_ADMIN') {
    seedOrgCacheFromUser(currentUser);
  }
  try {
    const includeInactive = document.getElementById('filterBuildingIncludeInactive')?.checked === true;
    const url = '/buildings' + (includeInactive ? '?include_inactive=true' : '');
    const res = await apiFetch(url);
    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">Không tải được danh sách tòa nhà (HTTP ' + res.status + '). Thử đăng nhập lại.</td></tr>';
      return;
    }
    const data = await res.json();
    allBuildings = Array.isArray(data) ? data : [];
    applyBuildingFilters(false);
  } catch (e) {
    console.error('Lỗi tải tòa nhà:', e);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">Lỗi kết nối API: ' + (e.message || e) + '</td></tr>';
  }
}

function applyBuildingFilters(resetPage) {
  if (resetPage !== false) window._buildingsPage = 1;
  const orgId = document.getElementById('filterBuildingOrg')?.value || '';
  const keyword = (document.getElementById('filterBuildingKeyword')?.value || '').trim().toLowerCase();
  const status = document.getElementById('filterBuildingStatus')?.value || '';
  const includeInactive = document.getElementById('filterBuildingIncludeInactive')?.checked === true;
  localStorage.setItem('buildingsFilters', JSON.stringify({
    orgId,
    keyword,
    status,
    includeInactive,
    sortKey: getBuildingTableSort().key,
    sortDir: getBuildingTableSort().dir
  }));
  let filtered = allBuildings.slice();
  if (orgId) filtered = filtered.filter(b => String(b.organization_id) === orgId);
  if (keyword) {
    filtered = filtered.filter(b =>
      (b.name || '').toLowerCase().includes(keyword) ||
      (b.address || '').toLowerCase().includes(keyword)
    );
  }
  if (status) filtered = filtered.filter(b => b.status === status);
  displayedBuildings = filtered;
  renderBuildingsFromCache();
}

async function onBuildingIncludeInactiveChange() {
  window._buildingsPage = 1;
  await fetchBuildings();
}

function clearBuildingFilters() {
  ['filterBuildingOrg', 'filterBuildingKeyword', 'filterBuildingStatus'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const inactiveEl = document.getElementById('filterBuildingIncludeInactive');
  if (inactiveEl) inactiveEl.checked = false;
  localStorage.removeItem('buildingsFilters');
  saveBuildingTableSort('name', 'asc');
  window._buildingsPage = 1;
  applyBuildingFilters(false);
}

function restoreBuildingFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem('buildingsFilters') || '{}');
    if (saved.orgId != null) { const el = document.getElementById('filterBuildingOrg'); if (el) el.value = saved.orgId; }
    if (saved.keyword != null) { const el = document.getElementById('filterBuildingKeyword'); if (el) el.value = saved.keyword; }
    if (saved.status != null) { const el = document.getElementById('filterBuildingStatus'); if (el) el.value = saved.status; }
    if (saved.includeInactive != null) {
      const el = document.getElementById('filterBuildingIncludeInactive');
      if (el) el.checked = !!saved.includeInactive;
    }
    if (saved.sortKey) saveBuildingTableSort(saved.sortKey, saved.sortDir || 'asc');
    else saveBuildingTableSort('name', 'asc');
  } catch (e) {}
}

function getBuildingTableSort() {
  if (!window._buildingTableSort) window._buildingTableSort = { key: 'name', dir: 'asc' };
  return window._buildingTableSort;
}

function saveBuildingTableSort(key, dir) {
  window._buildingTableSort = { key: key || 'name', dir: dir === 'desc' ? 'desc' : 'asc' };
  try {
    const saved = JSON.parse(localStorage.getItem('buildingsFilters') || '{}');
    saved.sortKey = window._buildingTableSort.key;
    saved.sortDir = window._buildingTableSort.dir;
    localStorage.setItem('buildingsFilters', JSON.stringify(saved));
  } catch (e) {}
}

function sortBuildingList(list, key, dir) {
  const orgLabel = (id) => getOrgName(id);
  if (window.DashboardTableSort && typeof window.DashboardTableSort.sortBuildings === 'function') {
    return window.DashboardTableSort.sortBuildings(list, key, dir, orgLabel);
  }
  const mul = dir === 'desc' ? -1 : 1;
  return list.slice().sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' }) * mul
  );
}

function syncBuildingSortBarFromState() {
  const cur = getBuildingTableSort();
  const keyEl = document.getElementById('filterBuildingSortKey');
  const dirEl = document.getElementById('filterBuildingSortDir');
  if (keyEl && keyEl.value !== cur.key) keyEl.value = cur.key;
  if (dirEl && dirEl.value !== cur.dir) dirEl.value = cur.dir;
}

function applyBuildingSortFromBar() {
  const key = document.getElementById('filterBuildingSortKey')?.value || 'name';
  const dir = document.getElementById('filterBuildingSortDir')?.value || 'asc';
  saveBuildingTableSort(key, dir);
  window._buildingsPage = 1;
  renderBuildingsFromCache();
}

function toggleBuildingTableSort(key) {
  const cur = getBuildingTableSort();
  if (cur.key === key) saveBuildingTableSort(key, cur.dir === 'asc' ? 'desc' : 'asc');
  else saveBuildingTableSort(key, 'asc');
  window._buildingsPage = 1;
  renderBuildingsFromCache();
}

function initBuildingTableSort() {
  initDashTableSort('buildingsTableHead', toggleBuildingTableSort);
}

function canManageBuildingMeta() {
  const role = currentUser?.role;
  return role === 'SUPER_ADMIN' || role === 'ORG_ADMIN';
}

function canDeleteBuilding() {
  return canManageBuildingMeta();
}

function renderBuildingsFromCache() {
  const tbody = document.getElementById('buildingsList');
  if (!tbody) return;
  let list = displayedBuildings.length ? displayedBuildings.slice() : allBuildings.slice();
  const sortState = getBuildingTableSort();
  list = sortBuildingList(list, sortState.key, sortState.dir);
  updateDashSortIndicators('buildingsTable', getBuildingTableSort);
  syncBuildingSortBarFromState();
  const canEditMeta = canManageBuildingMeta();
  const canDelete = canDeleteBuilding();
  if (!list.length) {
    const emptyMsg = canEditMeta
      ? 'Chưa có tòa nhà nào. Bấm "Thêm Tòa Nhà Mới"!'
      : 'Chưa có tòa nhà nào được gán cho tài khoản của bạn.';
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">' + emptyMsg + '</td></tr>';
    renderPagination('buildings', 0, 1);
    return;
  }
  const page = window._buildingsPage || 1;
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);
  tbody.innerHTML = pageItems.map(b => {
    const date = b.updatedAt ? new Date(b.updatedAt).toLocaleDateString('vi-VN') : '-';
    const desc = b.description ? '<br><small style="color:#888">' + escapeHtml(b.description) + '</small>' : '';
    const inactive = b.is_active === false;
    const rowStyle = inactive
      ? ' style="opacity:0.72;background:#fafafa;"'
      : (b.quota_locked ? ' style="background:#fff5f5;"' : '');
    const inactiveBadge = inactive ? ' <span class="badge badge-inactive" style="font-size:10px;">Vô hiệu</span>' : '';
    const lockedBadge = b.quota_locked ? ' <span class="badge badge-quota-locked" style="font-size:10px;">Khóa quota</span>' : '';
    let actions = '';
    if (inactive) {
      if (canDelete) {
        actions = '<button type="button" class="btn-create" onclick="restoreBuilding(\'' + b._id + '\')" style="background:#27ae60;padding:6px 12px;">Khôi phục</button>';
      } else {
        actions = '<span style="color:#888;font-size:12px;">Đã vô hiệu</span>';
      }
    } else if (b.quota_locked) {
      actions = '<span style="color:#c0392b;font-size:12px;">🔒 Bị khóa — chỉ xem / vô hiệu hóa</span>';
      if (canDelete) {
        actions += ' <button class="btn-logout" onclick="deleteBuilding(\'' + b._id + '\')" style="background:#e74c3c;padding:6px 12px;margin-left:6px;">Vô hiệu</button>';
      }
    } else {
      actions = '<button class="btn-edit" onclick="openEditor(\'' + b._id + '\')" style="margin-right:4px;">Vẽ bản đồ</button>' +
        '<button class="btn-edit" onclick="openMapVersionModal(\'' + b._id + '\', ' + (b.total_floors || 1) + ')" style="background:#8e44ad;color:white;margin-right:4px;">Phiên bản</button>';
      if (canEditMeta) {
        actions += '<button class="btn-edit" onclick="openEditBuildingModal(\'' + b._id + '\')" style="background:#f39c12;color:white;margin-right:4px;">Sửa</button>';
      }
      if (canDelete) {
        actions += '<button class="btn-logout" onclick="deleteBuilding(\'' + b._id + '\')" style="background:#e74c3c;padding:6px 12px;">Xóa</button>';
      }
    }
    return '<tr' + rowStyle + '>' +
      tdEllipsis(b.name, '<strong>' + escapeHtml(b.name) + '</strong>' + inactiveBadge + lockedBadge + desc) +
      tdEllipsis(b.address || '-') +
      '<td style="text-align:center;">' + (b.total_floors || 1) + '</td>' +
      '<td><span class="badge">' + escapeHtml(b.status) + '</span></td>' +
      tdEllipsis(getOrgName(b.organization_id)) +
      '<td>' + date + '</td>' +
      '<td class="actions-cell"><div class="building-actions">' + actions + '</div></td></tr>';
  }).join('');
  renderPagination('buildings', list.length, page);
}

// ============================================================
// ORGANIZATIONS
async function fetchOrganizations() {
  const tbody = document.getElementById('organizationsList');
  try {
    const res = await apiFetch('/organizations?with_counts=true');
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:red;">' +
          escapeHtml(d.message || 'Không tải được danh sách tổ chức (HTTP ' + res.status + ')') + '</td></tr>';
      }
      return;
    }
    const data = await res.json();
    allOrganizations = Array.isArray(data) ? data : [];
    populateOrganizationDropdown();
    renderOrganizationsFromCache();
  } catch (e) {
    console.error('Error fetching organizations:', e);
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:red;">Lỗi kết nối khi tải tổ chức.</td></tr>';
    }
  }
}

function populateOrganizationDropdown() {
  const options = '<option value="">Tất cả</option>' +
    allOrganizations.map(org =>
      '<option value="' + org._id + '">' + escapeHtml(org.name) + ' (' + escapeHtml(org.slug) + ')' + (org.is_active ? '' : ' [inactive]') + '</option>'
    ).join('');

  const filterOpts = '<option value="">Tất cả</option>' +
    allOrganizations.map(org =>
      '<option value="' + org._id + '">' + escapeHtml(org.name) + '</option>'
    ).join('');

  ['filterBuildingOrg', 'filterUserOrg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = filterOpts;
  });

  const addSelect = document.getElementById('addBuildingOrganizationId');
  if (addSelect) {
    addSelect.innerHTML = '<option value="">Chọn organization...</option>' +
      allOrganizations.map(org =>
        '<option value="' + org._id + '">' + escapeHtml(org.name) + ' (' + escapeHtml(org.slug) + ')</option>'
      ).join('');
  }

  const editSelect = document.getElementById('editBuildingOrganizationId');
  if (editSelect) {
    editSelect.innerHTML = '<option value="">Chọn organization...</option>' +
      allOrganizations.map(org =>
        '<option value="' + org._id + '">' + escapeHtml(org.name) + ' (' + escapeHtml(org.slug) + ')</option>'
      ).join('');
  }

  const createUserOrgSelect = document.getElementById('createUserOrganizationId');
  if (createUserOrgSelect) {
    createUserOrgSelect.innerHTML = '<option value="">Chọn organization...</option>' +
      allOrganizations.map(org =>
        '<option value="' + org._id + '">' + escapeHtml(org.name) + ' (' + escapeHtml(org.slug) + ')</option>'
      ).join('');
  }

  populateBillingOrgSelect();
}

function populateBillingOrgSelect() {
  const billingSel = document.getElementById('billingOrgSelect');
  if (!billingSel) return;
  const cur = billingSel.value;
  billingSel.innerHTML = '<option value="">— Chọn tổ chức —</option>' +
    allOrganizations.map((org) => {
      const plan = formatPlanNameVi(org.plan || 'FREE');
      const inactive = org.is_active === false ? ' [tạm dừng]' : '';
      return '<option value="' + org._id + '">' + escapeHtml(org.name) + ' · ' + escapeHtml(plan) + inactive + '</option>';
    }).join('');
  if (cur) billingSel.value = cur;
}

function renderOrgOverviewCards() {
  const container = document.getElementById('orgOverviewCards');
  const block = document.getElementById('orgOverviewBlock');
  if (!container) return;

  // Super Admin đã có thẻ「Tổng quan nền tảng」phía trên — ẩn bộ trùng trên tab Tổ Chức
  if (currentUser?.role === 'SUPER_ADMIN' && platformStatsCache?.scope === 'platform') {
    container.innerHTML = '';
    if (block) block.style.display = 'none';
    return;
  }
  if (block) block.style.display = '';

  const list = allOrganizations || [];
  const total = list.length;
  const active = list.filter((o) => o.is_active !== false).length;
  const inactive = total - active;
  const totalBuildings = list.reduce((s, o) => s + (Number(o.building_count) || 0), 0);
  const totalUsers = list.reduce((s, o) => s + (Number(o.user_count) || 0), 0);
  const proCount = list.filter((o) => (o.plan || 'FREE') === 'PRO').length;
  const enterpriseCount = list.filter((o) => (o.plan || 'FREE') === 'ENTERPRISE').length;

  const card = (label, value, sub, accent, clickable, onClick, selected) => {
    const cls = 'org-overview-card accent-' + accent +
      (clickable ? ' is-clickable' : '') +
      (selected ? ' is-selected' : '');
    const click = clickable && onClick ? ' onclick="' + onClick + '"' : '';
    return '<div class="' + cls + '"' + click + ' role="button" tabindex="' + (clickable ? '0' : '-1') + '">' +
      '<div class="ov-label">' + escapeHtml(label) + '</div>' +
      '<div class="ov-value">' + escapeHtml(String(value)) + '</div>' +
      (sub ? '<div class="ov-sub">' + escapeHtml(sub) + '</div>' : '') +
      '</div>';
  };

  const currentStatus = document.getElementById('filterOrgStatus')?.value || '';

  container.innerHTML =
    card('Tổng tổ chức', total, 'click xem tất cả', 'purple', true, 'filterOrgByOverviewStatus(\'\')', currentStatus === '') +
    card('Đang hoạt động', active, 'click để lọc', 'green', true, 'filterOrgByOverviewStatus(\'active\')', currentStatus === 'active') +
    card('Tạm dừng', inactive, 'click để lọc', 'red', true, 'filterOrgByOverviewStatus(\'inactive\')', currentStatus === 'inactive') +
    card('Tổng tòa nhà', totalBuildings, 'trên mọi tổ chức', 'blue', false) +
    card('Tổng tài khoản', totalUsers, 'trên mọi tổ chức', 'orange', false) +
    card('Gói trả phí', proCount + enterpriseCount, 'PRO: ' + proCount + ' · ENTERPRISE: ' + enterpriseCount, 'gray', false);
}

// ============================================================
// Phase 4.6 — Tổng quan platform / tổ chức (dashboard cards)
let platformStatsCache = null;

function buildOverviewCard(label, value, sub, accent, clickable, onClick, opts) {
  const o = opts || {};
  let cls = 'org-overview-card accent-' + accent;
  if (clickable) cls += ' is-clickable';
  if (o.alert) cls += ' card-needs-attention';
  const click = clickable && onClick ? ' onclick="' + onClick + '"' : '';
  const badge = o.badge
    ? '<span class="ov-badge">' + escapeHtml(o.badge) + '</span>'
    : '';
  let progressHtml = '';
  if (o.progress && o.progress.max > 0) {
    const pct = Math.min(100, Math.round((o.progress.value / o.progress.max) * 100));
    progressHtml =
      '<div class="ov-progress" title="' + escapeHtml(String(o.progress.value) + '/' + String(o.progress.max)) + '">' +
      '<div class="ov-progress-bar" style="width:' + pct + '%"></div></div>' +
      (o.progress.label ? '<div class="ov-progress-label">' + escapeHtml(o.progress.label) + '</div>' : '');
  }
  return '<div class="' + cls + '"' + click + ' role="button" tabindex="' + (clickable ? '0' : '-1') + '">' +
    '<div class="ov-label-row">' +
    '<div class="ov-label">' + escapeHtml(label) + '</div>' + badge +
    '</div>' +
    '<div class="ov-value">' + escapeHtml(String(value)) + '</div>' +
    (sub ? '<div class="ov-sub">' + escapeHtml(sub) + '</div>' : '') +
    progressHtml +
    '</div>';
}

async function fetchPlatformStats() {
  try {
    const res = await apiFetch('/platform/stats');
    if (!res.ok) return;
    platformStatsCache = await res.json();
    renderPlatformOverviewCards();
    if (currentUser) updatePlanQuotaBadge(currentUser, resolveQuotaFromStats(platformStatsCache));
  } catch (e) {
    console.warn('fetchPlatformStats:', e);
  }
}

function platformJumpBuildings(status) {
  switchTab('buildings');
  const el = document.getElementById('filterBuildingStatus');
  if (el) el.value = status || '';
  applyBuildingFilters();
}

function platformJumpBuildingsInactive() {
  switchTab('buildings');
  const inactiveEl = document.getElementById('filterBuildingIncludeInactive');
  if (inactiveEl) inactiveEl.checked = true;
  onBuildingIncludeInactiveChange();
}

function platformJumpOrganizations(status) {
  switchTab('organizations');
  const el = document.getElementById('filterOrgStatus');
  if (el) el.value = status || '';
  applyOrganizationFilters();
}

function platformJumpOrgPlan(plan) {
  switchTab('organizations');
  const planEl = document.getElementById('filterOrgPlan');
  const statusEl = document.getElementById('filterOrgStatus');
  if (planEl) planEl.value = plan || '';
  if (statusEl) statusEl.value = '';
  applyOrganizationFilters();
}

function platformJumpUsers(status, role) {
  switchTab('users');
  const statusEl = document.getElementById('filterUserStatus');
  const roleEl = document.getElementById('filterUserRole');
  if (statusEl && status != null) statusEl.value = status;
  if (roleEl && role != null) roleEl.value = role;
  applyUserFilters();
}

function platformJumpRegistrationsPending() {
  switchTab('registrations');
  const el = document.getElementById('filterRegStatus');
  if (el) el.value = 'PENDING';
  renderRegistrationsFromCache();
}

function renderPlatformOverviewCards() {
  const section = document.getElementById('platformOverviewSection');
  const container = document.getElementById('platformOverviewCards');
  const titleEl = document.getElementById('platformOverviewTitle');
  if (!section || !container || !platformStatsCache) return;

  const s = platformStatsCache;
  section.style.display = 'block';
  let html = '';

  if (s.scope === 'platform') {
    if (titleEl) titleEl.textContent = '📊 Tổng quan nền tảng';
    const org = s.organizations || {};
    const b = s.buildings || {};
    const u = s.users || {};
    const reg = s.registrations || {};
    const pending = reg.pending || 0;
    const inactiveOrg = org.inactive || 0;
    const inactiveBuildings = b.inactive || 0;
    const lockedUsers = u.inactive || 0;
    const totalActiveBuildings = b.total_active || 0;
    const published = b.published || 0;
    const draft = b.draft || 0;
    const paid = org.paid || 0;

    html =
      buildOverviewCard(
        'Tổ chức', org.total || 0,
        (org.active || 0) + ' HĐ · ' + paid + ' gói trả phí',
        'purple', true, "platformJumpOrganizations('')"
      ) +
      buildOverviewCard(
        'Đang hoạt động', org.active || 0,
        'bấm để lọc bảng tổ chức',
        'green', true, "platformJumpOrganizations('active')"
      ) +
      buildOverviewCard(
        'Tạm dừng', inactiveOrg,
        inactiveOrg ? 'tổ chức cần xem lại' : 'không có org tạm dừng',
        'red', true, "platformJumpOrganizations('inactive')",
        { alert: inactiveOrg > 0, badge: inactiveOrg > 0 ? 'Cần xem' : '' }
      ) +
      buildOverviewCard(
        'Tòa xuất bản', published,
        draft + ' nháp · ' + totalActiveBuildings + ' đang active',
        'blue', true, "platformJumpBuildings('PUBLISHED')",
        {
          progress: totalActiveBuildings > 0
            ? { value: published, max: totalActiveBuildings, label: Math.round((published / totalActiveBuildings) * 100) + '% đã publish' }
            : null
        }
      ) +
      buildOverviewCard(
        'Tòa nháp', draft,
        'chưa xuất bản lên app',
        'orange', true, "platformJumpBuildings('DRAFT')",
        { alert: draft > 0, badge: draft > 0 ? 'Soạn thảo' : '' }
      ) +
      buildOverviewCard(
        'Tài khoản', u.total || 0,
        'ORG ' + (u.org_admin || 0) + ' · BA ' + (u.building_admin || 0) +
          (lockedUsers ? ' · ' + lockedUsers + ' khóa' : ''),
        'teal', true, "switchTab('users')"
      ) +
      buildOverviewCard(
        'Hồ sơ chờ duyệt', pending,
        pending ? 'cần Super Admin duyệt' : 'không có hồ sơ chờ',
        'gray', true, 'platformJumpRegistrationsPending()',
        { alert: pending > 0, badge: pending > 0 ? 'Cần duyệt' : '' }
      ) +
      buildOverviewCard(
        'Tòa vô hiệu', inactiveBuildings,
        'soft delete — có thể khôi phục',
        'red', true, 'platformJumpBuildingsInactive()',
        { alert: inactiveBuildings > 0, badge: inactiveBuildings > 0 ? 'Khôi phục' : '' }
      );
  } else if (s.scope === 'organization') {
    const orgName = s.organization?.name || 'Tổ chức';
    const q = s.quota || {};
    const planLabel = formatPlanLabel(s.organization || {});
    if (titleEl) {
      titleEl.textContent = '📊 Tổng quan — ' + orgName + (planLabel ? ' (' + planLabel + ')' : '');
    }
    const b = s.buildings || {};
    const u = s.users || {};
    const draft = b.draft || 0;
    const inactiveB = b.inactive || 0;
    const buildingSub = 'XB ' + (b.published || 0) + ' · nháp ' + draft +
      (q.buildings?.limit != null ? ' · hạn ' + q.buildings.used + '/' + q.buildings.limit : '') +
      (q.buildings?.locked > 0 ? ' · 🔒' + q.buildings.locked : '');
    const userSub = 'ORG ' + (u.org_admin || 0) + ' · BA ' + (u.building_admin || 0) +
      (q.users?.limit != null ? ' · hạn ' + q.users.used + '/' + q.users.limit : '') +
      (q.users?.locked > 0 ? ' · 🔒' + q.users.locked : '');
    html =
      buildOverviewCard(
        'Tòa nhà', b.total_active || 0,
        buildingSub,
        'blue', true, "switchTab('buildings')",
        {
          progress: (b.total_active || 0) > 0
            ? { value: b.published || 0, max: b.total_active, label: 'tỷ lệ publish' }
            : null
        }
      ) +
      buildOverviewCard(
        'Đã xuất bản', b.published || 0,
        'app tải được',
        'green', true, "platformJumpBuildings('PUBLISHED')"
      ) +
      buildOverviewCard(
        'Tài khoản', u.total || 0,
        userSub,
        'orange', true, "switchTab('users')"
      ) +
      buildOverviewCard(
        'Tòa vô hiệu', inactiveB,
        inactiveB ? 'bấm để xem & khôi phục' : 'không có',
        'gray', true, 'platformJumpBuildingsInactive()',
        { alert: inactiveB > 0, badge: inactiveB > 0 ? 'Khôi phục' : '' }
      );
  } else if (s.scope === 'assigned') {
    if (titleEl) titleEl.textContent = '📊 Tổng quan tòa được gán';
    const b = s.buildings || {};
    const draft = b.draft || 0;
    html =
      buildOverviewCard(
        'Tòa được gán', b.assigned || 0,
        'tài khoản của bạn',
        'purple', true, "switchTab('buildings')"
      ) +
      buildOverviewCard(
        'Đã xuất bản', b.published || 0,
        'sẵn sàng trên app',
        'green', true, "platformJumpBuildings('PUBLISHED')"
      ) +
      buildOverviewCard(
        'Đang nháp', draft,
        draft ? 'cần publish' : 'không có nháp',
        'orange', true, "platformJumpBuildings('DRAFT')",
        { alert: draft > 0, badge: draft > 0 ? 'Publish' : '' }
      );
  }

  container.innerHTML = html;
  if (s.scope === 'platform') renderOrgOverviewCards();
}

function filterOrgByOverviewStatus(status) {
  const el = document.getElementById('filterOrgStatus');
  if (el) el.value = status;
  applyOrganizationFilters();
}

function getOrgTableSort() {
  if (!window._orgTableSort) {
    window._orgTableSort = { key: 'name', dir: 'asc' };
  }
  return window._orgTableSort;
}

function saveOrgTableSort(key, dir) {
  window._orgTableSort = { key: key || 'name', dir: dir === 'desc' ? 'desc' : 'asc' };
  try {
    const saved = JSON.parse(localStorage.getItem('organizationsFilters') || '{}');
    saved.sortKey = window._orgTableSort.key;
    saved.sortDir = window._orgTableSort.dir;
    localStorage.setItem('organizationsFilters', JSON.stringify(saved));
  } catch (e) {}
}

/** Sắp xếp danh sách tổ chức — dùng OrgListSort nếu có, fallback nội bộ */
function sortOrgList(list, key, dir) {
  if (window.OrgListSort && typeof window.OrgListSort.sortOrganizations === 'function') {
    return window.OrgListSort.sortOrganizations(list, key, dir);
  }
  const sortKey = key || 'name';
  const mul = dir === 'desc' ? -1 : 1;
  const planOrder = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
  return list.slice().sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'slug':
        cmp = String(a.slug || '').localeCompare(String(b.slug || ''), 'vi', { sensitivity: 'base' });
        break;
      case 'plan':
        cmp = (planOrder[a.plan || 'FREE'] ?? 0) - (planOrder[b.plan || 'FREE'] ?? 0);
        break;
      case 'status':
        cmp = (a.is_active === false ? 0 : 1) - (b.is_active === false ? 0 : 1);
        break;
      case 'buildings':
        cmp = (Number(a.building_count) || 0) - (Number(b.building_count) || 0);
        break;
      case 'users':
        cmp = (Number(a.user_count) || 0) - (Number(b.user_count) || 0);
        break;
      case 'created': {
        const ta = new Date(a.createdAt || a.created_at || 0).getTime();
        const tb = new Date(b.createdAt || b.created_at || 0).getTime();
        cmp = (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
        break;
      }
      default:
        cmp = String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' });
    }
    return cmp * mul;
  });
}

function syncOrgSortBarFromState() {
  const cur = getOrgTableSort();
  const keyEl = document.getElementById('filterOrgSortKey');
  const dirEl = document.getElementById('filterOrgSortDir');
  if (keyEl && keyEl.value !== cur.key) keyEl.value = cur.key;
  if (dirEl && dirEl.value !== cur.dir) dirEl.value = cur.dir;
}

function applyOrgSortFromBar() {
  const key = document.getElementById('filterOrgSortKey')?.value || 'name';
  const dir = document.getElementById('filterOrgSortDir')?.value || 'asc';
  saveOrgTableSort(key, dir);
  window._organizationsPage = 1;
  renderOrganizationsFromCache();
}

function toggleOrgTableSort(key) {
  const cur = getOrgTableSort();
  if (cur.key === key) {
    saveOrgTableSort(key, cur.dir === 'asc' ? 'desc' : 'asc');
  } else {
    saveOrgTableSort(key, 'asc');
  }
  window._organizationsPage = 1;
  renderOrganizationsFromCache();
}

function initOrgTableSort() {
  initDashTableSort('orgTableHead', toggleOrgTableSort);
}

function initDashTableSort(headId, toggleFn) {
  const head = document.getElementById(headId);
  if (!head || head.dataset.sortBound === '1') return;
  head.dataset.sortBound = '1';
  head.addEventListener('click', (e) => {
    const th = e.target.closest('th.org-sortable');
    if (!th) return;
    const sortKey = th.getAttribute('data-sort-key');
    if (sortKey) toggleFn(sortKey);
  });
}

function updateDashSortIndicators(tableId, getSortState) {
  const cur = getSortState();
  const table = document.getElementById(tableId);
  if (!table) return;
  table.querySelectorAll('.org-sort-indicator').forEach((el) => {
    const k = el.getAttribute('data-for');
    if (k === cur.key) {
      el.textContent = cur.dir === 'desc' ? '▼' : '▲';
      el.style.opacity = '1';
    } else {
      el.textContent = '⇅';
      el.style.opacity = '0.55';
    }
  });
  table.querySelectorAll('th.org-sortable').forEach((th) => {
    th.classList.toggle('org-sort-active', th.getAttribute('data-sort-key') === cur.key);
  });
}

function updateOrgSortIndicators() {
  updateDashSortIndicators('orgOrganizationsTable', getOrgTableSort);
  syncOrgSortBarFromState();
}

function renderOrganizationsFromCache() {
  renderOrgOverviewCards();
  const tbody = document.getElementById('organizationsList');
  if (!tbody) return;
  const keyword = (document.getElementById('filterOrgKeyword')?.value || '').trim().toLowerCase();
  const code = (document.getElementById('filterOrgCode')?.value || '').trim().toLowerCase();
  const plan = document.getElementById('filterOrgPlan')?.value || '';
  const status = document.getElementById('filterOrgStatus')?.value || '';
  let list = allOrganizations.slice();
  if (keyword) list = list.filter(o => (o.name || '').toLowerCase().includes(keyword));
  if (code) list = list.filter(o => (o.slug || '').toLowerCase().includes(code));
  if (plan) list = list.filter(o => (o.plan || 'FREE') === plan);
  if (status === 'active') list = list.filter(o => o.is_active !== false);
  if (status === 'inactive') list = list.filter(o => o.is_active === false);
  const sortState = getOrgTableSort();
  list = sortOrgList(list, sortState.key, sortState.dir);
  updateOrgSortIndicators();
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;">Chưa có tổ chức nào.</td></tr>';
    renderPagination('organizations', 0, 1);
    return;
  }
  const page = window._organizationsPage || 1;
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);
  tbody.innerHTML = pageItems.map(org => {
    const date = org.createdAt ? new Date(org.createdAt).toLocaleDateString('vi-VN') : (org.created_at ? new Date(org.created_at).toLocaleDateString('vi-VN') : '-');
    const isActive = org.is_active !== false;
    const oid = String(org._id);
    const statusBadge = isActive
      ? '<span class="status-badge active">Hoạt động</span>'
      : '<span class="status-badge inactive">Tạm dừng</span>';
    const bCount = formatBuildingCountCell(org, oid);
    const uCount = org.user_count != null ? org.user_count : '—';
    const userOverHint = getOrgQuotaOverHint(org);
    const uCountHtml = userOverHint
      ? '<span title="' + escapeHtml(userOverHint) + '">' + uCount + ' <span class="obc-warn">⚠</span></span>'
      : String(uCount);
    const adminsCell = formatOrgAdminsCell(org);
    const planCell = formatOrgPlanListCell(org);
    const isLegacy = org.slug === 'legacy';
    let statusBtn;
    if (isLegacy) {
      statusBtn = '<span class="badge badge-inactive" style="cursor:default;font-size:11px;" title="Không thể tạm dừng tổ chức legacy">—</span>';
    } else {
      const btnClass = isActive ? 'btn-logout' : 'btn-create';
      const btnText = isActive ? 'Tạm dừng' : 'Kích hoạt';
      statusBtn = '<button type="button" class="' + btnClass + ' org-status-btn" onclick="toggleOrganizationActive(\'' + oid + '\', ' + isActive + ')">' + btnText + '</button>';
    }
    return '<tr>' +
      tdEllipsis(org.name, '<strong class="org-name-link" onclick="openOrgDetailModal(\'' + oid + '\')" title="Xem chi tiết">' + escapeHtml(org.name) + '</strong>') +
      tdEllipsis(org.slug) +
      '<td class="org-plan-cell">' + planCell + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td style="text-align:center;">' + bCount + '</td>' +
      '<td style="text-align:center;cursor:pointer;" onclick="jumpToUsers(\'' + oid + '\')" title="Xem tài khoản">' + uCountHtml + '</td>' +
      tdEllipsis(adminsCell.plain, adminsCell.html) +
      '<td>' + date + '</td>' +
      '<td class="actions-cell"><div class="building-actions">' +
        '<button type="button" class="btn-edit org-detail-btn" onclick="openOrgDetailModal(\'' + oid + '\')">Chi tiết</button>' +
        '<button type="button" class="btn-edit" onclick="openBillingTabForOrg(\'' + oid + '\')" style="background:#2563eb;color:#fff;">Gói & TT</button>' +
        statusBtn +
        '<button type="button" class="btn-edit" onclick="jumpToBuildings(\'' + oid + '\')">Tòa nhà</button>' +
        '<button type="button" class="btn-edit" onclick="jumpToUsers(\'' + oid + '\')" style="background:#f39c12;color:#fff;">User</button>' +
      '</div></td></tr>';
  }).join('');
  renderPagination('organizations', list.length, page);
}

async function patchOrganization(orgId, body, confirmMsg) {
  if (confirmMsg && !confirm(confirmMsg)) return false;
  try {
    const res = await apiFetch('/organizations/' + orgId, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert('Lỗi: ' + (d.message || 'HTTP ' + res.status));
      return false;
    }
    const updated = d.organization;
    if (updated) {
      const idx = allOrganizations.findIndex((o) => String(o._id) === String(orgId));
      if (idx >= 0) {
        allOrganizations[idx] = { ...allOrganizations[idx], ...updated };
        populateOrganizationDropdown();
        renderOrganizationsFromCache();
      }
      if (_orgDetailId && String(_orgDetailId) === String(orgId)) {
        openOrgDetailModal(orgId);
      }
      if (_billingTabOrgId && String(_billingTabOrgId) === String(orgId)) {
        loadBillingTab(orgId);
      }
    }
    return true;
  } catch (e) {
    console.error('patchOrganization error:', e);
    alert('Lỗi kết nối khi cập nhật tổ chức.');
    return false;
  }
}

async function changeOrganizationPlan(orgId, selectEl) {
  const newPlan = selectEl.value;
  const org = allOrganizations.find((o) => String(o._id) === String(orgId));
  const oldPlan = org?.plan || 'FREE';
  if (newPlan === oldPlan) return;
  const ok = await patchOrganization(
    orgId,
    { plan: newPlan },
    'Đổi gói "' + (org?.name || '') + '" từ ' + oldPlan + ' → ' + newPlan + '?'
  );
  if (!ok && selectEl) selectEl.value = oldPlan;
}

async function toggleOrganizationActive(orgId, currentActive) {
  const org = allOrganizations.find((o) => String(o._id) === String(orgId));
  const orgName = org?.name || 'tổ chức';
  const next = !currentActive;
  const msg = next
    ? 'Kích hoạt lại tổ chức "' + orgName + '"?'
    : 'Tạm dừng tổ chức "' + orgName + '"?';
  await patchOrganization(orgId, { is_active: next }, msg);
}

let _orgDetailId = null;
let _orgDetailData = null;
let _billingTabOrgId = null;
let _billingTabData = null;

async function refreshBillingOrgViews(orgId) {
  if (_billingTabOrgId && String(_billingTabOrgId) === String(orgId)) {
    await loadBillingTab(orgId);
  }
  if (_orgDetailId && String(_orgDetailId) === String(orgId)) {
    await openOrgDetailModal(orgId);
  }
  if (typeof fetchOrganizations === 'function') await fetchOrganizations();
}

async function openBillingTabForOrg(orgId) {
  if (!orgId) return;
  closeOrgDetailModal();
  await switchTab('billing', { billingOrgId: orgId });
}

async function loadAnalyticsTab() {
  const range = document.getElementById('analyticsRangeSelect')?.value || '30d';
  const cards = document.getElementById('analyticsSummaryCards');
  const loginEl = document.getElementById('analyticsLoginChart');
  const publishEl = document.getElementById('analyticsPublishChart');
  const planEl = document.getElementById('analyticsPlanDist');
  const paidEl = document.getElementById('analyticsPaidMonth');
  const alertsEl = document.getElementById('analyticsAlerts');
  if (!cards) return;

  cards.innerHTML = '<p class="analytics-loading">Đang tải Analytics…</p>';
  if (loginEl) loginEl.innerHTML = '';
  if (publishEl) publishEl.innerHTML = '';
  if (planEl) planEl.innerHTML = '';
  if (paidEl) paidEl.innerHTML = '';
  if (alertsEl) alertsEl.innerHTML = '';

  try {
    const [ovRes, alRes] = await Promise.all([
      apiFetch('/analytics/overview?range=' + encodeURIComponent(range)),
      apiFetch('/analytics/alerts')
    ]);
    const overview = await ovRes.json().catch(() => ({}));
    const alertsData = await alRes.json().catch(() => ({}));
    if (!ovRes.ok) {
      cards.innerHTML = '<p class="analytics-error">Lỗi: ' + escapeHtml(overview.message || 'HTTP ' + ovRes.status) + '</p>';
      return;
    }
    renderAnalyticsSummary(overview);
    renderAnalyticsBarChart(loginEl, overview.series?.login || [], 'count');
    renderAnalyticsBarChart(publishEl, overview.series?.publish || [], 'count');
    renderAnalyticsPlanDist(planEl, overview.plan_distribution || {});
    renderAnalyticsPaidMonth(paidEl, overview.paid_by_month || [], overview.scope);
    renderAnalyticsBillingHint(overview);
    if (alRes.ok) {
      renderAnalyticsAlerts(alertsEl, alertsData.alerts || []);
    } else {
      if (alertsEl) {
        alertsEl.innerHTML = '<p class="analytics-error">Không tải được cảnh báo: ' +
          escapeHtml(alertsData.message || 'HTTP ' + alRes.status) + '</p>';
      }
    }
  } catch (e) {
    console.error('loadAnalyticsTab error:', e);
    cards.innerHTML = '<p class="analytics-error">Lỗi kết nối khi tải Analytics.</p>';
  }
}

function isAnalyticsOrgScope(overview) {
  return overview?.scope === 'organization' || currentUser?.role === 'ORG_ADMIN';
}

function renderAnalyticsSummary(overview) {
  const cards = document.getElementById('analyticsSummaryCards');
  if (!cards) return;
  const t = overview.totals || {};
  const isOrg = isAnalyticsOrgScope(overview);
  const scopeLabel = isOrg ? 'Tổ chức của bạn' : 'Toàn nền tảng';
  const orgName = overview.organization?.name
    ? ' · ' + escapeHtml(overview.organization.name)
    : '';
  const moneyLabel = isOrg ? 'Chi phí đã trả (VND)' : 'Doanh thu (VND)';
  const invoiceLabel = isOrg ? 'Hóa đơn đã trả' : 'Hóa đơn PAID';
  cards.innerHTML =
    '<div class="analytics-summary-meta">' + escapeHtml(scopeLabel) + orgName +
      ' · ' + escapeHtml(overview.range || '') + '</div>' +
    '<div class="analytics-summary-grid">' +
      analyticsSummaryCard('Đăng nhập', t.logins || 0, 'login') +
      analyticsSummaryCard('Xuất bản map', t.publishes || 0, 'publish') +
      analyticsSummaryCard(invoiceLabel, t.paid_invoices || 0, 'invoice') +
      analyticsSummaryCard(moneyLabel, (Number(t.paid_amount || 0)).toLocaleString('vi-VN'), 'amount') +
    '</div>';
}

function analyticsSummaryCard(label, value, kind) {
  return '<div class="analytics-summary-card analytics-card-' + kind + '">' +
    '<div class="analytics-summary-value">' + escapeHtml(String(value)) + '</div>' +
    '<div class="analytics-summary-label">' + escapeHtml(label) + '</div>' +
  '</div>';
}

function renderAnalyticsBarChart(container, series, field) {
  if (!container) return;
  const rows = Array.isArray(series) ? series : [];
  if (!rows.length) {
    container.innerHTML = '<p class="analytics-empty">Chưa có dữ liệu trong khoảng này.</p>';
    return;
  }
  const values = rows.map((r) => Number(r[field] || 0));
  const max = Math.max(1, ...values);
  const showEvery = rows.length > 14 ? Math.ceil(rows.length / 10) : 1;
  container.innerHTML =
    '<div class="analytics-bars" role="img" aria-label="Biểu đồ cột">' +
    rows.map((r, i) => {
      const v = Number(r[field] || 0);
      const pct = Math.round((v / max) * 100);
      const label = String(r.date || '').slice(5);
      const showLabel = i % showEvery === 0 || i === rows.length - 1;
      return '<div class="analytics-bar-col" title="' + escapeHtml(r.date + ': ' + v) + '">' +
        '<div class="analytics-bar-track"><div class="analytics-bar-fill" style="height:' + pct + '%"></div></div>' +
        (showLabel ? '<span class="analytics-bar-label">' + escapeHtml(label) + '</span>' : '<span class="analytics-bar-label analytics-bar-label-spacer"></span>') +
      '</div>';
    }).join('') +
    '</div>';
}

function renderAnalyticsPlanDist(container, dist) {
  if (!container) return;
  const plans = [
    { key: 'FREE', label: 'Miễn phí', cls: 'plan-free' },
    { key: 'PRO', label: 'Pro', cls: 'plan-pro' },
    { key: 'ENTERPRISE', label: 'Enterprise', cls: 'plan-ent' }
  ];
  const total = plans.reduce((s, p) => s + (Number(dist[p.key]) || 0), 0) || 1;
  container.innerHTML = plans.map((p) => {
    const n = Number(dist[p.key]) || 0;
    const pct = Math.round((n / total) * 100);
    return '<div class="analytics-plan-row">' +
      '<div class="analytics-plan-head"><span>' + escapeHtml(p.label) + '</span><strong>' + n + '</strong></div>' +
      '<div class="analytics-plan-bar"><div class="analytics-plan-fill ' + p.cls + '" style="width:' + pct + '%"></div></div>' +
    '</div>';
  }).join('');
}

function renderAnalyticsPaidMonth(container, rows, scope) {
  if (!container) return;
  const isOrg = scope === 'organization' || currentUser?.role === 'ORG_ADMIN';
  const titleEl = document.getElementById('analyticsPaidMonthTitle');
  if (titleEl) {
    titleEl.textContent = isOrg
      ? 'Chi phí đã thanh toán theo tháng'
      : 'Doanh thu PAID theo tháng';
  }
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    container.innerHTML = '<p class="analytics-empty">' +
      (isOrg ? 'Chưa có khoản thanh toán trong khoảng này.' : 'Chưa có hóa đơn PAID trong khoảng này.') +
      '</p>';
    return;
  }
  container.innerHTML =
    '<table class="analytics-paid-table"><thead><tr><th>Tháng</th><th>Số HĐ</th><th>Số tiền</th></tr></thead><tbody>' +
    list.map((r) =>
      '<tr><td>' + escapeHtml(r.month) + '</td><td>' + (r.count || 0) + '</td><td>' +
        (Number(r.amount || 0)).toLocaleString('vi-VN') + ' VND</td></tr>'
    ).join('') +
    '</tbody></table>';
}

function renderAnalyticsBillingHint(overview) {
  const hint = document.getElementById('analyticsBillingHint');
  if (!hint) return;
  const isOrg = isAnalyticsOrgScope(overview);
  if (isOrg) {
    hint.innerHTML =
      '<p class="analytics-billing-hint-text">Số liệu trên là <strong>tiền tổ chức đã trả cho nền tảng</strong> (chi phí gói), không phải doanh thu của tổ chức.</p>' +
      '<button type="button" class="btn-create analytics-billing-hint-btn" onclick="switchTab(\'billing\')">Xem hóa đơn chi tiết → Gói &amp; Thanh toán</button>';
  } else {
    hint.innerHTML =
      '<p class="analytics-billing-hint-text">Doanh thu = tổng hóa đơn PAID các tổ chức trả cho hệ thống. Chi tiết từng hóa đơn / từng org nằm ở tab Gói &amp; Thanh toán.</p>' +
      '<button type="button" class="btn-create analytics-billing-hint-btn" onclick="switchTab(\'billing\')">Xem hóa đơn chi tiết → Gói &amp; Thanh toán</button>';
  }
}

function renderAnalyticsAlerts(container, alerts) {
  if (!container) return;
  const list = Array.isArray(alerts) ? alerts : [];
  if (!list.length) {
    container.innerHTML = '<p class="analytics-empty analytics-alerts-ok">Không có cảnh báo.</p>';
    return;
  }
  container.innerHTML = '<ul class="analytics-alert-list">' + list.map((a) => {
    const sev = escapeHtml(a.severity || 'info');
    return '<li class="analytics-alert-item severity-' + sev + '">' +
      '<span class="analytics-alert-type">' + escapeHtml(a.type || '') + '</span>' +
      '<div class="analytics-alert-body">' +
        '<strong>' + escapeHtml(a.title || '') + '</strong>' +
        '<span>' + escapeHtml(a.message || '') + '</span>' +
      '</div></li>';
  }).join('') + '</ul>';
}

async function loadBillingTab(orgId) {
  const select = document.getElementById('billingOrgSelect');
  const id = orgId || select?.value;
  const body = document.getElementById('billingTabBody');
  if (!body) return;
  if (!id) {
    _billingTabOrgId = null;
    _billingTabData = null;
    body.innerHTML = '<p class="billing-tab-empty">Chọn một tổ chức để xem và quản lý gói đăng ký.</p>';
    return;
  }
  if (select && select.value !== id) select.value = id;
  _billingTabOrgId = id;
  body.innerHTML = '<p class="billing-tab-loading">Đang tải dữ liệu gói & thanh toán…</p>';
  try {
    const res = await apiFetch('/organizations/' + id);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      body.innerHTML = '<p class="billing-tab-error">Lỗi: ' + escapeHtml(d.message || 'HTTP ' + res.status) + '</p>';
      return;
    }
    _billingTabData = d;
    renderBillingTabBody(d);
  } catch (e) {
    console.error('loadBillingTab error:', e);
    body.innerHTML = '<p class="billing-tab-error">Lỗi kết nối khi tải tab Gói & Thanh toán.</p>';
  }
}

function renderBillingTabBody(data) {
  const body = document.getElementById('billingTabBody');
  if (!body || !data) return;
  const org = data.organization || {};
  const oid = String(org._id || _billingTabOrgId || '');
  const quota = data.quota || null;
  const subscription = data.current_subscription || null;
  const quotaBanner = formatDetailQuotaBanner(quota, org);
  const actionPanel = renderOrgBillingActionPanel(oid, org, subscription, quota);
  const subscriptionHtml = renderCurrentSubscription(subscription);
  const invoicesHtml = renderOrgInvoices(data.invoices);
  const billingEventsHtml = renderOrgBillingEvents(data.billing_events);
  const planHistoryHtml = renderOrgPlanHistory(data.plan_history);
  const lifecycleStatsHtml = renderLifecycleStats(data.lifecycle_stats);

  body.innerHTML =
    '<div class="billing-tab-org-head">' +
      '<h4>' + escapeHtml(org.name || 'Tổ chức') + '</h4>' +
      '<span class="billing-tab-org-meta">' + escapeHtml(org.slug || '') + ' · ' + formatOrgBillingBadge(org) + '</span>' +
    '</div>' +
    (quotaBanner || '') +
    '<div class="billing-tab-section-block">' +
      '<h4>Thao tác theo trạng thái</h4>' + actionPanel +
    '</div>' +
    '<div class="billing-tab-section-block">' +
      '<h4>Gói đăng ký hiện hành</h4>' + subscriptionHtml +
    '</div>' +
    '<div class="billing-tab-section-block">' +
      '<h4>Hóa đơn <span class="org-detail-hint">(20 gần nhất)</span></h4>' + invoicesHtml +
    '</div>' +
    '<div class="billing-tab-section-block">' +
      '<h4>Sự kiện thanh toán <span class="org-detail-hint">(30 gần nhất)</span></h4>' + billingEventsHtml +
    '</div>' +
    '<div class="billing-tab-section-block">' +
      '<h4>Lịch sử gói <span class="org-detail-hint">(20 lần gần nhất)</span></h4>' + planHistoryHtml +
    '</div>' +
    '<div class="billing-tab-section-block">' +
      '<h4>Thống kê vòng đời billing</h4>' + lifecycleStatsHtml +
    '</div>';
}

async function loadMyBillingTab() {
  const body = document.getElementById('billingTabBody');
  if (!body) return;
  body.innerHTML = '<p class="billing-tab-loading">Đang tải gói của tổ chức bạn…</p>';
  try {
    const res = await apiFetch('/billing/me');
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      body.innerHTML = '<p class="billing-tab-error">Lỗi: ' + escapeHtml(d.message || 'HTTP ' + res.status) + '</p>';
      return;
    }
    _billingTabOrgId = d.organization?._id;
    _billingTabData = d;
    renderMyBillingTabBody(d);
  } catch (e) {
    console.error('loadMyBillingTab error:', e);
    body.innerHTML = '<p class="billing-tab-error">Lỗi kết nối khi tải gói.</p>';
  }
}

function renderOrgSelfServicePanel(org, subscription, quota) {
  const plan = String(org?.plan || 'FREE').toUpperCase();
  const billing = String(org?.billing_status || 'ACTIVE').toUpperCase();
  const state = resolveOrgBillingUiState(org, subscription, quota);
  let actions = '';

  if (state === 'FREE' || state === 'EXPIRED' || plan === 'FREE') {
    actions += '<div class="org-plan-actions">' +
      '<button type="button" class="btn-create" onclick="checkoutOrgPlan(\'PRO\', \'upgrade\')">Nâng cấp Pro — 990.000đ/tháng</button>' +
      '<button type="button" class="btn-edit" onclick="checkoutOrgPlan(\'ENTERPRISE\', \'upgrade\')">Nâng cấp Doanh nghiệp — 4.990.000đ/tháng</button>' +
    '</div>';
  } else if (state === 'PAID_ACTIVE' || state === 'GRACE') {
  const renewLabel = state === 'GRACE' ? 'Thanh toán gia hạn ngay' : 'Gia hạn gói';
    actions += '<div class="org-plan-actions">' +
      '<button type="button" class="btn-create" onclick="checkoutOrgPlan(\'' + plan + '\', \'renew\')">' + renewLabel + '</button>';
    if (plan === 'PRO') {
      actions += '<button type="button" class="btn-edit" onclick="checkoutOrgPlan(\'ENTERPRISE\', \'upgrade\')">Nâng lên Doanh nghiệp</button>';
    }
    actions += '</div>';
    if (state === 'GRACE' && org.grace_ends_at) {
      actions += '<p class="org-billing-snapshot-hint">Đang trong thời gian gia hạn đến <strong>' + escapeHtml(formatDateTime(org.grace_ends_at)) + '</strong>. Thanh toán để tránh khóa hạn mức.</p>';
    }
  }

  return '<div class="org-subscription-manage billing-self-service">' +
    '<div class="billing-state-badge billing-state-' + state.toLowerCase() + '">' +
      escapeHtml(BILLING_UI_STATE_LABELS[state] || state) +
    '</div>' +
    '<div class="org-sub-manage-hint">Thanh toán qua VNPay (production) hoặc trang mock (dev). Sau khi thanh toán, hệ thống tự kích hoạt gói.</div>' +
    actions +
  '</div>';
}

function renderMyBillingTabBody(data) {
  const body = document.getElementById('billingTabBody');
  if (!body || !data) return;
  const org = data.organization || {};
  const quota = data.quota || null;
  const subscription = data.current_subscription || null;
  const quotaBanner = formatDetailQuotaBanner(quota, org);
  const selfPanel = renderOrgSelfServicePanel(org, subscription, quota);

  body.innerHTML =
    '<div class="billing-tab-org-head">' +
      '<h4>' + escapeHtml(org.name || 'Tổ chức của bạn') + '</h4>' +
      '<span class="billing-tab-org-meta">' + formatOrgBillingBadge(org) + ' · ' + escapeHtml(formatPlanExpiryLine(org, quota).replace(/<[^>]+>/g, ' ').trim()) + '</span>' +
    '</div>' +
    (quotaBanner || '') +
    '<div class="billing-tab-section-block"><h4>Gói & thanh toán</h4>' + selfPanel + '</div>' +
    '<div class="billing-tab-section-block"><h4>Gói đăng ký hiện hành</h4>' + renderCurrentSubscription(subscription) + '</div>' +
    '<div class="billing-tab-section-block"><h4>Hóa đơn</h4>' + renderOrgInvoices(data.invoices) + '</div>' +
    '<div class="billing-tab-section-block"><h4>Sự kiện thanh toán</h4>' + renderOrgBillingEvents(data.billing_events) + '</div>';
}

async function checkoutOrgPlan(plan, action) {
  const p = String(plan || 'PRO').toUpperCase();
  const act = String(action || 'upgrade').toLowerCase();
  if (!confirm('Tiếp tục thanh toán gói ' + formatPlanNameVi(p) + '?')) return;
  try {
    const res = await apiFetch('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: p, action: act })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert('Lỗi: ' + (d.message || 'HTTP ' + res.status));
      return;
    }
    if (d.checkout_url) {
      window.location.href = d.checkout_url;
    } else {
      alert('Đã xử lý thanh toán.');
      if (currentUser?.role === 'ORG_ADMIN') await loadMyBillingTab();
      else if (_billingTabOrgId) await loadBillingTab(_billingTabOrgId);
    }
  } catch (e) {
    console.error('checkoutOrgPlan:', e);
    alert('Lỗi kết nối khi tạo phiên thanh toán.');
  }
}

async function openOrgDetailModal(orgId) {
  _orgDetailId = orgId;
  const modal = document.getElementById('orgDetailModal');
  const body = document.getElementById('orgDetailBody');
  if (!modal || !body) return;
  modal.style.display = 'flex';
  body.innerHTML = '<p style="text-align:center;color:#888;padding:24px;">Đang tải...</p>';
  try {
    const res = await apiFetch('/organizations/' + orgId);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      body.innerHTML = '<p style="color:#e74c3c;text-align:center;">' + escapeHtml(d.message || 'HTTP ' + res.status) + '</p>';
      return;
    }
    renderOrgDetailBody(d);
    _orgDetailData = d;
  } catch (e) {
    console.error('openOrgDetailModal error:', e);
    body.innerHTML = '<p style="color:#e74c3c;text-align:center;">Lỗi kết nối khi tải chi tiết tổ chức.</p>';
  }
}

function closeOrgDetailModal() {
  const modal = document.getElementById('orgDetailModal');
  if (modal) modal.style.display = 'none';
  _orgDetailId = null;
  _orgDetailData = null;
}

function formatDateTime(val) {
  if (!val) return 'Chưa có';
  return new Date(val).toLocaleString('vi-VN');
}

function renderOrgAdminCards(admins) {
  if (!admins || !admins.length) {
    return '<p class="org-detail-empty">Chưa có ORG_ADMIN.</p>';
  }
  return admins.map((a) => {
    const uid = String(a._id);
    const email = escapeHtml(a.email || '-');
    const statusHtml = formatDetailUserStatus(a);
    return '<div class="org-admin-card">' +
      '<div class="org-admin-card-title">' + escapeHtml(a.full_name || a.email || 'ORG_ADMIN') + '</div>' +
      '<div class="org-admin-row"><span>Email đăng nhập</span><strong>' + email + '</strong></div>' +
      '<div class="org-admin-row"><span>Họ tên</span>' + escapeHtml(a.full_name || '—') + '</div>' +
      '<div class="org-admin-row"><span>Số điện thoại</span>' + escapeHtml(a.phone || '—') + '</div>' +
      '<div class="org-admin-row"><span>Trạng thái</span>' + statusHtml + '</div>' +
      '<div class="org-admin-row"><span>Đăng nhập lần cuối</span>' + escapeHtml(formatDateTime(a.last_login)) + '</div>' +
      '<div class="org-admin-row"><span>Ngày tạo TK</span>' + escapeHtml(formatDateTime(a.createdAt)) + '</div>' +
      '<p class="org-detail-note">Mật khẩu được mã hóa trong hệ thống — <strong>không thể xem</strong>. Dùng nút bên dưới để cấp mật khẩu mới.</p>' +
      '<div class="org-admin-actions">' +
        '<button type="button" class="btn-edit org-reset-pwd-btn" onclick="promptResetOrgAdminPassword(\'' + uid + '\')">Đặt mật khẩu mới</button>' +
        '<button type="button" class="btn-create org-reset-pwd-btn" onclick="generateResetOrgAdminPassword(\'' + uid + '\')">Tạo mật khẩu ngẫu nhiên</button>' +
      '</div></div>';
  }).join('');
}

async function callAdminResetPassword(userId, body) {
  const res = await apiFetch('/users/' + userId + '/reset-password', {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert('Lỗi: ' + (d.message || 'HTTP ' + res.status));
    return false;
  }
  if (d.temporary_password) {
    alert(
      'Đặt lại mật khẩu thành công!\n\n' +
      'Mật khẩu mới (chỉ hiện một lần — hãy sao chép ngay):\n\n' +
      d.temporary_password +
      '\n\nGửi thông tin đăng nhập cho quản trị viên tổ chức.'
    );
  } else {
    alert(d.message || 'Đặt lại mật khẩu thành công.');
  }
  if (_orgDetailId) openOrgDetailModal(_orgDetailId);
  if (typeof fetchUsers === 'function') fetchUsers();
  return true;
}

function findUserEmailForReset(userId) {
  const fromUsers = (allUsers || []).find((u) => String(u._id) === String(userId));
  if (fromUsers?.email) return fromUsers.email;
  const fromOrg = (_orgDetailData?.org_admins || []).find((a) => String(a._id) === String(userId));
  if (fromOrg?.email) return fromOrg.email;
  const fromRecent = (_orgDetailData?.recent_users || []).find((u) => String(u._id) === String(userId));
  return fromRecent?.email || document.getElementById('updateUserEmail')?.value || 'tài khoản';
}

async function promptResetUserPassword(userId) {
  if (!userId) return;
  const email = findUserEmailForReset(userId);
  const newPassword = prompt('Nhập mật khẩu mới cho ' + email + ' (ít nhất 8 ký tự):');
  if (!newPassword) return;
  if (newPassword.length < 8) {
    alert('Mật khẩu phải có ít nhất 8 ký tự.');
    return;
  }
  const confirmPwd = prompt('Nhập lại mật khẩu để xác nhận:');
  if (newPassword !== confirmPwd) {
    alert('Mật khẩu xác nhận không khớp.');
    return;
  }
  await callAdminResetPassword(userId, { newPassword });
}

async function generateResetUserPassword(userId) {
  if (!userId) return;
  const email = findUserEmailForReset(userId);
  if (!confirm('Tạo mật khẩu ngẫu nhiên cho ' + email + '?\nMật khẩu sẽ hiện một lần sau khi tạo.')) return;
  await callAdminResetPassword(userId, { generate: true });
}

async function promptResetOrgAdminPassword(userId) {
  await promptResetUserPassword(userId);
}

async function generateResetOrgAdminPassword(userId) {
  await generateResetUserPassword(userId);
}

function renderOrgDetailBody(data) {
  const org = data.organization || {};
  const oid = String(org._id || _orgDetailId || '');
  const isActive = org.is_active !== false;
  const created = formatDateTime(org.createdAt);
  const updated = formatDateTime(org.updatedAt);
  const titleEl = document.getElementById('orgDetailTitle');
  if (titleEl) titleEl.textContent = org.name || 'Chi tiết tổ chức';

  const rc = data.role_counts || {};
  const bsc = data.building_status_counts || {};
  const orgAdminCount = rc.ORG_ADMIN || 0;
  const buildingAdminCount = rc.BUILDING_ADMIN || 0;
  const publishedCount = bsc.PUBLISHED || 0;
  const draftCount = bsc.DRAFT || 0;

  const adminsHtml = renderOrgAdminCards(data.org_admins);

  const buildingsHtml = (data.recent_buildings || []).length
    ? '<table class="org-detail-mini-table"><thead><tr><th>Tên</th><th>Trạng thái</th><th>Số tầng</th><th>Cập nhật</th></tr></thead><tbody>' +
      data.recent_buildings.map((b) =>
        '<tr' + (b.quota_locked ? ' class="org-detail-row-locked"' : '') + '><td>' + escapeHtml(b.name || '-') + '</td><td>' +
        formatDetailBuildingStatus(b) + '</td><td>' +
        (b.total_floors != null ? b.total_floors : '—') + '</td><td>' +
        (b.updatedAt ? new Date(b.updatedAt).toLocaleDateString('vi-VN') : '-') + '</td></tr>'
      ).join('') + '</tbody></table>'
    : '<p class="org-detail-empty">Chưa có tòa nhà.</p>';

  const ROLE_DISPLAY = {
    SUPER_ADMIN: 'Super Admin',
    ORG_ADMIN: 'Quản trị tổ chức',
    BUILDING_ADMIN: 'Quản trị tòa'
  };
  const usersHtml = (data.recent_users || []).length
    ? '<table class="org-detail-mini-table"><thead><tr><th>Email</th><th>Họ tên</th><th>Vai trò</th><th>Đăng nhập cuối</th><th>Trạng thái</th></tr></thead><tbody>' +
      data.recent_users.map((u) =>
        '<tr' + (u.quota_locked ? ' class="org-detail-row-locked"' : '') + '><td>' + escapeHtml(u.email || '-') + '</td><td>' + escapeHtml(u.full_name || '-') + '</td><td>' +
        escapeHtml(ROLE_DISPLAY[u.role] || u.role || '-') + '</td><td>' + escapeHtml(formatDateTime(u.last_login)) + '</td><td>' +
        formatDetailUserStatus(u) +
        '</td></tr>'
      ).join('') + '</tbody></table>'
    : '<p class="org-detail-empty">Chưa có tài khoản.</p>';

  const quota = data.quota || null;
  const billingStatus = (org.billing_status || quota?.billing_status || 'ACTIVE').toUpperCase();
  const graceNote = billingStatus === 'GRACE_PERIOD' && (org.grace_ends_at || quota?.grace_ends_at)
    ? ' <span class="org-detail-hint">(đến ' + formatDateTime(org.grace_ends_at || quota.grace_ends_at) + ')</span>'
    : '';
  const activeB = data.active_building_count != null ? data.active_building_count : '—';
  const activeU = data.active_user_count != null ? data.active_user_count : '—';
  const quotaBanner = formatDetailQuotaBanner(quota, org);
  const billingSnapshot = renderOrgBillingSnapshot(oid, org, quota, data.current_subscription);
  const logsHtml = (data.recent_logs || []).length
    ? '<ul class="org-detail-list org-detail-logs">' + data.recent_logs.map((l) =>
      '<li><span class="org-detail-log-time">' + formatDateTime(l.createdAt) +
      '</span> ' + escapeHtml(formatActionLabel(l.action)) +
      (l.target ? ' — <em>' + escapeHtml(l.target) + '</em>' : '') + '</li>'
    ).join('') + '</ul>'
    : '<p class="org-detail-empty">Chưa có nhật ký hoạt động.</p>';

  const body = document.getElementById('orgDetailBody');
  if (!body) return;
  body.innerHTML =
    (quotaBanner || '') +
    billingSnapshot +
    '<div class="org-detail-grid">' +
      '<div><span class="org-detail-label">Mã tổ chức</span><div class="org-detail-value org-detail-id" title="Sao chép ID">' + escapeHtml(oid) + '</div></div>' +
      '<div><span class="org-detail-label">Mã định danh</span><div class="org-detail-value">' + escapeHtml(org.slug || '-') + '</div></div>' +
      '<div><span class="org-detail-label">Gói hiện tại</span><div class="org-detail-value">' + formatOrgBillingBadge(org) + graceNote + '</div></div>' +
      '<div><span class="org-detail-label">Trạng thái tổ chức</span><div class="org-detail-value">' +
        (isActive ? '<span class="status-badge active">Hoạt động</span>' : '<span class="status-badge inactive">Tạm dừng</span>') +
      '</div></div>' +
      '<div><span class="org-detail-label">Ngày tạo</span><div class="org-detail-value">' + escapeHtml(created) + '</div></div>' +
      '<div><span class="org-detail-label">Cập nhật</span><div class="org-detail-value">' + escapeHtml(updated) + '</div></div>' +
      '<div><span class="org-detail-label">Tòa nhà</span><div class="org-detail-value">' + (data.building_count != null ? data.building_count : '—') +
        ' <span class="org-detail-hint">(đang dùng: ' + activeB +
        (quota?.buildings?.limit != null ? '/' + quota.buildings.limit : '') +
        ' · đã xuất bản: ' + publishedCount + ', bản nháp: ' + draftCount + ')</span></div></div>' +
      '<div><span class="org-detail-label">Tài khoản</span><div class="org-detail-value">' + (data.user_count != null ? data.user_count : '—') +
        ' <span class="org-detail-hint">(đang dùng QT tổ chức/tòa: ' + activeU +
        (quota?.users?.limit != null ? '/' + quota.users.limit : '') +
        ' · QT tổ chức: ' + orgAdminCount + ', QT tòa: ' + buildingAdminCount + ')</span></div></div>' +
    '</div>' +
    '<div class="org-detail-section"><h4>Quản trị viên tổ chức</h4>' + adminsHtml + '</div>' +
    '<div class="org-detail-section"><h4>Tòa nhà <span class="org-detail-hint">(mới nhất, tối đa 10)</span></h4>' + buildingsHtml + '</div>' +
    '<div class="org-detail-section"><h4>Tài khoản <span class="org-detail-hint">(mới nhất, tối đa 10)</span></h4>' + usersHtml + '</div>' +
    '<div class="org-detail-section"><h4>Nhật ký gần đây <span class="org-detail-hint">(tối đa 10)</span></h4>' + logsHtml + '</div>';

  const jumpB = document.getElementById('orgDetailJumpBuildings');
  const jumpU = document.getElementById('orgDetailJumpUsers');
  const addAdminBtn = document.getElementById('orgDetailAddAdmin');
  const openBillingBtn = document.getElementById('orgDetailOpenBilling');
  if (jumpB) jumpB.onclick = () => { closeOrgDetailModal(); jumpToBuildings(oid); };
  if (jumpU) jumpU.onclick = () => { closeOrgDetailModal(); jumpToUsers(oid); };
  if (openBillingBtn) openBillingBtn.onclick = () => openBillingTabForOrg(oid);
  if (addAdminBtn) {
    addAdminBtn.onclick = () => {
      closeOrgDetailModal();
      openCreateUserModalForOrg(oid, 'ORG_ADMIN');
    };
  }
}

function applyOrganizationFilters(resetPage) {
  if (resetPage !== false) window._organizationsPage = 1;
  const keyword = document.getElementById('filterOrgKeyword')?.value || '';
  const code = document.getElementById('filterOrgCode')?.value || '';
  const plan = document.getElementById('filterOrgPlan')?.value || '';
  const status = document.getElementById('filterOrgStatus')?.value || '';
  const sortState = getOrgTableSort();
  localStorage.setItem('organizationsFilters', JSON.stringify({
    keyword, code, plan, status,
    sortKey: sortState.key,
    sortDir: sortState.dir
  }));
  renderOrganizationsFromCache();
}

function clearOrganizationFilters() {
  ['filterOrgKeyword', 'filterOrgCode', 'filterOrgPlan', 'filterOrgStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  localStorage.removeItem('organizationsFilters');
  saveOrgTableSort('name', 'asc');
  window._organizationsPage = 1;
  renderOrganizationsFromCache();
}

function restoreOrganizationFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem('organizationsFilters') || '{}');
    if (saved.keyword != null) { const el = document.getElementById('filterOrgKeyword'); if (el) el.value = saved.keyword; }
    if (saved.code != null) { const el = document.getElementById('filterOrgCode'); if (el) el.value = saved.code; }
    if (saved.plan != null) { const el = document.getElementById('filterOrgPlan'); if (el) el.value = saved.plan; }
    if (saved.status != null) { const el = document.getElementById('filterOrgStatus'); if (el) el.value = saved.status; }
    if (saved.sortKey) saveOrgTableSort(saved.sortKey, saved.sortDir || 'asc');
    else saveOrgTableSort('name', 'asc');
  } catch (e) {}
}

function jumpToBuildings(orgId) {
  const el = document.getElementById('filterBuildingOrg');
  if (el) el.value = orgId;
  window._buildingsPage = 1;
  localStorage.setItem('buildingsFilters', JSON.stringify({
    orgId,
    keyword: document.getElementById('filterBuildingKeyword')?.value || '',
    status: document.getElementById('filterBuildingStatus')?.value || ''
  }));
  switchTab('buildings');
}

function jumpToUsers(orgId) {
  const el = document.getElementById('filterUserOrg');
  if (el) el.value = orgId;
  window._usersPage = 1;
  localStorage.setItem('usersFilters', JSON.stringify({
    orgId,
    keyword: document.getElementById('filterUserKeyword')?.value || '',
    role: document.getElementById('filterUserRole')?.value || '',
    status: document.getElementById('filterUserStatus')?.value || ''
  }));
  switchTab('users');
}

function slugifyFromName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function prefillSlug() {
  const nameEl = document.getElementById('addOrgName');
  const slugEl = document.getElementById('addOrgSlug');
  if (!nameEl || !slugEl || slugEl.dataset.manual === '1') return;
  const s = slugifyFromName(nameEl.value.trim());
  if (s) slugEl.value = s;
}

function openAddOrgModal() {
  const modal = document.getElementById('addOrgModal');
  if (!modal) { alert('Modal Thêm Tổ Chức chưa được cấu hình trong HTML.'); return; }
  ['addOrgName', 'addOrgSlug', 'addOrgAdminName', 'addOrgAdminEmail', 'addOrgAdminPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const planEl = document.getElementById('addOrgPlan');
  if (planEl) planEl.value = 'FREE';
  const slugEl = document.getElementById('addOrgSlug');
  if (slugEl) delete slugEl.dataset.manual;
  modal.style.display = 'flex';
}

function closeAddOrgModal() {
  const modal = document.getElementById('addOrgModal');
  if (modal) modal.style.display = 'none';
}

async function createOrganization() {
  const organizationName = document.getElementById('addOrgName')?.value?.trim();
  let slug = document.getElementById('addOrgSlug')?.value?.trim().toLowerCase();
  const plan = document.getElementById('addOrgPlan')?.value || 'FREE';
  const adminName = document.getElementById('addOrgAdminName')?.value?.trim();
  const adminEmail = document.getElementById('addOrgAdminEmail')?.value?.trim();
  const adminPassword = document.getElementById('addOrgAdminPassword')?.value || '';
  if (!organizationName) return alert('Vui lòng nhập tên tổ chức!');
  if (!slug) slug = slugifyFromName(organizationName);
  if (!adminName || !adminEmail || !adminPassword) return alert('Vui lòng nhập đầy đủ thông tin quản trị viên.');
  const adminNameErrors = validateFullNameClient(adminName);
  if (adminNameErrors.length) return alert(adminNameErrors.join('\n'));
  const body = { organizationName, slug, plan, adminName, adminEmail, adminPassword };
  try {
    let res = await apiFetch('/organizations/with-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.status === 404) {
      res = await apiFetch('/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      alert(d.message || 'Tạo tổ chức thành công!');
      closeAddOrgModal();
      await fetchOrganizations();
      renderOrganizationsFromCache();
    } else {
      alert('Lỗi: ' + (d.message || 'HTTP ' + res.status));
    }
  } catch (e) {
    alert('Lỗi kết nối!');
  }
}

// ============================================================
// ORG REGISTRATIONS (2.8)
let allRegistrations = [];

async function fetchRegistrations() {
  const tbody = document.getElementById('registrationsList');
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Đang tải...</td></tr>';
  try {
    const res = await apiFetch('/org-registrations');
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:red;">' + escapeHtml(d.message || 'Không tải được hồ sơ') + '</td></tr>';
      return;
    }
    allRegistrations = await res.json();
    renderRegistrationsFromCache();
  } catch (e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:red;">Lỗi kết nối</td></tr>';
  }
}

function regStatusLabel(status) {
  if (status === 'PENDING') return '<span class="status-badge" style="background:#fff3cd;color:#856404;">Chờ duyệt</span>';
  if (status === 'APPROVED') return '<span class="status-badge active">Đã duyệt</span>';
  if (status === 'REJECTED') return '<span class="status-badge inactive">Từ chối</span>';
  return escapeHtml(status || '-');
}

function regSourceLabel(source) {
  if (source === 'SELF_SERVICE') return '<span style="font-size:12px;color:#27ae60;">Trial tự động</span>';
  return '<span style="font-size:12px;color:#666;">Chờ duyệt</span>';
}

function renderRegistrationsFromCache() {
  const tbody = document.getElementById('registrationsList');
  if (!tbody) return;
  const statusFilter = document.getElementById('filterRegStatus')?.value || '';
  let list = allRegistrations.slice();
  if (statusFilter) list = list.filter(r => r.status === statusFilter);
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;">Không có hồ sơ nào.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(r => {
    const date = r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN') : '-';
    let actions = '-';
    if (r.status === 'PENDING') {
      actions = '<button type="button" class="btn-edit" onclick="approveRegistration(\'' + r._id + '\')" style="margin-right:4px;">Duyệt</button>' +
        '<button type="button" class="btn-logout" onclick="rejectRegistration(\'' + r._id + '\')" style="padding:6px 10px;background:#e74c3c;">Từ chối</button>';
    } else if (r.status === 'REJECTED' && r.reject_reason) {
      actions = '<span title="' + escapeHtml(r.reject_reason) + '" style="font-size:12px;color:#888;">' + escapeHtml(r.reject_reason) + '</span>';
    } else if (r.source === 'SELF_SERVICE' && r.status === 'APPROVED') {
      actions = '<span style="font-size:12px;color:#27ae60;">Tự kích hoạt</span>';
    }
    return '<tr>' +
      tdEllipsis(r.organization_name, '<strong>' + escapeHtml(r.organization_name) + '</strong>') +
      tdEllipsis(r.slug) +
      tdEllipsis(r.contact_name) +
      tdEllipsis(r.contact_email) +
      tdEllipsis(r.contact_phone || '-') +
      '<td>' + regSourceLabel(r.source) + '</td>' +
      '<td>' + regStatusLabel(r.status) + '</td>' +
      '<td style="font-size:12px;">' + date + '</td>' +
      '<td class="actions-cell">' + actions + '</td></tr>';
  }).join('');
}

async function approveRegistration(id) {
  if (!confirm('Duyệt hồ sơ này và tạo tổ chức + tài khoản quản trị?')) return;
  try {
    const res = await apiFetch('/org-registrations/' + id + '/approve', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      alert(d.message || 'Đã duyệt thành công!');
      await fetchRegistrations();
      await fetchOrganizations();
    } else {
      alert('Lỗi: ' + (d.message || 'HTTP ' + res.status));
    }
  } catch (e) {
    alert('Lỗi kết nối');
  }
}

async function rejectRegistration(id) {
  const reason = prompt('Nhập lý do từ chối:');
  if (reason === null) return;
  if (!reason.trim()) return alert('Vui lòng nhập lý do từ chối.');
  try {
    const res = await apiFetch('/org-registrations/' + id + '/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() })
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      alert(d.message || 'Đã từ chối hồ sơ.');
      await fetchRegistrations();
    } else {
      alert('Lỗi: ' + (d.message || 'HTTP ' + res.status));
    }
  } catch (e) {
    alert('Lỗi kết nối');
  }
}

async function openCreateUserModal() {
  await openCreateUserModalForOrg(null, null);
}

async function openCreateUserModalForOrg(orgId, defaultRole) {
  const modal = document.getElementById('createUserModal');
  if (!modal) return;

  document.getElementById('createUserEmail').value = '';
  document.getElementById('createUserFullName').value = '';
  document.getElementById('createUserPhone').value = '';
  document.getElementById('createUserPassword').value = '';
  const createSearch = document.getElementById('createUserBuildingSearch');
  if (createSearch) createSearch.value = '';

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isOrgAdmin = currentUser?.role === 'ORG_ADMIN';

  const roleGroup = document.getElementById('createUserRoleGroup');
  const orgGroup = document.getElementById('createUserOrgGroup');
  const buildingsGroup = document.getElementById('createUserBuildingsGroup');
  const roleSelect = document.getElementById('createUserRole');
  const orgSelect = document.getElementById('createUserOrganizationId');

  if (roleGroup) roleGroup.style.display = isSuperAdmin ? '' : 'none';
  if (orgGroup) orgGroup.style.display = isSuperAdmin ? '' : 'none';
  if (buildingsGroup) buildingsGroup.style.display = isOrgAdmin || isSuperAdmin ? '' : 'none';

  const applyRoleUi = () => {
    const role = roleSelect ? roleSelect.value : 'BUILDING_ADMIN';
    if (buildingsGroup) buildingsGroup.style.display = role === 'BUILDING_ADMIN' ? '' : 'none';
    if (orgGroup) orgGroup.style.display = role === 'SUPER_ADMIN' ? 'none' : '';
    const orgFilter = role === 'SUPER_ADMIN' ? null : (orgSelect?.value || orgId || null);
    refreshUserBuildingsSelect('createUserAssignedBuildings', [], orgFilter, '');
  };

  if (roleSelect) {
    roleSelect.value = defaultRole || 'BUILDING_ADMIN';
    roleSelect.onchange = applyRoleUi;
  }

  if (isSuperAdmin && allOrganizations.length === 0) {
    await fetchOrganizations();
  } else if (isSuperAdmin) {
    populateOrganizationDropdown();
  }
  if (orgSelect && isSuperAdmin) {
    orgSelect.value = orgId || '';
    orgSelect.onchange = () => applyRoleUi();
  }

  if (!allBuildings.length) await fetchBuildings();
  const orgFilter = isOrgAdmin
    ? (currentUser.organization_id || null)
    : (defaultRole === 'ORG_ADMIN' || defaultRole === 'BUILDING_ADMIN' ? (orgId || orgSelect?.value || null) : null);
  if (defaultRole) {
    if (roleSelect) roleSelect.value = defaultRole;
    applyRoleUi();
  } else {
    refreshUserBuildingsSelect('createUserAssignedBuildings', [], orgFilter, '');
  }

  modal.style.display = 'flex';
}

function closeCreateUserModal() {
  const modal = document.getElementById('createUserModal');
  if (modal) modal.style.display = 'none';
}

function clearCreateUserBuildingsSelection() {
  const sel = document.getElementById('createUserAssignedBuildings');
  if (!sel) return;
  Array.from(sel.options).forEach(opt => { opt.selected = false; });
}

const _buildingSelectState = {};

function getBuildingsForUserSelect(orgIdFilter) {
  let list = (allBuildings || []).slice();
  if (orgIdFilter) {
    list = list.filter((b) => String(b.organization_id) === String(orgIdFilter));
  } else if (currentUser?.role === 'ORG_ADMIN' && currentUser.organization_id) {
    list = list.filter((b) => String(b.organization_id) === String(currentUser.organization_id));
  }
  return list;
}

function refreshUserBuildingsSelect(selectId, selectedIds, orgIdFilter, keyword) {
  _buildingSelectState[selectId] = { orgIdFilter: orgIdFilter || null, keyword: keyword || '' };
  populateUserBuildingsSelect(selectId, selectedIds, { orgIdFilter, keyword });
}

function filterUserBuildingsSelect(selectId, keyword) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const selectedIds = Array.from(sel.selectedOptions).map((o) => o.value);
  const state = _buildingSelectState[selectId] || {};
  populateUserBuildingsSelect(selectId, selectedIds, {
    orgIdFilter: state.orgIdFilter,
    keyword
  });
}

function populateUserBuildingsSelect(selectId, selectedIds, opts) {
  const options = opts || {};
  const orgIdFilter = options.orgIdFilter || null;
  const keyword = (options.keyword || '').trim().toLowerCase();
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const ids = (selectedIds || []).map((id) => String(id));
  const pool = getBuildingsForUserSelect(orgIdFilter);

  let list = pool.slice();
  if (keyword) {
    list = list.filter((b) =>
      (b.name || '').toLowerCase().includes(keyword) ||
      (b.address || '').toLowerCase().includes(keyword)
    );
  }

  const visibleIds = new Set(list.map((b) => String(b._id)));
  const pinned = (allBuildings || []).filter((b) => ids.includes(String(b._id)) && !visibleIds.has(String(b._id)));
  list = [...pinned, ...list];

  const countEl = document.getElementById(
    selectId === 'createUserAssignedBuildings' ? 'createUserBuildingCount' : 'updateUserBuildingCount'
  );
  if (countEl) {
    countEl.textContent = list.length + ' / ' + pool.length + ' tòa hiển thị';
  }

  if (!list.length) {
    sel.innerHTML = '<option value="" disabled>' + (pool.length ? 'Không khớp tìm kiếm' : 'Chưa có tòa nhà trong tổ chức') + '</option>';
    sel.disabled = true;
    return;
  }

  sel.disabled = false;
  sel.innerHTML = list.map((b) =>
    '<option value="' + b._id + '">' + escapeHtml(b.name) + ' (' + escapeHtml(b.address || '-') + ')</option>'
  ).join('');
  Array.from(sel.options).forEach((opt) => {
    if (ids.includes(String(opt.value))) opt.selected = true;
  });
}

async function saveNewUser() {
  const email = document.getElementById('createUserEmail').value.trim();
  const full_name = document.getElementById('createUserFullName').value.trim();
  const phone = document.getElementById('createUserPhone').value.trim();
  const password = document.getElementById('createUserPassword').value;
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  if (!email) return alert('Vui lòng nhập email.');
  if (!full_name) return alert('Họ tên không được để trống.');
  const nameErrors = validateFullNameClient(full_name);
  if (nameErrors.length) return alert(nameErrors.join('\n'));
  if (isSuperAdmin) {
    if (!password || password.length < 8) return alert('Mật khẩu phải có ít nhất 8 ký tự.');
  } else {
    const pwdErrors = validatePasswordStrengthClient(password);
    if (pwdErrors.length) return alert(pwdErrors.join('\n'));
  }
  if (phone && !/^[0-9\+\-\s]+$/.test(phone)) {
    return alert('Số điện thoại chỉ được chứa số, dấu +, - và khoảng trắng.');
  }

  if (!allBuildings || allBuildings.length === 0) {
    await fetchBuildings();
  }

  const payload = { email, full_name, phone, password, role: 'BUILDING_ADMIN' };

  if (isSuperAdmin) {
    const role = document.getElementById('createUserRole').value;
    payload.role = role;
    if (role !== 'SUPER_ADMIN') {
      const orgId = document.getElementById('createUserOrganizationId').value.trim();
      if (!orgId) return alert('Vui lòng chọn organization.');
      payload.organization_id = orgId;
    }
    if (role === 'BUILDING_ADMIN') {
      payload.assigned_buildings = Array.from(
        document.getElementById('createUserAssignedBuildings').selectedOptions
      ).map(o => o.value);
    }
  } else {
    payload.assigned_buildings = Array.from(
      document.getElementById('createUserAssignedBuildings').selectedOptions
    ).map(o => o.value);
  }

  try {
    const res = await apiFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      alert('Tạo tài khoản thành công!');
      closeCreateUserModal();
      fetchUsers();
    } else {
      alert('Lỗi: ' + (data.message || 'Tạo tài khoản thất bại.'));
    }
  } catch (e) {
    alert('Lỗi kết nối: ' + (e.message || e));
  }
}

document.getElementById('btnSaveNewUser')?.addEventListener('click', saveNewUser);


function openEditor(id) { window.location.href = '/editor/index.html?buildingId=' + id; }

function openAddBuildingModal() {
  // Nếu là Super Admin và chưa load organizations, load ngay
  if (currentUser?.role === 'SUPER_ADMIN' && allOrganizations.length === 0) {
    fetchOrganizations();
  }
  if (currentUser?.role === 'ORG_ADMIN' && currentUser.organization_id) {
    const orgSelect = document.getElementById('addBuildingOrganizationId');
    if (orgSelect) {
      orgSelect.value = currentUser.organization_id;
      orgSelect.disabled = true;
    }
  } else {
    const orgSelect = document.getElementById('addBuildingOrganizationId');
    if (orgSelect) orgSelect.disabled = false;
  }
  document.getElementById('addBuildingModal').style.display = 'flex';
}
function closeAddBuildingModal() { document.getElementById('addBuildingModal').style.display = 'none'; }

async function saveNewBuilding() {
  const name = document.getElementById('addBuildingName').value.trim();
  const address = document.getElementById('addBuildingAddress').value.trim();
  const desc = document.getElementById('addBuildingDesc').value.trim();
  const floors = parseInt(document.getElementById('addBuildingFloors').value) || 1;
  const lat = parseFloat(document.getElementById('addBuildingLat').value) || 0;
  const lng = parseFloat(document.getElementById('addBuildingLng').value) || 0;
  let orgId = document.getElementById('addBuildingOrganizationId').value.trim();
  if (!orgId && currentUser?.role === 'ORG_ADMIN') orgId = currentUser.organization_id || '';
  if (!name) return alert('Vui lòng nhập tên tòa nhà!');
  if (!orgId) return alert('Vui lòng chọn organization!');
  try {
    const res = await apiFetch('/buildings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, address, description: desc, total_floors: floors, lat, lng, organization_id: orgId })
    });
    if (res.ok) { alert('Đã thêm tòa nhà mới!'); closeAddBuildingModal(); fetchBuildings(); }
    else { const d = await res.json(); alert('Lỗi: ' + d.message); }
  } catch (e) { alert('Lỗi kết nối!'); }
}

document.getElementById('btnSaveNewBuilding').onclick = saveNewBuilding;

function openEditBuildingModal(id) {
  if (!canManageBuildingMeta()) {
    alert('Bạn không có quyền sửa thông tin tòa nhà. Chỉ được mở Map Editor để vẽ bản đồ.');
    return;
  }
  const b = allBuildings.find(x => x._id === id);
  if (!b) return;

  // Nếu là Super Admin và chưa load organizations, load ngay
  if (currentUser?.role === 'SUPER_ADMIN' && allOrganizations.length === 0) {
    fetchOrganizations();
  }

  document.getElementById('editBuildingId').value = id;
  document.getElementById('editBuildingName').value = b.name || '';
  document.getElementById('editBuildingAddress').value = b.address || '';
  document.getElementById('editBuildingDesc').value = b.description || '';
  syncEditBuildingFloorsUI(b.total_floors || 1);
  document.getElementById('editBuildingLat').value = b.gps_location ? b.gps_location.lat : 0;
  document.getElementById('editBuildingLng').value = b.gps_location ? b.gps_location.lng : 0;
  document.getElementById('editBuildingStatus').value = b.status || 'DRAFT';
  document.getElementById('editBuildingOrganizationId').value = b.organization_id || '';
  const floorMsg = document.getElementById('editBuildingFloorMsg');
  if (floorMsg) {
    floorMsg.style.display = 'none';
    floorMsg.textContent = '';
  }
  document.getElementById('editBuildingModal').style.display = 'flex';
}

function syncEditBuildingFloorsUI(n) {
  const count = Math.max(1, parseInt(n, 10) || 1);
  const hidden = document.getElementById('editBuildingFloors');
  const label = document.getElementById('editBuildingFloorsLabel');
  const hint = document.getElementById('editBuildingFloorHint');
  if (hidden) hidden.value = String(count);
  if (label) label.textContent = String(count);
  if (hint) {
    const range = count === 1
      ? 'Tầng hợp lệ: 0 (trệt)'
      : ('Tầng hợp lệ: 0 .. ' + (count - 1) + ' (0 = trệt)');
    hint.textContent = range + '. Chỉ bớt được tầng cao nhất khi chưa có bản đồ.';
  }
}

async function patchBuildingFloor(action) {
  if (!canManageBuildingMeta()) {
    alert('Bạn không có quyền sửa số tầng.');
    return;
  }
  const id = document.getElementById('editBuildingId').value;
  if (!id) return;
  const floorMsg = document.getElementById('editBuildingFloorMsg');
  if (floorMsg) {
    floorMsg.style.display = 'none';
    floorMsg.textContent = '';
  }
  const confirmMsg = action === 'add'
    ? 'Thêm 1 tầng ở đuôi (chưa tạo bản đồ)?'
    : 'Bớt tầng cao nhất? Chỉ thành công nếu tầng đó chưa có bản đồ.';
  if (!confirm(confirmMsg)) return;
  try {
    const res = await apiFetch('/buildings/' + id + '/floors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action })
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      const n = d.total_floors != null ? d.total_floors : (d.building && d.building.total_floors);
      syncEditBuildingFloorsUI(n);
      // Cập nhật cache danh sách để mở lại modal đúng
      const cached = allBuildings.find(x => x._id === id);
      if (cached) cached.total_floors = n;
      alert(d.message || 'Đã cập nhật số tầng.');
      fetchBuildings();
    } else {
      const msg = d.message || ('HTTP ' + res.status);
      if (floorMsg) {
        floorMsg.textContent = msg;
        floorMsg.style.display = 'block';
      }
      alert(msg);
    }
  } catch (e) {
    alert('Lỗi kết nối!');
  }
}

function closeEditBuildingModal() { document.getElementById('editBuildingModal').style.display = 'none'; }

async function saveEditBuilding() {
  const id = document.getElementById('editBuildingId').value;
  const name = document.getElementById('editBuildingName').value.trim();
  const address = document.getElementById('editBuildingAddress').value.trim();
  const desc = document.getElementById('editBuildingDesc').value.trim();
  // Số tầng đổi qua PATCH /floors — không gửi total_floors ở PUT để tránh nhảy số tự do
  const lat = parseFloat(document.getElementById('editBuildingLat').value) || 0;
  const lng = parseFloat(document.getElementById('editBuildingLng').value) || 0;
  const status = document.getElementById('editBuildingStatus').value;
  const orgId = document.getElementById('editBuildingOrganizationId')?.value?.trim() || '';
  try {
    const payload = { name, address, description: desc, lat, lng, status };
    // Chỉ Super Admin được gửi organization_id
    if (currentUser?.role === 'SUPER_ADMIN' && orgId) {
      payload.organization_id = orgId;
    }
    const res = await apiFetch('/buildings/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) { alert('Đã cập nhật tòa nhà!'); closeEditBuildingModal(); fetchBuildings(); }
    else { const d = await res.json(); alert('Lỗi: ' + d.message); }
  } catch (e) { alert('Lỗi kết nối!'); }
}

async function deleteBuilding(id) {
  if (!canDeleteBuilding()) {
    alert('Bạn không có quyền xóa tòa nhà. Chỉ Org Admin hoặc Super Admin mới được xóa.');
    return;
  }
  if (!confirm('Vô hiệu hóa tòa nhà này? Tòa sẽ ẩn khỏi app và dashboard (có thể khôi phục sau).')) return;
  try {
    const res = await apiFetch('/buildings/' + id, { method: 'DELETE' });
    if (res.ok) {
      const inactiveEl = document.getElementById('filterBuildingIncludeInactive');
      if (inactiveEl) inactiveEl.checked = true;
      alert('Đã vô hiệu hóa tòa nhà!\n\nDanh sách sẽ hiện cả tòa đã vô hiệu — bấm「Khôi phục」nếu cần bật lại.');
      fetchBuildings();
      fetchPlatformStats();
    }
    else {
      const d = await res.json().catch(() => ({}));
      alert('Lỗi khi vô hiệu hóa: ' + (d.message || ('HTTP ' + res.status)));
    }
  } catch (e) { alert('Lỗi kết nối!'); }
}

async function restoreBuilding(id) {
  if (!canDeleteBuilding()) {
    alert('Bạn không có quyền khôi phục tòa nhà.');
    return;
  }
  if (!confirm('Khôi phục tòa nhà này? Tòa sẽ hiển thị lại trên dashboard và app (nếu đã publish).')) return;
  try {
    const res = await apiFetch('/buildings/' + id + '/restore', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      alert(d.message || 'Đã khôi phục tòa nhà!');
      fetchBuildings();
      fetchPlatformStats();
    } else {
      alert('Lỗi: ' + (d.message || ('HTTP ' + res.status)));
    }
  } catch (e) { alert('Lỗi kết nối!'); }
}

// ============================================================
// MAP VERSIONS
window._mapVersionContext = { buildingId: null, buildingName: '', totalFloors: 1 };

function openMapVersionModal(buildingId, totalFloors) {
  const b = allBuildings.find(function (x) { return x._id === buildingId; });
  const buildingName = b ? (b.name || buildingId) : buildingId;
  window._mapVersionContext = {
    buildingId: buildingId,
    buildingName: buildingName,
    totalFloors: Math.max(parseInt(totalFloors, 10) || 1, 1)
  };
  document.getElementById('mapVersionTitle').textContent = 'Tòa nhà: ' + (buildingName || buildingId);
  const floorSelect = document.getElementById('mapVersionFloorSelect');
  if (floorSelect) {
    const count = window._mapVersionContext.totalFloors;
    let opts = '';
    for (let i = 0; i < count; i++) {
      const label = i === 0 ? 'Tầng trệt (0)' : ('Tầng ' + i);
      opts += '<option value="' + i + '">' + label + '</option>';
    }
    floorSelect.innerHTML = opts;
    floorSelect.value = '0';
  }
  document.getElementById('mapVersionModal').style.display = 'flex';
  loadMapVersions();
}

function closeMapVersionModal() { document.getElementById('mapVersionModal').style.display = 'none'; }

function onMapVersionFloorChange() {
  loadMapVersions();
}

async function loadMapVersions() {
  const ctx = window._mapVersionContext || {};
  const buildingId = ctx.buildingId;
  const floor = document.getElementById('mapVersionFloorSelect')?.value || '0';
  const tbody = document.getElementById('mapVersionsList');
  if (!buildingId || !tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Đang tải...</td></tr>';
  try {
    const res = await apiFetch('/map-versions/' + buildingId + '/' + floor);
    const payload = await res.json();
    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">' + escapeHtml(payload.message || 'Không tải được phiên bản.') + '</td></tr>';
      return;
    }
    const currentVersion = payload.current_version;
    const retention = payload.retention || {};
    const retentionEl = document.getElementById('mapVersionRetentionNote');
    if (retentionEl) {
      const max = retention.max_per_floor != null ? retention.max_per_floor : '—';
      const stored = retention.stored_count != null ? retention.stored_count : (payload.versions || []).length;
      retentionEl.textContent = 'Chính sách lưu: giữ tối đa ' + max + ' phiên bản / tầng · đang lưu ' + stored + ' bản.';
    }
    const data = Array.isArray(payload) ? payload : (payload.versions || []);
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">Chưa có phiên bản nào được publish cho tầng này.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(function (v) {
      const isCurrent = currentVersion != null && v.version === currentVersion;
      const snapHint = v.has_full_snapshot
        ? '<span style="color:#27ae60;font-size:10px;"> snapshot đủ</span>'
        : '<span style="color:#e67e22;font-size:10px;" title="Chỉ khôi phục nodes/edges"> snapshot một phần</span>';
      const rollbackBtn = isCurrent
        ? '<span style="color:#888;font-size:12px;">Đang dùng</span>'
        : (v.has_full_snapshot
          ? '<button type="button" class="btn-edit" style="background:#e67e22;color:#fff;font-size:12px;padding:4px 8px;" onclick="rollbackMapVersion(' + v.version + ',true)">Khôi phục</button>'
          : '<button type="button" class="btn-edit" style="background:#95a5a6;color:#fff;font-size:12px;padding:4px 8px;" disabled title="Bản cũ không có snapshot phòng/cửa">Không khôi phục được</button>');
      return '<tr>' +
        '<td style="text-align:center;"><strong>v' + v.version + '</strong>' + snapHint + (isCurrent ? ' <span style="color:#27ae60;font-size:11px;">(hiện tại)</span>' : '') + '</td>' +
        '<td style="text-align:center;">' + (v.rooms_count || 0) + '</td>' +
        '<td style="text-align:center;">' + (v.nodes_count || 0) + '</td>' +
        '<td style="text-align:center;">' + (v.edges_count || 0) + '</td>' +
        '<td>' + (v.published_by ? escapeHtml(v.published_by.email) : '-') + '</td>' +
        '<td>' + (v.published_at ? new Date(v.published_at).toLocaleString('vi-VN') : '-') + '</td>' +
        '<td style="text-align:center;">' + rollbackBtn + '</td>' +
      '</tr>';
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">Lỗi tải dữ liệu.</td></tr>';
  }
}

async function rollbackMapVersion(version, hasFullSnapshot) {
  const ctx = window._mapVersionContext || {};
  const buildingId = ctx.buildingId;
  const floor = document.getElementById('mapVersionFloorSelect')?.value || '0';
  if (!buildingId) return;

  if (hasFullSnapshot === false || hasFullSnapshot === 'false') {
    alert('Phiên bản v' + version + ' publish trước khi có snapshot đầy đủ.\n\nKhông thể khôi phục phòng/cửa từ bản này. Hãy chọn phiên bản có nhãn "snapshot đủ" (thường từ v2 trở đi).');
    return;
  }
  let confirmMsg = 'Khôi phục bản đồ tầng ' + floor + ' về nội dung phiên bản v' + version + '?\n\n';
  confirmMsg += '• Server sẽ tạo phiên bản MỚI (vd. v7) — không thay thế số phiên bản hiện tại.\n';
  confirmMsg += '• Mở Editor và Ctrl+F5 sau khi xong để xem map.\n';
  if (!confirm(confirmMsg)) return;

  const statusEl = document.getElementById('mapVersionStatus');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.style.background = '#eef6ff';
    statusEl.style.color = '#1d4ed8';
    statusEl.textContent = 'Đang khôi phục phiên bản v' + version + '...';
  }

  try {
    const res = await apiFetch('/map-versions/' + buildingId + '/' + floor + '/' + version + '/rollback', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const newVer = data.map && data.map.version != null ? data.map.version : (data.new_version || '?');
      let msg = (data.message || 'Đã khôi phục thành công!') +
        '\n\nPhiên bản hiện tại trên server: v' + newVer + '.';
      if (data.rollback_mode === 'graph_only') {
        msg += '\n\n⚠️ Chỉ khôi phục nodes/edges (bản cũ không có snapshot phòng/cửa).';
      }
      msg += '\n\nBước tiếp: Dashboard → Vẽ bản đồ → Ctrl+F5.';
      if (statusEl) {
        statusEl.style.background = '#ecfdf5';
        statusEl.style.color = '#047857';
        statusEl.textContent = 'Đã khôi phục từ v' + version + ' → v' + newVer + (data.rollback_mode === 'graph_only' ? ' (chỉ nodes/edges)' : '') + '. Mở Editor + Ctrl+F5.';
      }
      alert(msg);
      loadMapVersions();
    } else {
      if (statusEl) {
        statusEl.style.background = '#fef2f2';
        statusEl.style.color = '#b91c1c';
        statusEl.textContent = 'Lỗi: ' + (data.message || ('HTTP ' + res.status));
      }
      alert('Lỗi: ' + (data.message || ('HTTP ' + res.status)));
    }
  } catch (e) {
    if (statusEl) {
      statusEl.style.background = '#fef2f2';
      statusEl.style.color = '#b91c1c';
      statusEl.textContent = 'Lỗi kết nối khi rollback.';
    }
    alert('Lỗi kết nối khi rollback!');
  }
}

window.rollbackMapVersion = rollbackMapVersion;
window.openMapVersionModal = openMapVersionModal;
window.closeMapVersionModal = closeMapVersionModal;
window.onMapVersionFloorChange = onMapVersionFloorChange;
window.toggleOrgTableSort = toggleOrgTableSort;
window.applyOrgSortFromBar = applyOrgSortFromBar;
window.toggleBuildingTableSort = toggleBuildingTableSort;
window.applyBuildingSortFromBar = applyBuildingSortFromBar;
window.toggleUserTableSort = toggleUserTableSort;
window.applyUserSortFromBar = applyUserSortFromBar;
window.restoreBuilding = restoreBuilding;
window.platformJumpBuildings = platformJumpBuildings;
window.platformJumpBuildingsInactive = platformJumpBuildingsInactive;
window.platformJumpOrganizations = platformJumpOrganizations;
window.platformJumpOrgPlan = platformJumpOrgPlan;
window.platformJumpUsers = platformJumpUsers;
window.platformJumpRegistrationsPending = platformJumpRegistrationsPending;

async function fetchUsers() {
  if (currentUser?.role === 'SUPER_ADMIN' && allOrganizations.length === 0) {
    await fetchOrganizations();
  } else if (currentUser?.role === 'ORG_ADMIN') {
    seedOrgCacheFromUser(currentUser);
  }
  const tbody = document.getElementById('usersList');
  const keyword = (document.getElementById('filterUserKeyword')?.value || '').trim();
  const role = document.getElementById('filterUserRole')?.value || '';
  const status = document.getElementById('filterUserStatus')?.value || '';
  const orgId = document.getElementById('filterUserOrg')?.value || '';
  const params = new URLSearchParams();
  if (keyword) params.set('search', keyword);
  if (role) params.set('role', role);
  if (status === 'active') params.set('is_active', 'true');
  else if (status === 'inactive') params.set('is_active', 'false');
  const qs = params.toString();
  const url = '/users' + (qs ? '?' + qs : '');
  try {
    const res = await apiFetch(url);
    if (!res.ok) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:red;">Không tải được danh sách user (HTTP ' + res.status + '). Vui lòng tải lại trang.</td></tr>';
      return;
    }
    const data = await res.json();
    let users = Array.isArray(data) ? data : (data.users || data.data || []);
    if (orgId) users = users.filter(u => String(u.organization_id) === orgId);
    allUsers = users;
    localStorage.setItem('usersFilters', JSON.stringify({
      orgId,
      keyword,
      role,
      status,
      sortKey: getUserTableSort().key,
      sortDir: getUserTableSort().dir
    }));
    renderUsersFromCache();
  } catch (err) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:red;">Lỗi khi tải danh sách user: ' + (err.message || err) + '</td></tr>';
    console.error('Fetch users error:', err);
  }
}

function applyUserFilters() {
  window._usersPage = 1;
  fetchUsers();
}

function clearUserFilters() {
  ['filterUserOrg', 'filterUserKeyword', 'filterUserRole', 'filterUserStatus'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  localStorage.removeItem('usersFilters');
  saveUserTableSort('email', 'asc');
  window._usersPage = 1;
  fetchUsers();
}

function restoreUserFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem('usersFilters') || '{}');
    if (saved.orgId != null) { const el = document.getElementById('filterUserOrg'); if (el) el.value = saved.orgId; }
    if (saved.keyword != null) { const el = document.getElementById('filterUserKeyword'); if (el) el.value = saved.keyword; }
    if (saved.role != null) { const el = document.getElementById('filterUserRole'); if (el) el.value = saved.role; }
    if (saved.status != null) { const el = document.getElementById('filterUserStatus'); if (el) el.value = saved.status; }
    if (saved.sortKey) saveUserTableSort(saved.sortKey, saved.sortDir || 'asc');
    else saveUserTableSort('email', 'asc');
  } catch (e) {}
}

function getUserTableSort() {
  if (!window._userTableSort) window._userTableSort = { key: 'email', dir: 'asc' };
  return window._userTableSort;
}

function saveUserTableSort(key, dir) {
  window._userTableSort = { key: key || 'email', dir: dir === 'desc' ? 'desc' : 'asc' };
  try {
    const saved = JSON.parse(localStorage.getItem('usersFilters') || '{}');
    saved.sortKey = window._userTableSort.key;
    saved.sortDir = window._userTableSort.dir;
    localStorage.setItem('usersFilters', JSON.stringify(saved));
  } catch (e) {}
}

function sortUserList(list, key, dir) {
  const orgLabel = (id) => getOrgName(id);
  if (window.DashboardTableSort && typeof window.DashboardTableSort.sortUsers === 'function') {
    return window.DashboardTableSort.sortUsers(list, key, dir, orgLabel);
  }
  const mul = dir === 'desc' ? -1 : 1;
  return list.slice().sort((a, b) =>
    String(a.email || '').localeCompare(String(b.email || ''), 'vi', { sensitivity: 'base' }) * mul
  );
}

function syncUserSortBarFromState() {
  const cur = getUserTableSort();
  const keyEl = document.getElementById('filterUserSortKey');
  const dirEl = document.getElementById('filterUserSortDir');
  if (keyEl && keyEl.value !== cur.key) keyEl.value = cur.key;
  if (dirEl && dirEl.value !== cur.dir) dirEl.value = cur.dir;
}

function applyUserSortFromBar() {
  const key = document.getElementById('filterUserSortKey')?.value || 'email';
  const dir = document.getElementById('filterUserSortDir')?.value || 'asc';
  saveUserTableSort(key, dir);
  window._usersPage = 1;
  renderUsersFromCache();
}

function toggleUserTableSort(key) {
  const cur = getUserTableSort();
  if (cur.key === key) saveUserTableSort(key, cur.dir === 'asc' ? 'desc' : 'asc');
  else saveUserTableSort(key, 'asc');
  window._usersPage = 1;
  renderUsersFromCache();
}

function initUserTableSort() {
  initDashTableSort('usersTableHead', toggleUserTableSort);
}

let allUsers = [];

function renderUsersFromCache() {
  const sortState = getUserTableSort();
  const sorted = sortUserList(allUsers.slice(), sortState.key, sortState.dir);
  updateDashSortIndicators('usersTable', getUserTableSort);
  syncUserSortBarFromState();
  const page = window._usersPage || 1;
  const start = (page - 1) * PAGE_SIZE;
  const slice = sorted.slice(start, start + PAGE_SIZE);
  renderUsers(slice);
  renderPagination('users', sorted.length, page);
}


function formatAssignedBuildings(buildings) {
  if (!buildings || !buildings.length) return 'Chưa gán';
  if (typeof buildings === 'string') {
    // Có thể là id tòa nhà trần
    const b = allBuildings.find(x => x._id === buildings);
    return b ? b.name || b.address || b._id : buildings.slice(0, 6);
  }
  // Object: building object
  if (Array.isArray(buildings)) {
    return buildings.map(b => {
      if (typeof b === 'string') return b;
      if (b.name) return b.name;
      if (b.title) return b.title;
      if (b.building_name) return b.building_name;
      return b._id || b.id || String(b).slice(0, 6);
    }).join(', ');
  }
  // single object
  if (buildings.name) return buildings.name;
  if (buildings.title) return buildings.title;
  if (buildings.building_name) return buildings.building_name;
  if (buildings._id) return buildings._id;
  if (buildings.id) return buildings.id;
  return String(buildings).slice(0, 6);
}

function renderUsers(users) {
  const tbody = document.getElementById('usersList');
  if (!tbody) return;
  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#888;">Không có tài khoản.</td></tr>';
    return;
  }
  const ROLE_DISPLAY = {
    SUPER_ADMIN: 'Super Admin',
    ORG_ADMIN: 'Quản trị tổ chức',
    BUILDING_ADMIN: 'Quản trị tòa nhà'
  };
  tbody.innerHTML = users.map(u => {
    const createdAtStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '-';
    const isSuperAdmin = u.role === 'SUPER_ADMIN';
    const isSelf = u._id === localStorage.getItem('userId');
    const isAdminSelf = isSuperAdmin && isSelf;
    let actionBtn = '';
    if (isAdminSelf) {
      actionBtn = '<span class="badge badge-inactive" style="cursor:default;">Tự bảo vệ</span>';
    } else {
      const isActive = u.is_active;
      const btnClass = isActive ? 'btn-logout' : 'btn-create';
      const btnText = isActive ? 'Khóa' : 'Duyệt';
      actionBtn = '<button class="' + btnClass + '" onclick="toggleUserActive(\'' + u._id + '\', ' + isActive + ')" style="padding:6px 12px;">' + btnText + '</button>';
    }
    let editBtn = '';
    let pwdBtn = '';
    const canResetPwd = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ORG_ADMIN';
    if (!isAdminSelf) {
      editBtn = '<button class="btn-edit" onclick="openUpdateUserModal(\'' + u._id + '\')" style="font-size:13px;padding:6px 10px;">Sửa</button>';
      if (canResetPwd && !isSuperAdmin) {
        pwdBtn = '<button class="btn-edit" onclick="promptResetUserPassword(\'' + u._id + '\')" style="font-size:12px;padding:6px 8px;background:#8e44ad;color:#fff;">Cấp MK</button>';
      }
    }
    const roleClass = isSuperAdmin ? 'role-badge super-admin' : (u.role === 'ORG_ADMIN' ? 'role-badge org-admin' : 'role-badge building-admin');
    let statusClass;
    let statusText;
    if (u.quota_locked) {
      statusClass = 'status-badge inactive badge-quota-locked';
      statusText = 'Khóa quota';
    } else {
      statusClass = u.is_active ? 'status-badge active' : 'status-badge inactive';
      statusText = u.is_active ? 'Hoạt động' : 'Bị khóa';
    }
    if (u.quota_locked && !isAdminSelf) {
      actionBtn = '<span style="color:#c0392b;font-size:12px;">🔒 Vượt hạn mức gói</span>';
      editBtn = '';
      pwdBtn = '';
    }
    const roleText = ROLE_DISPLAY[u.role] || u.role || '-';
    const orgText = u.role === 'SUPER_ADMIN' ? '—' : getOrgName(u.organization_id);
    return '<tr>' +
      tdEllipsis(u.email || '-') +
      tdEllipsis(u.full_name || '-') +
      '<td>' + escapeHtml(u.phone || '-') + '</td>' +
      '<td><span class="' + roleClass + '" style="font-size:12px;">' + escapeHtml(roleText) + '</span></td>' +
      '<td><span class="' + statusClass + '">' + statusText + '</span></td>' +
      tdEllipsis(orgText) +
      tdEllipsis(formatAssignedBuildings(u.assigned_buildings)) +
      '<td>' + createdAtStr + '</td>' +
      '<td class="actions-cell"><div class="user-actions">' + actionBtn + pwdBtn + editBtn + '</div></td></tr>';
  }).join('');
}

async function toggleUserActive(userId, currentActive) {
  if (!confirm('Xác nhận thay đổi trạng thái tài khoản?')) return;
  try {
    const res = await apiFetch('/users/' + userId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentActive })
    });
    if (res.ok) { alert('Cập nhật trạng thái thành công!'); fetchUsers(); }
    else {
      const d = await res.json(); alert('Lỗi: ' + (d.message || 'Cập nhật thất bại.'));
    }
  } catch (err) {
    alert('Lỗi: ' + (err.message || err));
  }
}

async function openUpdateUserModal(userId) {
  try {
    const res = await apiFetch('/users/' + userId);
    if (!res.ok) { alert('Không thể tải chi tiết user!'); return; }
    const user = await res.json();

    // Ensure buildings list is loaded
    if (!allBuildings || allBuildings.length === 0) {
      await fetchBuildings();
    }

    document.getElementById('updateUserId').value = user._id;
    document.getElementById('updateUserEmail').value = user.email;
    document.getElementById('updateUserFullName').value = user.full_name || '';
    document.getElementById('updateUserPhone').value = user.phone || '';

    const roleSelect = document.getElementById('updateUserRole');
    const roleGroup = document.getElementById('updateUserRoleGroup');
    if (roleSelect) {
      roleSelect.value = user.role;
      if (currentUser?.role === 'ORG_ADMIN') {
        if (roleGroup) roleGroup.style.display = 'none';
        roleSelect.value = 'BUILDING_ADMIN';
      } else if (roleGroup) {
        roleGroup.style.display = '';
      }
    }

    const assignedIds = (user.assigned_buildings || []).map(b =>
      typeof b === 'string' ? b : (b._id || b.id)
    );
    const orgFilter = user.role === 'SUPER_ADMIN' ? null : (user.organization_id || null);
    const searchEl = document.getElementById('updateUserBuildingSearch');
    if (searchEl) searchEl.value = '';
    refreshUserBuildingsSelect('updateUserAssignedBuildings', assignedIds, orgFilter, '');

    const pwdGroup = document.getElementById('updateUserPasswordGroup');
    const canResetPwd = (currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ORG_ADMIN')
      && user.role !== 'SUPER_ADMIN'
      && String(user._id) !== String(localStorage.getItem('userId'));
    if (pwdGroup) pwdGroup.style.display = canResetPwd ? '' : 'none';

    // Gán sự kiện click cho nút Lưu (nếu Chưa gán)
    const saveBtn = document.getElementById('btnUpdateUser');
    if (saveBtn) {
      saveBtn.onclick = updateUserProfile;
    }
    document.getElementById('modalUpdateUser').style.display = 'flex';
  } catch (e) {
    alert('Lỗi: ' + (e.message || e));
  }
}

function closeUpdateUserModal() { document.getElementById('modalUpdateUser').style.display = 'none'; }

function clearAssignedBuildingsSelection() {
  const sel = document.getElementById('updateUserAssignedBuildings');
  if (!sel) return;
  Array.from(sel.options).forEach(opt => { opt.selected = false; });
}

async function updateUserProfile() {
  const userId = document.getElementById('updateUserId').value;
  let full_name = document.getElementById('updateUserFullName').value.trim();
  let phone = document.getElementById('updateUserPhone').value.trim();
  const roleSelect = document.getElementById('updateUserRole');
  const role = currentUser?.role === 'ORG_ADMIN' ? 'BUILDING_ADMIN' : roleSelect.value;
  const assigned_buildings = Array.from(document.getElementById('updateUserAssignedBuildings').selectedOptions).map(o => o.value);

  console.log('[DEBUG] Updating user:', { userId, full_name, phone, role, assigned_buildings });

  if (!full_name) {
    alert('Họ tên không được để trống.');
    return;
  }
  const nameErrors = validateFullNameClient(full_name);
  if (nameErrors.length) {
    alert(nameErrors.join('\n'));
    return;
  }

  // Validation số điện thoại: chỉ cho phép số, dấu +, -, khoảng trắng
  if (phone && !/^[0-9\+\-\s]+$/.test(phone)) {
    alert('Số điện thoại chỉ được chứa số, dấu +, - và khoảng trắng.');
    return;
  }

  try {
    const payload = { full_name, phone, role, assigned_buildings };
    console.log('[DEBUG] Payload:', payload);
    const res = await apiFetch('/users/' + userId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log('[DEBUG] Response status:', res.status, 'data:', data);
    if (res.ok) {
      alert('Cập nhật tài khoản thành công!');
      closeUpdateUserModal();
      fetchUsers();
    } else {
      alert('Lỗi: ' + (data.message || 'Cập nhật thất bại.'));
    }
  } catch (err) {
    console.error('[DEBUG] Update exception:', err);
    alert('Lỗi kết nối: ' + (err.message || err));
  }
}

// ============================================================
// LOGS — hiển thị tiếng Việt
// ============================================================

const ACTION_LABELS = {
  LOGIN: 'Đăng nhập',
  LOGOUT: 'Đăng xuất',
  REGISTER: 'Đăng ký công khai',
  UPDATE_PROFILE: 'Cập nhật hồ sơ',
  CHANGE_PASSWORD: 'Đổi mật khẩu',
  PASSWORD_RESET_REQUEST: 'Yêu cầu quên mật khẩu',
  PASSWORD_RESET_COMPLETE: 'Đặt lại mật khẩu',
  LOGOUT_ALL: 'Đăng xuất mọi thiết bị',
  PUBLISH_MAP: 'Xuất bản bản đồ',
  LOAD_MAP: 'Tải bản đồ',
  ROLLBACK_MAP: 'Khôi phục phiên bản bản đồ',
  MAP_VERSION_RETENTION: 'Dọn phiên bản map cũ',
  CREATE_BUILDING: 'Tạo tòa nhà',
  UPDATE_BUILDING: 'Cập nhật tòa nhà',
  ADD_FLOOR: 'Thêm tầng',
  REMOVE_FLOOR: 'Bớt tầng',
  DELETE_BUILDING: 'Xóa tòa nhà',
  DEACTIVATE_BUILDING: 'Vô hiệu hóa tòa nhà',
  ACTIVATE_BUILDING: 'Khôi phục tòa nhà',
  CREATE_USER: 'Tạo tài khoản',
  ADMIN_UPDATE_USER: 'Admin sửa user',
  ACTIVATE_USER: 'Kích hoạt tài khoản',
  DEACTIVATE_USER: 'Vô hiệu hóa tài khoản',
  DELETE_USER: 'Xóa / khóa tài khoản',
  ASSIGN_BUILDING: 'Gán tòa nhà',
  BUILDING_ASSIGN: 'Gán tòa nhà',
  BUILDING_UNASSIGN: 'Bỏ gán tòa nhà',
  BUILDING_ACCESS_DENIED: 'Từ chối truy cập tòa',
  CREATE_QR: 'Tạo mã QR',
  DELETE_QR: 'Xóa mã QR',
  UNLOCK_SESSION: 'Mở khóa phiên',
  CREATE_ORG: 'Tạo tổ chức',
  APPROVE_ORG_REGISTRATION: 'Duyệt hồ sơ đăng ký',
  REJECT_ORG_REGISTRATION: 'Từ chối hồ sơ đăng ký',
  SELF_SERVICE_ORG_TRIAL: 'Trial tự động (self-service)',
  UPDATE_ORGANIZATION: 'Cập nhật tổ chức',
  DEACTIVATE_ORGANIZATION: 'Tạm dừng tổ chức',
  ACTIVATE_ORGANIZATION: 'Kích hoạt tổ chức',
  ADMIN_RESET_PASSWORD: 'Admin đặt lại mật khẩu'
};

const FIELD_LABELS = {
  full_name: 'Họ tên',
  phone: 'Số điện thoại',
  role: 'Vai trò',
  is_active: 'Trạng thái',
  assigned_buildings: 'Tòa nhà được gán',
  name: 'Tên tòa nhà',
  address: 'Địa chỉ',
  description: 'Mô tả',
  total_floors: 'Số tầng',
  status: 'Trạng thái tòa',
  organization_id: 'Tổ chức',
  gps_location: 'Tọa độ GPS',
  activation_radius: 'Bán kính kích hoạt',
  slug: 'Mã định danh',
  plan: 'Gói dịch vụ',
  source: 'Nguồn',
  generated: 'Tự sinh mật khẩu'
};

const ROLE_LABELS = {
  SUPER_ADMIN: 'Quản trị hệ thống',
  ORG_ADMIN: 'Quản trị tổ chức',
  BUILDING_ADMIN: 'Quản trị tòa nhà'
};

function formatActionLabel(action) {
  return ACTION_LABELS[action] || action;
}

function formatRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

function formatActiveStatus(val) {
  if (val === true) return 'Đang hoạt động';
  if (val === false) return 'Đã vô hiệu hóa';
  return val === null || val === undefined ? '(trống)' : String(val);
}

function formatLogValue(val, field) {
  if (field === 'is_active') return formatActiveStatus(val);
  if (field === 'role') return ROLE_LABELS[val] || val;
  if (field === 'plan') return String(val);
  if (field === 'generated') return val ? 'Có' : 'Không';
  if (field === 'status') {
    if (val === 'DRAFT') return 'Nháp';
    if (val === 'PUBLISHED') return 'Đã xuất bản';
  }
  if (field === 'gps_location' && val && typeof val === 'object') {
    const lat = val.lat != null ? val.lat : '?';
    const lng = val.lng != null ? val.lng : '?';
    return lat + ', ' + lng;
  }
  if (Array.isArray(val)) return val.length ? val.map(String).join(', ') : '(không có)';
  if (val === null || val === undefined || val === '') return '(trống)';
  return String(val);
}

function translateDetailMessage(msg) {
  if (!msg || typeof msg !== 'string') return msg;
  const map = {
    'User changed password': 'Người dùng đã đổi mật khẩu',
    'Tạo tòa nhà mới': 'Tạo tòa nhà mới',
    'Cập nhật thông tin tòa nhà': 'Cập nhật thông tin tòa nhà',
    'Tạm dừng tổ chức': 'Tạm dừng tổ chức',
    'Kích hoạt lại tổ chức': 'Kích hoạt lại tổ chức',
    'Cập nhật tổ chức': 'Cập nhật tổ chức',
    'Admin đặt lại mật khẩu': 'Admin đặt lại mật khẩu'
  };
  if (map[msg]) return map[msg];
  if (msg.startsWith('Version ')) {
    return 'Phiên bản bản đồ: ' + msg.replace('Version ', '');
  }
  return msg;
}

function getActionFallbackDetail(action, target) {
  const name = target ? ` — ${target}` : '';
  const fallbacks = {
    LOGIN: 'Phiên đăng nhập mới',
    LOGOUT: 'Kết thúc phiên đăng nhập',
    REGISTER: 'Đăng ký tài khoản chờ duyệt' + name,
    CREATE_USER: 'Tạo tài khoản quản trị' + name,
    CREATE_BUILDING: 'Tạo tòa nhà mới' + name,
    UPDATE_BUILDING: 'Cập nhật thông tin tòa nhà' + name,
    ADD_FLOOR: 'Thêm tầng tòa nhà' + name,
    REMOVE_FLOOR: 'Bớt tầng tòa nhà' + name,
    DEACTIVATE_BUILDING: 'Vô hiệu hóa tòa nhà' + name,
    ACTIVATE_BUILDING: 'Khôi phục tòa nhà' + name,
    DELETE_BUILDING: 'Xóa tòa nhà' + name,
    PUBLISH_MAP: 'Xuất bản bản đồ lên server' + name,
    LOAD_MAP: 'Mở bản đồ trên Editor' + name,
    ROLLBACK_MAP: 'Khôi phục phiên bản bản đồ cũ' + name,
    MAP_VERSION_RETENTION: 'Tự động dọn phiên bản map cũ' + name,
    BUILDING_ASSIGN: 'Gán quyền quản lý tòa nhà' + name,
    BUILDING_UNASSIGN: 'Thu hồi quyền quản lý tòa nhà' + name,
    CHANGE_PASSWORD: 'Đổi mật khẩu tài khoản',
    PASSWORD_RESET_REQUEST: 'Yêu cầu quên mật khẩu' + name,
    PASSWORD_RESET_COMPLETE: 'Đặt lại mật khẩu' + name,
    LOGOUT_ALL: 'Đăng xuất mọi thiết bị' + name,
    CREATE_ORG: 'Tạo tổ chức' + name,
    APPROVE_ORG_REGISTRATION: 'Duyệt hồ sơ đăng ký tổ chức' + name,
    REJECT_ORG_REGISTRATION: 'Từ chối hồ sơ đăng ký' + name,
    ADMIN_UPDATE_USER: 'Admin cập nhật tài khoản' + name,
    ACTIVATE_USER: 'Kích hoạt tài khoản' + name,
    DEACTIVATE_USER: 'Vô hiệu hóa tài khoản' + name,
    UPDATE_ORGANIZATION: 'Cập nhật tổ chức' + name,
    DEACTIVATE_ORGANIZATION: 'Tạm dừng tổ chức' + name,
    ACTIVATE_ORGANIZATION: 'Kích hoạt lại tổ chức' + name,
    ADMIN_RESET_PASSWORD: 'Admin đặt lại mật khẩu' + name,
    UNLOCK_SESSION: 'Mở khóa editor sau khi khóa'
  };
  return fallbacks[action] || (target ? `Đối tượng: ${target}` : '—');
}

function formatDetails(details, log) {
  const action = log?.action || '';
  const target = log?.target || '';

  if (details == null || details === '') {
    return getActionFallbackDetail(action, target);
  }

  if (typeof details === 'string') {
    return translateDetailMessage(details);
  }

  if (typeof details !== 'object') {
    return String(details);
  }

  if (Object.keys(details).length === 0) {
    return getActionFallbackDetail(action, target);
  }

  if (details.message) {
    const parts = [translateDetailMessage(details.message)];
    if (details.version !== undefined) {
      parts.push(`Phiên bản bản đồ: ${details.version}`);
    }
    if (details.changes) {
      const changeText = formatDetails({ changes: details.changes }, log);
      if (changeText && changeText !== '—' && !parts.includes(changeText)) {
        parts.push(changeText);
      }
    }
    return parts.join('<br>');
  }

  if (details.building_ids && Array.isArray(details.building_ids)) {
    const verb = action === 'BUILDING_UNASSIGN' ? 'Đã bỏ gán' : 'Đã gán';
    return `${verb} ${details.building_ids.length} tòa: ${details.building_ids.join(', ')}`;
  }

  if (details.version !== undefined && Object.keys(details).length === 1) {
    return `Phiên bản bản đồ: ${details.version}`;
  }

  if (details.path) {
    const reason = details.reason === 'building_inactive'
      ? 'Tòa nhà đã vô hiệu hóa'
      : 'Không có quyền truy cập';
    return `${reason} · ${details.method || 'GET'} ${details.path}`;
  }

  if (details.from !== undefined && details.to !== undefined && !details.changes) {
    const isStatus = action.includes('ACTIVATE') || action.includes('DEACTIVATE');
    const from = isStatus ? formatActiveStatus(details.from) : formatLogValue(details.from);
    const to = isStatus ? formatActiveStatus(details.to) : formatLogValue(details.to);
    return `Thay đổi: ${from} → ${to}`;
  }

  const changeMap = details.changes || details;
  const parts = [];
  Object.entries(changeMap).forEach(([field, change]) => {
    if (field === 'changes' || field === 'message') return;
    if (change && typeof change === 'object' && ('from' in change || 'to' in change)) {
      const label = FIELD_LABELS[field] || field;
      const from = formatLogValue(change.from, field);
      const to = formatLogValue(change.to, field);
      parts.push(`${label}: ${from} → ${to}`);
    }
  });

  if (parts.length) return parts.join('<br>');

  return getActionFallbackDetail(action, target);
}

function resetLogsPageAndLoad() {
  window._logsPage = 1;
  loadLogs();
}

function renderLogsPagination(total, page) {
  const container = document.getElementById('logsPagination');
  if (!container) return;
  const totalPages = Math.max(1, Math.ceil(total / LOGS_PAGE_SIZE));
  const current = Math.min(Math.max(1, page || 1), totalPages);
  window._logsPage = current;

  if (!total) {
    container.innerHTML = '';
    return;
  }

  let html = '<span class="page-info">Trang ' + current + '/' + totalPages + ' (' + total + ' bản ghi)</span> ';
  const prev = Math.max(1, current - 1);
  const next = Math.min(totalPages, current + 1);
  html += '<button type="button" data-logs-page="' + prev + '"' + (current <= 1 ? ' disabled' : '') + '>&laquo;</button> ';
  const windowSize = 5;
  let start = Math.max(1, current - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  for (let i = start; i <= end; i++) {
    if (i === current) {
      html += '<span class="page-info" style="background:#3498db;color:#fff;padding:6px 10px;border-radius:4px;">' + i + '</span> ';
    } else {
      html += '<button type="button" data-logs-page="' + i + '">' + i + '</button> ';
    }
  }
  html += '<button type="button" data-logs-page="' + next + '"' + (current >= totalPages ? ' disabled' : '') + '>&raquo;</button>';
  container.innerHTML = html;
  container.querySelectorAll('button[data-logs-page]').forEach(btn => {
    btn.onclick = () => {
      window._logsPage = parseInt(btn.getAttribute('data-logs-page'), 10);
      loadLogs();
    };
  });
}

async function loadLogs() {
  const action = document.getElementById('filterAction')?.value || '';
  const email = document.getElementById('filterEmail')?.value.trim() || '';
  const target = document.getElementById('filterTarget')?.value.trim() || '';
  const fromDate = document.getElementById('filterFromDate')?.value || '';
  const toDate = document.getElementById('filterToDate')?.value || '';
  const tbody = document.getElementById('logsList');

  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Đang tải...</td></tr>';

  try {
    const page = window._logsPage || 1;
    let url = '/activity-logs?limit=' + LOGS_PAGE_SIZE + '&page=' + page;
    if (action) url += `&action=${encodeURIComponent(action)}`;
    if (email) url += `&email=${encodeURIComponent(email)}`;
    if (target) url += `&target=${encodeURIComponent(target)}`;
    if (fromDate) url += `&fromDate=${encodeURIComponent(fromDate)}`;
    if (toDate) url += `&toDate=${encodeURIComponent(toDate)}`;

    console.log('[Logs] Loading logs with URL:', url);

    const res = await apiFetch(url);
    if (!res.ok) {
      let errorMsg = 'Không thể tải logs (HTTP ' + res.status + ')';
      try {
        const errorData = await res.json();
        if (errorData.message) errorMsg += ': ' + errorData.message;
      } catch (e) { /* ignore */ }
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">' + errorMsg + '</td></tr>';
      document.getElementById('logsTotal').textContent = '';
      return;
    }
    const data = await res.json();
    const logs = data.logs || [];
    document.getElementById('logsTotal').textContent = 'Tổng: ' + (data.total || 0) + ' bản ghi';

    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">Chưa có log nào.</td></tr>';
      renderLogsPagination(data.total || 0, page);
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const time = new Date(l.createdAt).toLocaleString('vi-VN');
      const user = l.user_id || {};
      const email = user.email || '-';
      const role = formatRoleLabel(user.role || '-');
      const actionLabel = formatActionLabel(l.action);
      const actionBadgeColor =
        l.action.startsWith('DELETE') || l.action === 'DEACTIVATE_BUILDING' || l.action === 'DEACTIVATE_USER' || l.action === 'DEACTIVATE_ORGANIZATION' ? '#e74c3c' :
        l.action.startsWith('CREATE') || l.action === 'ACTIVATE_ORGANIZATION' || l.action === 'ACTIVATE_BUILDING' ? '#27ae60' :
        l.action === 'LOGIN' ? '#3498db' :
        l.action === 'LOGOUT' ? '#e67e22' :
        l.action === 'UPDATE_ORGANIZATION' || l.action === 'ADMIN_RESET_PASSWORD' ? '#8e44ad' :
        l.action.startsWith('ACTIVATE') || l.action.startsWith('DEACTIVATE') ? '#f39c12' :
        '#7f8c8d';

      const detailsHtml = formatDetails(l.details, l);

      return `<tr>
<td style="font-size:12px;">${time}</td>
<td>${email}</td>
<td><span class="role-badge" style="font-size:11px;background:#ecf0f1;color:#2c3e50;padding:2px 8px;border-radius:4px;">${role}</span></td>
<td><span class="badge" style="background:${actionBadgeColor}; font-size:11px;" title="${l.action}">${actionLabel}</span></td>
<td style="font-size:12px;">${l.target || l.target_id || '-'}</td>
<td style="font-size:12px;color:#555;">${detailsHtml}</td>
<td style="font-size:12px;color:#999;">${l.ip_address || '-'}</td>
</tr>`;
    }).join('');
    renderLogsPagination(data.total || 0, data.page || page);
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">Lỗi tải logs: ' + (e.message || e) + '</td></tr>';
    document.getElementById('logsTotal').textContent = '';
    console.error('[Logs] Load error:', e);
  }
}

// ============================================================
// PROFILE (cho mọi user)
let currentProfile = null;

async function loadProfile() {
  try {
    const res = await apiFetch('/users/me');
    if (!res.ok) { alert('Không thể tải thông tin profile (HTTP ' + res.status + ')'); return; }
    const user = await res.json();
    currentProfile = user;
    document.getElementById('profileEmail').value = user.email || '';
    document.getElementById('profileRole').value = user.role || '';
    document.getElementById('profileStatus').value = user.is_active ? 'Hoạt động' : 'Đã khóa';
    document.getElementById('profileCreatedAt').value = user.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN') : '-';
    document.getElementById('profileFullName').value = user.full_name || '';
    document.getElementById('profilePhone').value = user.phone || '';
    document.getElementById('profileMessage').style.display = 'none';
  } catch (e) { console.error('Lỗi tải profile:', e); alert('Lỗi kết nối khi tải profile!'); }
}

document.getElementById('btnSaveProfile').onclick = async () => {
  const fullName = document.getElementById('profileFullName').value.trim();
  const phone = document.getElementById('profilePhone').value.trim();
  const msgEl = document.getElementById('profileMessage');
  if (!fullName) { msgEl.textContent = 'Họ tên không được để trống.'; msgEl.style.display = 'block'; msgEl.className = 'error-msg'; return; }
  const profileNameErrors = validateFullNameClient(fullName);
  if (profileNameErrors.length) {
    msgEl.textContent = profileNameErrors.join(' ');
    msgEl.style.display = 'block';
    msgEl.className = 'error-msg';
    return;
  }
  try {
    const res = await apiFetch('/users/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, phone })
    });
    const data = await res.json();
    if (res.ok) {
      msgEl.textContent = 'Cập nhật thành công!';
      msgEl.style.display = 'block';
      msgEl.className = 'success-msg';
      if (currentProfile) { currentProfile.full_name = fullName; currentProfile.phone = phone; }
    } else {
      msgEl.textContent = 'Lỗi: ' + (data.message || 'Không rõ');
      msgEl.style.display = 'block';
      msgEl.className = 'error-msg';
    }
  } catch (e) {
    msgEl.textContent = 'Lỗi kết nối!';
    msgEl.style.display = 'block';
    msgEl.className = 'error-msg';
  }
};

// ============================================================
// CHANGE PASSWORD
const passMsgs = {
  missing: 'Tất cả các trường đều bắt buộc.',
  mismatch: 'Xác nhận mật khẩu không khớp.',
  same: 'Mật khẩu mới phải khác mật khẩu hiện tại.'
};

document.querySelectorAll('.toggle-password-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    const container = this.closest('.form-group') || this.parentElement;
    const input = container.querySelector('input');
    if (!input) return;
    if (input.type === 'password') { input.type = 'text'; this.textContent = 'Ẩn'; }
    else { input.type = 'password'; this.textContent = 'Hiện'; }
  });
});

document.getElementById('btnChangePassword').onclick = async () => {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const msgEl = document.getElementById('passwordMessage');
  msgEl.style.display = 'none';

  if (!currentPassword || !newPassword || !confirmPassword) {
    msgEl.textContent = passMsgs.missing; msgEl.style.display = 'block'; msgEl.className = 'error-msg'; return;
  }
  const strengthErrors = validatePasswordStrengthClient(newPassword);
  if (strengthErrors.length) {
    msgEl.textContent = strengthErrors.join(' ');
    msgEl.style.display = 'block';
    msgEl.className = 'error-msg';
    return;
  }
  if (newPassword !== confirmPassword) { msgEl.textContent = passMsgs.mismatch; msgEl.style.display = 'block'; msgEl.className = 'error-msg'; return; }

  try {
    const res = await apiFetch('/users/me/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });
    const data = await res.json();
    if (res.ok) {
      msgEl.textContent = 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.';
      msgEl.style.display = 'block';
      msgEl.className = 'success-msg';
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
      setTimeout(() => { clearAuthStorage(); window.location.replace('/admin/index.html'); }, 1500);
    } else {
      msgEl.textContent = 'Lỗi: ' + (data.message || 'Không rõ'); msgEl.style.display = 'block'; msgEl.className = 'error-msg';
    }
  } catch (e) {
    msgEl.textContent = 'Lỗi kết nối!';
    msgEl.style.display = 'block';
    msgEl.className = 'error-msg';
  }
};










