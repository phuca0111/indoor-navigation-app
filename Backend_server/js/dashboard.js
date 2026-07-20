// ============================================================
// 1. CONFIG & CONSTANTS
// Dùng relative URL để dashboard gọi đúng backend trên cùng domain.
// Khi deploy lên Render, cùng domain nên không cần CORS.
const API_URL = '/api';

const PAGE_SIZE = 15;
const LOGS_PAGE_SIZE = 20;
const PLAN_LIMITS_UI = { FREE: { buildings: 2, users: 5 }, PRO: { buildings: 20, users: 50 }, BUSINESS: { buildings: 50, users: 100 }, ENTERPRISE: { buildings: null, users: null } };
const PLAN_PRICE_FALLBACK = { FREE: 0, PRO: 990000, BUSINESS: 2490000, ENTERPRISE: 4990000 };
const PLAN_NAME_FALLBACK = { FREE: 'Miễn phí', PRO: 'Pro', BUSINESS: 'Business', ENTERPRISE: 'Doanh nghiệp' };

/** Cache catalog gói từ API — dùng chung badge / giá / hạn mức toàn dashboard. */
let planCatalogByCode = {};
let planCatalogList = [];
let planCatalogLoading = null;
/** Cache bảng Hóa đơn & sổ thu (phân trang client). */
let _financeInvoicesCache = [];
let _financePaymentsCache = [];

const VALID_DASHBOARD_TABS = new Set(['overview', 'buildings', 'maps', 'users', 'logs', 'organizations', 'myorg', 'billing', 'plans', 'finance', 'analytics', 'registrations', 'profile', 'website']);

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
  // REGISTERED_USER (Personal Workspace): chỉ Buildings / Maps / Profile
  if (role === 'REGISTERED_USER') {
    const allowed = new Set(['buildings', 'maps', 'profile']);
    return allowed.has(tab) ? tab : 'buildings';
  }
  // "Tổ chức của tôi" chỉ dành cho ORG_ADMIN
  if (tab === 'myorg' && role !== 'ORG_ADMIN') {
    return role === 'SUPER_ADMIN' ? 'organizations' : 'buildings';
  }
  if (role === 'BUILDING_ADMIN') {
    if (tab === 'users' || tab === 'logs' || tab === 'organizations' || tab === 'myorg') return 'buildings';
  }
  if (role === 'ORG_ADMIN' && tab === 'organizations') return 'myorg';
  if (role !== 'SUPER_ADMIN' && tab === 'registrations') return 'buildings';
  if (role === 'BUILDING_ADMIN' && tab === 'billing') return 'buildings';
  if (role === 'BUILDING_ADMIN' && tab === 'plans') return 'buildings';
  if (role === 'ORG_ADMIN' && tab === 'plans') return 'billing';
  // Phân tích / analytics chỉ dành cho SUPER_ADMIN
  if (tab === 'analytics' && role !== 'SUPER_ADMIN') {
    return role === 'ORG_ADMIN' ? 'billing' : 'buildings';
  }
  if (role === 'BUILDING_ADMIN' && tab === 'analytics') return 'buildings';
  return tab;
}

function resolveDashboardTab(name) {
  const raw = name && VALID_DASHBOARD_TABS.has(name) ? name : 'overview';
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

/** AD7 — markup loading/empty dùng AdminUi khi có (admin-ui.js load sau). */
function dashUiLoading(kind, meta) {
  if (window.AdminUi && typeof AdminUi.loadingMarkup === 'function') {
    return AdminUi.loadingMarkup(kind, meta);
  }
  const label = (meta && meta.label) || 'Đang tải…';
  return '<p class="analytics-loading">' + escapeHtml(label) + '</p>';
}

function dashUiEmpty(meta) {
  if (window.AdminUi && typeof AdminUi.emptyMarkup === 'function') {
    return AdminUi.emptyMarkup(meta || {});
  }
  const hint = (meta && (meta.hint || meta.title)) || 'Không có dữ liệu';
  return '<p class="analytics-muted">' + escapeHtml(hint) + '</p>';
}

function dashUiError(message) {
  if (window.AdminUi && typeof AdminUi.errorMarkup === 'function') {
    return AdminUi.errorMarkup(message);
  }
  return '<p class="analytics-error">' + escapeHtml(message || 'Lỗi') + '</p>';
}

function dashUiTableLoading(colspan) {
  const cols = Number(colspan) || 7;
  return '<tr><td colspan="' + cols + '" class="admin-table-loading-cell">' +
    dashUiLoading('text', { label: 'Đang tải…' }) + '</td></tr>';
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
  if (billing === 'ACTIVE' && isPaidPlanUi(plan)) return '';
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
  },
  billing: {
    containerId: 'billingOrgsPagination',
    pageVar: '_billingOrgsPage',
    render: () => renderBillingOrgList(false)
  },
  financeInvoices: {
    containerId: 'financeInvoicesPagination',
    pageVar: '_financeInvoicesPage',
    render: () => renderFinanceInvoicesFromCache(false)
  },
  financePayments: {
    containerId: 'financePaymentsPagination',
    pageVar: '_financePaymentsPage',
    render: () => renderFinancePaymentsFromCache(false)
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

const WIDE_LAYOUT_TABS = new Set(['overview', 'buildings', 'maps', 'users', 'logs', 'organizations', 'billing', 'plans', 'finance', 'analytics', 'registrations']);

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
  return getPlanPriceUi(plan) > 0;
}

function listPaidPlansForUi(opts) {
  const exclude = String(opts?.exclude || '').toUpperCase();
  const onlyActive = opts?.onlyActive !== false;
  const minPriceExclusive = opts?.minPriceExclusive != null ? Number(opts.minPriceExclusive) : null;
  const audience = opts?.audience || ''; // '' | 'organization' | 'personal'
  const source = planCatalogList.length
    ? planCatalogList
    : Object.keys(PLAN_PRICE_FALLBACK).map((code) => ({
        code,
        name: PLAN_NAME_FALLBACK[code] || code,
        price_vnd: PLAN_PRICE_FALLBACK[code],
        is_active: true,
        is_organization: code === 'BUSINESS' || code === 'ENTERPRISE',
        is_personal: code === 'FREE' || code === 'PRO',
        sort_order: code === 'FREE' ? 10 : code === 'PRO' ? 20 : 30
      }));
  return source
    .filter((p) => {
      const code = String(p.code || '').toUpperCase();
      if (!code || code === exclude) return false;
      if (onlyActive && p.is_active === false) return false;
      if (audience === 'organization' && p.is_organization !== true) return false;
      if (audience === 'personal' && p.is_personal !== true) return false;
      const price = getPlanPriceUi(code);
      if (!(price > 0)) return false;
      // Chỉ hiện gói cao hơn gói hiện tại (theo giá catalog)
      if (minPriceExclusive != null && !(price > minPriceExclusive)) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      const pa = getPlanPriceUi(a.code);
      const pb = getPlanPriceUi(b.code);
      if (pa !== pb) return pa - pb;
      return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
    });
}

/**
 * Bảng gói tổ chức: cột Gói / Giá / Trạng thái / Thao tác
 * @param {{ currentPlan: string, state: string, rows: Array<{code,action,label,status}> }}
 */
function renderOrgPlanOptionsTable(opts) {
  const rows = Array.isArray(opts?.rows) ? opts.rows : [];
  if (!rows.length) {
    return '<p class="org-detail-hint">' +
      escapeHtml(opts?.emptyHint || 'Chưa có gói tổ chức trong danh mục.') + '</p>';
  }
  const body = rows.map((row) => {
    const code = String(row.code || '').toUpperCase();
    const name = escapeHtml(formatPlanNameVi(code));
    const price = escapeHtml(formatPlanCheckoutPriceLabel(code));
    const status = escapeHtml(row.status || '—');
    const action = String(row.action || 'upgrade');
    const btnLabel = escapeHtml(row.buttonLabel || (action === 'renew' ? 'Gia hạn' : 'Nâng cấp'));
    const btnClass = action === 'renew' ? 'btn-create' : 'btn-edit';
    return '<tr>' +
      '<td><strong>' + name + '</strong><div class="org-plan-table-code">' + escapeHtml(code) + '</div></td>' +
      '<td>' + price + '</td>' +
      '<td>' + status + '</td>' +
      '<td class="org-plan-table-action">' +
        '<button type="button" class="' + btnClass + '" onclick="checkoutOrgPlan(\'' +
          escapeHtml(code) + '\', \'' + escapeHtml(action) + '\')">' + btnLabel + '</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  return '<div class="org-plan-table-wrap">' +
    '<table class="admin-data-table org-plan-options-table">' +
      '<thead><tr>' +
        '<th>Gói</th><th>Giá</th><th>Trạng thái</th><th>Thao tác</th>' +
      '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
    '</table></div>';
}

function renderPaidPlanActionButtons(opts) {
  const mode = opts?.mode || 'checkout';
  const oid = opts?.orgId || '';
  const exclude = opts?.exclude || '';
  const btnClass = opts?.btnClass || 'btn-edit';
  const primaryClass = opts?.primaryClass || 'btn-create';
  const plans = listPaidPlansForUi({
    exclude,
    onlyActive: opts?.onlyActive !== false,
    minPriceExclusive: opts?.minPriceExclusive
  });
  if (!plans.length) {
    if (opts?.emptyHint) {
      return '<p class="org-detail-hint">' + escapeHtml(opts.emptyHint) + '</p>';
    }
    return '<p class="org-detail-hint">Chưa có gói trả phí đang bán trong danh mục.</p>';
  }
  return plans.map((p, index) => {
    const code = String(p.code || '').toUpperCase();
    const label = escapeHtml(formatPlanNameVi(code));
    const price = formatPlanCheckoutPriceLabel(code);
    const cls = index === 0 ? primaryClass : btnClass;
    if (mode === 'activate') {
      return '<button type="button" class="' + cls + '" onclick="activateOrgSubscriptionUi(\'' +
        oid + '\', \'' + escapeHtml(code) + '\')">Kích hoạt ' + label + '</button>';
    }
    const action = opts?.action || 'upgrade';
    const verb = action === 'renew' ? 'Gia hạn' : (opts?.verb || 'Nâng cấp');
    return '<button type="button" class="' + cls + '" onclick="checkoutOrgPlan(\'' +
      escapeHtml(code) + '\', \'' + escapeHtml(action) + '\')">' + verb + ' ' + label +
      ' — ' + price + '</button>';
  }).join('');
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
  if (billing === 'ARCHIVED' || subStatus === 'ARCHIVED') return 'ARCHIVED';
  if (billing === 'GRACE_PERIOD') return 'GRACE';
  if (billing === 'EXPIRED' || subStatus === 'PAST_DUE' || subStatus === 'EXPIRED') return 'EXPIRED';
  if (isPaidPlanUi(plan) && billing === 'ACTIVE') return 'PAID_ACTIVE';
  return 'FREE';
}

const BILLING_UI_STATE_LABELS = {
  FREE: 'Gói Miễn phí',
  PAID_ACTIVE: 'Gói trả phí đang hoạt động',
  GRACE: 'Đang trong thời gian gia hạn',
  EXPIRED: 'Gói hết hạn / quá hạn thanh toán',
  ARCHIVED: 'Tổ chức đã lưu trữ'
};

function renderOrgBillingActionPanel(oid, org, subscription, quota) {
  const state = resolveOrgBillingUiState(org, subscription, quota);
  const plan = String(org?.plan || 'FREE').toUpperCase();
  let actions = '';

  if (state === 'FREE' || state === 'EXPIRED') {
    actions += '<div class="org-sub-group">' +
      '<div class="org-sub-group-title">Kích hoạt gói trả phí</div>' +
      '<div class="org-plan-actions">' +
        renderPaidPlanActionButtons({ mode: 'activate', orgId: oid, onlyActive: false }) +
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
    const upgradeBtns = renderPaidPlanActionButtons({
      mode: 'activate',
      orgId: oid,
      exclude: plan,
      onlyActive: false,
      minPriceExclusive: getPlanPriceUi(plan),
      primaryClass: 'btn-edit',
      btnClass: 'btn-edit',
      emptyHint: 'Đã ở gói cao nhất — không còn gói nâng cấp.'
    });
    actions += '<div class="org-sub-group">' +
      '<div class="org-sub-group-title">Xử lý gói đang dùng</div>' +
      '<div class="org-plan-actions">' +
        upgradeBtns +
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
      '<strong>Quản trị hệ thống:</strong> xử lý ngoại lệ (gia hạn thủ công, hủy gói). Quản trị tổ chức tự thanh toán qua tab này.' +
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
  if (!p) return '—';
  const doc = planCatalogByCode[p];
  if (doc && doc.name) return String(doc.name);
  return PLAN_NAME_FALLBACK[p] || plan || '—';
}

function getPlanPriceUi(plan) {
  const p = String(plan || 'FREE').toUpperCase();
  const doc = planCatalogByCode[p];
  if (doc && doc.price_vnd != null) return Number(doc.price_vnd) || 0;
  return PLAN_PRICE_FALLBACK[p] != null ? PLAN_PRICE_FALLBACK[p] : 0;
}

function getPlanPeriodDaysUi(plan) {
  const p = String(plan || 'FREE').toUpperCase();
  const doc = planCatalogByCode[p];
  if (doc && doc.period_days) return Number(doc.period_days) || 30;
  return 30;
}

function formatPlanCheckoutPriceLabel(plan) {
  const days = getPlanPeriodDaysUi(plan);
  const unit = days === 30 ? 'tháng' : (days + ' ngày');
  return formatVnd(getPlanPriceUi(plan)) + 'đ/' + unit;
}

/** Nhãn giá theo kỳ catalog (vd. 110.000 đ/5 ngày, 1.000.000 đ/tháng). */
function formatPlanPricePerPeriod(priceVnd, periodDays) {
  const days = Math.max(1, Number(periodDays) || 30);
  const unit = days === 30 ? 'tháng' : (days === 7 ? 'tuần' : (days + ' ngày'));
  return (Number(priceVnd) || 0).toLocaleString('vi-VN') + ' đ/' + unit;
}

function applyPlanCatalogToUiMaps(plans) {
  const next = {};
  (plans || []).forEach((plan) => {
    const code = String(plan.code || '').toUpperCase();
    if (!code) return;
    next[code] = plan;
    PLAN_LIMITS_UI[code] = {
      buildings: plan.max_buildings == null ? null : Number(plan.max_buildings),
      users: plan.max_users == null ? null : Number(plan.max_users)
    };
  });
  planCatalogByCode = next;
  planCatalogList = plans || [];
}

async function ensurePlanCatalogLoaded(force) {
  if (!force && Object.keys(planCatalogByCode).length) return planCatalogByCode;
  if (planCatalogLoading && !force) return planCatalogLoading;
  planCatalogLoading = (async () => {
    const role = currentUser?.role;
    const canFinance = role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN';
    try {
      let plans = [];
      if (canFinance) {
        const res = await apiFetch('/finance/plans');
        const data = await res.json().catch(() => ({}));
        if (res.ok) plans = data.plans || [];
      }
      if (!plans.length) {
        const res = await fetch(API_URL + '/billing/plans');
        const data = await res.json().catch(() => ({}));
        if (res.ok) plans = data.plans || [];
      }
      applyPlanCatalogToUiMaps(plans);
      populatePlanSelectsFromCatalog();
      return planCatalogByCode;
    } catch (e) {
      console.warn('ensurePlanCatalogLoaded:', e);
      return planCatalogByCode;
    } finally {
      planCatalogLoading = null;
    }
  })();
  return planCatalogLoading;
}

function populatePlanSelectsFromCatalog() {
  const plans = planCatalogList.length
    ? planCatalogList.slice().sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    : Object.keys(PLAN_NAME_FALLBACK).map((code) => ({ code, name: PLAN_NAME_FALLBACK[code], is_active: true }));

  const fillSelect = (el, opts) => {
    if (!el) return;
    const keep = el.value;
    const withAll = opts && opts.withAll;
    const allLabel = (opts && opts.allLabel) || 'Tất cả gói';
    const onlyActive = !(opts && opts.includeInactive);
    const rows = plans.filter((p) => !onlyActive || p.is_active !== false);
    el.innerHTML =
      (withAll ? '<option value="">' + escapeHtml(allLabel) + '</option>' : '') +
      rows.map((p) => {
        const code = String(p.code || '').toUpperCase();
        const label = escapeHtml(p.name || formatPlanNameVi(code));
        return '<option value="' + escapeHtml(code) + '">' + label + ' (' + escapeHtml(code) + ')</option>';
      }).join('');
    if (keep && Array.from(el.options).some((o) => o.value === keep)) el.value = keep;
  };

  fillSelect(document.getElementById('billingPlanFilter'), { withAll: true, allLabel: 'Tất cả gói', includeInactive: true });
  fillSelect(document.getElementById('filterOrgPlan'), { withAll: true, allLabel: 'Tất cả', includeInactive: true });
  fillSelect(document.getElementById('invPlan'), { includeInactive: false });
  fillSelect(document.getElementById('addOrgPlan'), { includeInactive: false });
}

async function refreshPlanDependentViews() {
  await ensurePlanCatalogLoaded(true);
  try {
    if (window._currentDashboardTab === 'organizations') {
      applyOrganizationFilters(false);
    }
  } catch (_) { /* ignore */ }
  try {
    if (window._currentDashboardTab === 'billing') {
      if (currentUser?.role === 'ORG_ADMIN') {
        await loadMyBillingTab();
      } else if (!_billingTabOrgId) {
        renderBillingOrgList();
      } else {
        await loadBillingTab(_billingTabOrgId);
      }
    }
  } catch (_) { /* ignore */ }
  try {
    if (window._currentDashboardTab === 'overview') {
      await refreshOverviewDashboard();
    }
  } catch (_) { /* ignore */ }
  try {
    if (typeof loadFinancePlans === 'function' && document.getElementById('financePlanList')) {
      await loadFinancePlans();
    }
  } catch (_) { /* ignore */ }
  try {
    if (window._currentDashboardTab === 'plans') {
      await loadPlansTab();
    }
  } catch (_) { /* ignore */ }
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
    ARCHIVED: 'Đã lưu trữ',
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
    EXPIRED: 'Hết hạn',
    ARCHIVED: 'Đã lưu trữ'
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
    '<div class="org-life-card"><div class="org-life-k">Phân bố gói</div><div class="org-life-v">' +
      (Object.keys(dist).length
        ? Object.keys(dist).map((k) => escapeHtml(k) + ':' + (dist[k] || 0)).join(' · ')
        : '—') + '</div></div>' +
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
  const days = getPlanPeriodDaysUi(p);
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  await createOrganizationBillingEvent(orgId, {
    event_type: 'SUBSCRIPTION_RENEWED',
    payment_status: 'PAID',
    plan: p,
    amount: getPlanPriceUi(p),
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
        amount: getPlanPriceUi(p),
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
    return 'Gói ' + formatPlanNameVi('FREE') + ' · Gói trả phí đã hết hạn';
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
    !(billing === 'ACTIVE' && isPaidPlanUi(plan));
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
  const billing = String(quota.billing_status || 'ACTIVE').toUpperCase();
  const role = currentUser?.role || user?.role || '';
  if (billing === 'ARCHIVED') {
    msg = '📦 Tổ chức đã lưu trữ. Gia hạn để khôi phục — dữ liệu vẫn được giữ.';
  } else if (billing === 'EXPIRED') {
    if (role === 'BUILDING_ADMIN') {
      msg = '⛔ Gói tổ chức đã hết hạn. Liên hệ Quản trị tổ chức để gia hạn.';
    } else {
      msg = '⛔ Gói đã hết hạn. Chỉ còn xem Dashboard / dữ liệu. Gia hạn để mở lại đầy đủ.';
    }
  } else if (billing === 'GRACE_PERIOD') {
    const days = quota.grace_days_left != null ? quota.grace_days_left : (quota.grace_period_days || 15);
    const planName = quota.plan || org?.plan || 'gói';
    if (role === 'BUILDING_ADMIN') {
      msg = '⚠️ Gói tổ chức đã hết hạn (còn ' + days + ' ngày gia hạn). Liên hệ Quản trị tổ chức.';
    } else {
      msg = '⚠️ Gói ' + planName + ' đã hết hạn. Gia hạn trong ' + days +
        ' ngày để tiếp tục sử dụng đầy đủ. Không tạo tòa/user mới, không Publish/Upload CAD.';
    }
  } else if (quota.enforcement_active && (quota.buildings?.locked > 0 || quota.users?.locked > 0)) {
    msg = '🔒 ' + (msg ? msg + ' — ' : '') +
      'Vượt hạn mức: vẫn xem/sửa được, không tạo mới. Giảm bớt hoặc nâng cấp gói.';
  } else if (quota.buildings?.over || quota.users?.over) {
    msg = '⚠️ ' + (msg ? msg + ' — ' : '') +
      'Đang vượt hạn mức gói. Không tạo mới cho đến khi nâng gói hoặc xóa bớt.';
  }

  if (msg) {
    quotaLine.textContent = msg;
    quotaLine.className = 'quota-alert-line' +
      (billing === 'EXPIRED' || billing === 'ARCHIVED' || (quota.enforcement_active && quota.buildings?.locked > 0)
        ? ' quota-alert-locked'
        : ' quota-alert-warn');
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
  if (nameEl) nameEl.textContent = user.full_name || user.email || 'Người dùng';
  if (roleEl) roleEl.textContent = formatRoleLabel(user.role || '');

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
  const isRegisteredUser = user.role === 'REGISTERED_USER';
  document.querySelectorAll('.super-admin-only').forEach(el => {
    el.style.display = isSuperAdmin ? '' : 'none';
  });
  document.querySelectorAll('.org-admin-only').forEach(el => {
    el.style.display = isOrgAdmin ? '' : 'none';
  });
  const customersGroupLabel = document.getElementById('navCustomersGroupLabel');
  if (customersGroupLabel) {
    customersGroupLabel.textContent = isOrgAdmin ? 'Nhân viên' : 'Khách hàng';
  }
  // Cột "Tổ chức" trong bảng Tòa nhà chỉ có ý nghĩa với Super Admin (đa tổ chức)
  const buildingsTableEl = document.getElementById('buildingsTable');
  if (buildingsTableEl) buildingsTableEl.classList.toggle('hide-org-col', !isSuperAdmin);

  const usersBtns = document.querySelectorAll('.users-tab-btn, button[onclick*="users"]');
  const logsBtn = document.querySelector('.logs-tab-btn, button[onclick*="logs"]');
  const orgTabBtn = document.querySelector('button[onclick*="organizations"]');
  const billingTabBtn = document.querySelector('.billing-tab-btn, button[onclick*="billing"]');
  usersBtns.forEach((btn) => {
    if (btn.classList.contains('org-scope-users')) {
      btn.style.display = isOrgAdmin ? '' : 'none';
    } else if (btn.classList.contains('super-admin-only')) {
      btn.style.display = isSuperAdmin ? '' : 'none';
    } else {
      btn.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
    }
  });
  if (logsBtn) logsBtn.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  if (orgTabBtn) orgTabBtn.style.display = isSuperAdmin ? '' : 'none';
  if (billingTabBtn) billingTabBtn.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  document.querySelectorAll('.registered-user-only').forEach((el) => {
    el.style.display = isRegisteredUser ? '' : 'none';
  });
  // Ẩn cả nhóm menu trống với tài khoản cá nhân (Khách hàng / Website / admin finance)
  if (isRegisteredUser) {
    document.querySelectorAll('.admin-nav-group[data-nav-group="customers"], .admin-nav-group[data-nav-group="website"]').forEach((g) => {
      g.style.display = 'none';
    });
    // Nhóm Tài chính: chỉ hiện mục «Gói & hóa đơn»
    const financeGroup = document.querySelector('.admin-nav-group[data-nav-group="finance"]');
    if (financeGroup) financeGroup.style.display = '';
  } else {
    document.querySelectorAll('.admin-nav-group[data-nav-group="customers"], .admin-nav-group[data-nav-group="website"]').forEach((g) => {
      g.style.display = '';
    });
  }
  document.querySelectorAll('.plans-tab-btn, button[onclick*="plans"]').forEach((btn) => {
    btn.style.display = (isSuperAdmin || user.role === 'FINANCE_ADMIN') ? '' : 'none';
  });
  const analyticsTabBtn = document.querySelector('.analytics-tab-btn, button[onclick*="analytics"]');
  if (analyticsTabBtn) analyticsTabBtn.style.display = isSuperAdmin ? '' : 'none';
  document.querySelectorAll('.analytics-tab-btn').forEach((btn) => {
    btn.style.display = isSuperAdmin ? '' : 'none';
  });
  document.querySelectorAll('.finance-tab-btn, button[onclick*="finance"], button[onclick*="Finance"]').forEach((btn) => {
    // Thu chi / các nút gắn super-admin-only: chỉ SUPER_ADMIN
    if (btn.classList.contains('super-admin-only') || btn.getAttribute('data-finance-sub') === 'overview') {
      btn.style.display = isSuperAdmin ? '' : 'none';
      return;
    }
    btn.style.display = (isSuperAdmin || user.role === 'FINANCE_ADMIN') ? '' : 'none';
  });
  // Ẩn subnav kế toán Thu–Chi với role dưới SUPER_ADMIN
  document.querySelectorAll('#financeSubNav .finance-subnav-btn').forEach((btn) => {
    const sub = btn.getAttribute('data-finance-sub');
    if (sub === 'overview' || sub === 'expenses' || sub === 'reports') {
      btn.style.display = isSuperAdmin ? '' : 'none';
    }
  });
  const btnAddUser = document.getElementById('btnAddUser');
  const btnAddBuilding = document.getElementById('btnAddBuilding');
  if (btnAddUser) btnAddUser.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  // REGISTERED_USER được tạo tòa nhà trong Personal Workspace của mình
  if (btnAddBuilding) btnAddBuilding.style.display = (isSuperAdmin || isOrgAdmin || isRegisteredUser) ? '' : 'none';
  document.querySelectorAll('.building-restore-filter').forEach(el => {
    el.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  });

  const currentTab = document.querySelector('.tab-btn.active');
  if (currentTab && !isSuperAdmin && user.role !== 'FINANCE_ADMIN') {
    const tabName = currentTab.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (tabName === 'organizations' || tabName === 'registrations' || tabName === 'finance' || tabName === 'plans') {
      switchTab('buildings');
    }
  }
  if (user.role === 'FINANCE_ADMIN') {
    // Finance Admin: chỉ giữ tab Thu–Chi hữu ích; ẩn org / đăng ký
    if (orgTabBtn) orgTabBtn.style.display = 'none';
    document.querySelectorAll('.super-admin-only').forEach(el => {
      el.style.display = 'none';
    });
  }
  if (currentTab && !isSuperAdmin && !isOrgAdmin) {
    const tabName = currentTab.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if (tabName === 'users' || tabName === 'logs') {
      switchTab('buildings');
    }
  }

  // REGISTERED_USER: Personal Workspace — chỉ giữ Tòa nhà / Chi tiết tòa / Hồ sơ cá nhân
  if (isRegisteredUser) {
    const allowedTabs = new Set(['buildings', 'maps', 'profile']);
    document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
      const t = btn.getAttribute('data-tab');
      btn.style.display = allowedTabs.has(t) ? '' : 'none';
    });
    const activeBtn = document.querySelector('.tab-btn.active');
    const activeTab = activeBtn?.getAttribute('data-tab');
    if (!activeTab || !allowedTabs.has(activeTab)) {
      switchTab('buildings');
    }
  }

  // Panel chuyển đổi tổ chức
  const personalWsBar = document.getElementById('personalWsBar');
  if (personalWsBar) personalWsBar.style.display = isRegisteredUser ? '' : 'none';
  const orgJoinPanel = document.getElementById('orgJoinPanel');
  if (orgJoinPanel) orgJoinPanel.style.display = isOrgAdmin ? '' : 'none';
  if (isRegisteredUser && typeof loadMyJoinRequests === 'function') loadMyJoinRequests();
  if (isRegisteredUser && typeof loadPersonalBilling === 'function') loadPersonalBilling();
  if (isOrgAdmin && typeof loadOrgJoinRequests === 'function') loadOrgJoinRequests();

  const tabNav = document.getElementById('tabNav');
  if (tabNav) tabNav.style.display = 'flex';

  // Đồng bộ nhóm SAU khi đã set xong display theo role
  if (typeof window.AdminShell?.syncNavGroupVisibility === 'function') {
    window.AdminShell.syncNavGroupVisibility();
  }

  updatePlanQuotaBadge(user, resolveQuotaFromStats(platformStatsCache));
}

// ============================================================
// SYNC CURRENT SESSION (Multi-tab sync)
// WHY: Kiểm tra token và fetch user info từ server để đảm bảo UI đúng.
// reason: 'initial-load' | 'storage-change' | 'tab-visible' | 'pageshow'
// ============================================================
async function syncCurrentSession(reason, depth) {
  depth = depth || 0;
  const tokenAtStart = localStorage.getItem('token');
  try {
    if (!tokenAtStart) {
      clearAuthStorage();
      window.location.replace('/login');
      return null;
    }
    const res = await apiFetch('/users/me');
    if (!res.ok) {
      if (localStorage.getItem('token') !== tokenAtStart) {
        if (depth < 2) {
          console.warn('[SessionSync] Bỏ qua 401 cũ — token đã đổi ở tab khác');
          return syncCurrentSession(reason, depth + 1);
        }
        return null;
      }
      clearAuthStorage();
      window.location.replace('/login');
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
    if (localStorage.getItem('token') !== tokenAtStart) {
      if (depth < 2) return syncCurrentSession(reason, depth + 1);
      return null;
    }
    clearAuthStorage();
    window.location.replace('/login');
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
    window.location.replace('/login');
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
    window.location.replace('/login');
  }
}

// ============================================================
// DASHBOARD STARTUP INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await syncCurrentSession('initial-load');
  if (!currentUser) return;

  await ensurePlanCatalogLoaded(true);

  if (currentUser.role === 'SUPER_ADMIN') {
    fetchOrganizations();
  } else if (currentUser.role === 'ORG_ADMIN') {
    seedOrgCacheFromUser(currentUser);
  }

  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  const logoutAllBtn = document.getElementById('btnLogoutAll');
  if (logoutAllBtn) logoutAllBtn.addEventListener('click', handleLogoutAll);

  let initialTab = localStorage.getItem('activeDashboardTab') || 'overview';
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

  if (opts.financeSub) {
    window._activeFinanceNavSub = opts.financeSub;
    try { localStorage.setItem('indoorNavFinanceSubtab', opts.financeSub); } catch (_) { /* ignore */ }
  }
  if (opts.profileSection) {
    window._activeProfileSection = opts.profileSection;
  } else if (tab !== 'profile') {
    window._activeProfileSection = 'info';
  }

  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  // 'myorg' (ORG_ADMIN) tái dùng panel #tab-organizations ở chế độ chỉ-chi-tiết
  const panelId = tab === 'myorg' ? 'tab-organizations' : 'tab-' + tab;
  const tabPanel = document.getElementById(panelId);
  if (tabPanel) tabPanel.style.display = 'block';
  syncDashboardNavActive(tab, opts);
  if (typeof window.AdminShell?.syncActiveNavigation === 'function') {
    window.AdminShell.syncActiveNavigation();
  }

  window._currentDashboardTab = tab;
  localStorage.setItem('activeDashboardTab', tab);

  if (window._dashboardHistoryReady && !opts.skipHistory && !opts.fromPopstate && prevTab !== tab) {
    history.pushState({ dashboardTab: tab }, '', dashboardTabHref(tab));
  }

  applyDashboardLayout(tab);

  stopOverviewAutoRefresh();
  if (tab === 'overview') {
    await refreshOverviewDashboard();
    startOverviewAutoRefresh();
  }
  if (tab === 'buildings') {
    initBuildingTableSort();
    await fetchBuildings();
    restoreBuildingFilters();
    applyBuildingFilters(false);
    updateDashSortIndicators('buildingsTable', getBuildingTableSort);
  }
  if (tab === 'maps') {
    await refreshBuildingDetail();
  }
  if (tab === 'users') {
    restoreUserFilters();
    initUserTableSort();
    await fetchUsers();
    updateDashSortIndicators('usersTable', getUserTableSort);
  }
  if (tab === 'logs') await loadLogs();
  if (tab === 'profile') {
    await loadProfile();
    focusProfileSection(window._activeProfileSection || opts.profileSection || 'info');
  }
  if (tab === 'organizations') {
    restoreOrganizationFilters();
    initOrgTableSort();
    await fetchOrganizations();
    if (!allBuildings.length) await fetchBuildings();
    if (!allUsers.length) await fetchUsers();
    updateOrgSortIndicators();
  }
  if (tab === 'myorg') {
    await openMyOrganization();
  }
  if (tab === 'registrations') await fetchRegistrations();
  if (tab === 'billing') {
    const toolbar = document.querySelector('.billing-tab-toolbar');
    const intro = document.querySelector('.billing-tab-intro');
    if (currentUser?.role === 'ORG_ADMIN') {
      if (toolbar) toolbar.style.display = 'none';
      if (intro) intro.textContent = 'Xem gói hiện tại, hóa đơn và tự nâng cấp/gia hạn qua cổng thanh toán.';
      showBillingDetailMode(true);
      await loadMyBillingTab();
    } else {
      if (toolbar) toolbar.style.display = '';
      if (intro) intro.textContent = 'Danh sách tổ chức và trạng thái gói. Bấm một tổ chức để quản lý subscription, hóa đơn và chu kỳ.';
      if (!allOrganizations.length) await fetchOrganizations();
      populateBillingOrgSelect();
      const preselect = opts.billingOrgId || _billingTabOrgId || document.getElementById('billingOrgSelect')?.value || '';
      const sel = document.getElementById('billingOrgSelect');
      if (sel && preselect) sel.value = preselect;
      if (preselect) {
        await loadBillingTab(preselect);
      } else {
        showBillingOrgList();
      }
    }
    const hashPaid = (window.location.hash || '').includes('paid=1');
    if (hashPaid) {
      setTimeout(() => alert('Thanh toán thành công! Gói đã được kích hoạt/gia hạn.'), 300);
      history.replaceState(history.state, '', dashboardTabHref('billing'));
    }
  }
  if (tab === 'plans') {
    if (currentUser?.role !== 'SUPER_ADMIN' && currentUser?.role !== 'FINANCE_ADMIN') {
      alert('Chỉ Quản trị hệ thống hoặc Quản trị tài chính được quản lý danh mục gói.');
      await switchTab('billing', { skipHistory: true });
      return;
    }
    await loadPlansTab();
  }
  if (tab === 'analytics') {
    if (currentUser?.role !== 'SUPER_ADMIN') {
      await switchTab(currentUser?.role === 'ORG_ADMIN' ? 'billing' : 'buildings', { skipHistory: true });
      return;
    }
    const intro = document.getElementById('analyticsIntro');
    if (intro) {
      intro.textContent =
        'Doanh thu nền tảng (tiền tổ chức trả cho hệ thống), hoạt động đăng nhập/xuất bản, phân bố gói và cảnh báo vận hành.';
    }
    await loadAnalyticsTab();
  }
  if (tab === 'finance') {
    if (currentUser?.role !== 'SUPER_ADMIN' && currentUser?.role !== 'FINANCE_ADMIN') {
      alert('Chỉ Quản trị hệ thống hoặc Quản trị tài chính được xem tab Thu – Chi.');
      await switchTab('buildings', { skipHistory: true });
      return;
    }
    if (opts.financeSub) switchFinanceSubtab(opts.financeSub);
    else initFinanceSubtab();
    await loadFinanceTab();
    syncDashboardNavActive('finance', { financeSub: window._activeFinanceNavSub });
    if (typeof window.AdminShell?.syncActiveNavigation === 'function') {
      window.AdminShell.syncActiveNavigation();
    }
  }
  if (tab === 'website') {
    if (currentUser?.role !== 'SUPER_ADMIN') {
      alert('Chỉ Quản trị hệ thống được quản lý Website.');
      await switchTab('overview', { skipHistory: true });
      return;
    }
    if (opts.websiteSub) window._activeWebsiteSub = opts.websiteSub;
    if (typeof WebsiteCms?.load === 'function') {
      await WebsiteCms.load(window._activeWebsiteSub || 'pages');
    }
    syncDashboardNavActive('website', { websiteSub: window._activeWebsiteSub || 'pages' });
    if (typeof window.AdminShell?.syncActiveNavigation === 'function') {
      window.AdminShell.syncActiveNavigation();
    }
  }
}

function resolveNavButtonTab(btn) {
  const dataTab = btn.getAttribute('data-tab');
  if (dataTab) return dataTab;
  const onclick = btn.getAttribute('onclick') || '';
  if (onclick.includes('openFinance')) return 'finance';
  if (onclick.includes('openProfile')) return 'profile';
  if (onclick.includes('openWebsiteSub')) return 'website';
  const m = onclick.match(/switchTab\('([^']+)'\)/);
  return m ? m[1] : '';
}

function syncDashboardNavActive(tab, opts) {
  const options = opts || {};
  let financeSub = options.financeSub || window._activeFinanceNavSub;
  if (!financeSub) {
    try { financeSub = localStorage.getItem('indoorNavFinanceSubtab') || 'overview'; } catch (_) { financeSub = 'overview'; }
  }
  const profileSection = options.profileSection || window._activeProfileSection || 'info';
  const websiteSub = options.websiteSub || window._activeWebsiteSub || 'pages';

  document.querySelectorAll('#tabNav .tab-btn').forEach((btn) => {
    const btnTab = resolveNavButtonTab(btn);
    let active = false;
    if (btnTab === tab) {
      if (tab === 'finance') {
        active = (btn.getAttribute('data-finance-sub') || 'overview') === financeSub;
      } else if (tab === 'profile') {
        active = (btn.getAttribute('data-profile-section') || 'info') === profileSection;
      } else if (tab === 'website') {
        active = (btn.getAttribute('data-website-sub') || 'pages') === websiteSub;
      } else {
        active = true;
      }
    }
    btn.classList.toggle('active', active);
  });
}

async function openFinanceInvoicesNav() {
  window._activeFinanceNavSub = 'invoices';
  await switchTab('finance', { financeSub: 'invoices' });
}

async function openFinanceOverviewNav() {
  window._activeFinanceNavSub = 'overview';
  await switchTab('finance', { financeSub: 'overview' });
}

async function openProfileSectionNav(section) {
  const next = section === 'security' || section === 'sessions' ? section : 'info';
  window._activeProfileSection = next;
  await switchTab('profile', { profileSection: next });
}

function focusProfileSection(section) {
  const map = {
    info: 'profileSectionInfo',
    security: 'profileSectionSecurity',
    sessions: 'profileSectionSessions'
  };
  const id = map[section] || map.info;
  document.querySelectorAll('.profile-section-anchor').forEach((el) => {
    el.classList.toggle('is-nav-target', el.id === id);
  });
  const el = document.getElementById(id);
  if (el && typeof el.scrollIntoView === 'function') {
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  }
}

let _buildingDetailId = sessionStorage.getItem('dashboardBuildingDetailId') || '';
let _buildingDetailCache = null;
let _buildingDetailSubtab = sessionStorage.getItem('dashboardBuildingDetailSubtab') || 'overview';

function getBuildingDetailId() {
  return _buildingDetailId || sessionStorage.getItem('dashboardBuildingDetailId') || '';
}

function setBuildingDetailId(id) {
  _buildingDetailId = id ? String(id) : '';
  if (_buildingDetailId) sessionStorage.setItem('dashboardBuildingDetailId', _buildingDetailId);
  else sessionStorage.removeItem('dashboardBuildingDetailId');
}

function switchBuildingDetailSubtab(name) {
  const allowed = new Set(['overview', 'floors', 'versions', 'qr', 'settings']);
  _buildingDetailSubtab = allowed.has(name) ? name : 'overview';
  sessionStorage.setItem('dashboardBuildingDetailSubtab', _buildingDetailSubtab);
  document.querySelectorAll('.building-detail-subnav-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.buildingSub === _buildingDetailSubtab);
  });
  if (_buildingDetailCache) renderBuildingDetailProfile(_buildingDetailCache);
}

/** Mở tab Chi tiết tòa với đúng buildingId (từ danh sách Tòa nhà). */
async function openBuildingDetail(id) {
  if (!id) {
    switchTab('buildings');
    return;
  }
  setBuildingDetailId(id);
  _buildingDetailCache = null;
  await switchTab('maps');
}

async function refreshBuildingDetail() {
  const body = document.getElementById('buildingDetailBody');
  const titleEl = document.getElementById('buildingDetailTitle');
  const actionsEl = document.getElementById('buildingDetailActions');
  if (!body) return;

  const id = getBuildingDetailId();
  if (!id) {
    if (titleEl) titleEl.textContent = 'Chi tiết tòa nhà';
    if (actionsEl) actionsEl.innerHTML = '';
    const headerStatus = document.getElementById('buildingDetailHeaderStatus');
    const headerAddress = document.getElementById('buildingDetailHeaderAddress');
    const headerMeta = document.getElementById('buildingDetailHeaderMeta');
    if (headerStatus) headerStatus.innerHTML = '';
    if (headerAddress) headerAddress.textContent = '';
    if (headerMeta) headerMeta.innerHTML = '';
    const subnav = document.getElementById('buildingDetailSubnav');
    if (subnav) subnav.hidden = true;
    await renderBuildingDetailPicker(body);
    return;
  }

  body.innerHTML = dashUiLoading('list', { label: 'Đang tải hồ sơ tòa nhà…' });
  if (actionsEl) actionsEl.innerHTML = '';
  if (titleEl) titleEl.textContent = 'Đang tải…';

  try {
    const res = await apiFetch('/buildings/' + encodeURIComponent(id));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      body.innerHTML = dashUiError(data.message || 'Không tải được chi tiết tòa nhà');
      if (titleEl) titleEl.textContent = 'Chi tiết tòa nhà';
      return;
    }
    _buildingDetailCache = data;
    // Đồng bộ cache danh sách nếu đã có
    const idx = allBuildings.findIndex((x) => String(x._id) === String(data._id));
    if (idx >= 0) {
      allBuildings[idx] = { ...allBuildings[idx], ...data };
    }
    renderBuildingDetailProfile(data);
  } catch (e) {
    body.innerHTML = dashUiError(e.message || 'Không tải được chi tiết tòa nhà');
    if (titleEl) titleEl.textContent = 'Chi tiết tòa nhà';
  }
}

/** Alias cũ — tab maps giờ là profile tòa. */
async function refreshMapsHub() {
  return refreshBuildingDetail();
}

async function renderBuildingDetailPicker(body) {
  if (!allBuildings.length) {
    try { await fetchBuildings(); } catch (_) { /* ignore */ }
  }
  const list = Array.isArray(allBuildings) ? allBuildings.slice() : [];
  list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));

  if (!list.length) {
    body.innerHTML = dashUiEmpty({
      title: 'Chưa có tòa nhà',
      hint: 'Tạo tòa nhà ở tab Tòa nhà trước, rồi mở hồ sơ từ đây.'
    });
    return;
  }

  body.innerHTML =
    '<p class="analytics-tab-intro">Chọn tòa nhà để xem hồ sơ chi tiết (mô tả, tổ chức, người quản lý, bản đồ).</p>' +
    '<div class="building-detail-picker">' +
    list.map((b) => {
      const bid = escapeHtml(b._id || b.id || '');
      const name = escapeHtml(b.name || 'Không tên');
      const addr = escapeHtml(b.address || '—');
      const status = escapeHtml(formatBuildingStatusVi(b.status) || b.status || '—');
      return (
        '<button type="button" class="building-detail-picker-item" onclick="openBuildingDetail(\'' + bid + '\')">' +
          '<strong>' + name + '</strong>' +
          '<span>' + addr + '</span>' +
          '<span class="building-detail-picker-meta">' + status + ' · ' + (b.total_floors || 1) + ' tầng</span>' +
        '</button>'
      );
    }).join('') +
    '</div>';
}

function renderBuildingDetailProfile(b) {
  const body = document.getElementById('buildingDetailBody');
  const titleEl = document.getElementById('buildingDetailTitle');
  const actionsEl = document.getElementById('buildingDetailActions');
  if (!body || !b) return;

  const id = String(b._id || '');
  const name = b.name || 'Không tên';
  if (titleEl) titleEl.textContent = name;

  const canEditMeta = canManageBuildingMeta();
  const inactive = b.is_active === false;
  const floors = Number(b.total_floors != null ? b.total_floors : 1) || 1;
  const org = b.organization || null;
  const orgName = (org && org.name) || getOrgName(b.organization_id) || '—';
  const gps = b.gps_location || {};
  const lat = gps.lat != null ? gps.lat : '—';
  const lng = gps.lng != null ? gps.lng : '—';
  const radius = b.activation_radius != null ? b.activation_radius : 50;
  const creator = b.created_by_user;
  const managers = Array.isArray(b.managers) ? b.managers : [];
  const orgAdmins = Array.isArray(b.org_admins) ? b.org_admins : [];
  const summary = b.resource_summary || {};
  const floorRows = Array.isArray(b.floors) ? b.floors : [];
  const versions = Array.isArray(b.versions) ? b.versions : [];
  const qrCodes = Array.isArray(b.qr_codes) ? b.qr_codes : [];
  const activity = Array.isArray(b.recent_activity) ? b.recent_activity : [];

  if (actionsEl) {
    let actions = '';
    if (!inactive && !b.quota_locked) {
      actions += '<button type="button" class="btn-create building-detail-primary-action" onclick="openEditor(\'' + escapeHtml(id) + '\')">Vẽ bản đồ</button>';
      actions += '<button type="button" class="btn-edit" onclick="switchBuildingDetailSubtab(\'versions\')">Phiên bản</button>';
      if (canEditMeta) {
        actions += '<button type="button" class="btn-edit" onclick="openEditBuildingModal(\'' + escapeHtml(id) + '\')">Sửa</button>';
      }
    }
    actions += '<button type="button" class="btn-edit building-detail-icon-action" onclick="refreshBuildingDetail()" title="Làm mới" aria-label="Làm mới">↻</button>';
    actionsEl.innerHTML = actions;
  }

  const statusBadge = inactive
    ? '<span class="resource-status resource-status--inactive">Vô hiệu</span>'
    : (String(b.status).toUpperCase() === 'PUBLISHED'
      ? '<span class="resource-status resource-status--published">Đã xuất bản</span>'
      : '<span class="resource-status resource-status--draft">Bản nháp</span>');
  const headerStatus = document.getElementById('buildingDetailHeaderStatus');
  const headerAddress = document.getElementById('buildingDetailHeaderAddress');
  const headerMeta = document.getElementById('buildingDetailHeaderMeta');
  if (headerStatus) headerStatus.innerHTML = statusBadge;
  if (headerAddress) headerAddress.textContent = b.address || 'Chưa có địa chỉ';
  if (headerMeta) {
    headerMeta.innerHTML =
      '<span>' + escapeHtml(orgName) + '</span>' +
      '<span>ID <code>' + escapeHtml(id) + '</code></span>' +
      '<span>Tạo ' + escapeHtml(formatDateTime(b.createdAt)) + '</span>' +
      '<span>Cập nhật ' + escapeHtml(formatRelativeTime(b.updatedAt)) + '</span>';
  }
  const subnav = document.getElementById('buildingDetailSubnav');
  if (subnav) subnav.hidden = false;
  document.querySelectorAll('.building-detail-subnav-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.buildingSub === _buildingDetailSubtab);
  });

  const lockedNote = b.quota_locked
    ? '<div class="building-detail-banner warn">Tòa đang bị khóa quota — chỉ xem / vô hiệu hóa.</div>'
    : '';

  const peopleRows = (list, emptyText) => {
    if (!list.length) return '<p class="org-detail-empty">' + emptyText + '</p>';
    return '<ul class="building-detail-people">' + list.map((u) =>
      '<li><strong>' + escapeHtml(u.full_name || '—') + '</strong>' +
      '<span>' + escapeHtml(u.email || '') + '</span></li>'
    ).join('') + '</ul>';
  };

  const infoPanel =
    '<section class="resource-panel"><div class="resource-panel-heading"><h4>Thông tin</h4></div>' +
      '<dl class="resource-property-list">' +
        resourceProperty('Tên', name) +
        resourceProperty('Mã tòa', id, true) +
        resourceProperty('Địa chỉ', b.address || '—') +
        resourceProperty('GPS', String(lat) + ', ' + String(lng)) +
        resourceProperty('Bán kính', String(radius) + ' m') +
        resourceProperty('Ngày tạo', formatDateTime(b.createdAt)) +
        resourceProperty('Cập nhật', formatDateTime(b.updatedAt)) +
      '</dl></section>';

  const adminPanel =
    '<section class="resource-panel"><div class="resource-panel-heading"><h4>Quản trị</h4></div>' +
      '<dl class="resource-property-list">' +
        resourceProperty('Tổ chức', orgName) +
        resourceProperty('Quản trị tòa', String(managers.length)) +
        resourceProperty('Người tạo', creator ? (creator.full_name || creator.email || '—') : '—') +
        resourceProperty('Phiên bản', String(summary.version_count || 0)) +
        resourceProperty('Đã xuất bản', String(summary.published_floor_count || 0) + '/' + floors + ' tầng') +
        resourceProperty('Có bản nháp', String(summary.draft_floor_count || 0) + ' tầng') +
        resourceProperty('Khóa hạn mức', b.quota_locked ? 'Đang khóa' : 'Không') +
      '</dl></section>';

  const kpis =
    '<div class="resource-kpi-grid">' +
      resourceKpi('Tầng', summary.total_floors ?? floors, 'Tổng cấu hình') +
      resourceKpi('Bản đồ', summary.map_count ?? 0, (summary.published_floor_count || 0) + ' đã xuất bản') +
      resourceKpi('Mã QR', summary.qr_count ?? 0, (summary.qr_scans_30d || 0) + ' lượt quét / 30 ngày') +
      resourceKpi('Quản trị tòa', summary.building_admin_count ?? managers.length, 'Đang hoạt động') +
      resourceKpi('Xuất bản gần nhất', summary.latest_publish_at ? formatRelativeTime(summary.latest_publish_at) : 'Chưa có', summary.latest_publish_at ? formatDateTime(summary.latest_publish_at) : '—', true) +
    '</div>';

  const overview =
    lockedNote +
    '<p class="building-detail-desc">' + escapeHtml(b.description || 'Chưa có mô tả cho tòa nhà này.') + '</p>' +
    kpis +
    '<div class="resource-two-column">' + infoPanel + adminPanel + '</div>' +
    '<section class="resource-panel resource-panel--table">' +
      '<div class="resource-panel-heading"><h4>Tầng</h4><button type="button" class="linkish" onclick="switchBuildingDetailSubtab(\'floors\')">Xem tất cả</button></div>' +
      renderBuildingFloorsTable(floorRows.slice(0, 6), id, inactive || b.quota_locked) +
    '</section>' +
    '<section class="resource-panel">' +
      '<div class="resource-panel-heading"><h4>Hoạt động gần đây</h4></div>' +
      renderBuildingActivity(activity.slice(0, 8)) +
    '</section>';

  const floorsPanel =
    '<section class="resource-panel resource-panel--table">' +
      '<div class="resource-panel-heading"><div><h4>Quản lý tầng</h4><p>Trạng thái bản đồ, QR và phiên bản của từng tầng.</p></div></div>' +
      renderBuildingFloorsTable(floorRows, id, inactive || b.quota_locked) +
    '</section>';

  const versionsPanel =
    '<section class="resource-panel resource-panel--table">' +
      '<div class="resource-panel-heading"><div><h4>Phiên bản bản đồ</h4><p>' + escapeHtml(String(summary.version_count || 0)) + ' phiên bản đã lưu.</p></div>' +
      '<button type="button" class="btn-edit" onclick="openMapVersionModal(\'' + escapeHtml(id) + '\', ' + floors + ')">Mở công cụ khôi phục</button></div>' +
      renderBuildingVersionsTable(versions) +
    '</section>';

  const qrPanel =
    '<div class="resource-kpi-grid resource-kpi-grid--compact">' +
      resourceKpi('Tổng mã QR', summary.qr_count ?? 0, 'Đang được đồng bộ') +
      resourceKpi('Lượt quét 30 ngày', summary.qr_scans_30d ?? 0, 'Dữ liệu thực tế') +
      resourceKpi('Tầng có mã QR', floorRows.filter((f) => Number(f.qr_count) > 0).length, 'Trên ' + floors + ' tầng') +
    '</div>' +
    '<section class="resource-panel"><div class="resource-panel-heading"><div><h4>Lượt quét mã QR — 30 ngày</h4><p>Xu hướng theo ngày.</p></div></div>' +
      renderBuildingScanBars(b.qr_scan_series_30d) + '</section>' +
    '<section class="resource-panel resource-panel--table"><div class="resource-panel-heading"><h4>Danh sách mã QR</h4></div>' +
      renderBuildingQrTable(qrCodes) + '</section>';

  const settingsPanel =
    '<div class="resource-two-column">' +
      '<section class="resource-panel"><div class="resource-panel-heading"><h4>Cấu hình vị trí</h4></div>' +
        '<dl class="resource-property-list">' +
          resourceProperty('Vĩ độ', String(lat)) +
          resourceProperty('Kinh độ', String(lng)) +
          resourceProperty('Bán kính kích hoạt', String(radius) + ' m') +
          resourceProperty('Hướng Bắc bản đồ', floorRows.length ? 'Thiết lập theo từng tầng' : 'Chưa có bản đồ') +
          resourceProperty('Tỷ lệ thước', floorRows.length ? 'Thiết lập theo từng tầng' : 'Chưa có bản đồ') +
        '</dl></section>' +
      '<section class="resource-panel"><div class="resource-panel-heading"><h4>Quản trị truy cập</h4></div>' +
        '<h5>Quản trị tòa</h5>' + peopleRows(managers, 'Chưa gán quản trị tòa.') +
        '<h5>Quản trị tổ chức</h5>' + peopleRows(orgAdmins, 'Chưa có quản trị tổ chức.') +
      '</section>' +
    '</div>' +
    (canEditMeta
      ? '<section class="resource-panel resource-settings-actions"><div><h4>Chỉnh sửa thông tin tòa</h4><p>Cập nhật mô tả, tọa độ GPS, trạng thái và tổ chức sở hữu.</p></div>' +
        '<button type="button" class="btn-edit" onclick="openEditBuildingModal(\'' + escapeHtml(id) + '\')">Sửa thông tin</button></section>'
      : '');

  const panels = {
    overview,
    floors: floorsPanel,
    versions: versionsPanel,
    qr: qrPanel,
    settings: settingsPanel
  };
  body.innerHTML = panels[_buildingDetailSubtab] || panels.overview;
}

function formatRelativeTime(value) {
  if (!value) return '—';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return 'vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + ' phút trước';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' giờ trước';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + ' ngày trước';
  return formatDateTime(value);
}

function resourceKpi(label, value, hint, isText) {
  return '<article class="resource-kpi">' +
    '<span>' + escapeHtml(label) + '</span>' +
    '<strong' + (isText ? ' class="resource-kpi-text"' : '') + '>' + escapeHtml(String(value)) + '</strong>' +
    '<small>' + escapeHtml(hint || '') + '</small>' +
  '</article>';
}

function resourceProperty(label, value, monospace) {
  return '<div><dt>' + escapeHtml(label) + '</dt><dd' + (monospace ? ' class="resource-monospace"' : '') + '>' +
    escapeHtml(value == null || value === '' ? '—' : String(value)) + '</dd></div>';
}

function renderBuildingFloorsTable(rows, buildingId, readOnly) {
  if (!rows.length) return '<p class="resource-empty">Chưa cấu hình tầng.</p>';
  return '<div class="resource-table-wrap"><table class="resource-table"><thead><tr>' +
    '<th>Tầng</th><th>Trạng thái</th><th>Bản đồ</th><th>Mã QR</th><th>Phiên bản</th><th>Xuất bản gần nhất</th><th>Hướng Bắc</th><th>Tỷ lệ</th><th></th>' +
    '</tr></thead><tbody>' + rows.map((floor) => {
      const state = floor.has_draft
        ? '<span class="resource-status resource-status--draft">Có bản nháp</span>'
        : (floor.is_published
          ? '<span class="resource-status resource-status--published">Đã xuất bản</span>'
          : '<span class="resource-status resource-status--empty">Chưa có</span>');
      return '<tr><td><strong>' + escapeHtml(floor.floor_name || ('Tầng ' + floor.floor_number)) + '</strong>' +
        '<small>#' + escapeHtml(String(floor.floor_number)) + '</small></td>' +
        '<td>' + state + '</td>' +
        '<td>' + (floor.has_map ? '1' : '0') + '</td>' +
        '<td>' + escapeHtml(String(floor.qr_count || 0)) + '</td>' +
        '<td>v' + escapeHtml(String(floor.version || 0)) + ' <small>(' + escapeHtml(String(floor.version_count || 0)) + ' bản lưu)</small></td>' +
        '<td>' + (floor.published_at ? escapeHtml(formatRelativeTime(floor.published_at)) : '—') + '</td>' +
        '<td>' + (floor.map_bearing_offset == null ? '—' : escapeHtml(String(floor.map_bearing_offset)) + '°') + '</td>' +
        '<td>' + (floor.scale_ratio == null ? '—' : escapeHtml(String(floor.scale_ratio))) + '</td>' +
        '<td>' + (readOnly ? '—' : '<button type="button" class="linkish" onclick="openEditor(\'' + escapeHtml(buildingId) + '\')">Chỉnh sửa</button>') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

function renderBuildingVersionsTable(versions) {
  if (!versions.length) return '<p class="resource-empty">Chưa có phiên bản publish.</p>';
  return '<div class="resource-table-wrap"><table class="resource-table"><thead><tr>' +
    '<th>Phiên bản</th><th>Tầng</th><th>Phòng</th><th>Nút đường đi</th><th>Cạnh nối</th><th>Người xuất bản</th><th>Thời gian</th>' +
    '</tr></thead><tbody>' + versions.map((version) => {
      const publisher = version.published_by?.full_name || version.published_by?.email || '—';
      return '<tr><td><strong>v' + escapeHtml(String(version.version || 0)) + '</strong></td>' +
        '<td>' + escapeHtml(String(version.floor_number)) + '</td>' +
        '<td>' + escapeHtml(String(version.rooms_count || 0)) + '</td>' +
        '<td>' + escapeHtml(String(version.nodes_count || 0)) + '</td>' +
        '<td>' + escapeHtml(String(version.edges_count || 0)) + '</td>' +
        '<td>' + escapeHtml(publisher) + '</td>' +
        '<td>' + escapeHtml(formatDateTime(version.published_at)) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

function renderBuildingQrTable(qrCodes) {
  if (!qrCodes.length) return '<p class="resource-empty">Chưa có mã QR.</p>';
  return '<div class="resource-table-wrap"><table class="resource-table"><thead><tr>' +
    '<th>Mã QR</th><th>Nhãn</th><th>Tầng</th><th>Nút gắn</th><th>Ngày tạo</th>' +
    '</tr></thead><tbody>' + qrCodes.map((qr) =>
      '<tr><td><code>' + escapeHtml(qr.qr_code || '—') + '</code></td>' +
      '<td>' + escapeHtml(qr.label || '—') + '</td>' +
      '<td>' + escapeHtml(String(qr.floor_number)) + '</td>' +
      '<td>' + escapeHtml(qr.node_id || '—') + '</td>' +
      '<td>' + escapeHtml(formatDateTime(qr.createdAt)) + '</td></tr>'
    ).join('') + '</tbody></table></div>';
}

function renderBuildingActivity(activity) {
  if (!activity.length) return '<p class="resource-empty">Chưa có hoạt động được ghi nhận cho tòa này.</p>';
  return '<ol class="resource-timeline">' + activity.map((item) => {
    const actor = item.user_id?.full_name || item.user_id?.email || 'Hệ thống';
    const detail = typeof item.details === 'string'
      ? item.details
      : (item.details?.message || item.target || '');
    return '<li><span class="resource-timeline-dot"></span><div><strong>' +
      escapeHtml(formatActionLabel(item.action)) + '</strong><p>' + escapeHtml(detail) +
      '</p><small>' + escapeHtml(actor) + ' · ' + escapeHtml(formatRelativeTime(item.createdAt)) + '</small></div></li>';
  }).join('') + '</ol>';
}

function renderBuildingScanBars(series) {
  const rows = Array.isArray(series) ? series : [];
  const byDate = new Map(rows.map((row) => [row.date, Number(row.count || 0)]));
  const values = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    values.push({ date: key, count: byDate.get(key) || 0 });
  }
  const max = Math.max(1, ...values.map((row) => row.count));
  return '<div class="resource-spark-bars" aria-label="Lượt quét QR 30 ngày">' + values.map((row) =>
    '<span title="' + escapeHtml(row.date + ': ' + row.count + ' lượt') + '" style="height:' +
      Math.max(4, Math.round((row.count / max) * 72)) + 'px"></span>'
  ).join('') + '</div>';
}

window.openBuildingDetail = openBuildingDetail;
window.refreshBuildingDetail = refreshBuildingDetail;
window.refreshMapsHub = refreshMapsHub;
window.switchBuildingDetailSubtab = switchBuildingDetailSubtab;

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
  if (orgId) {
    filtered = filtered.filter((b) => {
      const raw = b.organization_id;
      const buildingOrgId = raw && typeof raw === 'object'
        ? String(raw._id || raw.id || '')
        : String(raw || '');
      return buildingOrgId === String(orgId);
    });
  }
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
  // Luôn dùng kết quả lọc; mảng rỗng = không có tòa khớp (không fallback về allBuildings)
  let list = displayedBuildings.slice();
  const sortState = getBuildingTableSort();
  list = sortBuildingList(list, sortState.key, sortState.dir);
  updateDashSortIndicators('buildingsTable', getBuildingTableSort);
  syncBuildingSortBarFromState();
  const canEditMeta = canManageBuildingMeta();
  const canDelete = canDeleteBuilding();
  if (!list.length) {
    const hasFilter = !!(
      document.getElementById('filterBuildingOrg')?.value ||
      (document.getElementById('filterBuildingKeyword')?.value || '').trim() ||
      document.getElementById('filterBuildingStatus')?.value
    );
    const emptyMsg = hasFilter
      ? 'Không có tòa nhà khớp bộ lọc hiện tại.'
      : (canEditMeta
        ? 'Chưa có tòa nhà nào. Bấm "Thêm Tòa Nhà Mới"!'
        : 'Chưa có tòa nhà nào được gán cho tài khoản của bạn.');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#667085;">' + emptyMsg + '</td></tr>';
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
        actions = '<button type="button" class="btn-edit" onclick="openBuildingDetail(\'' + b._id + '\')" style="margin-right:4px;">Chi tiết</button>' +
          '<button type="button" class="btn-create" onclick="restoreBuilding(\'' + b._id + '\')" style="background:#27ae60;padding:6px 12px;">Khôi phục</button>';
      } else {
        actions = '<button type="button" class="btn-edit" onclick="openBuildingDetail(\'' + b._id + '\')" style="margin-right:4px;">Chi tiết</button>' +
          '<span style="color:#888;font-size:12px;">Đã vô hiệu</span>';
      }
    } else if (b.quota_locked) {
      actions = '<button type="button" class="btn-edit" onclick="openBuildingDetail(\'' + b._id + '\')" style="margin-right:4px;">Chi tiết</button>' +
        '<span style="color:#c0392b;font-size:12px;">🔒 Bị khóa — chỉ xem / vô hiệu hóa</span>';
      if (canDelete) {
        actions += ' <button class="btn-logout" onclick="deleteBuilding(\'' + b._id + '\')" style="background:#e74c3c;padding:6px 12px;margin-left:6px;">Vô hiệu</button>';
      }
    } else {
      actions = '<button class="btn-edit" onclick="openBuildingDetail(\'' + b._id + '\')" style="margin-right:4px;" title="Xem hồ sơ chi tiết tòa nhà">Chi tiết</button>' +
        '<button class="btn-edit" onclick="openEditor(\'' + b._id + '\')" style="margin-right:4px;" title="Mở trình soạn bản đồ tầng">Vẽ bản đồ</button>' +
        '<button class="btn-edit" onclick="openMapVersionModal(\'' + b._id + '\', ' + (b.total_floors || 1) + ')" style="background:#8e44ad;color:white;margin-right:4px;" title="Xem lịch sử phiên bản bản đồ / khôi phục">Phiên bản</button>';
      if (canEditMeta) {
        actions += '<button class="btn-edit" onclick="openEditBuildingModal(\'' + b._id + '\')" style="background:#f39c12;color:white;margin-right:4px;" title="Sửa thông tin tòa nhà">Sửa</button>';
      }
      if (canDelete) {
        actions += '<button class="btn-logout" onclick="deleteBuilding(\'' + b._id + '\')" style="background:#e74c3c;padding:6px 12px;" title="Vô hiệu hóa tòa nhà (soft delete)">Xóa</button>';
      }
    }
    return '<tr' + rowStyle + '>' +
      tdEllipsis(b.name, '<a href="#" class="building-name-link" onclick="event.preventDefault();openBuildingDetail(\'' + b._id + '\')"><strong>' + escapeHtml(b.name) + '</strong></a>' + inactiveBadge + lockedBadge + desc) +
      tdEllipsis(b.address || '-') +
      '<td style="text-align:center;">' + (b.total_floors || 1) + '</td>' +
      '<td><span class="badge">' + escapeHtml(formatBuildingStatusVi(b.status)) + '</span></td>' +
      '<td class="bcol-org" title="' + escapeHtml(getOrgName(b.organization_id) || '') + '"><span class="cell-ellipsis">' + escapeHtml(getOrgName(b.organization_id) || '-') + '</span></td>' +
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
    if (!el) return;
    const prev = el.value;
    el.innerHTML = filterOpts;
    if (prev && [...el.options].some((opt) => opt.value === prev)) el.value = prev;
  });
  // Giữ bộ lọc tòa nhà sau khi dropdown tổ chức được dựng lại
  if (allBuildings.length) applyBuildingFilters(false);

  const addSelect = document.getElementById('addBuildingOrganizationId');
  if (addSelect) {
    addSelect.innerHTML = '<option value="">Chọn tổ chức...</option>' +
      allOrganizations.map(org =>
        '<option value="' + org._id + '">' + escapeHtml(org.name) + ' (' + escapeHtml(org.slug) + ')</option>'
      ).join('');
  }

  const editSelect = document.getElementById('editBuildingOrganizationId');
  if (editSelect) {
    editSelect.innerHTML = '<option value="">Chọn tổ chức...</option>' +
      allOrganizations.map(org =>
        '<option value="' + org._id + '">' + escapeHtml(org.name) + ' (' + escapeHtml(org.slug) + ')</option>'
      ).join('');
  }

  const createUserOrgSelect = document.getElementById('createUserOrganizationId');
  if (createUserOrgSelect) {
    createUserOrgSelect.innerHTML = '<option value="">Chọn tổ chức...</option>' +
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
  billingSel.innerHTML = '<option value="">— Xem danh sách —</option>' +
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
  const paidByPlan = {};
  list.forEach((o) => {
    const p = String(o.plan || 'FREE').toUpperCase();
    if (!isPaidPlanUi(p)) return;
    paidByPlan[p] = (paidByPlan[p] || 0) + 1;
  });
  const paidTotal = Object.values(paidByPlan).reduce((s, n) => s + n, 0);
  const paidSub = Object.keys(paidByPlan).length
    ? Object.keys(paidByPlan).map((k) => k + ': ' + paidByPlan[k]).join(' · ')
    : 'Chưa có org trả phí';

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
    card('Gói trả phí', paidTotal, paidSub, 'gray', false);
}

// ============================================================
// AD15 — Overview Dashboard (widget bundle + date filter)
let platformStatsCache = null;
let overviewDashboardCache = null;
let overviewLoadAbort = null;

function buildOverviewCard(label, value, sub, accent, clickable, onClick, opts) {
  const o = opts || {};
  let cls = 'org-overview-card accent-' + accent;
  if (clickable) cls += ' is-clickable';
  if (o.alert) cls += ' card-needs-attention';
  if (o.miniHtml) cls += ' has-kpi-mini kpi-mini-' + escapeHtml(o.miniType || 'default');
  if (o.className) cls += ' ' + escapeHtml(o.className);
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
  let deltaHtml = '';
  if (o.delta && o.delta.pct != null) {
    const pct = Number(o.delta.pct) || 0;
    const dir = pct > 0 ? 'up' : (pct < 0 ? 'down' : 'flat');
    const sign = pct > 0 ? '+' : '';
    deltaHtml = '<div class="ov-delta ov-delta-' + dir + '">' + sign + pct + '%</div>';
  }
  let miniHtml = o.miniHtml || '';
  if (!miniHtml && Array.isArray(o.sparkline) && o.sparkline.length > 1) {
    miniHtml = buildOverviewAreaSparkline(o.sparkline, accent);
  }
  return '<div class="' + cls + '"' + click + ' role="button" tabindex="' + (clickable ? '0' : '-1') + '">' +
    '<div class="ov-label-row">' +
    '<div class="ov-label">' + escapeHtml(label) + '</div>' + badge +
    '</div>' +
    '<div class="ov-card-main">' +
      '<div class="ov-card-copy">' +
        '<div class="ov-value-row">' +
          '<div class="ov-value">' + escapeHtml(String(value)) + '</div>' +
        '</div>' +
        (sub ? '<div class="ov-sub">' + escapeHtml(sub) + '</div>' : '') +
      '</div>' +
      '<div class="ov-card-visual">' +
        deltaHtml +
        miniHtml +
      '</div>' +
    '</div>' +
    progressHtml +
    '</div>';
}

function overviewMiniChartPoints(values, width, height) {
  const nums = values.map((v) => Number(v) || 0);
  const max = Math.max.apply(null, nums.concat([1]));
  const min = Math.min.apply(null, nums);
  const span = Math.max(1, max - min);
  return nums.map((v, i) => {
    const x = nums.length <= 1 ? 0 : (i / (nums.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
}

function buildOverviewAreaSparkline(values, accent) {
  const nums = (values || []).map((v) => Number(v) || 0);
  if (nums.length < 2) nums.push(nums[0] || 0);
  const w = 104;
  const h = 48;
  const pts = overviewMiniChartPoints(nums, w, h);
  const area = '0,' + h + ' ' + pts + ' ' + w + ',' + h;
  return '<svg class="ov-mini-chart ov-mini-area accent-' + escapeHtml(accent || 'blue') +
    '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
    '<polygon class="ov-mini-area-fill" points="' + area + '"></polygon>' +
    '<polyline class="ov-mini-area-line" fill="none" points="' + pts + '"></polyline>' +
    '</svg>';
}

function buildOverviewStackedBar(items) {
  const rows = (items || []).map((item) => ({
    label: item.label,
    value: Math.max(0, Number(item.value) || 0),
    cls: item.cls || 'blue'
  }));
  const total = rows.reduce((sum, item) => sum + item.value, 0) || 1;
  return '<div class="ov-mini-stacked" aria-hidden="true">' +
    '<div class="ov-mini-stacked-bar">' +
      rows.map((item) => '<span class="is-' + escapeHtml(item.cls) +
        '" style="width:' + ((item.value / total) * 100).toFixed(1) + '%"></span>').join('') +
    '</div>' +
    '<div class="ov-mini-stacked-legend">' +
      rows.map((item) => '<span><i class="is-' + escapeHtml(item.cls) + '"></i>' +
        escapeHtml(String(item.value)) + ' ' + escapeHtml(item.label) + '</span>').join('') +
    '</div>' +
    '</div>';
}

function buildOverviewDonut(published, total) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safePublished = Math.min(safeTotal, Math.max(0, Number(published) || 0));
  const pct = safeTotal > 0 ? Math.round((safePublished / safeTotal) * 100) : 0;
  return '<div class="ov-mini-donut" style="--kpi-pct:' + pct + '%" aria-hidden="true">' +
    '<span>' + pct + '%</span></div>';
}

function buildOverviewProgressRing(value, max) {
  const safeMax = Math.max(0, Number(max) || 0);
  const safeValue = Math.min(safeMax, Math.max(0, Number(value) || 0));
  const pct = safeMax > 0 ? Math.round((safeValue / safeMax) * 100) : 0;
  return '<div class="ov-mini-progress-ring" style="--kpi-pct:' + pct + '%" aria-hidden="true">' +
    '<span>' + pct + '%</span><small>' + safeValue + '/' + safeMax + '</small></div>';
}

function buildOverviewMapStats(draftMaps, versionCount) {
  return '<div class="ov-mini-map-stats" aria-hidden="true">' +
    '<span><strong>' + (Math.max(0, Number(draftMaps) || 0)) + '</strong> bản nháp</span>' +
    '<span><strong>' + (Math.max(0, Number(versionCount) || 0)) + '</strong> phiên bản</span>' +
  '</div>';
}

function buildOverviewStatusGauge(value) {
  const count = Math.max(0, Number(value) || 0);
  const pct = Math.min(100, count * 10);
  return '<div class="ov-mini-gauge" aria-hidden="true">' +
    '<div class="ov-mini-gauge-track"><span style="width:' + pct + '%"></span></div>' +
    '<strong>' + count + '</strong><small>Pending</small></div>';
}

async function fetchPlatformStats() {
  try {
    const res = await apiFetch('/platform/stats');
    if (!res.ok) return;
    platformStatsCache = await res.json();
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

function getOverviewRange() {
  return document.getElementById('overviewRangeSelect')?.value || '30d';
}

function getSubscriptionRange() {
  return document.getElementById('subscriptionRangeSelect')?.value || '30d';
}

function syncOverviewCustomRangeUi() {
  const wrap = document.getElementById('overviewCustomRange');
  const range = getOverviewRange();
  if (wrap) wrap.hidden = range !== 'custom';
  if (range === 'custom') {
    const toEl = document.getElementById('overviewToDate');
    const fromEl = document.getElementById('overviewFromDate');
    if (toEl && !toEl.value) toEl.value = new Date().toISOString().slice(0, 10);
    if (fromEl && !fromEl.value) {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      fromEl.value = d.toISOString().slice(0, 10);
    }
  }
}

function onOverviewRangeChange() {
  syncOverviewCustomRangeUi();
  // Không đồng bộ sang subscriptionRange — tránh kéo theo «Tổng quan gói đăng ký»
  if (getOverviewRange() === 'custom') return;
  loadOverviewDashboard({ force: true });
}

function applyOverviewCustomRange() {
  const sel = document.getElementById('overviewRangeSelect');
  if (sel) sel.value = 'custom';
  syncOverviewCustomRangeUi();
  loadOverviewDashboard({ force: true });
}

function syncSubscriptionRangeUi() {
  const range = getSubscriptionRange();
  const select = document.getElementById('subscriptionRangeSelect');
  const custom = document.getElementById('subscriptionCustomRange');
  if (select) select.value = range;
  if (custom) custom.hidden = range !== 'custom';
  document.querySelectorAll('[data-sub-range]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-sub-range') === range);
  });
  if (range === 'custom') {
    const from = document.getElementById('subscriptionFromDate');
    const to = document.getElementById('subscriptionToDate');
    if (from && !from.value) {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      from.value = d.toISOString().slice(0, 10);
    }
    if (to && !to.value) to.value = new Date().toISOString().slice(0, 10);
  }
}

function setOverviewSubscriptionRange(range) {
  const next = ['today', '7d', '30d', '90d', 'month', 'year', 'custom'].includes(range)
    ? range
    : '30d';
  const subscriptionSelect = document.getElementById('subscriptionRangeSelect');
  if (subscriptionSelect) subscriptionSelect.value = next;
  syncSubscriptionRangeUi();
  if (next !== 'custom') loadOverviewDashboard({ force: true });
}

function onSubscriptionRangeSelect() {
  setOverviewSubscriptionRange(document.getElementById('subscriptionRangeSelect')?.value || '30d');
}

function applySubscriptionCustomRange() {
  const from = document.getElementById('subscriptionFromDate')?.value || '';
  const to = document.getElementById('subscriptionToDate')?.value || '';
  if (!from || !to || from > to) {
    if (typeof showToast === 'function') showToast('Vui lòng chọn khoảng ngày hợp lệ.', 'warning');
    return;
  }
  const subscriptionSelect = document.getElementById('subscriptionRangeSelect');
  if (subscriptionSelect) subscriptionSelect.value = 'custom';
  syncSubscriptionRangeUi();
  loadOverviewDashboard({ force: true });
}

function setOverviewDashboardSection(section) {
  const next = ['priority', 'operations', 'system'].includes(section) ? section : 'priority';
  window._overviewDashboardSection = next;
  const grid = document.querySelector('.overview-widget-grid');
  if (grid) grid.setAttribute('data-active-section', next);
  document.querySelectorAll('[data-overview-section]').forEach((element) => {
    if (element.getAttribute('data-overview-force-hidden') === '1') {
      element.hidden = true;
      return;
    }
    const sections = String(element.getAttribute('data-overview-section') || '').split(/\s+/);
    element.hidden = !sections.includes(next);
  });
  document.querySelectorAll('[data-overview-section-btn]').forEach((button) => {
    const active = button.getAttribute('data-overview-section-btn') === next;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function buildOverviewQuery() {
  const range = getOverviewRange();
  let q = '/overview/dashboard?range=' + encodeURIComponent(range);
  if (range === 'custom') {
    const from = document.getElementById('overviewFromDate')?.value || '';
    const to = document.getElementById('overviewToDate')?.value || '';
    if (from) q += '&from=' + encodeURIComponent(from);
    if (to) q += '&to=' + encodeURIComponent(to);
  }
  const subRange = getSubscriptionRange();
  q += '&subscription_range=' + encodeURIComponent(subRange);
  if (subRange === 'custom') {
    const sf = document.getElementById('subscriptionFromDate')?.value || '';
    const st = document.getElementById('subscriptionToDate')?.value || '';
    if (sf) q += '&subscription_from=' + encodeURIComponent(sf);
    if (st) q += '&subscription_to=' + encodeURIComponent(st);
  }
  return q;
}

function setOverviewRevExpPeriod(period) {
  const next = ['today', 'weekly', 'monthly'].includes(period) ? period : 'weekly';
  window._overviewRevExpPeriod = next;
  document.querySelectorAll('.overview-period-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-revexp-period') === next);
  });
  if (window._overviewRevExpData) {
    renderOverviewRevExpWidget(window._overviewRevExpData, next);
  }
}

function renderOverviewRevExpWidget(d, period) {
  const p = period || window._overviewRevExpPeriod || d.default_period || 'weekly';
  const block = (d.periods && d.periods[p]) || null;
  const series = (block && block.series) || [];
  const summary = (block && block.summary) || {
    revenue: d.revenue || 0,
    expense: d.expense || 0,
    profit: d.profit || 0,
    total: (d.revenue || 0) + (d.expense || 0)
  };
  const total = Number(summary.total) || 0;
  const rev = Number(summary.revenue) || 0;
  const exp = Number(summary.expense) || 0;
  const revPct = total > 0 ? Math.round((rev / total) * 100) : 0;
  const maxBar = Math.max(1, ...series.map((r) => Math.max(Number(r.revenue) || 0, Number(r.expense) || 0)));

  const donut = '<svg class="overview-revexp-donut" viewBox="0 0 36 36" aria-hidden="true">' +
    '<circle class="overview-revexp-donut-bg" cx="18" cy="18" r="15.9"></circle>' +
    '<circle class="overview-revexp-donut-rev" cx="18" cy="18" r="15.9" ' +
      'stroke-dasharray="' + revPct + ' ' + (100 - revPct) + '" stroke-dashoffset="25"></circle>' +
    '</svg>';

  const bars = !series.length
    ? '<p class="analytics-muted">Chưa có dữ liệu trong kỳ này.</p>'
    : '<div class="overview-revexp-bars" role="img" aria-label="Biểu đồ thu chi">' +
      series.map((r) => {
        const rv = Number(r.revenue) || 0;
        const ev = Number(r.expense) || 0;
        const rh = Math.round((rv / maxBar) * 100);
        const eh = Math.round((ev / maxBar) * 100);
        return '<div class="overview-revexp-col" title="' + escapeHtml((r.label || '') + ': thu ' + overviewMoney(rv) + ' · chi ' + overviewMoney(ev)) + '">' +
          '<div class="overview-revexp-pair">' +
            '<span class="overview-revexp-bar is-rev" style="height:' + rh + '%"></span>' +
            '<span class="overview-revexp-bar is-exp" style="height:' + eh + '%"></span>' +
          '</div>' +
          '<span class="overview-revexp-xlabel">' + escapeHtml(r.label || '') + '</span>' +
        '</div>';
      }).join('') +
      '</div>';

  document.querySelectorAll('.overview-period-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-revexp-period') === p);
  });

  setOverviewWidgetState('revenue_expense', 'ready',
    '<div class="overview-revexp-stats">' +
      '<div class="overview-revexp-total">' +
        donut +
        '<div><span>Tổng thu+chi</span><strong>' + escapeHtml(overviewMoney(total)) + '</strong></div>' +
      '</div>' +
      '<div class="overview-revexp-legend">' +
        '<div class="is-rev"><i></i><span>Thu</span><strong>' + escapeHtml(overviewMoney(rev)) + '</strong></div>' +
        '<div class="is-exp"><i></i><span>Chi</span><strong>' + escapeHtml(overviewMoney(exp)) + '</strong></div>' +
      '</div>' +
    '</div>' +
    bars +
    '<div class="overview-revexp-footer">' +
      '<span class="analytics-muted">Lợi nhuận: <strong>' + escapeHtml(overviewMoney(summary.profit || 0)) + '</strong></span>' +
      '<button type="button" class="btn-edit overview-deep-link" onclick="switchTab(\'finance\')">Mở Thu – Chi</button>' +
    '</div>'
  );
}

function setOverviewWidgetState(id, state, html) {
  const body = document.getElementById('ov-body-' + id);
  const card = document.getElementById('ov-w-' + id);
  if (card) {
    card.setAttribute('data-ov-state', state || 'ready');
    card.classList.toggle('is-error', state === 'error');
    card.classList.toggle('is-empty', state === 'empty' || state === 'unavailable');
  }
  if (body != null && html != null) body.innerHTML = html;
}

function overviewWidgetLoading(id, label) {
  setOverviewWidgetState(id, 'loading', dashUiLoading('chart', { label: label || 'Đang tải…' }));
}

function overviewWidgetError(id, message) {
  setOverviewWidgetState(id, 'error', dashUiError(message || 'Không tải được widget'));
}

function overviewWidgetUnavailable(id, message) {
  setOverviewWidgetState(id, 'unavailable', dashUiEmpty({
    icon: 'chart',
    title: 'Chưa sẵn sàng',
    hint: message || 'Widget chưa có dữ liệu.'
  }));
}

function overviewWidgetEmpty(id, title, hint) {
  setOverviewWidgetState(id, 'empty', dashUiEmpty({
    icon: 'inbox',
    title: title || 'Trống',
    hint: hint || ''
  }));
}

async function refreshOverviewDashboard() {
  await Promise.all([
    loadOverviewDashboard({ force: true }),
    fetchPlatformStats()
  ]);
}

function renderOverviewDashboardEmpty() {
  const kpi = document.getElementById('overviewKpiCards');
  if (kpi) {
    kpi.innerHTML = dashUiEmpty({
      icon: 'chart',
      title: 'Chưa có số liệu tổng quan',
      hint: 'Thử bấm Làm mới hoặc kiểm tra quyền tài khoản.'
    });
  }
  ['org_growth', 'revenue_expense', 'navigation_activity', 'map_publish', 'subscription',
    'top_organizations', 'billing_care', 'system_health', 'recent_activities', 'recent_alerts', 'contact_crm'].forEach((id) => {
    overviewWidgetEmpty(id, 'Chưa có dữ liệu', '');
  });
  const tasks = document.getElementById('overviewTasks');
  if (tasks) tasks.innerHTML = '';
}

function buildOverviewDistBars(items) {
  const rows = (items || []).filter((x) => x && Number(x.value) >= 0);
  if (!rows.length) {
    return '<p class="analytics-muted">Chưa có dữ liệu để vẽ biểu đồ.</p>';
  }
  const max = Math.max.apply(null, rows.map((x) => Number(x.value) || 0).concat([1]));
  return '<div class="overview-dist-list">' + rows.map((item) => {
    const value = Number(item.value) || 0;
    const pct = Math.round((value / max) * 100);
    const click = item.onClick
      ? ' role="button" tabindex="0" onclick="' + item.onClick + '"'
      : '';
    const cls = 'overview-dist-row' + (item.onClick ? ' is-clickable' : '');
    return (
      '<div class="' + cls + '"' + click + '>' +
        '<div class="overview-dist-meta">' +
          '<span>' + escapeHtml(item.label || '') + '</span>' +
          '<strong>' + escapeHtml(String(value)) + '</strong>' +
        '</div>' +
        '<div class="overview-dist-track">' +
          '<span class="overview-dist-fill accent-' + escapeHtml(item.accent || 'blue') +
          '" style="width:' + pct + '%"></span>' +
        '</div>' +
      '</div>'
    );
  }).join('') + '</div>';
}

function buildOverviewDonutChart(items, opts) {
  const options = opts || {};
  const rows = (items || []).filter((item) => item && Number(item.value) >= 0);
  const total = rows.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  if (!rows.length || total <= 0) {
    return '<p class="analytics-muted">Chưa có dữ liệu để vẽ biểu đồ.</p>';
  }
  const centerValue = options.centerValue != null ? options.centerValue : total;
  const centerLabel = options.centerLabel || 'Tổng';
  const colors = {
    green: '#12b76a', orange: '#f79009', red: '#f04438',
    blue: '#2e90fa', purple: '#7a5af8', gray: '#98a2b3'
  };
  let cursor = 0;
  const stops = rows.map((item) => {
    const start = cursor;
    cursor += ((Number(item.value) || 0) / total) * 100;
    return (colors[item.accent] || colors.blue) + ' ' + start.toFixed(2) + '% ' + cursor.toFixed(2) + '%';
  }).join(', ');
  const legend = rows.map((item) => {
    const value = Number(item.value) || 0;
    const share = total > 0 ? Math.round((value / total) * 100) : 0;
    const click = item.onClick
      ? ' role="button" tabindex="0" onclick="' + item.onClick + '"'
      : '';
    return '<div class="overview-donut-legend-row' + (item.onClick ? ' is-clickable' : '') + '"' + click + '>' +
      '<i class="accent-' + escapeHtml(item.accent || 'blue') + '"></i>' +
      '<span>' + escapeHtml(item.label || '') + '</span>' +
      '<strong>' + escapeHtml(String(value)) + '</strong>' +
      '<small>' + share + '%</small>' +
    '</div>';
  }).join('');
  const note = options.note
    ? '<p class="overview-donut-note">' + escapeHtml(options.note) + '</p>'
    : '';
  return '<div class="overview-donut-layout">' +
    '<div class="overview-donut" style="background:conic-gradient(' + stops + ')"' +
      ' role="img" aria-label="' + escapeHtml(centerLabel) + ' ' + centerValue + '">' +
      '<div class="overview-donut-center"><strong>' + escapeHtml(String(centerValue)) +
        '</strong><span>' + escapeHtml(centerLabel) + '</span></div>' +
    '</div>' +
    '<div class="overview-donut-legend">' + legend + '</div>' +
  '</div>' + note;
}
function getOverviewPlanMeta(data) {
  const accents = ['gray', 'blue', 'purple', 'green', 'orange', 'teal'];
  const reserved = new Set(['active', 'grace', 'expired', 'deltas', 'series', 'newSubscriptions', 'newByPlan', 'upgrades', 'revenue', 'revenueTotal', 'kpi', 'planKeys']);
  const fromData = Object.keys(data || {}).filter((key) => {
    if (reserved.has(key)) return false;
    const value = data[key];
    return typeof value === 'number' || (value != null && typeof value !== 'object');
  });
  const fromCatalog = (planCatalogList || []).map((p) => String(p.code || '').toUpperCase()).filter(Boolean);
  const keys = Array.from(new Set(['FREE', 'PRO', 'ENTERPRISE', ...fromCatalog, ...fromData]));
  return keys.map((key, index) => ({
    key,
    label: formatPlanNameVi(key),
    accent: accents[index % accents.length],
    onClick: key === 'FREE'
      ? "platformJumpOrganizations('')"
      : "platformJumpOrgPlan('" + key + "')"
  }));
}

function buildOverviewSubscriptionTable(data) {
  const source = data || {};
  const series = source.series || {};
  const active = source.active || {};
  const grace = source.grace || {};
  const expired = source.expired || {};
  const newByPlan = source.newByPlan || {};
  const revenue = source.revenue || {};
  const plans = getOverviewPlanMeta(source).filter((plan) => {
    const value = Number(source[plan.key]) || 0;
    const rev = Number(revenue[plan.key]) || 0;
    const neu = Number(newByPlan[plan.key]) || 0;
    return value > 0 || rev > 0 || neu > 0 || ['FREE', 'PRO', 'ENTERPRISE'].includes(plan.key);
  });
  const hasHealth = source.active != null || source.grace != null || source.expired != null;
  const total = plans.reduce((sum, plan) => sum + (Number(source[plan.key]) || 0), 0);
  const trendHtml = (delta) => {
    const trendClass = delta > 0 ? 'is-up' : (delta < 0 ? 'is-down' : 'is-flat');
    const trendIcon = delta > 0 ? '↗' : (delta < 0 ? '↘' : '→');
    const trendValue = (delta > 0 ? '+' : '') + delta;
    return '<span class="overview-subscription-trend ' + trendClass + '">' +
      trendIcon + ' ' + escapeHtml(String(trendValue)) + '</span>';
  };
  const healthFor = (planKey, value) => {
    if (!hasHealth) {
      return { healthy: value, graceCount: 0, expiredCount: 0, pct: value > 0 ? 100 : 0, note: 'Chưa có dữ liệu trạng thái' };
    }
    const activeCount = Math.max(0, Number(active[planKey]) || 0);
    const graceCount = Math.max(0, Number(grace[planKey]) || 0);
    const expiredCount = Math.max(0, Number(expired[planKey]) || 0);
    const healthy = Math.min(value, activeCount + graceCount);
    const pct = value > 0 ? Math.round((healthy / value) * 100) : 0;
    let note = healthy + '/' + value + ' hiệu lực';
    if (graceCount > 0) note += ' · ' + graceCount + ' ân hạn';
    if (expiredCount > 0) note += ' · ' + expiredCount + ' hết hạn';
    return { healthy, graceCount, expiredCount, pct, note };
  };

  const body = plans.map((plan) => {
    const value = Number(source[plan.key]) || 0;
    const newCount = Number(newByPlan[plan.key]) || 0;
    const health = healthFor(plan.key, value);
    const values = (series[plan.key] || []).map((row) => Number(row.count) || 0);
    const sparkValues = values.length ? values : [value, value];
    return '<tr class="overview-subscription-row" role="button" tabindex="0"' +
      ' onclick="' + plan.onClick + '" onkeydown="if(event.key===\'Enter\'){' + plan.onClick + '}">' +
      '<td><span class="overview-plan-badge accent-' + plan.accent + '">' +
        escapeHtml(plan.label) + '</span></td>' +
      '<td><strong class="overview-plan-count">' + escapeHtml(String(value)) + '</strong></td>' +
      '<td><div class="overview-plan-trend">' + trendHtml(newCount) +
        '<span class="overview-plan-spark">' + buildOverviewAreaSparkline(sparkValues, plan.accent) + '</span>' +
      '</div></td>' +
      '<td><strong class="overview-plan-revenue">' +
        escapeHtml(overviewMoney(Number(revenue[plan.key]) || 0)) + 'đ</strong></td>' +
      '<td><div class="overview-plan-health-meta"><span>' + escapeHtml(health.note) + '</span>' +
        '<strong>' + health.pct + '%</strong></div>' +
        '<div class="overview-plan-health-track"><i class="accent-' + plan.accent +
          '" style="width:' + health.pct + '%"></i></div></td>' +
    '</tr>';
  }).join('');

  const totalHealth = plans.reduce((acc, plan) => {
    const value = Number(source[plan.key]) || 0;
    const health = healthFor(plan.key, value);
    acc.healthy += health.healthy;
    acc.grace += health.graceCount;
    acc.expired += health.expiredCount;
    return acc;
  }, { healthy: 0, grace: 0, expired: 0 });
  const overallPct = total > 0 ? Math.round((totalHealth.healthy / total) * 100) : 0;
  let totalNote = totalHealth.healthy + '/' + total + ' hiệu lực';
  if (totalHealth.grace > 0) totalNote += ' · ' + totalHealth.grace + ' ân hạn';
  if (totalHealth.expired > 0) totalNote += ' · ' + totalHealth.expired + ' hết hạn';
  const totalNew = plans.reduce((sum, plan) => sum + (Number(newByPlan[plan.key]) || 0), 0);
  const totalRevenue = plans.reduce((sum, plan) => sum + (Number(revenue[plan.key]) || 0), 0);

  return '<div class="overview-subscription-table-wrap">' +
    '<table class="overview-subscription-table">' +
      '<thead><tr><th>Gói đăng ký</th><th>Hiện tại</th><th>Mới trong kỳ</th><th>Doanh thu</th><th>Hiệu lực</th></tr></thead>' +
      '<tbody>' + body + '</tbody>' +
      '<tfoot><tr><td><strong>Tổng</strong></td><td><strong class="overview-plan-count">' + total + '</strong></td>' +
        '<td>' + trendHtml(totalNew) + '<small> phát sinh</small></td>' +
        '<td><strong class="overview-plan-revenue">' + escapeHtml(overviewMoney(totalRevenue)) + 'đ</strong></td>' +
        '<td><div class="overview-plan-health-meta"><span>' + escapeHtml(totalNote) + '</span>' +
          '<strong>' + overallPct + '%</strong></div>' +
          '<div class="overview-plan-health-track"><i class="accent-green" style="width:' + overallPct + '%"></i></div></td>' +
      '</tr></tfoot>' +
    '</table>' +
  '</div>';
}

const OVERVIEW_RANGE_LABELS = {
  today: 'Hôm nay',
  '7d': '7 ngày gần nhất',
  '30d': '30 ngày gần nhất',
  '90d': '90 ngày gần nhất',
  month: 'Tháng này',
  year: 'Năm nay',
  custom: 'Khoảng tùy chọn'
};

function formatPeriodRangeLabel(period, rangeKey, days, withName) {
  if (!period?.from || !period?.to) return 'Theo khoảng thời gian đã chọn';
  const from = String(period.from).split('-').reverse().join('/');
  const to = String(period.to).split('-').reverse().join('/');
  const name = withName && OVERVIEW_RANGE_LABELS[rangeKey]
    ? OVERVIEW_RANGE_LABELS[rangeKey]
    : '';
  if (rangeKey === 'today' || (period.from && period.from === period.to)) {
    return (name ? name + ' · ' : '') + from;
  }
  const daysPart = days ? ' · ' + days + ' ngày' : '';
  return (name ? name + ': ' : '') + from + ' → ' + to + daysPart;
}

function formatOverviewPeriodLabel(withName) {
  const meta = overviewDashboardCache || {};
  return formatPeriodRangeLabel(meta.period, meta.range, meta.days, withName);
}

function formatSubscriptionPeriodLabel(withName) {
  const meta = overviewDashboardCache || {};
  const period = meta.subscription_period || meta.period || {};
  const rangeKey = meta.subscription_range || meta.range;
  const days = meta.subscription_days || meta.days;
  return formatPeriodRangeLabel(period, rangeKey, days, withName);
}

function renderOverviewRangeSummary() {
  const el = document.getElementById('overviewRangeSummary');
  if (!el) return;
  if (!overviewDashboardCache?.period?.from) {
    el.textContent = '';
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = 'Đang xem ' + formatOverviewPeriodLabel(true);
}

function renderOverviewSubscriptionWidget(data) {
  syncSubscriptionRangeUi();
  const periodLabel = 'Số liệu trong kỳ · ' + formatSubscriptionPeriodLabel(true);
  setOverviewWidgetState('subscription', 'ready',
    '<p class="overview-subscription-period">' + escapeHtml(periodLabel) + '</p>' +
    buildOverviewSubscriptionKpiStrip(data) +
    '<section class="overview-subscription-section overview-subscription-section--full">' +
      '<div class="overview-subscription-section-head"><div><h5>Tổng quan theo gói</h5>' +
        '<p>Quy mô hiện tại kết hợp số phát sinh và doanh thu trong kỳ</p></div></div>' +
      buildOverviewSubscriptionTable(data) +
    '</section>' +
    '<div class="overview-subscription-grid">' +
      '<section class="overview-subscription-section">' +
        '<div class="overview-subscription-section-head"><div><h5>Xu hướng gói đăng ký</h5>' +
          '<p>Số tổ chức / tài khoản cá nhân đang dùng từng gói</p></div></div>' +
        buildOverviewSubscriptionTrend(data) +
      '</section>' +
      '<section class="overview-subscription-section">' +
        '<div class="overview-subscription-section-head"><div><h5>Doanh thu theo gói</h5>' +
          '<p>So sánh doanh thu thực thu của từng gói trong kỳ</p></div></div>' +
        buildOverviewSubscriptionRevenue(data) +
      '</section>' +
      '<section class="overview-subscription-section">' +
        '<div class="overview-subscription-section-head"><div><h5>Đăng ký mới</h5>' +
          '<p>Số tổ chức mới tham gia hệ thống trong kỳ</p></div></div>' +
        buildOverviewNewSubscriptionChart(data) +
      '</section>' +
      '<section class="overview-subscription-section">' +
        '<div class="overview-subscription-section-head"><div><h5>Luồng nâng cấp</h5>' +
          '<p>Số lượt chuyển lên gói cao hơn trong kỳ</p></div></div>' +
        buildOverviewUpgradeFlow(data) +
      '</section>' +
    '</div>');
}

function buildOverviewSubscriptionRevenue(data) {
  const source = data || {};
  const revenue = source.revenue || {};
  const rows = getOverviewPlanMeta(source).map((plan) => ({
    label: plan.label,
    accent: plan.accent,
    onClick: plan.onClick,
    amount: Math.max(0, Number(revenue[plan.key]) || 0)
  }));
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  if (total <= 0) {
    return '<p class="analytics-muted overview-subscription-empty">Chưa phát sinh doanh thu trong khoảng đã chọn.</p>';
  }
  const max = Math.max.apply(null, rows.map((row) => row.amount).concat([1]));
  const bars = rows
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .map((row) => {
      const width = Math.round((row.amount / max) * 100);
      const share = total > 0 ? Math.round((row.amount / total) * 100) : 0;
      return '<div class="overview-revplan-row is-clickable" role="button" tabindex="0"' +
        ' onclick="' + row.onClick + '" onkeydown="if(event.key===\'Enter\'){' + row.onClick + '}">' +
        '<div class="overview-revplan-meta">' +
          '<span class="overview-plan-badge accent-' + row.accent + '">' + escapeHtml(row.label) + '</span>' +
          '<strong>' + escapeHtml(overviewMoney(row.amount)) + 'đ</strong>' +
        '</div>' +
        '<div class="overview-revplan-track"><span class="accent-' + row.accent +
          '" style="width:' + width + '%"></span></div>' +
        '<small>' + share + '% tổng doanh thu</small>' +
      '</div>';
    }).join('');
  return '<div class="overview-revplan-head"><span>Doanh thu theo gói (trong kỳ)</span>' +
      '<strong>' + escapeHtml(overviewMoney(total)) + 'đ</strong></div>' +
    '<div class="overview-revplan-list">' + bars + '</div>';
}

function buildOverviewSubscriptionTrend(data) {
  const source = data || {};
  const series = source.series || {};
  const dateSet = [];
  getOverviewPlanMeta(source).forEach((plan) => {
    (series[plan.key] || []).forEach((row) => {
      if (!dateSet.includes(row.date)) dateSet.push(row.date);
    });
  });
  dateSet.sort();
  if (dateSet.length < 2) {
    return '<p class="analytics-muted overview-subscription-empty">Chưa đủ dữ liệu để vẽ xu hướng.</p>';
  }
  const width = 520;
  const height = 190;
  const left = 34;
  const right = 12;
  const top = 12;
  const bottom = 26;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const valueAt = (planKey, date) => {
    const found = (series[planKey] || []).find((row) => row.date === date);
    return found ? Number(found.count) || 0 : 0;
  };
  let maxVal = 1;
  dateSet.forEach((date) => {
    getOverviewPlanMeta(source).forEach((plan) => {
      maxVal = Math.max(maxVal, valueAt(plan.key, date));
    });
  });
  const xAt = (i) => left + (dateSet.length <= 1 ? 0 : (i / (dateSet.length - 1)) * plotW);
  const yAt = (v) => top + plotH - (v / maxVal) * plotH;
  const colors = { gray: '#98a2b3', blue: '#2e90fa', purple: '#7a5af8', green: '#12b76a', orange: '#f79009', teal: '#15b79e' };

  const grid = Array.from({ length: 4 }, (_, i) => {
    const ratio = i / 3;
    const y = top + plotH * ratio;
    const label = Math.round(maxVal * (1 - ratio));
    return '<g class="overview-trend-grid">' +
      '<line x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (left + plotW) +
        '" y2="' + y.toFixed(1) + '"></line>' +
      '<text x="' + (left - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + label + '</text>' +
    '</g>';
  }).join('');

  const lines = getOverviewPlanMeta(source).map((plan) => {
    const points = dateSet.map((date, i) => xAt(i).toFixed(1) + ',' + yAt(valueAt(plan.key, date)).toFixed(1)).join(' ');
    return '<polyline fill="none" stroke="' + (colors[plan.accent] || '#667085') +
      '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' + points + '"></polyline>';
  }).join('');

  const step = Math.max(1, Math.ceil(dateSet.length / 6));
  const labels = dateSet.map((date, i) => {
    if (i % step !== 0 && i !== dateSet.length - 1) return '';
    const parts = String(date).split('-');
    const label = parts.length === 3 ? (parts[2] + '/' + parts[1]) : date;
    return '<text class="overview-trend-x" x="' + xAt(i).toFixed(1) + '" y="' + (height - 8) +
      '" text-anchor="middle">' + escapeHtml(label) + '</text>';
  }).join('');

  const legend = getOverviewPlanMeta(source).map((plan) =>
    '<span><i style="background:' + (colors[plan.accent] || '#667085') + '"></i>' + escapeHtml(plan.label) + '</span>'
  ).join('');

  return '<div class="overview-trend-legend">' + legend + '</div>' +
    '<div class="overview-trend-scroll">' +
      '<svg class="overview-trend-chart" viewBox="0 0 ' + width + ' ' + height +
        '" role="img" aria-label="Xu hướng số tổ chức theo gói">' +
        grid + lines + labels +
      '</svg>' +
    '</div>';
}

function buildOverviewNewSubscriptionChart(data) {
  const source = Array.isArray(data?.newSubscriptions) ? data.newSubscriptions : [];
  if (!source.length) {
    return '<p class="analytics-muted overview-subscription-empty">Chưa có dữ liệu đăng ký mới trong kỳ.</p>';
  }
  const maxBars = 12;
  const groupSize = Math.max(1, Math.ceil(source.length / maxBars));
  const grouped = [];
  for (let index = 0; index < source.length; index += groupSize) {
    const slice = source.slice(index, index + groupSize);
    grouped.push({
      date: slice[slice.length - 1]?.date || '',
      count: slice.reduce((sum, row) => sum + (Number(row.count) || 0), 0)
    });
  }
  const total = grouped.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max.apply(null, grouped.map((row) => row.count).concat([1]));
  const width = 520;
  const height = 165;
  const left = 30;
  const right = 10;
  const top = 12;
  const bottom = 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const slot = plotW / grouped.length;
  const barW = Math.max(5, Math.min(28, slot * 0.58));
  const grid = Array.from({ length: 4 }, (_, i) => {
    const ratio = i / 3;
    const y = top + ratio * plotH;
    const label = Math.round(max * (1 - ratio));
    return '<g class="overview-trend-grid"><line x1="' + left + '" y1="' + y.toFixed(1) +
      '" x2="' + (left + plotW) + '" y2="' + y.toFixed(1) + '"></line>' +
      '<text x="' + (left - 6) + '" y="' + (y + 3).toFixed(1) +
      '" text-anchor="end">' + label + '</text></g>';
  }).join('');
  const bars = grouped.map((row, index) => {
    const barH = (row.count / max) * plotH;
    const x = left + index * slot + (slot - barW) / 2;
    const y = top + plotH - barH;
    const parts = String(row.date).split('-');
    const label = parts.length === 3 ? parts[2] + '/' + parts[1] : row.date;
    return '<g><rect class="overview-new-sub-bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
      '" width="' + barW.toFixed(1) + '" height="' + Math.max(2, barH).toFixed(1) +
      '" rx="4"><title>' + escapeHtml(label + ': ' + row.count + ' tổ chức mới') + '</title></rect>' +
      '<text class="overview-trend-x" x="' + (x + barW / 2).toFixed(1) + '" y="' + (height - 8) +
      '" text-anchor="middle">' + escapeHtml(label) + '</text></g>';
  }).join('');
  return '<div class="overview-new-sub-summary"><strong>' + total +
      '</strong><span>tổ chức mới trong kỳ</span></div>' +
    '<div class="overview-trend-scroll"><svg class="overview-trend-chart" viewBox="0 0 ' +
      width + ' ' + height + '" role="img" aria-label="Số tổ chức đăng ký mới">' +
      grid + bars + '</svg></div>';
}

function buildOverviewUpgradeFlow(data) {
  const upgrades = data?.upgrades || {};
  const freeToPro = Number(upgrades.freeToPro) || 0;
  const proToEnterprise = Number(upgrades.proToEnterprise) || 0;
  const direct = Number(upgrades.freeToEnterprise) || 0;
  const total = Number(upgrades.total) || 0;
  return '<div class="overview-upgrade-total"><strong>' + total +
      '</strong><span>lượt nâng cấp trong kỳ</span></div>' +
    '<div class="overview-upgrade-flow">' +
      '<div class="overview-upgrade-plan accent-gray"><span>Miễn phí</span><strong>' +
        (Number(data?.FREE) || 0) + '</strong></div>' +
      '<div class="overview-upgrade-arrow"><span>→</span><strong>' + freeToPro +
        '</strong><small>lên Pro</small></div>' +
      '<div class="overview-upgrade-plan accent-blue"><span>Pro</span><strong>' +
        (Number(data?.PRO) || 0) + '</strong></div>' +
      '<div class="overview-upgrade-arrow"><span>→</span><strong>' + proToEnterprise +
        '</strong><small>lên Doanh nghiệp</small></div>' +
      '<div class="overview-upgrade-plan accent-purple"><span>Doanh nghiệp</span><strong>' +
        (Number(data?.ENTERPRISE) || 0) + '</strong></div>' +
    '</div>' +
    (direct > 0
      ? '<p class="overview-upgrade-direct">Có ' + direct +
        ' lượt nâng trực tiếp từ Miễn phí lên Doanh nghiệp.</p>'
      : '<p class="overview-upgrade-direct">Chưa có lượt nâng trực tiếp từ Miễn phí lên Doanh nghiệp.</p>');
}

function buildOverviewSubscriptionKpiStrip(data) {
  const source = data || {};
  const kpi = source.kpi || {};
  const active = source.active || {};
  const grace = source.grace || {};
  const total = getOverviewPlanMeta(source).reduce((sum, plan) => sum + (Number(source[plan.key]) || 0), 0);
  const healthy = getOverviewPlanMeta(source).reduce((sum, plan) =>
    sum + Math.max(0, Number(active[plan.key]) || 0) + Math.max(0, Number(grace[plan.key]) || 0), 0);
  const activeRate = total > 0 ? Math.round((healthy / total) * 100) : 0;
  const hasKpi = source.kpi != null;
  const items = [
    { label: 'Tổng tổ chức', value: String(total) },
    { label: 'Doanh thu tháng', value: hasKpi ? overviewMoney(kpi.mrr || 0) + 'đ' : '—', title: 'MRR: doanh thu định kỳ hàng tháng ước tính từ tổ chức trả phí còn hiệu lực' },
    { label: 'Doanh thu năm', value: hasKpi ? overviewMoney(kpi.arr || 0) + 'đ' : '—', title: 'ARR: doanh thu định kỳ năm, bằng doanh thu tháng nhân 12' },
    { label: 'Tỷ lệ hiệu lực', value: activeRate + '%', title: 'Tỷ lệ tổ chức đang hoạt động hoặc trong thời gian ân hạn' },
    { label: 'Tỷ lệ gia hạn', value: hasKpi && kpi.renewRate != null ? kpi.renewRate + '%' : '—', title: 'Tỷ lệ gia hạn thành công trong khoảng thời gian đã chọn' },
    { label: 'Tỷ lệ rời bỏ', value: hasKpi ? (kpi.churnRate || 0) + '%' : '—', title: 'Tỷ lệ gói hết hạn hoặc bị hủy trong khoảng thời gian đã chọn' }
  ];
  return '<div class="overview-subscription-kpi-strip">' + items.map((item) =>
    '<div class="overview-subscription-kpi-item" title="' + escapeHtml(item.title || item.label) + '">' +
      '<span>' + escapeHtml(item.label) + '</span>' +
      '<strong>' + escapeHtml(item.value) + '</strong>' +
    '</div>'
  ).join('') + '</div>';
}

function buildOverviewTaskItem(title, hint, badge, onClick, accent) {
  return (
    '<button type="button" class="overview-task-item accent-' + escapeHtml(accent || 'gray') +
    '" onclick="' + onClick + '">' +
      '<span class="overview-task-main">' +
        '<strong>' + escapeHtml(title) + '</strong>' +
        (hint ? '<small>' + escapeHtml(hint) + '</small>' : '') +
      '</span>' +
      (badge ? '<span class="overview-task-badge">' + escapeHtml(badge) + '</span>' : '') +
    '</button>'
  );
}

function hideLegacyPlatformOverview() {
  const legacySection = document.getElementById('platformOverviewSection');
  if (legacySection) {
    legacySection.style.display = 'none';
    legacySection.hidden = true;
  }
  const legacyCards = document.getElementById('platformOverviewCards');
  if (legacyCards) legacyCards.innerHTML = '';
}

function overviewMoney(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

/** AD15 — load bundle Overview theo range */
async function loadOverviewDashboard(opts) {
  opts = opts || {};
  hideLegacyPlatformOverview();
  const kpi = document.getElementById('overviewKpiCards');
  if (!kpi) return;

  const range = getOverviewRange();
  const cacheKey = range === 'custom'
    ? ('custom:' + (document.getElementById('overviewFromDate')?.value || '') + ':' + (document.getElementById('overviewToDate')?.value || ''))
    : range;
  if (!opts.force && overviewDashboardCache && overviewDashboardCache._cacheKey === cacheKey) {
    renderOverviewDashboard();
    return;
  }

  // silent: làm mới ngầm (auto-refresh) — không hiện skeleton để tránh nhấp nháy
  const silent = !!opts.silent && !!overviewDashboardCache;

  if (overviewLoadAbort) {
    try { overviewLoadAbort.abort(); } catch (e) { /* ignore */ }
  }
  overviewLoadAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;

  window._overviewLoading = true;
  if (!silent) {
    kpi.innerHTML = dashUiLoading('cards', { count: 6, label: 'Đang tải tổng quan…' });
    ['org_growth', 'revenue_expense', 'navigation_activity', 'map_publish', 'subscription',
      'top_organizations', 'billing_care', 'system_health', 'recent_activities', 'recent_alerts', 'contact_crm'].forEach((id) => {
      overviewWidgetLoading(id);
    });
  }

  try {
    const res = await apiFetch(buildOverviewQuery());
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Refresh ngầm thất bại: giữ nguyên dữ liệu cũ, không xóa trắng.
      if (silent) return;
      overviewDashboardCache = null;
      renderOverviewDashboardEmpty();
      kpi.innerHTML = dashUiError(data.message || ('HTTP ' + res.status));
      return;
    }
    data._cacheKey = cacheKey;
    overviewDashboardCache = data;
    window._overviewLastRefreshAt = Date.now();
    if (!platformStatsCache && data.widgets?.kpi?.status === 'ready') {
      platformStatsCache = {
        scope: data.scope,
        ...(data.widgets.kpi.data || {})
      };
    }
    renderOverviewDashboard();
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    console.warn('loadOverviewDashboard:', e);
    if (silent) return;
    overviewDashboardCache = null;
    renderOverviewDashboardEmpty();
    kpi.innerHTML = dashUiError('Lỗi kết nối khi tải Tổng quan.');
  } finally {
    window._overviewLoading = false;
  }
}

/* ===== Auto-refresh (live) cho tab Tổng quan ===== */
const OVERVIEW_AUTO_REFRESH_MS = 45000;
let _overviewAutoRefreshTimer = null;

function startOverviewAutoRefresh() {
  stopOverviewAutoRefresh();
  _overviewAutoRefreshTimer = setInterval(() => {
    if (window._currentDashboardTab !== 'overview') return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (window._overviewLoading) return;
    loadOverviewDashboard({ force: true, silent: true });
  }, OVERVIEW_AUTO_REFRESH_MS);
}

function stopOverviewAutoRefresh() {
  if (_overviewAutoRefreshTimer) {
    clearInterval(_overviewAutoRefreshTimer);
    _overviewAutoRefreshTimer = null;
  }
}

/**
 * Làm mới overview ngay sau một thao tác thay đổi dữ liệu (thanh toán, tạo/sửa…).
 * Chỉ tải lại nếu người dùng đang ở tab Tổng quan; nếu không, xóa cache để lần
 * vào tab kế tiếp lấy dữ liệu mới.
 */
function notifyOverviewDataChanged() {
  try {
    localStorage.setItem('indoorNavOverviewRefresh', String(Date.now()));
  } catch (_) {}
  try {
    if (window._overviewBroadcast) {
      window._overviewBroadcast.postMessage({ type: 'overview-refresh', at: Date.now() });
    }
  } catch (_) {}
  if (window._currentDashboardTab === 'overview') {
    loadOverviewDashboard({ force: true, silent: true });
  } else {
    overviewDashboardCache = null;
  }
}
if (typeof window !== 'undefined') {
  window.notifyOverviewDataChanged = notifyOverviewDataChanged;
  if (!window._overviewBroadcastBound) {
    window._overviewBroadcastBound = true;
    try {
      window._overviewBroadcast = new BroadcastChannel('indoor-nav-overview');
      window._overviewBroadcast.onmessage = () => {
        if (window._currentDashboardTab === 'overview') {
          loadOverviewDashboard({ force: true, silent: true });
        } else {
          overviewDashboardCache = null;
        }
      };
    } catch (_) {}
    window.addEventListener('storage', (ev) => {
      if (ev.key !== 'indoorNavOverviewRefresh') return;
      if (window._currentDashboardTab === 'overview') {
        loadOverviewDashboard({ force: true, silent: true });
      } else {
        overviewDashboardCache = null;
      }
    });
  }
}
if (typeof document !== 'undefined' && !window._overviewVisibilityBound) {
  window._overviewVisibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible'
      && window._currentDashboardTab === 'overview'
      && !window._overviewLoading) {
      loadOverviewDashboard({ force: true, silent: true });
    }
  });
}

function retryOverviewWidget() {
  loadOverviewDashboard({ force: true });
}

/** AD15 — render tab Tổng quan từ bundle /overview/dashboard */
function renderOverviewDashboard() {
  hideLegacyPlatformOverview();
  renderPlatformOverviewCards();
}

function renderWidgetStatusOr(id, widget, renderFn) {
  if (!widget) {
    overviewWidgetEmpty(id, 'Chưa có dữ liệu', '');
    return;
  }
  if (widget.status === 'error') {
    overviewWidgetError(id, widget.message);
    return;
  }
  if (widget.status === 'unavailable') {
    overviewWidgetUnavailable(id, widget.message);
    return;
  }
  if (widget.status !== 'ready' || widget.data == null) {
    overviewWidgetEmpty(id, 'Trống', widget.message || '');
    return;
  }
  try {
    renderFn(widget.data);
  } catch (e) {
    console.warn('render widget ' + id, e);
    overviewWidgetError(id, 'Lỗi hiển thị widget');
  }
}

let overviewOrgGrowthState = null;
let overviewOrgGrowthRaf = 0;

const OV_GROWTH_DIMS = { width: 1000, height: 220, left: 50, right: 38, top: 12, bottom: 30 };

function initializeOverviewOrgGrowthChart(series, currentTotal) {
  const rows = Array.isArray(series) ? series : [];
  if (!rows.length) {
    overviewOrgGrowthState = null;
    return;
  }
  const newValues = rows.map((row) => Math.max(0, Number(row.count) || 0));
  const allNew = newValues.reduce((sum, value) => sum + value, 0);
  let running = Math.max(0, (Number(currentTotal) || 0) - allNew);
  const totals = newValues.map((value) => {
    running += value;
    return running;
  });
  const windowSize = Math.min(rows.length, rows.length > 14 ? 12 : Math.max(1, rows.length));
  const maxStart = Math.max(0, rows.length - windowSize);
  const plotWidth = OV_GROWTH_DIMS.width - OV_GROWTH_DIMS.left - OV_GROWTH_DIMS.right;
  const step = plotWidth / Math.max(1, windowSize - 1);
  overviewOrgGrowthState = {
    rows,
    totals,
    newValues,
    windowSize,
    maxStart,
    step,
    startPos: maxStart,
    targetPos: maxStart,
    currentTotal: Number(currentTotal) || 0,
    newTotal: allNew
  };
  setOverviewWidgetState('org_growth', 'ready', buildOverviewOrgGrowthChart(overviewOrgGrowthState));
  // Đặt vị trí ban đầu (không animate) sau khi DOM đã gắn.
  requestAnimationFrame(() => applyOverviewOrgGrowthTransform());
}

function formatOverviewGrowthWindowLabel(first, last) {
  const compact = (value) => {
    const parts = String(value || '').split('-');
    return parts.length === 3 ? (parts[2] + '/' + parts[1]) : String(value || '');
  };
  return compact(first) + ' – ' + compact(last);
}

// Vẽ ngay transform theo startPos hiện tại + cập nhật nút/nhãn (không chạy vòng animation).
function applyOverviewOrgGrowthTransform() {
  const s = overviewOrgGrowthState;
  if (!s) return;
  const pan = document.getElementById('ovGrowthPan');
  if (pan) {
    pan.style.transform = 'translateX(' + (-(s.startPos * s.step)).toFixed(2) + 'px)';
  }
  const prev = document.getElementById('ovGrowthNavPrev');
  const next = document.getElementById('ovGrowthNavNext');
  const label = document.getElementById('ovGrowthNavLabel');
  const atStart = s.startPos <= 0.01;
  const atEnd = s.startPos >= s.maxStart - 0.01;
  if (prev) prev.disabled = atStart;
  if (next) next.disabled = atEnd;
  if (label) {
    const i0 = Math.round(s.startPos);
    const i1 = Math.min(s.rows.length - 1, i0 + s.windowSize - 1);
    label.textContent = formatOverviewGrowthWindowLabel(s.rows[i0] && s.rows[i0].date, s.rows[i1] && s.rows[i1].date);
  }
}

// Vòng animation dùng requestAnimationFrame để nội suy startPos -> targetPos (easing quán tính).
function runOverviewOrgGrowthAnim() {
  const s = overviewOrgGrowthState;
  if (!s) {
    overviewOrgGrowthRaf = 0;
    return;
  }
  const diff = s.targetPos - s.startPos;
  if (Math.abs(diff) < 0.002) {
    s.startPos = s.targetPos;
    applyOverviewOrgGrowthTransform();
    overviewOrgGrowthRaf = 0;
    return;
  }
  // Hệ số 0.22 cho cảm giác trôi mượt, có giảm tốc ở cuối.
  s.startPos += diff * 0.22;
  applyOverviewOrgGrowthTransform();
  overviewOrgGrowthRaf = requestAnimationFrame(runOverviewOrgGrowthAnim);
}

function setOverviewOrgGrowthTarget(pos) {
  const s = overviewOrgGrowthState;
  if (!s) return;
  s.targetPos = Math.max(0, Math.min(s.maxStart, pos));
  if (!overviewOrgGrowthRaf) {
    overviewOrgGrowthRaf = requestAnimationFrame(runOverviewOrgGrowthAnim);
  }
}

function shiftOverviewOrgGrowth(direction) {
  const s = overviewOrgGrowthState;
  if (!s) return;
  setOverviewOrgGrowthTarget(Math.round(s.targetPos) + Number(direction || 0));
}

function handleOverviewOrgGrowthWheel(event) {
  const s = overviewOrgGrowthState;
  if (!s || s.maxStart <= 0) return true;
  const dir = event.deltaY > 0 ? 1 : -1;
  const atBoundary =
    (dir > 0 && s.targetPos >= s.maxStart - 0.01) ||
    (dir < 0 && s.targetPos <= 0.01);
  // Ở biên timeline, nhường wheel cho trang để vẫn cuộn dọc được.
  if (atBoundary) return true;
  event.preventDefault();
  // Chuẩn hóa theo deltaMode (dòng vs pixel) rồi cộng dồn phân số cho cảm giác liên tục.
  const unit = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? 400 : 1);
  let delta = (event.deltaY * unit) * 0.011;
  if (delta > 2) delta = 2;
  if (delta < -2) delta = -2;
  setOverviewOrgGrowthTarget(s.targetPos + delta);
  return false;
}

function buildOverviewOrgGrowthChart(state) {
  const s = state || overviewOrgGrowthState;
  if (!s || !s.rows.length) return '';
  const rows = s.rows;
  const totalValues = s.totals;
  const newValues = s.newValues;
  const step = s.step;
  const { width, height, left, right, top, bottom } = OV_GROWTH_DIMS;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  // Chừa khoảng trống phía trên để nét line/điểm cực đại không bị clip sát mép SVG.
  // Mốc trục được làm tròn theo bước 1/2/2.5/5/10 để vẫn dễ đọc.
  const niceAxisMax = (values) => {
    const dataMax = Math.max(1, ...values);
    const roughStep = dataMax / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;
    const niceStep = (
      normalized <= 1 ? 1 :
      normalized <= 2 ? 2 :
      normalized <= 2.5 ? 2.5 :
      normalized <= 5 ? 5 : 10
    ) * magnitude;
    return Math.max(niceStep, Math.ceil((dataMax * 1.12) / niceStep) * niceStep);
  };
  const formatAxisValue = (value) => (
    Math.abs(value - Math.round(value)) < 0.001
      ? String(Math.round(value))
      : String(Math.round(value * 10) / 10)
  );
  const maxTotal = niceAxisMax(totalValues);
  const maxNew = niceAxisMax(newValues);
  const x = (index) => left + index * step;
  const yTotal = (value) => top + plotHeight - (value / maxTotal) * plotHeight;
  const yNew = (value) => top + plotHeight - (value / maxNew) * plotHeight;
  const totalCoords = totalValues.map((value, index) => ({ x: x(index), y: yTotal(value) }));
  const newCoords = newValues.map((value, index) => ({ x: x(index), y: yNew(value) }));

  const smoothPath = (points) => {
    if (!points.length) return '';
    if (points.length === 1) return 'M ' + points[0].x + ' ' + points[0].y;
    let d = 'M ' + points[0].x.toFixed(1) + ' ' + points[0].y.toFixed(1);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C ' + cp1x.toFixed(1) + ' ' + cp1y.toFixed(1) + ', ' +
        cp2x.toFixed(1) + ' ' + cp2y.toFixed(1) + ', ' +
        p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
    }
    return d;
  };
  const totalPath = smoothPath(totalCoords);
  const newPath = smoothPath(newCoords);
  const baseline = top + plotHeight;
  const lastX = x(rows.length - 1);
  const areaPath = 'M ' + totalCoords[0].x.toFixed(1) + ' ' + baseline +
    ' L ' + totalCoords[0].x.toFixed(1) + ' ' + totalCoords[0].y.toFixed(1) +
    totalPath.replace(/^M [^C]+/, '') +
    ' L ' + lastX.toFixed(1) + ' ' + baseline + ' Z';

  const grid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const y = top + plotHeight * ratio;
    const totalLabel = formatAxisValue(maxTotal * (1 - ratio));
    const newLabel = formatAxisValue(maxNew * (1 - ratio));
    return '<g class="ov-growth-grid-row">' +
      '<line x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (left + plotWidth) +
        '" y2="' + y.toFixed(1) + '"></line>' +
      '<text x="' + (left - 9) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' +
        totalLabel + '</text>' +
      '<text class="is-right" x="' + (left + plotWidth + 9) + '" y="' +
        (y + 4).toFixed(1) + '" text-anchor="start">' + newLabel + '</text>' +
    '</g>';
  }).join('');

  const showEvery = Math.max(1, Math.ceil(rows.length / 8));
  const labels = rows.map((row, index) => {
    if (index % showEvery !== 0 && index !== rows.length - 1) return '';
    const raw = String(row.date || '');
    const parts = raw.split('-');
    const label = parts.length === 3 ? (parts[2] + '/' + parts[1]) : raw;
    return '<text class="ov-growth-x-label" x="' + x(index).toFixed(1) +
      '" y="' + (height - 8) + '" text-anchor="middle">' + escapeHtml(label) + '</text>';
  }).join('');

  const points = rows.map((row, index) =>
    '<g class="ov-growth-point">' +
      '<circle class="is-total" cx="' + x(index).toFixed(1) + '" cy="' +
        yTotal(totalValues[index]).toFixed(1) + '" r="2.4"><title>' +
        escapeHtml(String(row.date || '') + ': tổng ' + totalValues[index]) +
      '</title></circle>' +
      '<circle class="is-new" cx="' + x(index).toFixed(1) + '" cy="' +
        yNew(newValues[index]).toFixed(1) + '" r="2"><title>' +
        escapeHtml(String(row.date || '') + ': mới ' + newValues[index]) +
      '</title></circle>' +
    '</g>'
  ).join('');

  const i0 = Math.round(s.startPos);
  const i1 = Math.min(rows.length - 1, i0 + s.windowSize - 1);
  const navLabel = formatOverviewGrowthWindowLabel(rows[i0] && rows[i0].date, rows[i1] && rows[i1].date);
  const atStart = s.startPos <= 0.01;
  const atEnd = s.startPos >= s.maxStart - 0.01;

  return '<div class="ov-growth-summary">' +
      '<div><span>Tổng tổ chức</span><strong>' + escapeHtml(String(s.currentTotal || 0)) + '</strong></div>' +
      '<div><span>Mới trong kỳ</span><strong>' + escapeHtml(String(s.newTotal || 0)) + '</strong></div>' +
      '<div class="ov-growth-legend">' +
        '<span><i class="is-total"></i>Tổng tích lũy</span>' +
        '<span><i class="is-new"></i>Tổ chức mới</span>' +
      '</div>' +
      '<div class="ov-growth-nav">' +
        '<button type="button" id="ovGrowthNavPrev" onclick="shiftOverviewOrgGrowth(-1)"' +
          (atStart ? ' disabled' : '') + ' aria-label="Xem giai đoạn trước">‹</button>' +
        '<span id="ovGrowthNavLabel">' + escapeHtml(navLabel) + '</span>' +
        '<button type="button" id="ovGrowthNavNext" onclick="shiftOverviewOrgGrowth(1)"' +
          (atEnd ? ' disabled' : '') + ' aria-label="Xem giai đoạn sau">›</button>' +
      '</div>' +
    '</div>' +
    '<div class="ov-growth-chart-scroll" onwheel="return handleOverviewOrgGrowthWheel(event)"' +
      ' title="Cuộn chuột lên/xuống để lùi hoặc tiến thời gian">' +
      '<svg class="ov-growth-chart" viewBox="0 0 ' + width + ' ' + height +
        '" role="img" aria-label="Biểu đồ tăng trưởng tổ chức">' +
        '<defs><linearGradient id="ovGrowthAreaFill" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#6172f3" stop-opacity="0.28"></stop>' +
          '<stop offset="100%" stop-color="#6172f3" stop-opacity="0.02"></stop>' +
        '</linearGradient><clipPath id="ovGrowthPlotClip">' +
          '<rect x="' + left + '" y="' + top + '" width="' + plotWidth +
            '" height="' + (height - top) + '"></rect>' +
        '</clipPath></defs>' +
        grid +
        '<g clip-path="url(#ovGrowthPlotClip)">' +
          '<g id="ovGrowthPan" class="ov-growth-pan">' +
            '<path class="ov-growth-area" d="' + areaPath + '"></path>' +
            '<path class="ov-growth-total-line" d="' + totalPath + '"></path>' +
            '<path class="ov-growth-new-line" d="' + newPath + '"></path>' +
            points +
            labels +
          '</g>' +
        '</g>' +
      '</svg>' +
    '</div>';
}

function renderOverviewKpiFromBundle(scope, data) {
  const kpiEl = document.getElementById('overviewKpiCards');
  const titleEl = document.getElementById('overviewPageTitle');
  const introEl = document.getElementById('overviewPageIntro');
  if (!kpiEl || !data) return;

  let html = '';
  if (scope === 'platform') {
    if (titleEl) titleEl.textContent = '📊 Tổng quan nền tảng';
    if (introEl) {
      introEl.textContent = 'KPI vận hành + widget báo cáo. Đổi khoảng thời gian ở thanh công cụ.';
    }
    const org = data.organizations || {};
    const b = data.buildings || {};
    const floors = data.floors || {};
    const u = data.users || {};
    const reg = data.registrations || {};
    const pending = reg.pending || 0;
    const published = b.published || 0;
    const draft = b.draft || 0;
    const totalActiveBuildings = b.total_active || 0;
    const floorTotal = Number(floors.total) || 0;
    const floorPublished = Number(floors.published) || 0;
    const floorDraft = floors.draft != null
      ? Number(floors.draft) || 0
      : Math.max(0, floorTotal - floorPublished);
    const floorOrphan = Number(floors.orphan) || 0;
    const currentMaps = Number(floors.current_maps) || 0;
    const draftMaps = Number(floors.draft_maps) || 0;
    const mapVersions = Number(floors.version_count) || 0;
    const revenue = data.revenue || {};
    const deltas = data.deltas || {};
    const sparks = data.sparklines || {};
    const paidOrgs = Number(org.paid) || 0;
    const freeOrgs = Math.max(0, (Number(org.total) || 0) - paidOrgs);
    const revenueSeries =
      overviewDashboardCache?.widgets?.revenue_expense?.data?.periods?.weekly?.series || [];
    const revenueTrend = revenueSeries.map((row) => Number(row.revenue) || 0);

    html =
      buildOverviewCard('Doanh thu trong kỳ', overviewMoney(revenue.amount || 0),
        'Lợi nhuận ' + overviewMoney(revenue.profit || 0),
        'orange', true, "switchTab('finance')",
        {
          delta: deltas.revenue,
          miniType: 'revenue',
          className: 'overview-kpi-featured',
          miniHtml: buildOverviewAreaSparkline(revenueTrend.length ? revenueTrend : [0, 0], 'orange')
        }) +
      buildOverviewCard('Tổ chức hoạt động', org.active || 0,
        (org.total || 0) + ' Total · ' + paidOrgs + ' Paid · ' + freeOrgs + ' Free',
        'green', true, "platformJumpOrganizations('active')",
        {
          delta: deltas.orgs_new,
          miniType: 'area',
          miniHtml: buildOverviewAreaSparkline(sparks.org_growth || [0, 0], 'green')
        }) +
      buildOverviewCard('Tòa nhà', totalActiveBuildings,
        'Đã xuất bản ' + published + ' · Nháp ' + draft,
        'blue', true, "switchTab('buildings')",
        {
          miniType: 'stacked',
          miniHtml: buildOverviewStackedBar([
            { label: 'Đã XB', value: published, cls: 'green' },
            { label: 'Nháp', value: draft, cls: 'gray' }
          ])
        }) +
      buildOverviewCard('Tầng', floorTotal,
        'Thuộc tòa đã xuất bản ' + floorPublished + ' · Tòa nháp ' + floorDraft +
          (floorOrphan > 0 ? ' · ' + floorOrphan + ' tầng mồ côi' : ''),
        'teal', true, "switchTab('buildings')",
        {
          miniType: 'donut',
          miniHtml: buildOverviewDonut(floorPublished, floorTotal)
        }) +
      buildOverviewCard('Bản đồ hiện hành', currentMaps,
        'Có bản nháp ' + draftMaps + ' · ' + mapVersions + ' phiên bản đã lưu',
        'green', true, "platformJumpBuildings('PUBLISHED')",
        {
          miniType: 'map-stats',
          miniHtml: buildOverviewMapStats(draftMaps, mapVersions)
        }) +
      buildOverviewCard('User hôm nay', data.active_users_today || 0,
        'last_login trong ngày · ' + (u.total || 0) + ' user HĐ',
        'purple', true, "switchTab('users')",
        {
          delta: deltas.active_users_today,
          miniType: 'hourly',
          miniHtml: buildOverviewAreaSparkline(sparks.users_hourly || [0, 0], 'purple')
        }) +
      buildOverviewCard('Chờ duyệt', pending,
        pending ? 'hồ sơ cần quản trị hệ thống' : 'không có hồ sơ chờ',
        'orange', true, 'platformJumpRegistrationsPending()',
        {
          alert: pending > 0,
          badge: pending > 0 ? 'Cần duyệt' : '',
          miniType: 'gauge',
          miniHtml: buildOverviewStatusGauge(pending)
        });
  } else if (scope === 'organization') {
    const orgName = data.organization?.name || 'Tổ chức';
    if (titleEl) titleEl.textContent = '📊 Tổng quan — ' + orgName;
    if (introEl) introEl.textContent = 'Mức dùng tổ chức của bạn.';
    const b = data.buildings || {};
    const floors = data.floors || {};
    const u = data.users || {};
    const q = data.quota || {};
    const sparks = data.sparklines || {};
    const floorTotal = Number(floors.total) || 0;
    const floorPublished = Number(floors.published) || 0;
    const floorDraft = floors.draft != null
      ? Number(floors.draft) || 0
      : Math.max(0, floorTotal - floorPublished);
    const currentMaps = Number(floors.current_maps) || 0;
    const draftMaps = Number(floors.draft_maps) || 0;
    const mapVersions = Number(floors.version_count) || 0;
    html =
      buildOverviewCard('Tòa nhà', b.total_active || 0,
        'Đã xuất bản ' + (b.published || 0) + ' · Nháp ' + (b.draft || 0),
        'blue', true, "switchTab('buildings')",
        {
          miniType: 'stacked',
          miniHtml: buildOverviewStackedBar([
            { label: 'Đã XB', value: b.published || 0, cls: 'green' },
            { label: 'Nháp', value: b.draft || 0, cls: 'gray' }
          ])
        }) +
      buildOverviewCard('Tầng', floorTotal,
        'Thuộc tòa đã xuất bản ' + floorPublished + ' · Tòa nháp ' + floorDraft,
        'teal', true, "switchTab('buildings')",
        {
          miniType: 'donut',
          miniHtml: buildOverviewDonut(floorPublished, floorTotal)
        }) +
      buildOverviewCard('Bản đồ hiện hành', currentMaps,
        'Có bản nháp ' + draftMaps + ' · ' + mapVersions + ' phiên bản đã lưu',
        'green', true, "platformJumpBuildings('PUBLISHED')",
        {
          miniType: 'map-stats',
          miniHtml: buildOverviewMapStats(draftMaps, mapVersions)
        }) +
      buildOverviewCard('User hôm nay', data.active_users_today || 0,
        (u.total || 0) + ' tài khoản HĐ',
        'purple', true, "switchTab('users')",
        {
          delta: data.deltas?.active_users_today,
          miniType: 'hourly',
          miniHtml: buildOverviewAreaSparkline(sparks.users_hourly || [0, 0], 'purple')
        }) +
      buildOverviewCard('Tài khoản', u.total || 0,
        'QT tổ chức ' + (u.org_admin || 0) + ' · QT tòa ' + (u.building_admin || 0),
        'orange', true, "switchTab('users')") +
      buildOverviewCard('Tòa vô hiệu', b.inactive || 0,
        (q.buildings?.locked || 0) ? 'có khóa hạn mức' : 'không có',
        'gray', true, 'platformJumpBuildingsInactive()',
        { alert: (b.inactive || 0) > 0, badge: (b.inactive || 0) > 0 ? 'Khôi phục' : '' });
  } else {
    if (titleEl) titleEl.textContent = '📊 Tổng quan tòa được gán';
    if (introEl) introEl.textContent = 'Các tòa nhà gắn với tài khoản của bạn.';
    const b = data.buildings || {};
    const floors = data.floors || {};
    const draft = b.draft || 0;
    html =
      buildOverviewCard('Tòa được gán', b.assigned || 0, 'tài khoản của bạn',
        'purple', true, "switchTab('buildings')") +
      buildOverviewCard('Tầng', floors.total || 0, (floors.published || 0) + ' đã publish',
        'teal', true, "switchTab('buildings')") +
      buildOverviewCard('Đã xuất bản', b.published || 0, 'sẵn sàng trên app',
        'green', true, "platformJumpBuildings('PUBLISHED')") +
      buildOverviewCard('Đang nháp', draft,
        draft ? 'cần publish' : 'không có nháp',
        'orange', true, "platformJumpBuildings('DRAFT')",
        { alert: draft > 0, badge: draft > 0 ? 'Publish' : '' });
  }
  kpiEl.innerHTML = html || dashUiEmpty({ icon: 'chart', title: 'Chưa có KPI', hint: '' });
}

function renderOverviewTasksFromKpi(scope, data) {
  const tasksEl = document.getElementById('overviewTasks');
  if (!tasksEl || !data) return;
  const tasks = [];
  const b = data.buildings || {};
  const draft = b.draft || 0;
  const inactiveB = b.inactive || 0;

  if (scope === 'platform') {
    const pending = data.registrations?.pending || 0;
    const inactiveOrg = data.organizations?.inactive || 0;
    if (pending > 0) {
      tasks.push(buildOverviewTaskItem(pending + ' hồ sơ chờ duyệt', 'Cần quản trị hệ thống duyệt', 'Duyệt',
        'platformJumpRegistrationsPending()', 'orange'));
    }
    if (draft > 0) {
      tasks.push(buildOverviewTaskItem(draft + ' tòa đang nháp', 'Chưa xuất bản lên app', 'Xem nháp',
        "platformJumpBuildings('DRAFT')", 'orange'));
    }
    if (inactiveB > 0) {
      tasks.push(buildOverviewTaskItem(inactiveB + ' tòa vô hiệu', 'Có thể khôi phục', 'Khôi phục',
        'platformJumpBuildingsInactive()', 'red'));
    }
    if (inactiveOrg > 0) {
      tasks.push(buildOverviewTaskItem(inactiveOrg + ' tổ chức tạm dừng', 'Cần xem lại trạng thái', 'Xem',
        "platformJumpOrganizations('inactive')", 'red'));
    }
  } else if (scope === 'organization') {
    const q = data.quota || {};
    if (draft > 0) {
      tasks.push(buildOverviewTaskItem(draft + ' tòa nháp', 'Cần publish lên app', 'Publish',
        "platformJumpBuildings('DRAFT')", 'orange'));
    }
    if (inactiveB > 0) {
      tasks.push(buildOverviewTaskItem(inactiveB + ' tòa vô hiệu', 'Có thể khôi phục', 'Khôi phục',
        'platformJumpBuildingsInactive()', 'red'));
    }
    if ((q.buildings?.locked || 0) > 0 || (q.users?.locked || 0) > 0) {
      tasks.push(buildOverviewTaskItem('Đang khóa hạn mức', 'Giảm tài nguyên hoặc nâng gói', 'Gói',
        "switchTab('billing')", 'red'));
    }
  } else if (draft > 0) {
    tasks.push(buildOverviewTaskItem(draft + ' tòa nháp', 'Cần publish', 'Xem',
      "platformJumpBuildings('DRAFT')", 'orange'));
  }

  tasksEl.innerHTML = tasks.length
    ? tasks.join('')
    : '<p class="analytics-muted overview-tasks-empty">Không có việc cần xử lý ngay.</p>';
}

function renderPlatformOverviewCards() {
  hideLegacyPlatformOverview();
  const data = overviewDashboardCache;
  if (!data || !data.widgets) {
    renderOverviewDashboardEmpty();
    return;
  }

  const w = data.widgets;
  const scope = data.scope;

  if (w.kpi?.status === 'ready') {
    renderOverviewKpiFromBundle(scope, w.kpi.data);
    renderOverviewTasksFromKpi(scope, w.kpi.data);
  } else if (w.kpi?.status === 'error') {
    const kpiEl = document.getElementById('overviewKpiCards');
    if (kpiEl) kpiEl.innerHTML = dashUiError(w.kpi.message || 'Không tải được KPI');
  } else {
    renderOverviewDashboardEmpty();
  }

  renderWidgetStatusOr('org_growth', w.org_growth, (d) => {
    const series = d.series || [];
    if (!series.length) {
      overviewWidgetEmpty('org_growth', 'Chưa có org mới', 'Trong khoảng đã chọn.');
      return;
    }
    const total = overviewDashboardCache?.widgets?.kpi?.data?.organizations?.total || 0;
    initializeOverviewOrgGrowthChart(series, total);
  });

  renderWidgetStatusOr('revenue_expense', w.revenue_expense, (d) => {
    if (currentUser?.role !== 'SUPER_ADMIN') {
      const card = document.getElementById('ov-w-revenue_expense');
      if (card) card.hidden = true;
      return;
    }
    window._overviewRevExpData = d;
    const period = window._overviewRevExpPeriod || d.default_period || 'weekly';
    window._overviewRevExpPeriod = period;
    renderOverviewRevExpWidget(d, period);
  });

  renderWidgetStatusOr('navigation_activity', w.navigation_activity, (d) => {
    const series = d.series || [];
    const body = document.getElementById('ov-body-navigation_activity');
    let chart = '';
    if (typeof renderAnalyticsBarChart === 'function' && body && series.length) {
      renderAnalyticsBarChart(body, series, 'count');
      chart = body.innerHTML;
    }
    setOverviewWidgetState('navigation_activity', 'ready',
      '<div class="overview-nav-kpis">' +
        '<div><span>QR scans</span><strong>' + escapeHtml(String(d.qr_scans || 0)) + '</strong></div>' +
        '<div><span>Sessions</span><strong>' + escapeHtml(String(d.sessions || 0)) + '</strong></div>' +
        '<div><span>QR khác nhau</span><strong>' + escapeHtml(String(d.unique_qr || 0)) + '</strong></div>' +
        '<div><span>Completed</span><strong>' + escapeHtml(String(d.completed_routes || 0)) + '</strong></div>' +
      '</div>' +
      (chart || '') +
      '<p class="analytics-muted">' + escapeHtml(d.note || '') + '</p>'
    );
  });

  renderWidgetStatusOr('map_publish', w.map_publish, (d) => {
    const published = Number(d.published) || 0;
    const draft = Number(d.draft) || 0;
    const inactive = Number(d.inactive) || 0;
    const activeTotal = d.total_active != null
      ? Number(d.total_active) || 0
      : (published + draft);
    const allTotal = activeTotal + inactive;
    setOverviewWidgetState('map_publish', 'ready', buildOverviewDonutChart(
      [
        { label: 'Đã xuất bản', value: published, accent: 'green', onClick: "platformJumpBuildings('PUBLISHED')" },
        { label: 'Bản nháp', value: draft, accent: 'orange', onClick: "platformJumpBuildings('DRAFT')" }
      ],
      {
        centerValue: activeTotal,
        centerLabel: 'Tòa còn hiệu lực',
        note: inactive > 0
          ? ('Ngoài ra: ' + inactive + ' tòa vô hiệu · Tổng mọi trạng thái: ' + allTotal)
          : ('Tổng mọi trạng thái: ' + allTotal)
      }
    ));
  });

  renderWidgetStatusOr('subscription', w.subscription, (d) => {
    renderOverviewSubscriptionWidget(d);
  });

  renderWidgetStatusOr('top_organizations', w.top_organizations, (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      overviewWidgetEmpty('top_organizations', 'Chưa có tổ chức', '');
      return;
    }
    setOverviewWidgetState('top_organizations', 'ready',
      '<div class="overview-top-orgs">' + list.map((o, i) => (
        '<button type="button" class="overview-top-org-row" onclick="openOrgDetailModal(\'' +
          escapeHtml(String(o.id || '')) + '\')" title="Xem chi tiết tổ chức">' +
          '<span class="overview-top-rank">' + (i + 1) + '</span>' +
          '<span class="overview-top-main">' +
            '<strong>' + escapeHtml(o.name || '') + '</strong>' +
            '<small>' + escapeHtml(o.plan || 'FREE') + ' · ' + escapeHtml(o.billing_status || '') + '</small>' +
          '</span>' +
          '<strong class="overview-top-amount">' + escapeHtml(overviewMoney(o.paid_amount || 0)) + '</strong>' +
        '</button>'
      )).join('') + '</div>'
    );
  });

  renderWidgetStatusOr('billing_care', w.billing_care, (d) => {
    if (currentUser?.role !== 'SUPER_ADMIN') {
      const card = document.getElementById('ov-w-billing_care');
      if (card) card.style.display = 'none';
      return;
    }
    const c = d.counts || {};
    const strip =
      '<div class="overview-subscription-kpi-strip">' +
        [
          { label: 'Sắp hết hạn', value: c.expiring_soon || 0, title: 'ACTIVE hết hạn trong 15 ngày' },
          { label: 'Đang Grace', value: c.grace || 0, title: 'GRACE_PERIOD' },
          { label: 'Hết hạn', value: c.expired || 0, title: 'EXPIRED' },
          { label: 'Lưu trữ', value: c.archived || 0, title: 'ARCHIVED' },
          { label: 'Doanh thu treo', value: overviewMoney(d.suspended_mrr_vnd || 0) + 'đ', title: 'Tổng giá/tháng các org Grace/Expired/Archived' }
        ].map((item) =>
          '<div class="overview-subscription-kpi-item" title="' + escapeHtml(item.title) + '">' +
            '<span>' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(String(item.value)) + '</strong>' +
          '</div>'
        ).join('') +
      '</div>';

    const renderList = (title, rows, dateKey) => {
      const list = Array.isArray(rows) ? rows.slice(0, 5) : [];
      if (!list.length) {
        return '<div class="overview-billing-care-col"><h5>' + escapeHtml(title) + '</h5>' +
          '<p class="analytics-muted">Không có</p></div>';
      }
      return '<div class="overview-billing-care-col"><h5>' + escapeHtml(title) + '</h5>' +
        list.map((o) => {
          const oid = String(o._id || '');
          const when = o[dateKey] ? formatDateTime(o[dateKey]) : '—';
          return '<button type="button" class="overview-top-org-row" onclick="openOrgDetailModal(\'' +
            escapeHtml(oid) + '\')">' +
            '<span class="overview-top-main">' +
              '<strong>' + escapeHtml(o.name || '') + '</strong>' +
              '<small>' + escapeHtml(o.plan || '') + ' · ' + escapeHtml(when) + '</small>' +
            '</span></button>';
        }).join('') + '</div>';
    };
    const lists = d.lists || {};
    setOverviewWidgetState('billing_care', 'ready',
      strip +
      '<div class="overview-billing-care-grid">' +
        renderList('Sắp hết hạn', lists.expiring_soon, 'plan_expires_at') +
        renderList('Grace', lists.grace, 'grace_ends_at') +
        renderList('Hết hạn', lists.expired, 'billing_expired_at') +
        renderList('Lưu trữ', lists.archived, 'archived_at') +
      '</div>'
    );
  });

  renderWidgetStatusOr('system_health', w.system_health, (d) => {
    const card = document.getElementById('ov-w-system_health');
    if (card && card.getAttribute('data-overview-force-hidden') === '1') {
      card.hidden = true;
      return;
    }
    const cpu = d.cpu || {};
    const mem = d.memory || {};
    const db = d.db || {};
    const redis = d.redis || {};
    const storage = d.storage || {};
    const api = d.api || {};
    const gauge = (label, pct, sub) => {
      const p = pct == null ? null : Math.max(0, Math.min(100, Number(pct)));
      return '<div class="overview-health-gauge">' +
        '<div class="overview-health-label">' + escapeHtml(label) + '</div>' +
        '<div class="overview-health-track"><span style="width:' + (p == null ? 0 : p) + '%"></span></div>' +
        '<div class="overview-health-meta">' +
          (p == null ? '—' : (p + '%')) +
          (sub ? ' · ' + escapeHtml(sub) : '') +
        '</div></div>';
    };
    setOverviewWidgetState('system_health', 'ready',
      '<div class="overview-health-status status-' + escapeHtml(d.status || 'unknown') + '">' +
        escapeHtml(String(d.status || 'unknown').toUpperCase()) +
        ' · uptime ' + Math.round((d.uptime_sec || 0) / 60) + ' phút' +
      '</div>' +
      '<div class="overview-health-grid">' +
        gauge('CPU', cpu.used_pct, (cpu.cores || 0) + ' cores') +
        gauge('RAM', mem.used_pct, overviewMoney(Math.round((mem.used_bytes || 0) / 1e6)) + ' MB') +
        gauge('DB latency', db.latency_ms != null ? Math.min(100, db.latency_ms) : null,
          db.ok ? ((db.latency_ms != null ? db.latency_ms + ' ms' : 'ok')) : 'down') +
        gauge('Storage', storage.used_pct, storage.ok === false ? (storage.message || 'n/a') : '') +
        gauge('API', api.latency_ms != null ? Math.min(100, api.latency_ms) : null,
          api.latency_ms != null ? api.latency_ms + ' ms' : 'ok') +
        gauge('Redis', redis.configured ? (redis.ok ? Math.min(100, redis.latency_ms || 1) : 100) : 0,
          redis.configured ? (redis.ok ? ((redis.latency_ms || 0) + ' ms') : 'down') : 'off') +
      '</div>'
    );
  });

  renderWidgetStatusOr('recent_activities', w.recent_activities, (logs) => {
    const list = Array.isArray(logs) ? logs.slice(0, 5) : [];
    if (!list.length) {
      overviewWidgetEmpty('recent_activities', 'Chưa có hoạt động', '');
      return;
    }
    setOverviewWidgetState('recent_activities', 'ready',
      '<div class="overview-activity-list">' + list.map((l) => {
        const who = l.user?.full_name || l.user?.email || '—';
        const when = l.createdAt ? new Date(l.createdAt).toLocaleString('vi-VN') : '';
        return '<div class="overview-activity-row">' +
          '<div><strong>' + escapeHtml(l.action || '') + '</strong>' +
            '<small>' + escapeHtml(who) + (l.target ? ' · ' + escapeHtml(l.target) : '') + '</small></div>' +
          '<time>' + escapeHtml(when) + '</time></div>';
      }).join('') +
      '<button type="button" class="btn-edit overview-deep-link" onclick="switchTab(\'logs\')">Xem nhật ký</button></div>'
    );
  });

  renderWidgetStatusOr('recent_alerts', w.recent_alerts, (payload) => {
    const alerts = (payload.alerts || []).slice(0, 5);
    if (!alerts.length) {
      overviewWidgetEmpty('recent_alerts', 'Không có cảnh báo', 'Billing / quota ổn định.');
      return;
    }
    setOverviewWidgetState('recent_alerts', 'ready',
      '<div class="overview-alerts-list">' + alerts.map((a) => (
        '<div class="overview-alert-item severity-' + escapeHtml(a.severity || 'warn') + '">' +
          '<strong>' + escapeHtml(a.title || a.type || 'Cảnh báo') + '</strong>' +
          '<small>' + escapeHtml(a.message || '') + '</small></div>'
      )).join('') +
      '<button type="button" class="btn-edit overview-deep-link" onclick="switchTab(\'analytics\')">Mở Phân tích</button></div>'
    );
  });

  if (currentUser?.role === 'SUPER_ADMIN') {
    loadOverviewContactCrmWidget();
    if (typeof WebsiteCms?.startContactPolling === 'function') WebsiteCms.startContactPolling();
  } else {
    const contactCard = document.getElementById('ov-w-contact_crm');
    if (contactCard) contactCard.hidden = true;
  }

  if (scope === 'platform' && typeof renderOrgOverviewCards === 'function') {
    renderOrgOverviewCards();
  }
  setOverviewDashboardSection(window._overviewDashboardSection || 'priority');
  renderOverviewRangeSummary();
}

function filterOrgByOverviewStatus(status) {
  const el = document.getElementById('filterOrgStatus');
  if (el) el.value = status;
  applyOrganizationFilters();
}

async function loadOverviewContactCrmWidget() {
  const card = document.getElementById('ov-w-contact_crm');
  const body = document.getElementById('ov-body-contact_crm');
  if (!card || !body) return;
  card.hidden = false;
  setOverviewWidgetState('contact_crm', 'loading');
  try {
    const res = await apiFetch('/contact/stats');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || ('HTTP ' + res.status));
    const st = data.status || {};
    setOverviewWidgetState('contact_crm', 'ready',
      '<div class="website-contact-stats" style="margin:0">' +
        '<article><strong>' + (st.NEW || 0) + '</strong><span>Mới</span></article>' +
        '<article><strong>' + (st.IN_PROGRESS || 0) + '</strong><span>Đang xử lý</span></article>' +
        '<article><strong>' + (st.REPLIED || 0) + '</strong><span>Đã phản hồi</span></article>' +
        '<article><strong>' + (data.month_count || 0) + '</strong><span>Tháng này</span></article>' +
      '</div>' +
      (data.avg_reply_hours != null
        ? '<p class="analytics-muted" style="margin-top:10px">Thời gian phản hồi TB: <strong>' +
          escapeHtml(String(data.avg_reply_hours)) + ' giờ</strong></p>'
        : '') +
      '<button type="button" class="btn-edit overview-deep-link" onclick="openWebsiteSub(\'forms\')">Mở hộp thư Liên hệ</button>'
    );
  } catch (e) {
    setOverviewWidgetState('contact_crm', 'error',
      '<p class="analytics-error">' + escapeHtml(e.message || 'Không tải được Liên hệ') + '</p>');
  }
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
      statusBtn = '';
    } else {
      const btnClass = isActive ? 'is-danger' : 'is-success';
      const btnText = isActive ? 'Tạm dừng' : 'Kích hoạt';
      statusBtn =
        '<button type="button" class="org-row-action-btn org-row-status-btn ' + btnClass +
        '" onclick="toggleOrganizationActive(\'' + oid + '\', ' + isActive +
        ')" title="' + btnText + ' tổ chức">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v10M6.34 5.34a8 8 0 1 0 11.32 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
          '<span>' + btnText + '</span>' +
        '</button>';
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
      '<td class="actions-cell org-actions-cell"><div class="org-row-actions">' +
        '<button type="button" class="org-row-action-btn org-row-detail-btn" onclick="openOrgDetailModal(\'' + oid + '\')" title="Xem thông tin, gói, tòa nhà và tài khoản">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>' +
          '<span>Chi tiết</span>' +
        '</button>' +
        statusBtn +
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
let _orgDetailSubtab = 'overview';
let _orgDetailMine = false;
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
  closeOrgDetailPage();
  await switchTab('billing', { billingOrgId: orgId });
}

// ============================================================
// FINANCE (Phase 9 — Super only)
function formatVnd(n) {
  return Number(n || 0).toLocaleString('vi-VN');
}

const FINANCE_SUBTABS = new Set(['overview', 'customers', 'invoices', 'expenses', 'reports']);
const FINANCE_SUBTAB_KEY = 'indoorNavFinanceSubtab';

function switchFinanceSubtab(name) {
  const next = FINANCE_SUBTABS.has(name) ? name : 'overview';
  // Role dưới SUPER_ADMIN không vào subtab kế toán Thu–Chi
  if (currentUser?.role !== 'SUPER_ADMIN' && (next === 'overview' || next === 'expenses' || next === 'reports')) {
    return switchFinanceSubtab('invoices');
  }
  window._activeFinanceNavSub = next;
  document.querySelectorAll('.finance-subpanel').forEach((panel) => {
    panel.classList.toggle('is-active', panel.getAttribute('data-finance-panel') === next);
  });
  document.querySelectorAll('.finance-subnav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-finance-sub') === next);
  });
  try {
    localStorage.setItem(FINANCE_SUBTAB_KEY, next);
  } catch (_) {
    // ignore
  }
  if (window._currentDashboardTab === 'finance' && typeof syncDashboardNavActive === 'function') {
    syncDashboardNavActive('finance', { financeSub: next });
    if (typeof window.AdminShell?.syncActiveNavigation === 'function') {
      window.AdminShell.syncActiveNavigation();
    }
  }
}

function initFinanceSubtab() {
  let saved = 'overview';
  try {
    saved = localStorage.getItem(FINANCE_SUBTAB_KEY) || 'overview';
  } catch (_) {
    saved = 'overview';
  }
  if (currentUser?.role !== 'SUPER_ADMIN') saved = 'invoices';
  switchFinanceSubtab(saved);
}

async function loadFinanceTab() {
  const kpiEl = document.getElementById('financeKpiCards');
  if (!kpiEl) return;
  initFinanceSubtab();
  // Non-super: chỉ hóa đơn / khách — không load KPI Thu–Chi
  if (currentUser?.role !== 'SUPER_ADMIN') {
    try {
      await loadFinanceOrgs();
      await loadFinancePlans();
      await loadFinanceInvoices();
      await loadFinancePayments();
      await loadFinanceSettingsForm();
    } catch (e) {
      console.error('loadFinanceTab:', e);
    }
    return;
  }
  kpiEl.innerHTML = dashUiLoading('cards', { count: 4, label: 'Đang tải Thu – Chi…' });
  const dayEl = document.getElementById('financeDayPicker');
  if (dayEl && !dayEl.value) {
    dayEl.value = new Date().toISOString().slice(0, 10);
  }
  const dateEl = document.getElementById('expenseDate');
  if (dateEl && !dateEl.value) {
    dateEl.value = new Date().toISOString().slice(0, 10);
  }
  try {
    const day = dayEl?.value || '';
    const q = day ? ('?date=' + encodeURIComponent(day)) : '';
    const res = await apiFetch('/finance/overview' + q);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      kpiEl.innerHTML = '<p class="analytics-error">Lỗi: ' + escapeHtml(data.message || 'HTTP ' + res.status) + '</p>';
      return;
    }
    renderFinanceDayKpi(data);
    renderFinanceKpi(data.kpi || {});
    renderFinanceRevenueMonth(data.charts?.revenue_by_month || []);
    renderFinanceRevenuePlan(data.charts?.revenue_by_plan || {});
    renderFinanceExpenseCats(data.charts?.expense_by_category || []);
    renderFinanceExpiring(data.expiring_soon || []);
    renderFinanceActivity(data.recent_activity || []);
    await loadFinanceOrgs();
    await loadFinanceExpenses();
    await loadFinancePlans();
    await loadFinanceInvoices();
    await loadFinancePayments();
    await loadFinanceReportDefaults();
    await loadFinanceSettingsForm();
  } catch (e) {
    console.error('loadFinanceTab:', e);
    kpiEl.innerHTML = '<p class="analytics-error">Lỗi kết nối khi tải Thu – Chi.</p>';
  }
}

async function loadFinanceDayKpi() {
  const dayEl = document.getElementById('financeDayPicker');
  const day = dayEl?.value;
  if (!day) {
    alert('Chọn ngày cần xem.');
    return;
  }
  const box = document.getElementById('financeDayKpi');
  if (box) box.innerHTML = dashUiLoading('cards', { count: 3, label: 'Đang tải ngày…' });
  try {
    const res = await apiFetch('/finance/overview?date=' + encodeURIComponent(day));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (box) {
        box.innerHTML = '<p class="analytics-error">' + escapeHtml(data.message || 'Lỗi') + '</p>';
      }
      return;
    }
    renderFinanceDayKpi(data);
    renderFinanceKpi(data.kpi || {});
  } catch (e) {
    if (box) box.innerHTML = '<p class="analytics-error">Lỗi kết nối.</p>';
  }
}

async function loadFinanceReportDefaults() {
  const fromEl = document.getElementById('financeReportFrom');
  const toEl = document.getElementById('financeReportTo');
  if (!fromEl || !toEl) return;
  const now = new Date();
  if (!toEl.value) toEl.value = now.toISOString().slice(0, 10);
  if (!fromEl.value) {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    fromEl.value = first.toISOString().slice(0, 10);
  }
}

async function loadFinanceReportSummary() {
  const el = document.getElementById('financeReportSummary');
  if (!el) return;
  await loadFinanceReportDefaults();
  const from = document.getElementById('financeReportFrom')?.value || '';
  const to = document.getElementById('financeReportTo')?.value || '';
  el.innerHTML = dashUiLoading('cards', { count: 4, label: 'Đang tải báo cáo…' });
  try {
    const q = '?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
    const res = await apiFetch('/finance/reports/summary' + q);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      el.innerHTML = '<p class="analytics-error">' + escapeHtml(data.message || 'Lỗi') + '</p>';
      return;
    }
    const s = data.summary || {};
    el.innerHTML =
      '<div class="analytics-summary-grid">' +
        analyticsSummaryCard('Thu (khoảng)', formatVnd(s.revenue), 'amount') +
        analyticsSummaryCard('Chi (khoảng)', formatVnd(s.expense), 'amount') +
        analyticsSummaryCard('Lãi (thu−chi)', formatVnd(s.profit), 'amount') +
        analyticsSummaryCard('HĐ PAID / Payment',
          (s.paid_invoices || 0) + ' / ' + (s.payments_success || 0), 'invoice') +
      '</div>';
  } catch (e) {
    el.innerHTML = '<p class="analytics-error">Lỗi kết nối.</p>';
  }
}

async function exportFinanceReport(kind) {
  await loadFinanceReportDefaults();
  const from = document.getElementById('financeReportFrom')?.value || '';
  const to = document.getElementById('financeReportTo')?.value || '';
  const q =
    '?kind=' + encodeURIComponent(kind || 'invoices') +
    '&from=' + encodeURIComponent(from) +
    '&to=' + encodeURIComponent(to);
  try {
    const res = await apiFetch('/finance/reports/export' + q);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.message || 'Không export được');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (kind || 'invoices') + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('Lỗi kết nối khi export');
  }
}

async function loadFinanceSettingsForm() {
  try {
    const res = await apiFetch('/finance/settings');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const s = data.settings || {};
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v != null ? v : '';
    };
    set('finSetCompany', s.company_name);
    set('finSetTaxCode', s.tax_code);
    set('finSetAddress', s.address);
    set('finSetCurrency', s.currency || 'VND');
    set('finSetTaxPct', s.default_tax_percent != null ? s.default_tax_percent : 0);
    set('finSetPrefix', s.invoice_prefix || 'INV');
    set('finSetReminder', s.reminder_days_before_expiry != null ? s.reminder_days_before_expiry : 7);
    set('finSetFooter', s.invoice_footer);
  } catch (e) {
    /* ignore */
  }
}

async function saveFinanceSettings(ev) {
  ev.preventDefault();
  const payload = {
    company_name: document.getElementById('finSetCompany')?.value || '',
    tax_code: document.getElementById('finSetTaxCode')?.value || '',
    address: document.getElementById('finSetAddress')?.value || '',
    currency: document.getElementById('finSetCurrency')?.value || 'VND',
    default_tax_percent: Number(document.getElementById('finSetTaxPct')?.value || 0),
    invoice_prefix: document.getElementById('finSetPrefix')?.value || 'INV',
    reminder_days_before_expiry: Number(document.getElementById('finSetReminder')?.value || 7),
    invoice_footer: document.getElementById('finSetFooter')?.value || ''
  };
  try {
    const res = await apiFetch('/finance/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || 'Không lưu được');
      return false;
    }
    alert(data.message || 'Đã lưu.');
  } catch (e) {
    alert('Lỗi kết nối');
  }
  return false;
}

function renderFinanceDayKpi(data) {
  const el = document.getElementById('financeDayKpi');
  if (!el) return;
  const kpi = data.kpi || {};
  const d = data.as_of_date || document.getElementById('financeDayPicker')?.value || '';
  const label = d ? new Date(d + 'T12:00:00').toLocaleDateString('vi-VN') : 'ngày đã chọn';
  el.innerHTML =
    '<div class="analytics-summary-meta">Theo ngày <strong>' + escapeHtml(label) +
    '</strong> · Thu − Chi = Lãi · VND</div>' +
    '<div class="analytics-summary-grid">' +
      analyticsSummaryCard('Thu ngày', formatVnd(kpi.revenue_day != null ? kpi.revenue_day : kpi.revenue_today), 'amount') +
      analyticsSummaryCard('Chi ngày', formatVnd(kpi.expense_day || 0), 'amount') +
      analyticsSummaryCard('Lãi ngày', formatVnd(kpi.profit_day != null ? kpi.profit_day : 0), 'amount') +
      analyticsSummaryCard('HĐ PAID / khoản chi',
        (kpi.paid_invoices_day || kpi.paid_invoices_today || 0) + ' / ' + (kpi.expense_count_day || 0), 'invoice') +
    '</div>';
}

function renderFinanceKpi(kpi) {
  const el = document.getElementById('financeKpiCards');
  if (!el) return;
  el.innerHTML =
    '<div class="analytics-summary-meta">Tổng hợp tháng / năm (tính đến ngày đang xem) · VND</div>' +
    '<div class="analytics-summary-grid">' +
      analyticsSummaryCard('Thu tháng này', formatVnd(kpi.revenue_month), 'amount') +
      analyticsSummaryCard('Thu năm nay', formatVnd(kpi.revenue_year), 'amount') +
      analyticsSummaryCard('Chi tháng này', formatVnd(kpi.expense_month), 'amount') +
      analyticsSummaryCard('Lãi tháng (thu−chi)', formatVnd(kpi.profit_month), 'amount') +
      analyticsSummaryCard('Org / Paid / Expired',
        (kpi.orgs_total || 0) + ' / ' + (kpi.orgs_paid || 0) + ' / ' + (kpi.orgs_expired || 0), 'invoice') +
      analyticsSummaryCard('Hóa đơn OPEN', kpi.pending_invoices || 0, 'invoice') +
      analyticsSummaryCard('FREE / Grace',
        (kpi.orgs_free || 0) + ' / ' + (kpi.orgs_grace || 0), 'login') +
    '</div>';
}

function renderFinanceRevenueMonth(rows) {
  const el = document.getElementById('financeRevenueMonth');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<p class="analytics-muted">Chưa có doanh thu PAID.</p>';
    return;
  }
  el.innerHTML =
    '<table class="analytics-paid-table"><thead><tr><th>Tháng</th><th>Số HĐ</th><th>Số tiền</th></tr></thead><tbody>' +
    rows.map((r) =>
      '<tr><td>' + escapeHtml(r.month) + '</td><td>' + (r.count || 0) +
      '</td><td>' + formatVnd(r.amount) + '</td></tr>'
    ).join('') +
    '</tbody></table>';
}

function renderFinanceRevenuePlan(planMap) {
  const el = document.getElementById('financeRevenuePlan');
  if (!el) return;
  const keys = Object.keys(planMap || {});
  if (!keys.length) {
    el.innerHTML = '<p class="analytics-muted">Chưa có phân bố gói.</p>';
    return;
  }
  el.innerHTML = keys.map((k) => {
    const row = planMap[k] || {};
    return '<div class="analytics-plan-row"><strong>' + escapeHtml(k) +
      '</strong> · ' + formatVnd(row.amount) + ' (' + (row.count || 0) + ' HĐ)</div>';
  }).join('');
}

function renderFinanceExpenseCats(rows) {
  const el = document.getElementById('financeExpenseCats');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<p class="analytics-muted">Chưa ghi chi phí tháng này.</p>';
    return;
  }
  el.innerHTML = rows.map((r) =>
    '<div class="analytics-plan-row"><strong>' + escapeHtml(r.category) +
    '</strong> · ' + formatVnd(r.amount) + ' (' + (r.count || 0) + ')</div>'
  ).join('');
}

function renderFinanceExpiring(rows) {
  const el = document.getElementById('financeExpiring');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<p class="analytics-muted">Không có org sắp hết hạn trong 7 ngày.</p>';
    return;
  }
  el.innerHTML = rows.map((o) =>
    '<div class="analytics-alert-item"><strong>' + escapeHtml(o.name || '') +
    '</strong> · ' + escapeHtml(o.plan || '') + ' · hết hạn ' +
    escapeHtml(o.plan_expires_at ? new Date(o.plan_expires_at).toLocaleString('vi-VN') : '-') +
    ' <button type="button" class="btn-edit" style="margin-left:8px;padding:4px 8px;font-size:12px;" onclick="openBillingTabForOrg(\'' +
    escapeHtml(String(o._id)) + '\')">Gói &amp; TT</button></div>'
  ).join('');
}

function renderFinanceActivity(rows) {
  const el = document.getElementById('financeActivity');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<p class="analytics-muted">Chưa có hoạt động.</p>';
    return;
  }
  el.innerHTML = rows.map((ev) =>
    '<div class="analytics-alert-item"><span class="badge" style="background:#334155;color:#fff;font-size:11px;">' +
    escapeHtml(ev.type) + '</span> ' + escapeHtml(ev.label || '') +
    (ev.org_name ? ' · ' + escapeHtml(ev.org_name) : '') +
    ' · <strong>' + formatVnd(ev.amount) + '</strong> · ' +
    escapeHtml(ev.at ? new Date(ev.at).toLocaleString('vi-VN') : '-') + '</div>'
  ).join('');
}

async function loadFinanceOrgs() {
  const el = document.getElementById('financeOrgList');
  if (!el) return;
  el.innerHTML = dashUiLoading('table', { rows: 5, cols: 8, label: 'Đang tải danh sách org…' });
  const status = document.getElementById('financeOrgStatusFilter')?.value || '';
  try {
    const q = status ? ('?status=' + encodeURIComponent(status)) : '';
    const res = await apiFetch('/finance/orgs' + q);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      el.innerHTML = '<p class="analytics-error">' + escapeHtml(data.message || 'Lỗi') + '</p>';
      return;
    }
    const orgs = data.organizations || [];
    if (!orgs.length) {
      el.innerHTML = dashUiEmpty({
        icon: 'table',
        title: 'Không có tổ chức',
        hint: 'Không có tổ chức khớp bộ lọc.'
      });
      return;
    }
    el.innerHTML =
      '<div class="finance-table-wrap"><table class="data-table finance-data-table"><thead><tr>' +
      '<th>Tên</th><th>Gói</th><th>Billing</th><th>Hết hạn</th><th>HĐ</th><th>OPEN</th><th>Đã thu</th><th></th>' +
      '</tr></thead><tbody>' +
      orgs.map((o) =>
        '<tr><td>' + escapeHtml(o.name || '') + '</td><td>' + escapeHtml(o.plan || '') +
        '</td><td>' + escapeHtml(o.billing_status || '') +
        '</td><td>' + escapeHtml(o.plan_expires_at ? new Date(o.plan_expires_at).toLocaleDateString('vi-VN') : '-') +
        '</td><td>' + (o.invoice_count || 0) + '</td><td>' + (o.open_invoices || 0) +
        '</td><td>' + formatVnd(o.paid_amount) +
        '</td><td><button type="button" class="btn-edit" style="padding:4px 8px;font-size:12px;" onclick="openBillingTabForOrg(\'' +
        String(o._id) + '\')">Chi tiết</button></td></tr>'
      ).join('') +
      '</tbody></table></div>';
  } catch (e) {
    console.error('loadFinanceOrgs:', e);
    el.innerHTML = '<p class="analytics-error">Lỗi kết nối.</p>';
  }
}

async function loadFinanceExpenses() {
  const el = document.getElementById('financeExpenseList');
  if (!el) return;
  try {
    const res = await apiFetch('/finance/expenses?limit=50');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      el.innerHTML = '<p class="analytics-error">' + escapeHtml(data.message || 'Lỗi') + '</p>';
      return;
    }
    const items = data.expenses || [];
    if (!items.length) {
      el.innerHTML = dashUiEmpty({
        icon: 'wallet',
        title: 'Chưa có chi phí',
        hint: 'Thêm Render, Domain… ở form phía trên.'
      });
      return;
    }
    el.innerHTML =
      '<div class="finance-table-wrap"><table class="data-table finance-data-table"><thead><tr>' +
      '<th>Ngày</th><th>Danh mục</th><th>NCC</th><th>Số tiền</th><th>Ghi chú</th><th></th>' +
      '</tr></thead><tbody>' +
      items.map((x) =>
        '<tr><td>' + escapeHtml(x.expense_date ? new Date(x.expense_date).toLocaleDateString('vi-VN') : '-') +
        '</td><td>' + escapeHtml(x.category) +
        '</td><td>' + escapeHtml(x.vendor || '-') +
        '</td><td>' + formatVnd(x.amount) +
        '</td><td>' + escapeHtml(x.note || '-') +
        '</td><td><button type="button" class="btn-logout" style="padding:4px 8px;font-size:12px;background:#e74c3c;" onclick="deleteFinanceExpense(\'' +
        String(x._id) + '\')">Xóa</button></td></tr>'
      ).join('') +
      '</tbody></table></div>';
  } catch (e) {
    console.error('loadFinanceExpenses:', e);
    el.innerHTML = '<p class="analytics-error">Lỗi kết nối.</p>';
  }
}

async function submitFinanceExpense(ev) {
  ev.preventDefault();
  const payload = {
    expense_date: document.getElementById('expenseDate')?.value,
    category: document.getElementById('expenseCategory')?.value || 'OTHER',
    vendor: document.getElementById('expenseVendor')?.value || '',
    amount: Number(document.getElementById('expenseAmount')?.value),
    note: document.getElementById('expenseNote')?.value || ''
  };
  if (!Number.isFinite(payload.amount) || payload.amount < 0) {
    alert('Số tiền không hợp lệ.');
    return false;
  }
  try {
    const res = await apiFetch('/finance/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || 'Không thêm được chi phí');
      return false;
    }
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseNote').value = '';
    await loadFinanceTab();
  } catch (e) {
    alert('Lỗi kết nối');
  }
  return false;
}

async function deleteFinanceExpense(id) {
  if (!id || !confirm('Xóa khoản chi này?')) return;
  try {
    const res = await apiFetch('/finance/expenses/' + encodeURIComponent(id), { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || 'Không xóa được');
      return;
    }
    await loadFinanceTab();
  } catch (e) {
    alert('Lỗi kết nối');
  }
}

async function loadFinancePlans() {
  const el = document.getElementById('financePlanList');
  if (!el) return;
  try {
    const res = await apiFetch('/finance/plans');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      el.innerHTML = '<p class="analytics-error">' + escapeHtml(data.message || 'Lỗi') + '</p>';
      return;
    }
    const plans = data.plans || [];
    if (!plans.length) {
      el.innerHTML = dashUiEmpty({
        icon: 'chart',
        title: 'Chưa có gói',
        hint: 'Mở tab Danh mục gói để tạo gói dịch vụ.'
      });
      return;
    }
    el.innerHTML =
      '<div class="finance-table-wrap"><table class="data-table finance-data-table finance-plan-table" style="table-layout:fixed;border-collapse:collapse;">' +
      '<colgroup>' +
      '<col style="width:12%"><col style="width:22%"><col style="width:16%"><col style="width:10%">' +
      '<col style="width:12%"><col style="width:12%"><col style="width:10%">' +
      '</colgroup>' +
      '<thead><tr>' +
      '<th style="text-align:left;">Mã</th><th style="text-align:left;">Tên</th><th style="text-align:right;">Giá</th>' +
      '<th style="text-align:center;">Ngày</th><th style="text-align:center;">Tòa</th>' +
      '<th style="text-align:center;">User</th><th style="text-align:center;">Active</th>' +
      '</tr></thead><tbody>' +
      plans.map((p) => {
        const buildings =
          p.max_buildings == null ? '<span title="Không giới hạn">∞</span>' : String(p.max_buildings);
        const users =
          p.max_users == null ? '<span title="Không giới hạn">∞</span>' : String(p.max_users);
        return (
          '<tr><td>' + escapeHtml(p.code) +
          '</td><td>' + escapeHtml(p.name) +
          '</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + formatVnd(p.price_vnd) +
          '</td><td style="text-align:center;">' + (p.period_days || '-') +
          '</td><td style="text-align:center;">' + buildings +
          '</td><td style="text-align:center;">' + users +
          '</td><td style="text-align:center;">' + (p.is_active ? 'Có' : 'Không') + '</td></tr>'
        );
      }).join('') +
      '</tbody></table></div>' +
      '<p class="analytics-muted" style="margin-top:10px;">Chỉnh sửa đầy đủ tại tab <button type="button" class="linkish" onclick="switchTab(\'plans\')">Danh mục gói</button>.</p>';
  } catch (e) {
    el.innerHTML = '<p class="analytics-error">Lỗi kết nối.</p>';
  }
}

let plansCatalogCache = [];

function formatPlanLimitLabel(value) {
  if (value == null || value === '') return 'Không giới hạn';
  return String(value);
}

async function loadPlansTab() {
  const grid = document.getElementById('plansCatalogGrid');
  if (!grid) return;
  grid.innerHTML = dashUiLoading('cards', { count: 3, label: 'Đang tải danh mục gói…' });
  try {
    const res = await apiFetch('/finance/plans');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      grid.innerHTML = dashUiError(data.message || 'Không tải được danh mục gói');
      return;
    }
    plansCatalogCache = Array.isArray(data.plans) ? data.plans : [];
    applyPlanCatalogToUiMaps(plansCatalogCache);
    populatePlanSelectsFromCatalog();
    renderPlansCatalog(plansCatalogCache);
  } catch (e) {
    grid.innerHTML = dashUiError(e.message || 'Lỗi kết nối');
  }
}

function renderPlansCatalog(plans) {
  const grid = document.getElementById('plansCatalogGrid');
  if (!grid) return;
  if (!plans.length) {
    grid.innerHTML = dashUiEmpty({
      icon: 'chart',
      title: 'Chưa có gói trong catalog',
      hint: 'Bấm «Thêm gói» để tạo FREE / PRO / ENTERPRISE hoặc gói tùy chỉnh.'
    });
    return;
  }
  grid.innerHTML = plans.map((plan) => {
    const id = escapeHtml(plan._id || '');
    const code = escapeHtml(plan.code || '');
    const active = plan.is_active !== false;
    const features = Array.isArray(plan.features) ? plan.features : [];
    const featureHtml = features.length
      ? '<ul class="plan-card-features">' + features.map((f) => '<li>' + escapeHtml(f) + '</li>').join('') + '</ul>'
      : '<p class="plan-card-empty-features">Chưa có mô tả tính năng</p>';
    return (
      '<article class="plan-card' + (active ? '' : ' is-inactive') + '" data-plan-id="' + id + '">' +
        '<div class="plan-card-top">' +
          '<span class="plan-card-code">' + code + '</span>' +
          '<span class="plan-card-status ' + (active ? 'is-on' : 'is-off') + '">' +
            (active ? 'Đang bán' : 'Ngừng bán') +
          '</span>' +
        '</div>' +
        '<h4>' + escapeHtml(plan.name || code) + '</h4>' +
        '<p class="plan-card-desc">' + escapeHtml(plan.description || '—') + '</p>' +
        '<div class="plan-card-price">' +
          '<strong>' + formatVnd(plan.price_vnd || 0) + '</strong>' +
          '<span>/ ' + (Number(plan.period_days) || 30) + ' ngày</span>' +
        '</div>' +
        '<div class="plan-card-limits">' +
          '<div><span>Tòa nhà</span><strong>' + escapeHtml(formatPlanLimitLabel(plan.max_buildings)) + '</strong></div>' +
          '<div><span>Tài khoản</span><strong>' + escapeHtml(formatPlanLimitLabel(plan.max_users)) + '</strong></div>' +
        '</div>' +
        '<div class="plan-card-audience" style="display:flex; flex-wrap:wrap; gap:6px; margin:8px 0 4px;">' +
          (plan.is_personal ? '<span style="font-size:11px; padding:2px 8px; border-radius:999px; background:#fef3c7; color:#92400e;">Cá nhân</span>' : '') +
          (plan.is_organization ? '<span style="font-size:11px; padding:2px 8px; border-radius:999px; background:#dbeafe; color:#1e40af;">Tổ chức</span>' : '') +
          (plan.show_on_landing !== false ? '<span style="font-size:11px; padding:2px 8px; border-radius:999px; background:#ecfdf3; color:#067647;">Landing</span>' : '') +
        '</div>' +
        featureHtml +
        '<div class="plan-card-actions">' +
          '<button type="button" class="btn-edit" onclick="openPlanEditor(\'' + id + '\')">Sửa</button>' +
          '<button type="button" class="btn-edit" onclick="togglePlanActive(\'' + id + '\',' +
            (active ? 'false' : 'true') + ')">' + (active ? 'Ngừng bán' : 'Mở bán') + '</button>' +
          (String(plan.code || '').toUpperCase() === 'FREE'
            ? ''
            : '<button type="button" class="btn-logout" onclick="deletePlanCatalog(\'' + id + '\')">Xóa</button>') +
        '</div>' +
      '</article>'
    );
  }).join('');
}

function openPlanEditor(planId) {
  const modal = document.getElementById('planEditorModal');
  const title = document.getElementById('planEditorTitle');
  const msg = document.getElementById('planEditorMessage');
  if (!modal) return;
  if (msg) {
    msg.style.display = 'none';
    msg.textContent = '';
  }
  const plan = planId
    ? plansCatalogCache.find((p) => String(p._id) === String(planId))
    : null;
  document.getElementById('planEditId').value = plan ? String(plan._id) : '';
  const codeEl = document.getElementById('planEditCode');
  codeEl.value = plan ? (plan.code || '') : '';
  codeEl.readOnly = !!plan;
  document.getElementById('planEditName').value = plan ? (plan.name || '') : '';
  document.getElementById('planEditDescription').value = plan ? (plan.description || '') : '';
  document.getElementById('planEditPrice').value = plan ? (Number(plan.price_vnd) || 0) : 0;
  document.getElementById('planEditPeriod').value = plan ? (Number(plan.period_days) || 30) : 30;
  document.getElementById('planEditBuildings').value =
    plan && plan.max_buildings != null ? plan.max_buildings : '';
  document.getElementById('planEditUsers').value =
    plan && plan.max_users != null ? plan.max_users : '';
  document.getElementById('planEditSort').value = plan ? (Number(plan.sort_order) || 10) : 10;
  document.getElementById('planEditActive').checked = plan ? plan.is_active !== false : true;
  document.getElementById('planEditFeatures').value = Array.isArray(plan?.features)
    ? plan.features.join('\n')
    : '';
  const isPersonal = plan ? plan.is_personal === true : false;
  const isOrg = plan
    ? plan.is_organization === true
    : true; // gói mới mặc định gắn Tổ chức nếu admin không chọn
  document.getElementById('planEditIsPersonal').checked = isPersonal;
  document.getElementById('planEditIsOrganization').checked = isOrg;
  document.getElementById('planEditShowLanding').checked = plan ? plan.show_on_landing !== false : true;
  document.getElementById('planEditPMaxBuildings').value =
    plan && plan.personal_max_buildings != null ? plan.personal_max_buildings : '';
  document.getElementById('planEditPMaxFloors').value =
    plan && plan.personal_max_floors_per_building != null ? plan.personal_max_floors_per_building : '';
  document.getElementById('planEditPMaxMaps').value =
    plan && plan.personal_max_maps != null ? plan.personal_max_maps : '';
  document.getElementById('planEditPMaxQr').value =
    plan && plan.personal_max_qr != null ? plan.personal_max_qr : '';
  togglePlanPersonalQuotaFields();
  if (title) title.textContent = plan ? 'Sửa gói ' + (plan.code || '') : 'Thêm gói dịch vụ';
  modal.style.display = 'flex';
}

function togglePlanPersonalQuotaFields() {
  syncPlanAudienceFields();
}

function syncPlanAudienceFields() {
  const personalOn = document.getElementById('planEditIsPersonal')?.checked === true;
  const orgOn = document.getElementById('planEditIsOrganization')?.checked === true;
  const personalBox = document.getElementById('planEditPersonalQuota');
  const orgBox = document.getElementById('planEditOrgQuota');
  if (personalBox) personalBox.style.display = personalOn ? '' : 'none';
  if (orgBox) orgBox.style.display = orgOn ? '' : 'none';
}

function closePlanEditor() {
  const modal = document.getElementById('planEditorModal');
  if (modal) modal.style.display = 'none';
}

async function savePlanEditor(ev) {
  ev.preventDefault();
  const msg = document.getElementById('planEditorMessage');
  const id = document.getElementById('planEditId')?.value?.trim();
  const code = String(document.getElementById('planEditCode')?.value || '').trim().toUpperCase();
  const name = String(document.getElementById('planEditName')?.value || '').trim();
  const description = String(document.getElementById('planEditDescription')?.value || '').trim();
  const price_vnd = Number(document.getElementById('planEditPrice')?.value) || 0;
  const period_days = Number(document.getElementById('planEditPeriod')?.value) || 30;
  const buildingsRaw = document.getElementById('planEditBuildings')?.value;
  const usersRaw = document.getElementById('planEditUsers')?.value;
  const sort_order = Number(document.getElementById('planEditSort')?.value) || 0;
  const is_active = document.getElementById('planEditActive')?.checked !== false;
  const features = String(document.getElementById('planEditFeatures')?.value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!code || !name) {
    if (msg) {
      msg.style.display = '';
      msg.textContent = 'Vui lòng nhập mã và tên gói.';
    }
    return false;
  }
  const payload = {
    code,
    name,
    description,
    price_vnd,
    period_days,
    max_buildings: buildingsRaw === '' || buildingsRaw == null ? null : Number(buildingsRaw),
    max_users: usersRaw === '' || usersRaw == null ? null : Number(usersRaw),
    sort_order,
    is_active,
    features,
    is_personal: document.getElementById('planEditIsPersonal')?.checked === true,
    is_organization: document.getElementById('planEditIsOrganization')?.checked === true,
    show_on_landing: document.getElementById('planEditShowLanding')?.checked !== false,
    personal_max_buildings: (() => {
      const v = document.getElementById('planEditPMaxBuildings')?.value;
      return v === '' || v == null ? null : Number(v);
    })(),
    personal_max_floors_per_building: (() => {
      const v = document.getElementById('planEditPMaxFloors')?.value;
      return v === '' || v == null ? null : Number(v);
    })(),
    personal_max_maps: (() => {
      const v = document.getElementById('planEditPMaxMaps')?.value;
      return v === '' || v == null ? null : Number(v);
    })(),
    personal_max_qr: (() => {
      const v = document.getElementById('planEditPMaxQr')?.value;
      return v === '' || v == null ? null : Number(v);
    })()
  };
  if (!payload.is_personal && !payload.is_organization && !payload.show_on_landing) {
    if (msg) {
      msg.style.display = '';
      msg.textContent = 'Chọn ít nhất một đối tượng hiển thị (Cá nhân / Tổ chức / Landing).';
    }
    return false;
  }
  try {
    const res = await apiFetch(id ? ('/finance/plans/' + encodeURIComponent(id)) : '/finance/plans', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (msg) {
        msg.style.display = '';
        msg.textContent = data.message || 'Không lưu được gói.';
      }
      return false;
    }
    closePlanEditor();
    await refreshPlanDependentViews();
  } catch (e) {
    if (msg) {
      msg.style.display = '';
      msg.textContent = e.message || 'Lỗi kết nối';
    }
  }
  return false;
}

async function togglePlanActive(planId, nextActive) {
  if (!planId) return;
  const label = nextActive === true || nextActive === 'true' ? 'mở bán lại' : 'ngừng bán';
  if (!confirm('Xác nhận ' + label + ' gói này?')) return;
  try {
    const res = await apiFetch('/finance/plans/' + encodeURIComponent(planId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: nextActive === true || nextActive === 'true' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || 'Không cập nhật được trạng thái gói');
      return;
    }
    await refreshPlanDependentViews();
  } catch (e) {
    alert(e.message || 'Lỗi kết nối');
  }
}

async function deletePlanCatalog(planId) {
  if (!planId) return;
  const plan = plansCatalogCache.find((p) => String(p._id) === String(planId));
  const code = plan?.code || planId;
  if (!confirm('Xóa vĩnh viễn gói ' + code + '?\nChỉ xóa được khi không còn tổ chức nào đang dùng gói này.')) return;
  try {
    const res = await apiFetch('/finance/plans/' + encodeURIComponent(planId), { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || 'Không xóa được gói');
      return;
    }
    await refreshPlanDependentViews();
  } catch (e) {
    alert(e.message || 'Lỗi kết nối');
  }
}

async function loadFinanceInvoices() {
  const el = document.getElementById('financeInvoiceList');
  if (!el) return;
  const status = document.getElementById('financeInvoiceStatusFilter')?.value || '';
  try {
    const q = status ? ('?status=' + encodeURIComponent(status)) : '';
    const res = await apiFetch('/finance/invoices' + q);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      _financeInvoicesCache = [];
      el.innerHTML = '<p class="analytics-error">' + escapeHtml(data.message || 'Lỗi') + '</p>';
      renderPagination('financeInvoices', 0, 1);
      return;
    }
    _financeInvoicesCache = Array.isArray(data.invoices) ? data.invoices : [];
    renderFinanceInvoicesFromCache(true);
  } catch (e) {
    _financeInvoicesCache = [];
    el.innerHTML = '<p class="analytics-error">Lỗi kết nối.</p>';
    renderPagination('financeInvoices', 0, 1);
  }
}

function renderFinanceInvoicesFromCache(resetPage) {
  const el = document.getElementById('financeInvoiceList');
  if (!el) return;
  if (resetPage !== false) window._financeInvoicesPage = 1;
  const rows = _financeInvoicesCache || [];
  if (!rows.length) {
    el.innerHTML = dashUiEmpty({
      icon: 'invoice',
      title: 'Chưa có hóa đơn',
      hint: 'Tạo hóa đơn mới bằng form phía trên.'
    });
    renderPagination('financeInvoices', 0, 1);
    return;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  let page = window._financeInvoicesPage || 1;
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  window._financeInvoicesPage = page;
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = rows.slice(start, start + PAGE_SIZE);
  el.innerHTML =
    '<div class="finance-table-wrap finance-table-wrap--borderless"><table class="data-table finance-data-table finance-invoice-table"><thead><tr>' +
    '<th>Số HĐ</th><th>Org</th><th>Gói</th><th>Tổng</th><th>Status</th><th></th>' +
    '</tr></thead><tbody>' +
    pageItems.map((inv) => {
      const oid = inv.organization?._id || inv.organization_id || '';
      const oname = inv.organization?.name || '-';
      const actions =
        '<button type="button" class="btn-edit" style="padding:4px 8px;font-size:12px;" onclick="openFinanceInvoicePdf(\'' +
        String(inv._id) + '\')">PDF</button> ' +
        (inv.status === 'OPEN' || inv.status === 'DRAFT'
          ? '<button type="button" class="btn-edit" style="padding:4px 8px;font-size:12px;background:#16a34a;color:#fff;border-color:#16a34a;" onclick="markFinanceInvoicePaid(\'' +
            String(inv._id) + '\')">Đã thu</button> ' +
            '<button type="button" class="btn-logout" style="padding:4px 8px;font-size:12px;background:#e74c3c;" onclick="voidFinanceInvoice(\'' +
            String(inv._id) + '\')">Hủy</button>'
          : '');
      return '<tr><td>' + escapeHtml(inv.invoice_number || '') +
        '</td><td title="' + escapeHtml(String(oid)) + '">' + escapeHtml(oname) +
        '</td><td>' + escapeHtml(inv.plan || '') +
        '</td><td>' + formatVnd(inv.total != null ? inv.total : inv.amount) +
        '</td><td>' + escapeHtml(inv.status || '') +
        '</td><td>' + actions + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
  renderPagination('financeInvoices', rows.length, page);
}

async function submitFinanceInvoice(ev) {
  ev.preventDefault();
  const orgId = document.getElementById('invOrgId')?.value?.trim();
  const plan = document.getElementById('invPlan')?.value || 'PRO';
  const amountRaw = document.getElementById('invAmount')?.value;
  const payload = { organization_id: orgId, plan };
  if (amountRaw !== '' && amountRaw != null && Number(amountRaw) > 0) {
    payload.amount = Number(amountRaw);
  }
  try {
    const res = await apiFetch('/finance/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || 'Không tạo được HĐ');
      return false;
    }
    alert('Đã tạo ' + (data.invoice?.invoice_number || 'hóa đơn'));
    await loadFinanceInvoices();
  } catch (e) {
    alert('Lỗi kết nối');
  }
  return false;
}

async function voidFinanceInvoice(id) {
  if (!id || !confirm('Hủy (VOID) hóa đơn này?')) return;
  try {
    const res = await apiFetch('/finance/invoices/' + encodeURIComponent(id) + '/void', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Super hủy từ UI' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || 'Không hủy được');
      return;
    }
    await loadFinanceInvoices();
    if (typeof loadFinancePayments === 'function') await loadFinancePayments();
    if (typeof loadFinanceTab === 'function') await loadFinanceTab();
  } catch (e) {
    alert('Lỗi kết nối');
  }
}

async function markFinanceInvoicePaid(id) {
  if (!id || !confirm('Ghi nhận đã thu hóa đơn này (PAID + sổ thanh toán)?\nLưu ý: không tự gia hạn gói — dùng tab Gói & Thanh toán nếu cần kích hoạt.')) {
    return;
  }
  try {
    const res = await apiFetch('/finance/invoices/' + encodeURIComponent(id) + '/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'MANUAL' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || ('Không ghi nhận được (HTTP ' + res.status + ')'));
      return;
    }
    alert(data.message || 'Đã thu.');
    await loadFinanceInvoices();
    if (typeof loadFinancePayments === 'function') await loadFinancePayments();
    if (typeof loadFinanceTab === 'function') await loadFinanceTab();
  } catch (e) {
    alert('Lỗi kết nối');
  }
}

async function openFinanceInvoicePdf(id) {
  if (!id) return;
  try {
    const res = await apiFetch('/finance/invoices/' + encodeURIComponent(id) + '/pdf');
    const html = await res.text();
    if (!res.ok) {
      alert('Không mở được PDF');
      return;
    }
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    } else {
      alert('Trình duyệt chặn popup — cho phép popup để xem hóa đơn.');
    }
  } catch (e) {
    alert('Lỗi kết nối');
  }
}

async function loadFinancePayments() {
  const el = document.getElementById('financePaymentList');
  if (!el) return;
  const status = document.getElementById('financePaymentStatusFilter')?.value || '';
  try {
    const q = status ? ('?status=' + encodeURIComponent(status)) : '';
    const res = await apiFetch('/finance/payments' + q);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      _financePaymentsCache = [];
      el.innerHTML = '<p class="analytics-error">' + escapeHtml(data.message || 'Lỗi') + '</p>';
      renderPagination('financePayments', 0, 1);
      return;
    }
    _financePaymentsCache = Array.isArray(data.payments) ? data.payments : [];
    renderFinancePaymentsFromCache(true);
  } catch (e) {
    _financePaymentsCache = [];
    el.innerHTML = '<p class="analytics-error">Lỗi kết nối.</p>';
    renderPagination('financePayments', 0, 1);
  }
}

function renderFinancePaymentsFromCache(resetPage) {
  const el = document.getElementById('financePaymentList');
  if (!el) return;
  if (resetPage !== false) window._financePaymentsPage = 1;
  const rows = _financePaymentsCache || [];
  if (!rows.length) {
    el.innerHTML = dashUiEmpty({
      icon: 'wallet',
      title: 'Chưa có giao dịch',
      hint: 'Sổ thu tiền sẽ hiển thị khi có payment thành công.'
    });
    renderPagination('financePayments', 0, 1);
    return;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  let page = window._financePaymentsPage || 1;
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  window._financePaymentsPage = page;
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = rows.slice(start, start + PAGE_SIZE);
  el.innerHTML =
    '<div class="finance-table-wrap finance-table-wrap--borderless"><table class="data-table finance-data-table finance-payment-table"><thead><tr>' +
    '<th>Ngày</th><th>Org</th><th>HĐ</th><th>Method</th><th>Số tiền</th><th>Status</th><th>Ref</th>' +
    '</tr></thead><tbody>' +
    pageItems.map((p) =>
      '<tr><td>' + escapeHtml(p.paid_at ? new Date(p.paid_at).toLocaleString('vi-VN') : '-') +
      '</td><td>' + escapeHtml(p.organization_id?.name || '-') +
      '</td><td>' + escapeHtml(p.invoice_id?.invoice_number || '-') +
      '</td><td>' + escapeHtml(p.method || '') +
      '</td><td>' + formatVnd(p.amount) +
      '</td><td>' + escapeHtml(p.status || '') +
      '</td><td>' + escapeHtml(p.external_ref || '-') + '</td></tr>'
    ).join('') +
    '</tbody></table></div>';
  renderPagination('financePayments', rows.length, page);
}

async function loadAnalyticsTab() {
  const range = document.getElementById('analyticsRangeSelect')?.value || '30d';
  const cards = document.getElementById('analyticsSummaryCards');
  const loginEl = document.getElementById('analyticsLoginChart');
  const publishEl = document.getElementById('analyticsPublishChart');
  const qrEl = document.getElementById('analyticsQrChart');
  const navigationEl = document.getElementById('analyticsNavigationChart');
  const revenueEl = document.getElementById('analyticsRevenueTrend');
  if (!cards) return;

  cards.innerHTML = dashUiLoading('cards', { count: 4, label: 'Đang tải Phân tích…' });
  [
    loginEl, publishEl, qrEl, navigationEl, revenueEl,
    document.getElementById('analyticsRevenueByPlan'),
    document.getElementById('analyticsSubscriptionTrend'),
    document.getElementById('analyticsConversionFunnel'),
    document.getElementById('analyticsOrgGrowth'),
    document.getElementById('analyticsBuildingGrowth'),
    document.getElementById('analyticsUserGrowth'),
    document.getElementById('analyticsMapGrowth'),
    document.getElementById('analyticsTopOrganizations'),
    document.getElementById('analyticsTopBuildings'),
    document.getElementById('analyticsTopPlans'),
    document.getElementById('analyticsInsights')
  ].forEach((element) => {
    if (element) element.innerHTML = '';
  });

  try {
    const params = new URLSearchParams({ range });
    if (range === 'custom') {
      const from = document.getElementById('analyticsFromDate')?.value || '';
      const to = document.getElementById('analyticsToDate')?.value || '';
      if (!from || !to || from > to) {
        cards.innerHTML = '<p class="analytics-error">Vui lòng chọn khoảng ngày hợp lệ.</p>';
        return;
      }
      params.set('from', from);
      params.set('to', to);
    }
    const response = await apiFetch('/analytics/overview?' + params.toString());
    const overview = await response.json().catch(() => ({}));
    if (!response.ok) {
      cards.innerHTML = '<p class="analytics-error">Lỗi: ' + escapeHtml(overview.message || 'HTTP ' + response.status) + '</p>';
      return;
    }
    renderAnalyticsSummary(overview);
    renderAnalyticsLineChart(revenueEl, overview.series?.revenue || [], 'amount', { money: true, area: true });
    renderAnalyticsLineChart(loginEl, overview.series?.login || [], 'count', { area: true });
    renderAnalyticsColumnChart(publishEl, overview.series?.publish || [], 'count');
    renderAnalyticsColumnChart(qrEl, overview.series?.qr_scan || [], 'count');
    renderAnalyticsUnavailableChart(navigationEl, 'Chưa có nguồn ghi nhận lượt tìm đường.');
    renderAnalyticsBusiness(overview);
    renderAnalyticsGrowth(overview.growth || {});
    renderAnalyticsRankings(overview.rankings || {});
    renderAnalyticsInsights(overview.insights || []);
  } catch (e) {
    console.error('loadAnalyticsTab error:', e);
    cards.innerHTML = '<p class="analytics-error">Lỗi kết nối khi tải Phân tích.</p>';
  }
}

function onAnalyticsRangeChange() {
  const range = document.getElementById('analyticsRangeSelect')?.value || '30d';
  const custom = document.getElementById('analyticsCustomRange');
  if (custom) custom.hidden = range !== 'custom';
  if (range !== 'custom') loadAnalyticsTab();
}

function isAnalyticsOrgScope(overview) {
  return overview?.scope === 'organization' || currentUser?.role === 'ORG_ADMIN';
}

function renderAnalyticsSummary(overview) {
  const cards = document.getElementById('analyticsSummaryCards');
  if (!cards) return;
  window._analyticsScope = overview?.scope || 'platform';
  const t = overview.totals || {};
  const isOrg = isAnalyticsOrgScope(overview);
  const scopeLabel = isOrg ? 'Tổ chức của bạn' : 'Toàn nền tảng';
  const orgName = overview.organization?.name
    ? ' · ' + escapeHtml(overview.organization.name)
    : '';
  const moneyLabel = isOrg ? 'Chi phí đã trả' : 'Doanh thu';
  const invoiceLabel = 'Hóa đơn đã thanh toán';
  const changes = overview.changes || {};
  cards.innerHTML =
    '<div class="analytics-summary-meta">' + escapeHtml(scopeLabel) + orgName +
      ' · ' + escapeHtml(overview.range || '') + '</div>' +
    '<div class="analytics-summary-grid">' +
      analyticsSummaryCard('Đăng nhập', t.logins || 0, 'login', changes.logins, "switchTab('logs')") +
      analyticsSummaryCard('Xuất bản bản đồ', t.publishes || 0, 'publish', changes.publishes, "switchTab('buildings')") +
      analyticsSummaryCard(invoiceLabel, t.paid_invoices || 0, 'invoice', changes.paid_invoices, 'analyticsOpenInvoices()') +
      analyticsSummaryCard(moneyLabel, analyticsMoney(t.paid_amount), 'amount', changes.paid_amount, 'analyticsOpenInvoices()') +
    '</div>';
}

function analyticsSummaryCard(label, value, kind, change, onClick) {
  const delta = Number(change) || 0;
  const deltaClass = delta > 0 ? 'is-up' : (delta < 0 ? 'is-down' : 'is-flat');
  const deltaIcon = delta > 0 ? '▲' : (delta < 0 ? '▼' : '→');
  return '<button type="button" class="analytics-summary-card analytics-card-' + kind + '"' +
    (onClick ? ' onclick="' + onClick + '"' : '') + '>' +
    '<div class="analytics-summary-label">' + escapeHtml(label) + '</div>' +
    '<div class="analytics-summary-value">' + escapeHtml(String(value)) + '</div>' +
    '<div class="analytics-summary-delta ' + deltaClass + '">' + deltaIcon + ' ' +
      escapeHtml(String(Math.abs(delta))) + '% <span>so với kỳ trước</span></div>' +
  '</button>';
}

function analyticsMoney(value) {
  const amount = Number(value) || 0;
  if (amount >= 1000000000) return (amount / 1000000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tỷ ₫';
  if (amount >= 1000000) return (amount / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' triệu ₫';
  return amount.toLocaleString('vi-VN') + ' ₫';
}

function analyticsOpenInvoices() {
  if (window._analyticsScope === 'organization') {
    switchTab('billing');
    return;
  }
  openFinanceInvoicesNav();
}

function analyticsOpenPlan(plan) {
  if (window._analyticsScope === 'organization') {
    switchTab('billing');
    return;
  }
  platformJumpOrgPlan(plan);
}

function analyticsOpenOrganization(orgId) {
  if (window._analyticsScope === 'organization') {
    switchTab('profile');
    return;
  }
  openOrgDetailModal(orgId);
}

function renderAnalyticsLineChart(container, series, field, options) {
  if (!container) return;
  const rows = Array.isArray(series) ? series : [];
  if (!rows.length) {
    container.innerHTML = '<p class="analytics-empty">Chưa có dữ liệu trong khoảng này.</p>';
    return;
  }
  const opts = options || {};
  const values = rows.map((row) => Number(row[field]) || 0);
  const max = Math.max(1, ...values);
  const width = 760;
  const height = 230;
  const left = 48;
  const right = 12;
  const top = 16;
  const bottom = 32;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (index) => left + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const y = (value) => top + plotHeight - (value / max) * plotHeight;
  const points = rows.map((row, index) => `${x(index).toFixed(1)},${y(values[index]).toFixed(1)}`).join(' ');
  const area = left + ',' + (top + plotHeight) + ' ' + points + ' ' +
    (left + plotWidth) + ',' + (top + plotHeight);
  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const gy = top + plotHeight * ratio;
    const value = Math.round(max * (1 - ratio));
    return '<line x1="' + left + '" y1="' + gy + '" x2="' + (left + plotWidth) + '" y2="' + gy + '"></line>' +
      '<text x="' + (left - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' +
      escapeHtml(opts.money ? analyticsMoney(value) : String(value)) + '</text>';
  }).join('');
  const labelEvery = Math.max(1, Math.ceil(rows.length / 7));
  const labels = rows.map((row, index) => (
    index % labelEvery === 0 || index === rows.length - 1
      ? '<text x="' + x(index).toFixed(1) + '" y="' + (height - 8) + '" text-anchor="middle">' +
        escapeHtml(String(row.date || '').slice(5)) + '</text>'
      : ''
  )).join('');
  const dots = rows.map((row, index) =>
    '<circle cx="' + x(index).toFixed(1) + '" cy="' + y(values[index]).toFixed(1) + '" r="2.5"><title>' +
      escapeHtml(String(row.date) + ': ' + (opts.money ? analyticsMoney(values[index]) : values[index])) +
    '</title></circle>'
  ).join('');
  container.innerHTML = '<svg class="analytics-svg-chart" viewBox="0 0 ' + width + ' ' + height +
    '" role="img" aria-label="Biểu đồ xu hướng">' +
    '<g class="analytics-svg-grid">' + grid + labels + '</g>' +
    (opts.area ? '<polygon class="analytics-svg-area" points="' + area + '"></polygon>' : '') +
    '<polyline class="analytics-svg-line" points="' + points + '"></polyline>' +
    '<g class="analytics-svg-points">' + dots + '</g></svg>';
}

function renderAnalyticsColumnChart(container, series, field) {
  if (!container) return;
  const rows = Array.isArray(series) ? series : [];
  if (!rows.length) {
    container.innerHTML = '<p class="analytics-empty">Chưa có dữ liệu trong khoảng này.</p>';
    return;
  }
  const values = rows.map((row) => Number(row[field]) || 0);
  const max = Math.max(1, ...values);
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));
  container.innerHTML = '<div class="analytics-columns">' + rows.map((row, index) => {
    const value = values[index];
    const height = Math.max(3, Math.round((value / max) * 100));
    return '<div class="analytics-column" title="' + escapeHtml(String(row.date) + ': ' + value) + '">' +
      '<div class="analytics-column-track"><i style="height:' + height + '%"></i></div>' +
      (index % labelEvery === 0 || index === rows.length - 1
        ? '<span>' + escapeHtml(String(row.date || '').slice(5)) + '</span>'
        : '<span></span>') +
    '</div>';
  }).join('') + '</div>';
}

function renderAnalyticsUnavailableChart(container, message) {
  if (!container) return;
  container.innerHTML = '<div class="analytics-data-unavailable"><span>Chưa có dữ liệu</span><p>' +
    escapeHtml(message || '') + '</p></div>';
}

function renderAnalyticsBusiness(overview) {
  const subscription = overview.subscription || {};
  const metrics = document.getElementById('analyticsBusinessMetrics');
  if (metrics) {
    metrics.innerHTML =
      analyticsBusinessMetric('MRR', analyticsMoney(subscription.mrr), 'Doanh thu định kỳ tháng') +
      analyticsBusinessMetric('ARR', analyticsMoney(subscription.arr), 'Doanh thu định kỳ năm') +
      analyticsBusinessMetric('ARPU', analyticsMoney(subscription.arpu), 'Doanh thu / tổ chức trả phí');
  }
  renderAnalyticsDonut(
    document.getElementById('analyticsRevenueByPlan'),
    (overview.revenue_by_plan || []).map((row) => ({
      key: row.plan,
      label: formatPlanNameVi(row.plan),
      value: Number(row.amount) || 0,
      detail: analyticsMoney(row.amount)
    })),
    true
  );
  renderAnalyticsMultiLineChart(
    document.getElementById('analyticsSubscriptionTrend'),
    subscription.trend || {}
  );
  renderAnalyticsFunnel(document.getElementById('analyticsConversionFunnel'), overview.conversion_funnel || {});
}

function analyticsBusinessMetric(label, value, hint) {
  return '<article><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) +
    '</strong><small>' + escapeHtml(hint) + '</small></article>';
}

function renderAnalyticsDonut(container, items, moneyMode) {
  if (!container) return;
  const rows = (Array.isArray(items) ? items : []).filter((item) => item.value > 0);
  const total = rows.reduce((sum, item) => sum + item.value, 0);
  if (!rows.length || total <= 0) {
    container.innerHTML = '<p class="analytics-empty">Chưa có dữ liệu.</p>';
    return;
  }
  const colors = ['#465fff', '#12b76a', '#f79009', '#7a5af8', '#2e90fa', '#f04438'];
  let cursor = 0;
  const stops = rows.map((item, index) => {
    const start = cursor;
    cursor += (item.value / total) * 100;
    return colors[index % colors.length] + ' ' + start.toFixed(2) + '% ' + cursor.toFixed(2) + '%';
  });
  container.innerHTML =
    '<div class="analytics-donut" style="background:conic-gradient(' + stops.join(',') + ')">' +
      '<div><strong>' + escapeHtml(moneyMode ? analyticsMoney(total) : String(total)) + '</strong><span>Tổng</span></div>' +
    '</div>' +
    '<div class="analytics-donut-legend">' + rows.map((item, index) =>
      '<button type="button" onclick="analyticsOpenPlan(\'' + escapeHtml(item.key) + '\')">' +
        '<i style="background:' + colors[index % colors.length] + '"></i><span>' +
        escapeHtml(item.label) + '</span><strong>' + escapeHtml(item.detail) + '</strong></button>'
    ).join('') + '</div>';
}

function renderAnalyticsMultiLineChart(container, seriesByKey) {
  if (!container) return;
  const entries = Object.entries(seriesByKey || {}).filter((entry) => Array.isArray(entry[1]) && entry[1].length);
  if (!entries.length) {
    container.innerHTML = '<p class="analytics-empty">Chưa có biến động gói trong khoảng này.</p>';
    return;
  }
  const width = 520;
  const height = 210;
  const left = 30;
  const right = 10;
  const top = 12;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const count = entries[0][1].length;
  const max = Math.max(1, ...entries.flatMap((entry) => entry[1].map((row) => Number(row.count) || 0)));
  const x = (index) => left + (count <= 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth);
  const y = (value) => top + plotHeight - (value / max) * plotHeight;
  const colors = ['#465fff', '#12b76a', '#f79009', '#7a5af8', '#2e90fa'];
  const lines = entries.map((entry, index) => {
    const points = entry[1].map((row, pointIndex) =>
      x(pointIndex).toFixed(1) + ',' + y(Number(row.count) || 0).toFixed(1)
    ).join(' ');
    return '<polyline points="' + points + '" style="stroke:' + colors[index % colors.length] + '"></polyline>';
  }).join('');
  const rows = entries[0][1];
  const labelEvery = Math.max(1, Math.ceil(rows.length / 5));
  const labels = rows.map((row, index) => (
    index % labelEvery === 0 || index === rows.length - 1
      ? '<text x="' + x(index) + '" y="' + (height - 7) + '" text-anchor="middle">' +
        escapeHtml(String(row.date || '').slice(5)) + '</text>'
      : ''
  )).join('');
  container.innerHTML =
    '<div class="analytics-multiline-legend">' + entries.map((entry, index) =>
      '<button type="button" onclick="analyticsOpenPlan(\'' + escapeHtml(entry[0]) + '\')">' +
        '<i style="background:' + colors[index % colors.length] + '"></i>' +
        escapeHtml(formatPlanNameVi(entry[0])) + '</button>'
    ).join('') + '</div>' +
    '<svg class="analytics-svg-chart analytics-svg-multiline" viewBox="0 0 ' + width + ' ' + height + '">' +
      '<g class="analytics-svg-grid"><line x1="' + left + '" y1="' + (top + plotHeight) +
        '" x2="' + (left + plotWidth) + '" y2="' + (top + plotHeight) + '"></line>' + labels + '</g>' +
      '<g class="analytics-multiline-lines">' + lines + '</g></svg>';
}

function renderAnalyticsFunnel(container, funnel) {
  if (!container) return;
  const rows = [
    ['Đăng ký', Number(funnel.registrations) || 0],
    ['Được duyệt / dùng thử', Number(funnel.approved) || 0],
    ['Tổ chức trả phí', Number(funnel.paid_organizations) || 0],
    ['Gói doanh nghiệp', Number(funnel.enterprise) || 0]
  ];
  const max = Math.max(1, ...rows.map((row) => row[1]));
  container.innerHTML = rows.map((row, index) =>
    '<div class="analytics-funnel-step" style="width:' + Math.max(42, Math.round((row[1] / max) * 100)) + '%">' +
      '<span>' + (index + 1) + '</span><strong>' + escapeHtml(row[0]) + '</strong><b>' + row[1] + '</b></div>'
  ).join('');
}

function renderAnalyticsGrowth(growth) {
  renderAnalyticsLineChart(document.getElementById('analyticsOrgGrowth'), growth.organization || [], 'count', { area: true });
  renderAnalyticsLineChart(document.getElementById('analyticsBuildingGrowth'), growth.building || [], 'count', { area: true });
  renderAnalyticsLineChart(document.getElementById('analyticsUserGrowth'), growth.user || [], 'count', { area: true });
  renderAnalyticsLineChart(document.getElementById('analyticsMapGrowth'), growth.map || [], 'count', { area: true });
}

function renderAnalyticsRankings(rankings) {
  renderAnalyticsRankingTable(
    document.getElementById('analyticsTopOrganizations'),
    rankings.organizations || [],
    [
      ['Tổ chức', (row) => row.name || '—'],
      ['Doanh thu', (row) => analyticsMoney(row.revenue)],
      ['Xuất bản', (row) => row.publishes || 0],
      ['Đăng nhập', (row) => row.logins || 0]
    ],
    (row) => `analyticsOpenOrganization('${String(row.id || '')}')`
  );
  renderAnalyticsRankingTable(
    document.getElementById('analyticsTopBuildings'),
    rankings.buildings || [],
    [
      ['Tòa nhà', (row) => row.name || '—'],
      ['Xuất bản', (row) => row.publishes || 0],
      ['Quét QR', (row) => row.qr_scans || 0],
      ['Tìm đường', (row) => row.navigation_requests == null ? '—' : row.navigation_requests]
    ],
    (row) => `openBuildingDetail('${String(row.id || '')}')`
  );
  renderAnalyticsRankingTable(
    document.getElementById('analyticsTopPlans'),
    rankings.plans || [],
    [
      ['Gói', (row) => formatPlanNameVi(row.plan)],
      ['Doanh thu', (row) => analyticsMoney(row.revenue)],
      ['Hóa đơn', (row) => row.invoice_count || 0],
      ['Tổ chức', (row) => row.organization_count || 0]
    ],
    (row) => `analyticsOpenPlan('${String(row.plan || '')}')`
  );
}

function renderAnalyticsRankingTable(container, rows, columns, actionFor) {
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = '<p class="analytics-empty">Chưa có dữ liệu xếp hạng.</p>';
    return;
  }
  container.innerHTML = '<div class="analytics-ranking-table-wrap"><table class="analytics-ranking-table"><thead><tr>' +
    columns.map((column) => '<th>' + escapeHtml(column[0]) + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map((row) =>
      '<tr' + (actionFor ? ' role="button" tabindex="0" onclick="' + actionFor(row) + '"' : '') + '>' +
      columns.map((column) => '<td>' + escapeHtml(String(column[1](row))) + '</td>').join('') +
      '</tr>'
    ).join('') + '</tbody></table></div>';
}

function renderAnalyticsInsights(insights) {
  const container = document.getElementById('analyticsInsights');
  if (!container) return;
  const rows = Array.isArray(insights) ? insights : [];
  if (!rows.length) {
    container.innerHTML = '<p class="analytics-empty">Chưa có đủ dữ liệu để tạo nhận định.</p>';
    return;
  }
  const icons = { positive: '↗', negative: '↘', warning: '!', neutral: '→' };
  container.innerHTML = rows.map((insight) =>
    '<article class="analytics-insight analytics-insight--' + escapeHtml(insight.type || 'neutral') + '">' +
      '<span>' + (icons[insight.type] || '→') + '</span><div><strong>' +
      escapeHtml(insight.title || '') + '</strong><small>Dựa trên dữ liệu trong khoảng đã chọn</small></div></article>'
  ).join('');
}

window.onAnalyticsRangeChange = onAnalyticsRangeChange;

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
  const source = dist || {};
  const plans = getOverviewPlanMeta(source).map((p) => ({
    key: p.key,
    label: p.label,
    cls: 'plan-' + String(p.key || '').toLowerCase()
  }));
  const total = plans.reduce((s, p) => s + (Number(source[p.key]) || 0), 0) || 1;
  container.innerHTML = plans.map((p) => {
    const n = Number(source[p.key]) || 0;
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

function showBillingDetailMode(showDetail) {
  const listPanel = document.getElementById('billingOrgListPanel');
  const pager = document.getElementById('billingOrgsPagination');
  const body = document.getElementById('billingTabBody');
  const listBtn = document.getElementById('btnBillingShowList');
  if (listPanel) listPanel.style.display = showDetail ? 'none' : '';
  if (pager) pager.style.display = showDetail ? 'none' : '';
  if (body) body.style.display = showDetail ? '' : 'none';
  if (listBtn) listBtn.style.display = showDetail && currentUser?.role !== 'ORG_ADMIN' ? '' : 'none';
}

function showBillingOrgList() {
  const select = document.getElementById('billingOrgSelect');
  if (select) select.value = '';
  _billingTabOrgId = null;
  _billingTabData = null;
  showBillingDetailMode(false);
  renderBillingOrgList();
}

function refreshBillingTab() {
  if (currentUser?.role === 'ORG_ADMIN') {
    return loadMyBillingTab();
  }
  if (_billingTabOrgId) return loadBillingTab(_billingTabOrgId);
  return showBillingOrgList();
}

function renderBillingOrgList(resetPage) {
  const panel = document.getElementById('billingOrgListPanel');
  if (!panel) return;
  if (resetPage !== false) window._billingOrgsPage = 1;
  const sourceOrgs = allOrganizations || [];
  if (!sourceOrgs.length) {
    panel.innerHTML = dashUiEmpty({
      icon: 'table',
      title: 'Chưa có tổ chức',
      hint: 'Tạo tổ chức ở tab Tổ chức hoặc duyệt hồ sơ đăng ký.'
    });
    renderPagination('billing', 0, 1);
    return;
  }
  const keyword = String(document.getElementById('billingOrgKeyword')?.value || '')
    .trim()
    .toLocaleLowerCase('vi');
  const planFilter = String(document.getElementById('billingPlanFilter')?.value || '')
    .trim()
    .toUpperCase();
  const orgs = sourceOrgs.filter((org) => {
    const haystack = [org.name, org.slug].filter(Boolean).join(' ').toLocaleLowerCase('vi');
    const matchesKeyword = !keyword || haystack.includes(keyword);
    const matchesPlan = !planFilter || String(org.plan || 'FREE').toUpperCase() === planFilter;
    return matchesKeyword && matchesPlan;
  });
  if (!orgs.length) {
    panel.innerHTML = dashUiEmpty({
      icon: 'search',
      title: 'Không tìm thấy tổ chức',
      hint: 'Thử đổi tên tìm kiếm hoặc chọn gói đăng ký khác.'
    });
    renderPagination('billing', 0, 1);
    return;
  }
  const totalPages = Math.max(1, Math.ceil(orgs.length / PAGE_SIZE));
  let page = window._billingOrgsPage || 1;
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  window._billingOrgsPage = page;
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = orgs.slice(start, start + PAGE_SIZE);
  const rows = pageItems.map((org) => {
    const oid = String(org._id);
    const status = formatBillingStatusVi(org.billing_status || 'ACTIVE');
    const expiry = org.plan_expires_at
      ? new Date(org.plan_expires_at).toLocaleDateString('vi-VN')
      : '—';
    const active = org.is_active === false
      ? '<span class="status-badge inactive">Tạm dừng</span>'
      : '<span class="status-badge active">Hoạt động</span>';
    return (
      '<tr class="billing-org-row" onclick="loadBillingTab(\'' + oid + '\')">' +
        '<td><strong>' + escapeHtml(org.name || '') + '</strong></td>' +
        '<td><span class="billing-org-slug">' + escapeHtml(org.slug || '—') + '</span></td>' +
        '<td>' + formatOrgBillingBadge(org) + '</td>' +
        '<td>' + escapeHtml(status) + '</td>' +
        '<td>' + escapeHtml(expiry) + '</td>' +
        '<td>' + active + '</td>' +
        '<td><button type="button" class="btn-edit" style="padding:4px 10px;font-size:12px;" onclick="event.stopPropagation();loadBillingTab(\'' +
          oid + '\')">Xem gói</button></td>' +
      '</tr>'
    );
  }).join('');
  panel.innerHTML =
    '<div class="billing-org-list-head">' +
      '<h4>Danh sách tổ chức</h4>' +
      '<p class="analytics-muted">Bấm một dòng hoặc «Xem gói» để mở chi tiết subscription. Hiển thị ' +
        PAGE_SIZE + ' dòng mỗi trang.</p>' +
    '</div>' +
    '<div class="finance-table-wrap">' +
      '<table class="data-table finance-data-table billing-org-table">' +
        '<thead><tr>' +
          '<th>Tổ chức</th><th>Định danh</th><th>Gói</th><th>Billing</th><th>Hết hạn</th><th>Trạng thái</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  renderPagination('billing', orgs.length, page);
}

async function loadBillingTab(orgId) {
  const select = document.getElementById('billingOrgSelect');
  const id = orgId || select?.value;
  const body = document.getElementById('billingTabBody');
  if (!body) return;
  if (!id) {
    showBillingOrgList();
    return;
  }
  if (select && select.value !== id) select.value = id;
  _billingTabOrgId = id;
  showBillingDetailMode(true);
  body.innerHTML =
    '<div class="billing-detail-back-row">' +
      '<button type="button" class="btn-edit" onclick="showBillingOrgList()">← Danh sách tổ chức</button>' +
    '</div>' +
    dashUiLoading('text', { label: 'Đang tải dữ liệu gói & thanh toán…' });
  try {
    await ensurePlanCatalogLoaded(true);
    const res = await apiFetch('/organizations/' + id);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      body.innerHTML =
        '<div class="billing-detail-back-row">' +
          '<button type="button" class="btn-edit" onclick="showBillingOrgList()">← Danh sách tổ chức</button>' +
        '</div>' +
        '<p class="billing-tab-error">Lỗi: ' + escapeHtml(d.message || 'HTTP ' + res.status) + '</p>';
      return;
    }
    _billingTabData = d;
    renderBillingTabBody(d);
  } catch (e) {
    console.error('loadBillingTab error:', e);
    body.innerHTML =
      '<div class="billing-detail-back-row">' +
        '<button type="button" class="btn-edit" onclick="showBillingOrgList()">← Danh sách tổ chức</button>' +
      '</div>' +
      '<p class="billing-tab-error">Lỗi kết nối khi tải tab Gói & Thanh toán.</p>';
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
    (currentUser?.role !== 'ORG_ADMIN'
      ? '<div class="billing-detail-back-row">' +
          '<button type="button" class="btn-edit" onclick="showBillingOrgList()">← Danh sách tổ chức</button>' +
        '</div>'
      : '') +
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
  showBillingDetailMode(true);
  body.innerHTML = dashUiLoading('text', { label: 'Đang tải gói của tổ chức bạn…' });
  try {
    await ensurePlanCatalogLoaded(true);
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
  const state = resolveOrgBillingUiState(org, subscription, quota);
  const rows = [];
  const currentPrice = getPlanPriceUi(plan);

  if (state === 'FREE' || plan === 'FREE') {
    // Chưa có gói trả phí: hiện tất cả gói tổ chức
    listPaidPlansForUi({ audience: 'organization' }).forEach((p) => {
      rows.push({
        code: String(p.code || '').toUpperCase(),
        action: 'upgrade',
        status: 'Có thể đăng ký',
        buttonLabel: 'Đăng ký'
      });
    });
  } else if (state === 'EXPIRED' || state === 'ARCHIVED' || state === 'PAID_ACTIVE' || state === 'GRACE') {
    // Luôn có hàng gói đang dùng (gia hạn / khôi phục) — không liệt kê gói thấp hơn
    const statusLabel =
      state === 'GRACE' ? 'Hết hạn — đang Grace'
        : state === 'EXPIRED' ? 'Đã hết hạn — cần gia hạn'
          : state === 'ARCHIVED' ? 'Đã lưu trữ — khôi phục'
            : 'Đang dùng';
    const btnLabel =
      state === 'GRACE' ? 'Thanh toán gia hạn'
        : (state === 'EXPIRED' || state === 'ARCHIVED') ? 'Gia hạn'
          : 'Gia hạn';
    rows.push({
      code: plan,
      action: 'renew',
      status: statusLabel,
      buttonLabel: btnLabel
    });
    // Chỉ gói tổ chức đắt hơn gói hiện tại
    listPaidPlansForUi({
      audience: 'organization',
      exclude: plan,
      minPriceExclusive: currentPrice
    }).forEach((p) => {
      rows.push({
        code: String(p.code || '').toUpperCase(),
        action: 'upgrade',
        status: 'Nâng cấp',
        buttonLabel: 'Nâng cấp'
      });
    });
  }

  let hintExtra = '';
  if (state === 'GRACE' && org.grace_ends_at) {
    hintExtra = '<p class="org-billing-snapshot-hint">Đang trong thời gian gia hạn đến <strong>' +
      escapeHtml(formatDateTime(org.grace_ends_at)) +
      '</strong>. Thanh toán để tránh khóa hạn mức.</p>';
  }

  return '<div class="org-subscription-manage billing-self-service">' +
    '<div class="billing-state-badge billing-state-' + state.toLowerCase() + '">' +
      escapeHtml(BILLING_UI_STATE_LABELS[state] || state) +
    '</div>' +
    '<div class="org-sub-manage-hint">Thanh toán qua VNPay (production) hoặc trang mock (dev). Sau khi thanh toán, hệ thống tự kích hoạt gói.</div>' +
    renderOrgPlanOptionsTable({
      rows,
      emptyHint: 'Chưa có gói tổ chức đang bán. Liên hệ Super Admin.'
    }) +
    hintExtra +
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

function checkoutOrgPlan(plan, action) {
  const p = String(plan || 'PRO').toUpperCase();
  const act = String(action || 'upgrade').toLowerCase();
  // Dùng trang checkout QR chung (cùng UX với gói cá nhân)
  window.open('/admin/upgrade-pro.html?scope=org&plan=' + encodeURIComponent(p) + '&action=' + encodeURIComponent(act), '_blank');
}

function showOrgListView() {
  const list = document.getElementById('orgListView');
  const page = document.getElementById('orgDetailPage');
  if (list) list.hidden = false;
  if (page) page.hidden = true;
}

function showOrgDetailPageShell() {
  const list = document.getElementById('orgListView');
  const page = document.getElementById('orgDetailPage');
  if (list) list.hidden = true;
  if (page) page.hidden = false;
}

function closeOrgDetailPage() {
  _orgDetailId = null;
  _orgDetailData = null;
  _orgDetailSubtab = 'overview';
  _orgDetailMine = false;
  showOrgListView();
  const modal = document.getElementById('orgDetailModal');
  if (modal) modal.style.display = 'none';
}

function switchOrgDetailSubtab(name) {
  _orgDetailSubtab = name || 'overview';
  document.querySelectorAll('.org-detail-subnav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-org-sub') === _orgDetailSubtab);
  });
  if (_orgDetailData) renderOrgDetailPageContent(_orgDetailData);
}

async function openMyOrganization() {
  _orgDetailMine = true;
  _orgDetailId = currentUser?.organization_id || null;
  _orgDetailSubtab = 'overview';
  showOrgDetailPageShell();
  document.querySelectorAll('.org-detail-subnav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-org-sub') === 'overview');
  });
  const body = document.getElementById('orgDetailPageBody');
  const titleEl = document.getElementById('orgDetailPageTitle');
  if (titleEl) titleEl.textContent = 'Đang tải…';
  if (body) body.innerHTML = dashUiLoading('text', { label: 'Đang tải tổ chức của bạn…' });
  try {
    const res = await apiFetch('/organizations/me/detail');
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body) body.innerHTML = dashUiError(d.message || ('HTTP ' + res.status));
      return;
    }
    _orgDetailData = d;
    renderOrgDetailPageContent(d);
  } catch (e) {
    console.error('openMyOrganization error:', e);
    if (body) body.innerHTML = dashUiError('Lỗi kết nối khi tải tổ chức của bạn.');
  }
}

async function openOrgDetailModal(orgId) {
  _orgDetailMine = false;
  _orgDetailId = orgId;
  _orgDetailSubtab = 'overview';
  showOrgDetailPageShell();
  document.querySelectorAll('.org-detail-subnav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-org-sub') === 'overview');
  });
  const body = document.getElementById('orgDetailPageBody');
  const titleEl = document.getElementById('orgDetailPageTitle');
  if (titleEl) titleEl.textContent = 'Đang tải…';
  if (body) body.innerHTML = dashUiLoading('text', { label: 'Đang tải chi tiết tổ chức…' });
  try {
    if (typeof switchTab === 'function') await switchTab('organizations', { skipHistory: true });
  } catch (e) { /* ignore */ }
  try {
    const res = await apiFetch('/organizations/' + orgId);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body) body.innerHTML = dashUiError(d.message || ('HTTP ' + res.status));
      return;
    }
    _orgDetailData = d;
    renderOrgDetailPageContent(d);
    const legacyBody = document.getElementById('orgDetailBody');
    if (legacyBody) {
      renderOrgDetailBody(d);
      const modal = document.getElementById('orgDetailModal');
      if (modal) modal.style.display = 'none';
    }
  } catch (e) {
    console.error('openOrgDetailModal error:', e);
    if (body) body.innerHTML = dashUiError('Lỗi kết nối khi tải chi tiết tổ chức.');
  }
}

function closeOrgDetailModal() {
  const modal = document.getElementById('orgDetailModal');
  if (modal) modal.style.display = 'none';
}

// ============================================================
// AD — Chi tiết tổ chức (IA kiểu SaaS: Overview là entry-point,
// mỗi tab một nhiệm vụ; không nhồi mọi thứ vào một trang dài).
// ============================================================
const ORG_DETAIL_ROLE_DISPLAY = {
  SUPER_ADMIN: 'Quản trị hệ thống',
  ORG_ADMIN: 'Quản trị tổ chức',
  BUILDING_ADMIN: 'Quản trị tòa nhà'
};

function orgProgressBar(label, used, limit) {
  const u = Number(used) || 0;
  const hasLimit = limit != null && limit !== '' && Number.isFinite(Number(limit));
  const lim = hasLimit ? Number(limit) : null;
  const pct = hasLimit && lim > 0 ? Math.min(100, Math.round((u / lim) * 100)) : (u > 0 ? 100 : 0);
  const level = pct >= 100 ? 'danger' : (pct >= 80 ? 'warn' : 'ok');
  const valueText = hasLimit ? (u + ' / ' + lim) : (u + ' <span class="org-ov-progress-inf">/ ∞</span>');
  return '<div class="org-ov-progress">' +
    '<div class="org-ov-progress-top"><span>' + escapeHtml(label) + '</span><strong>' + valueText + '</strong></div>' +
    '<div class="org-ov-progress-track"><span class="org-ov-progress-fill is-' + level + '" style="width:' + pct + '%"></span></div>' +
    '</div>';
}

function orgStatItem(label, value) {
  return '<div class="org-ov-stat"><span class="org-ov-stat-num">' + escapeHtml(String(value)) +
    '</span><span class="org-ov-stat-label">' + escapeHtml(label) + '</span></div>';
}

function orgOverviewCard(title, bodyHtml, opts) {
  const o = opts || {};
  const cls = 'org-ov-card' + (o.span2 ? ' org-ov-card--wide' : '');
  const action = o.action || '';
  return '<section class="' + cls + '">' +
    '<div class="org-ov-card-head"><h4>' + escapeHtml(title) + '</h4>' + action + '</div>' +
    '<div class="org-ov-card-body">' + bodyHtml + '</div></section>';
}

function orgKvRow(label, valueHtml) {
  return '<div class="org-ov-kv"><span>' + escapeHtml(label) + '</span><div>' + valueHtml + '</div></div>';
}

function renderOrgDetailPageContent(data) {
  const org = data.organization || {};
  const oid = String(org._id || _orgDetailId || '');
  const isActive = org.is_active !== false;
  const rc = data.role_counts || {};
  const bsc = data.building_status_counts || {};
  const quota = data.quota || null;
  const stats = data.stats || {};
  const billingStatus = (org.billing_status || quota?.billing_status || 'ACTIVE').toUpperCase();

  // ---- Header (name + status/plan badges + meta) ----
  const titleEl = document.getElementById('orgDetailPageTitle');
  if (titleEl) titleEl.textContent = org.name || 'Chi tiết tổ chức';
  const badgesEl = document.getElementById('orgDetailPageBadges');
  if (badgesEl) {
    badgesEl.innerHTML =
      (isActive ? '<span class="status-badge active">Hoạt động</span>' : '<span class="status-badge inactive">Tạm dừng</span>') +
      ' ' + formatOrgBillingBadge(org);
  }
  const metaEl = document.getElementById('orgDetailPageMeta');
  if (metaEl) {
    metaEl.innerHTML =
      '<span>' + escapeHtml(org.slug || '—') + '</span>' +
      '<span>ID <code>' + escapeHtml(oid) + '</code></span>' +
      '<span>Tạo ' + escapeHtml(formatDateTime(org.createdAt)) + '</span>';
  }

  const body = document.getElementById('orgDetailPageBody');
  if (!body) return;

  // ORG_ADMIN xem tổ chức của mình: không có danh sách để quay về
  const backBtn = document.querySelector('.org-detail-back');
  if (backBtn) backBtn.style.display = _orgDetailMine ? 'none' : '';

  const quotaBanner = formatDetailQuotaBanner(quota, org) || '';
  const billingSnapshot = renderOrgBillingSnapshot(oid, org, quota, data.current_subscription);

  // ---------- TAB 1: OVERVIEW ----------
  const infoCard = orgOverviewCard('Thông tin tổ chức',
    orgKvRow('Tên', escapeHtml(org.name || '—')) +
    orgKvRow('Mã định danh', escapeHtml(org.slug || '—')) +
    orgKvRow('Email', escapeHtml(org.contact_email || (data.org_admins && data.org_admins[0] && data.org_admins[0].email) || '—')) +
    orgKvRow('Điện thoại', escapeHtml(org.contact_phone || '—')) +
    orgKvRow('Địa chỉ', escapeHtml(org.contact_address || '—')) +
    orgKvRow('Ngày tạo', escapeHtml(formatDateTime(org.createdAt)))
  );

  const expireLine = org.plan_expires_at || quota?.plan_expires_at
    ? formatDateTime(org.plan_expires_at || quota.plan_expires_at) : '—';
  const graceLine = billingStatus === 'GRACE_PERIOD'
    ? (quota?.grace_days_left != null ? quota.grace_days_left + ' ngày' : (org.grace_ends_at ? formatDateTime(org.grace_ends_at) : '—'))
    : '—';
  const subCard = orgOverviewCard('Gói dịch vụ',
    orgKvRow('Gói', formatOrgBillingBadge(org)) +
    orgKvRow('Trạng thái', escapeHtml(billingStatus)) +
    orgKvRow('Hết hạn', escapeHtml(expireLine)) +
    orgKvRow('Gia hạn', escapeHtml(graceLine)),
    { action: '<button type="button" class="linkish" onclick="switchOrgDetailSubtab(\'subscription\')">Quản lý →</button>' }
  );

  const usageCard = orgOverviewCard('Mức sử dụng tài nguyên',
    orgProgressBar('Tòa nhà', quota?.buildings?.used != null ? quota.buildings.used : (data.active_building_count || 0), quota?.buildings?.limit) +
    orgProgressBar('Người dùng', quota?.users?.used != null ? quota.users.used : (data.active_user_count || 0), quota?.users?.limit)
  );

  const statsCard = orgOverviewCard('Thống kê',
    '<div class="org-ov-stat-grid">' +
      orgStatItem('Tòa nhà', stats.building_count != null ? stats.building_count : (data.building_count || 0)) +
      orgStatItem('Số tầng', stats.total_floors != null ? stats.total_floors : '—') +
      orgStatItem('Tầng đã xuất bản', stats.published_map_count != null ? stats.published_map_count : (bsc.PUBLISHED || 0)) +
      orgStatItem('Mã QR', stats.qr_count != null ? stats.qr_count : '—') +
      orgStatItem('QT tòa nhà', stats.building_admin_count != null ? stats.building_admin_count : (rc.BUILDING_ADMIN || 0)) +
      orgStatItem('Người dùng', data.user_count != null ? data.user_count : '—') +
    '</div>'
  );

  const recentLogs = (data.recent_logs || []).slice(0, 5);
  const activityCard = orgOverviewCard('Hoạt động gần đây',
    recentLogs.length
      ? '<ul class="org-ov-activity">' + recentLogs.map((l) =>
          '<li><span class="org-ov-activity-act">' + escapeHtml(formatActionLabel(l.action)) + '</span>' +
          '<span class="org-ov-activity-time">' + escapeHtml(formatRelativeTime(l.createdAt)) + '</span></li>'
        ).join('') + '</ul>'
      : '<p class="org-detail-empty">Chưa có hoạt động.</p>',
    { action: recentLogs.length ? '<button type="button" class="linkish" onclick="switchOrgDetailSubtab(\'activity\')">Xem tất cả →</button>' : '' }
  );

  const actionsCard = orgOverviewCard('Thao tác nhanh',
    '<div class="org-ov-actions">' +
      '<button type="button" class="org-ov-action-btn" onclick="switchOrgDetailSubtab(\'buildings\')">Tòa nhà</button>' +
      '<button type="button" class="org-ov-action-btn" onclick="switchOrgDetailSubtab(\'users\')">Người dùng</button>' +
      '<button type="button" class="org-ov-action-btn" onclick="switchOrgDetailSubtab(\'subscription\')">Gói &amp; Thanh toán</button>' +
      '<button type="button" class="org-ov-action-btn" onclick="closeOrgDetailPage(); switchTab(\'analytics\')">Phân tích</button>' +
    '</div>'
  );

  const overviewHtml = (quotaBanner || '') +
    '<div class="org-ov-grid">' +
      infoCard + subCard + usageCard + statsCard + activityCard + actionsCard +
    '</div>';

  // ---------- TAB 2: BUILDINGS ----------
  const buildingsTable = (data.recent_buildings || []).length
    ? '<table class="org-detail-mini-table"><thead><tr><th>Tên</th><th>Trạng thái</th><th>Số tầng</th><th>Cập nhật</th></tr></thead><tbody>' +
      data.recent_buildings.map((b) =>
        '<tr' + (b.quota_locked ? ' class="org-detail-row-locked"' : '') + '><td>' + escapeHtml(b.name || '-') + '</td><td>' +
        formatDetailBuildingStatus(b) + '</td><td>' +
        (b.total_floors != null ? b.total_floors : '—') + '</td><td>' +
        (b.updatedAt ? new Date(b.updatedAt).toLocaleDateString('vi-VN') : '-') + '</td></tr>'
      ).join('') + '</tbody></table>'
    : '<p class="org-detail-empty">Chưa có tòa nhà.</p>';
  const buildingsJumpBtn = _orgDetailMine
    ? '<button type="button" class="btn-edit" onclick="switchTab(\'buildings\')">Xem tất cả trong tab Tòa nhà →</button>'
    : '<button type="button" class="btn-edit" onclick="closeOrgDetailPage(); jumpToBuildings(\'' + oid + '\')">Xem tất cả trong tab Tòa nhà →</button>';
  const buildingsHtml =
    '<div class="org-detail-tab-head"><h4>Tòa nhà <span class="org-detail-hint">(mới nhất, tối đa 10)</span></h4>' +
    buildingsJumpBtn + '</div>' +
    '<div class="org-detail-section">' + buildingsTable + '</div>';

  // ---------- TAB 3: USERS ----------
  const usersTable = (data.recent_users || []).length
    ? '<table class="org-detail-mini-table"><thead><tr><th>Email</th><th>Họ tên</th><th>Vai trò</th><th>Đăng nhập cuối</th><th>Trạng thái</th></tr></thead><tbody>' +
      data.recent_users.map((u) =>
        '<tr' + (u.quota_locked ? ' class="org-detail-row-locked"' : '') + '><td>' + escapeHtml(u.email || '-') + '</td><td>' + escapeHtml(u.full_name || '-') + '</td><td>' +
        escapeHtml(ORG_DETAIL_ROLE_DISPLAY[u.role] || u.role || '-') + '</td><td>' + escapeHtml(formatDateTime(u.last_login)) + '</td><td>' +
        formatDetailUserStatus(u) +
        '</td></tr>'
      ).join('') + '</tbody></table>'
    : '<p class="org-detail-empty">Chưa có tài khoản.</p>';
  const addAdminBtn = _orgDetailMine ? ''
    : '<button type="button" class="btn-create" style="background:#8e44ad;" onclick="closeOrgDetailPage(); openCreateUserModalForOrg(\'' + oid + '\', \'ORG_ADMIN\')">+ Thêm QT viên</button>';
  const usersJumpBtn = _orgDetailMine
    ? '<button type="button" class="btn-edit" onclick="switchTab(\'users\')">Xem tất cả →</button>'
    : '<button type="button" class="btn-edit" onclick="closeOrgDetailPage(); jumpToUsers(\'' + oid + '\')">Xem tất cả →</button>';
  const usersHtml =
    '<div class="org-detail-tab-head"><h4>Quản trị viên tổ chức</h4>' + addAdminBtn + '</div>' +
    '<div class="org-detail-section">' + renderOrgAdminCards(data.org_admins) + '</div>' +
    '<div class="org-detail-tab-head"><h4>Người dùng <span class="org-detail-hint">(mới nhất, tối đa 10)</span></h4>' +
    usersJumpBtn + '</div>' +
    '<div class="org-detail-section">' + usersTable + '</div>';

  // ---------- TAB 4: SUBSCRIPTION ----------
  const subscriptionHtml = _orgDetailMine
    ? (quotaBanner || '') +
      billingSnapshot +
      '<div class="org-detail-section"><button type="button" class="btn-create" onclick="switchTab(\'billing\')">Nâng cấp / gia hạn gói →</button></div>' +
      '<div class="org-detail-section"><h4>Hóa đơn</h4>' + renderOrgInvoices(data.invoices) + '</div>' +
      '<div class="org-detail-section"><h4>Lịch sử đổi gói</h4>' + renderOrgPlanHistory(data.plan_history) + '</div>'
    : (quotaBanner || '') +
      billingSnapshot +
      '<div class="org-detail-section">' + renderOrgBillingActionPanel(oid, org, data.current_subscription, quota) + '</div>' +
      '<div class="org-detail-section"><h4>Hóa đơn</h4>' + renderOrgInvoices(data.invoices) + '</div>' +
      '<div class="org-detail-section"><h4>Sự kiện thanh toán</h4>' + renderOrgBillingEvents(data.billing_events) + '</div>' +
      '<div class="org-detail-section"><h4>Lịch sử đổi gói</h4>' + renderOrgPlanHistory(data.plan_history) + '</div>';

  // ---------- TAB 5: ACTIVITY ----------
  const activityHtml = (data.recent_logs || []).length
    ? '<div class="org-detail-section"><ul class="org-detail-list org-detail-logs">' + data.recent_logs.map((l) =>
        '<li><span class="org-detail-log-time">' + formatDateTime(l.createdAt) +
        '</span> ' + escapeHtml(formatActionLabel(l.action)) +
        (l.target ? ' — <em>' + escapeHtml(l.target) + '</em>' : '') + '</li>'
      ).join('') + '</ul></div>'
    : '<p class="org-detail-empty">Chưa có nhật ký hoạt động.</p>';

  // ---------- TAB 6: SETTINGS ----------
  const planOptions = (planCatalogList && planCatalogList.length
    ? planCatalogList
    : [{ code: 'FREE', name: 'Free' }, { code: 'PRO', name: 'Professional' }, { code: 'ENTERPRISE', name: 'Enterprise' }]
  ).map((p) => {
    const code = String(p.code || '').toUpperCase();
    const sel = String(org.plan || 'FREE').toUpperCase() === code ? ' selected' : '';
    return '<option value="' + escapeHtml(code) + '"' + sel + '>' + escapeHtml(p.name || code) + '</option>';
  }).join('');
  const settingsInfo =
    '<div class="org-detail-section"><h4>Thông tin</h4>' +
      '<div class="org-detail-grid">' +
        '<div><span class="org-detail-label">Tên tổ chức</span><div class="org-detail-value">' + escapeHtml(org.name || '—') + '</div></div>' +
        '<div><span class="org-detail-label">Mã định danh</span><div class="org-detail-value">' + escapeHtml(org.slug || '—') + '</div></div>' +
        '<div><span class="org-detail-label">Email liên hệ</span><div class="org-detail-value">' + escapeHtml(org.contact_email || '—') + '</div></div>' +
        '<div><span class="org-detail-label">Điện thoại</span><div class="org-detail-value">' + escapeHtml(org.contact_phone || '—') + '</div></div>' +
        '<div><span class="org-detail-label">Địa chỉ</span><div class="org-detail-value">' + escapeHtml(org.contact_address || '—') + '</div></div>' +
      '</div>' +
      '<p class="org-detail-note">Tên và mã định danh không thể sửa sau khi tạo (đảm bảo toàn vẹn dữ liệu).</p>' +
    '</div>';
  const settingsHtml = _orgDetailMine
    ? settingsInfo +
      '<div class="org-detail-section"><h4>Gói dịch vụ</h4>' +
        '<p class="org-detail-note">Để nâng cấp hoặc gia hạn gói, dùng cổng thanh toán trong mục Gói đăng ký.</p>' +
        '<button type="button" class="btn-create" onclick="switchTab(\'billing\')">Quản lý gói của tôi →</button>' +
      '</div>'
    : settingsInfo +
      '<div class="org-detail-section"><h4>Gói dịch vụ</h4>' +
        '<div class="org-settings-row"><label>Đổi gói</label>' +
        '<select onchange="changeOrganizationPlan(\'' + oid + '\', this)">' + planOptions + '</select></div>' +
      '</div>' +
      '<div class="org-detail-section org-settings-danger"><h4>Vùng nguy hiểm</h4>' +
        '<div class="org-settings-danger-row">' +
          '<div><strong>' + (isActive ? 'Tạm dừng tổ chức' : 'Kích hoạt lại tổ chức') + '</strong>' +
          '<p>' + (isActive ? 'Tạm dừng sẽ chặn đăng nhập của mọi tài khoản thuộc tổ chức.' : 'Kích hoạt lại cho phép các tài khoản đăng nhập trở lại.') + '</p></div>' +
          '<button type="button" class="' + (isActive ? 'btn-danger' : 'btn-create') + '" onclick="toggleOrganizationActive(\'' + oid + '\', ' + isActive + ')">' +
            (isActive ? 'Tạm dừng' : 'Kích hoạt') + '</button>' +
        '</div>' +
      '</div>';

  const panels = {
    overview: overviewHtml,
    buildings: buildingsHtml,
    users: usersHtml,
    subscription: subscriptionHtml,
    activity: activityHtml,
    settings: settingsHtml
  };
  body.innerHTML = panels[_orgDetailSubtab] || panels.overview;
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
    SUPER_ADMIN: 'Quản trị hệ thống',
    ORG_ADMIN: 'Quản trị tổ chức',
    BUILDING_ADMIN: 'Quản trị tòa nhà'
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
  if (tbody) tbody.innerHTML = dashUiTableLoading(9);
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
      actions = '<button type="button" class="btn-edit" onclick="approveRegistration(\'' + r._id + '\')" style="margin-right:4px;" title="Duyệt hồ sơ và tạo tổ chức + ORG_ADMIN">Duyệt</button>' +
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
    if (orgGroup) orgGroup.style.display = (role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN') ? 'none' : '';
    const orgFilter = (role === 'SUPER_ADMIN' || role === 'FINANCE_ADMIN') ? null : (orgSelect?.value || orgId || null);
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


function openEditor(id) {
  try {
    sessionStorage.setItem('editorAuthHandoff', JSON.stringify({
      token: localStorage.getItem('token'),
      refreshToken: localStorage.getItem('refreshToken'),
      userEmail: localStorage.getItem('userEmail'),
      userRole: localStorage.getItem('userRole'),
      userId: localStorage.getItem('userId'),
      ts: Date.now()
    }));
  } catch (_) { /* ignore */ }
  window.location.href = '/editor/index.html?buildingId=' + id;
}

// ==========================================
// Chuyển đổi tổ chức (Personal Workspace)
// ==========================================
function _orgToast(msg, type) {
  if (typeof showToast === 'function') showToast(msg, type || 'info');
  else alert(msg);
}

let _personalBilling = null;

async function loadPersonalBilling() {
  const badge = document.getElementById('personalPlanBadge');
  const expiry = document.getElementById('personalPlanExpiry');
  const planNameEl = document.getElementById('personalCurrentPlanName');
  const priceEl = document.getElementById('personalCurrentPrice');
  const quotaEl = document.getElementById('personalQuotaList');
  try {
    const res = await fetch('/api/billing/personal/me', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    if (!res.ok) return;
    const d = await res.json();
    _personalBilling = d;
    const planCode = String(d.plan || 'FREE').toUpperCase();
    const planActive = d.plan_active !== false && (
      planCode === 'FREE' || !d.plan_expires_at || new Date(d.plan_expires_at).getTime() > Date.now()
    );
    // Có plan_active từ API thì ưu tiên; hết hạn = không còn gói trả phí hiệu lực
    const isPaidActive = planCode !== 'FREE' && (d.plan_active === true || (d.plan_active == null && planActive && !!d.plan_expires_at && new Date(d.plan_expires_at) > new Date()));
    const isExpiredPaid = d.plan_expired === true || (planCode !== 'FREE' && d.plan_active === false);
    const isPaid = planCode !== 'FREE';
    const plans = Array.isArray(d.available_plans) ? d.available_plans.slice() : [];
    plans.sort((a, b) => (Number(a.price_vnd) || 0) - (Number(b.price_vnd) || 0));
    const currentMeta = plans.find((p) => p.code === planCode);
    const unitPrice = currentMeta
      ? (Number(currentMeta.price_vnd) || 0)
      : (Number(d.pro_price_vnd) || 0);
    const periodDays = Math.max(
      1,
      Number(currentMeta?.period_days) || getPlanPeriodDaysUi(planCode) || Number(d.pro_period_days) || 30
    );
    const priceLabel = !isPaid
      ? 'Miễn phí'
      : (isExpiredPaid
        ? (formatPlanPricePerPeriod(unitPrice, periodDays) + ' · đã hết hạn')
        : formatPlanPricePerPeriod(unitPrice, periodDays));

    if (badge) {
      badge.style.display = '';
      badge.textContent = isExpiredPaid ? (planCode + ' · Hết hạn') : planCode;
      badge.style.background = isExpiredPaid ? '#fee4e2' : (isPaidActive ? '#fff3cd' : '#eef');
      badge.style.color = isExpiredPaid ? '#b42318' : (isPaidActive ? '#8a6d00' : '#5b3fbf');
    }

    if (planNameEl) planNameEl.textContent = (currentMeta && currentMeta.name) || planCode;
    if (priceEl) priceEl.textContent = priceLabel;
    if (expiry) {
      if (isExpiredPaid && d.plan_expires_at) {
        expiry.textContent = 'Đã hết hạn từ ' + new Date(d.plan_expires_at).toLocaleDateString('vi-VN') +
          ' — hạn mức tạm về FREE. Gia hạn hoặc chọn gói khác bên dưới.';
      } else if (isPaid && d.plan_expires_at) {
        const dt = new Date(d.plan_expires_at);
        const days = Math.max(0, Math.ceil((dt.getTime() - Date.now()) / 86400000));
        expiry.textContent = 'Hiệu lực đến ' + dt.toLocaleDateString('vi-VN') + ' (còn ' + days + ' ngày)';
      } else if (isPaid) {
        expiry.textContent = 'Gói trả phí đang hiệu lực';
      } else {
        expiry.textContent = 'Không giới hạn thời gian';
      }
    }
    if (quotaEl) {
      const lim = d.limits || {};
      const fmt = (v) => (v == null ? '<strong style="color:#12b76a;">Không giới hạn</strong>' : '<strong>' + v + '</strong>');
      quotaEl.innerHTML =
        '🏢 Tòa nhà: ' + fmt(lim.maxBuildings) + '<br>' +
        '🏬 Tầng/tòa: ' + fmt(lim.maxFloorsPerBuilding) + '<br>' +
        '🗺️ Bản đồ: ' + fmt(lim.maxMaps) + '<br>' +
        '🔗 Mã QR: ' + fmt(lim.maxQr);
    }

    // Mỗi gói cá nhân = 1 thẻ riêng (gói mới trong catalog tự xuất hiện)
    const plansHost = document.getElementById('personalUpgradePlans');
    if (plansHost) {
      if (!plans.length) {
        plansHost.innerHTML =
          '<div style="background:#fffaf0; border:1px dashed #fde3b8; border-radius:12px; padding:16px 18px; color:#667085; font-size:13px;">' +
          'Chưa có gói cá nhân trả phí trong catalog. Admin hãy tạo gói và đánh dấu «Cá nhân».</div>';
      } else {
        plansHost.innerHTML = plans.map((p) => {
          const code = String(p.code || '').toUpperCase();
          const name = escapeHtml(p.name || code);
          const price = formatPlanPricePerPeriod(p.price_vnd, p.period_days);
          const isCurrent = code === planCode;
          const isRenew = isCurrent || p.action === 'renew';
          const feats = Array.isArray(p.features) ? p.features.slice(0, 4) : [];
          const featHtml = feats.length
            ? '<ul style="margin:0 0 12px; padding-left:18px; font-size:12px; color:#475467; line-height:1.6;">' +
              feats.map((f) => '<li>' + escapeHtml(f) + '</li>').join('') + '</ul>'
            : '<p style="margin:0 0 12px; font-size:13px; color:#667085; flex:1;">Gói cá nhân · mở rộng hạn mức Personal Workspace.</p>';
          const verb = isRenew ? 'Gia hạn' : 'Nâng cấp';
          const eyebrow = isRenew ? 'Gói của bạn · Gia hạn' : 'Nâng cấp gói';
          return (
            '<div class="pws-plan-card" style="background:#fffaf0; border:1px solid #fde3b8; border-radius:12px; padding:16px 18px; display:flex; flex-direction:column;' +
            (isCurrent ? ' outline:2px solid #f59e0b;' : '') + '">' +
              '<div style="font-size:11px; letter-spacing:.5px; color:#b7791f; text-transform:uppercase; margin-bottom:6px;">' +
                eyebrow +
              '</div>' +
              '<div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">' +
                '<span style="font-size:22px; font-weight:700; color:#1d2939;">' + name + '</span>' +
                '<span style="font-size:13px; color:#b7791f; font-weight:600;">' + price + '</span>' +
              '</div>' +
              featHtml +
              '<button type="button" class="btn-add" style="background:#f39c12; width:100%; margin-top:auto;" ' +
                'onclick="openPersonalUpgradeModal(\'' + escapeHtml(code) + '\')">⭐ ' + verb + ' ' + name + '</button>' +
            '</div>'
          );
        }).join('');
      }
    }

    const canCreateOrg = d.can_create_org === true;
    const orgCard = document.getElementById('personalOrgUpgradeCard');
    const lockedCard = document.getElementById('personalOrgLockedCard');
    if (orgCard) orgCard.style.display = canCreateOrg ? 'flex' : 'none';
    if (lockedCard) lockedCard.style.display = canCreateOrg ? 'none' : 'flex';

    renderPersonalInvoicesList(d.invoices || []);
  } catch (_) {
    const list = document.getElementById('personalInvoicesList');
    if (list) list.textContent = 'Không tải được hóa đơn.';
  }
}

function renderPersonalInvoicesList(invoices) {
  const list = document.getElementById('personalInvoicesList');
  if (!list) return;
  if (!invoices.length) {
    list.innerHTML = '<p style="margin:0; color:#98a2b3;">Chưa có hóa đơn. Sau khi thanh toán gói, hóa đơn sẽ hiện tại đây.</p>';
    return;
  }
  const statusVi = { PAID: 'Đã thanh toán', OPEN: 'Chờ thu', VOID: 'Đã hủy' };
  list.innerHTML =
    '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:13px;">' +
    '<thead><tr style="text-align:left; color:#98a2b3; border-bottom:1px solid #eaecf0;">' +
    '<th style="padding:6px 8px;">Mã HĐ</th><th style="padding:6px 8px;">Gói</th>' +
    '<th style="padding:6px 8px;">Số tiền</th><th style="padding:6px 8px;">Trạng thái</th>' +
    '<th style="padding:6px 8px;">Ngày</th></tr></thead><tbody>' +
    invoices.map((inv) => {
      const when = inv.paid_at || inv.created_at;
      const dateStr = when ? new Date(when).toLocaleString('vi-VN') : '—';
      const amount = (Number(inv.amount) || 0).toLocaleString('vi-VN') + ' đ';
      return '<tr style="border-bottom:1px solid #f2f4f7;">' +
        '<td style="padding:8px;">' + escapeHtml(inv.invoice_number || '—') + '</td>' +
        '<td style="padding:8px;">' + escapeHtml(inv.plan || '—') + '</td>' +
        '<td style="padding:8px; font-weight:600;">' + escapeHtml(amount) + '</td>' +
        '<td style="padding:8px;">' + escapeHtml(statusVi[inv.status] || inv.status || '—') + '</td>' +
        '<td style="padding:8px; white-space:nowrap;">' + escapeHtml(dateStr) + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

function openPersonalBillingNav() {
  switchTab('buildings');
  setTimeout(() => {
    const el = document.getElementById('personalWsBar') || document.getElementById('personalInvoicesPanel');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

function _proUnitPrice() {
  return (_personalBilling && Number(_personalBilling.pro_price_vnd)) || 990000;
}
function updatePersonalUpgradeTotal() {
  const months = Math.max(1, Math.min(24, parseInt(document.getElementById('personalUpgradeMonths').value, 10) || 1));
  const total = _proUnitPrice() * months;
  const el = document.getElementById('personalUpgradeTotal');
  if (el) el.textContent = 'Tổng thanh toán: ' + total.toLocaleString('vi-VN') + ' đ (' + months + ' tháng)';
}
function openPersonalUpgradeModal(plan) {
  // Chuyển sang trang thanh toán chuyên dụng (mở tab mới)
  const code = (plan && typeof plan === 'string') ? plan.toUpperCase() : 'PRO';
  window.open('/admin/upgrade-pro.html?scope=personal&plan=' + encodeURIComponent(code), '_blank');
}
function closePersonalUpgradeModal() { const el = document.getElementById('personalUpgradeModal'); if (el) el.style.display = 'none'; }

async function submitPersonalUpgrade() {
  const months = Math.max(1, Math.min(24, parseInt(document.getElementById('personalUpgradeMonths').value, 10) || 1));
  const bankEmail = document.getElementById('personalUpgradeBankEmail').value.trim();
  const bankPassword = document.getElementById('personalUpgradeBankPassword').value;
  const msgEl = document.getElementById('personalUpgradeMsg');
  const btn = document.getElementById('btnSubmitPersonalUpgrade');
  if (!bankEmail || !bankPassword) {
    if (msgEl) { msgEl.textContent = 'Vui lòng nhập tài khoản ví TPTPbank.'; msgEl.style.display = 'block'; }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Đang xử lý...'; }
  try {
    const res = await fetch('/api/billing/personal/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ plan: 'PRO', months, bankEmail, bankPassword })
    });
    const d = await res.json();
    if (!res.ok) {
      if (msgEl) { msgEl.textContent = d.message || 'Nâng cấp thất bại.'; msgEl.style.display = 'block'; }
      return;
    }
    closePersonalUpgradeModal();
    _orgToast(d.message || 'Nâng cấp PRO thành công!', 'success');
    loadPersonalBilling();
  } catch (e) {
    if (msgEl) { msgEl.textContent = 'Lỗi kết nối: ' + e.message; msgEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Thanh toán & Nâng cấp'; }
  }
}

// Tạo tổ chức qua trang thanh toán QR (mở tab mới) — thống nhất UX với gói cá nhân
function openCreateOrgCheckout() {
  if (_personalBilling && _personalBilling.can_create_org !== true) {
    _orgToast(_personalBilling.create_org_lock_reason || 'Cần nâng cấp gói cá nhân trả phí trước.', 'warn');
    openPersonalUpgradeModal();
    return;
  }
  const orgPlans = (_personalBilling && Array.isArray(_personalBilling.organization_plans))
    ? _personalBilling.organization_plans
    : [];
  const planCode = (orgPlans[0] && orgPlans[0].code) || 'BUSINESS';
  window.open('/admin/upgrade-pro.html?scope=create-org&plan=' + encodeURIComponent(planCode), '_blank');
}
function openCreateOrgModal() {
  const el = document.getElementById('createOrgModal');
  document.getElementById('createOrgName').value = '';
  document.getElementById('createOrgSlug').value = '';
  const msg = document.getElementById('createOrgMsg'); if (msg) msg.style.display = 'none';
  if (el) el.style.display = 'flex';
}
function closeCreateOrgModal() { const el = document.getElementById('createOrgModal'); if (el) el.style.display = 'none'; }

async function submitCreateOrg() {
  const name = document.getElementById('createOrgName').value.trim();
  const slug = document.getElementById('createOrgSlug').value.trim();
  const plan = document.getElementById('createOrgPlan').value;
  const msgEl = document.getElementById('createOrgMsg');
  const btn = document.getElementById('btnSubmitCreateOrg');
  if (name.length < 2) {
    if (msgEl) { msgEl.textContent = 'Tên tổ chức phải có ít nhất 2 ký tự.'; msgEl.style.display = 'block'; }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Đang tạo...'; }
  try {
    const res = await fetch('/api/organizations/me/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ name, slug: slug || undefined, plan })
    });
    const data = await res.json();
    if (!res.ok) {
      if (msgEl) { msgEl.textContent = data.message || 'Không tạo được tổ chức.'; msgEl.style.display = 'block'; }
      return;
    }
    if (data.token) localStorage.setItem('token', data.token);
    if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
    if (data.user?.role) localStorage.setItem('userRole', data.user.role);
    _orgToast('Tạo tổ chức thành công! Đang chuyển sang chế độ Quản trị tổ chức...', 'success');
    setTimeout(() => window.location.reload(), 900);
  } catch (e) {
    if (msgEl) { msgEl.textContent = 'Lỗi kết nối: ' + e.message; msgEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Tạo tổ chức'; }
  }
}

function openJoinOrgModal() {
  document.getElementById('joinOrgSlug').value = '';
  document.getElementById('joinOrgMessage').value = '';
  const msg = document.getElementById('joinOrgMsg'); if (msg) msg.style.display = 'none';
  const el = document.getElementById('joinOrgModal'); if (el) el.style.display = 'flex';
}
function closeJoinOrgModal() { const el = document.getElementById('joinOrgModal'); if (el) el.style.display = 'none'; }

async function submitJoinOrg() {
  const slug = document.getElementById('joinOrgSlug').value.trim().toLowerCase();
  const message = document.getElementById('joinOrgMessage').value.trim();
  const msgEl = document.getElementById('joinOrgMsg');
  const btn = document.getElementById('btnSubmitJoinOrg');
  if (!slug) {
    if (msgEl) { msgEl.textContent = 'Vui lòng nhập mã tổ chức (slug).'; msgEl.style.display = 'block'; }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Đang gửi...'; }
  try {
    const res = await fetch('/api/org-join-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: JSON.stringify({ slug, message })
    });
    const data = await res.json();
    if (!res.ok) {
      if (msgEl) { msgEl.textContent = data.message || 'Không gửi được yêu cầu.'; msgEl.style.display = 'block'; }
      return;
    }
    closeJoinOrgModal();
    _orgToast('Đã gửi yêu cầu tham gia. Vui lòng chờ duyệt.', 'success');
    if (typeof loadMyJoinRequests === 'function') loadMyJoinRequests();
  } catch (e) {
    if (msgEl) { msgEl.textContent = 'Lỗi kết nối: ' + e.message; msgEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Gửi yêu cầu'; }
  }
}

async function loadMyJoinRequests() {
  const box = document.getElementById('myJoinRequests');
  if (!box) return;
  try {
    const res = await fetch('/api/org-join-requests/mine', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    if (!res.ok) { box.innerHTML = ''; return; }
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) { box.innerHTML = ''; return; }
    const statusLabel = { PENDING: '⏳ Chờ duyệt', APPROVED: '✅ Đã duyệt', REJECTED: '❌ Bị từ chối', CANCELLED: 'Đã hủy' };
    box.innerHTML = '<strong>Yêu cầu tham gia của bạn:</strong> ' + rows.map(r =>
      `<span style="display:inline-block; margin:4px 6px 0 0; padding:3px 8px; background:#fff; border:1px solid #e0d7ff; border-radius:6px;">${escapeHtml(r.organization?.name || r.organization?.slug || 'Tổ chức')} — ${statusLabel[r.status] || r.status}</span>`
    ).join('');
  } catch (_) { box.innerHTML = ''; }
}

async function loadOrgJoinRequests() {
  const list = document.getElementById('orgJoinRequestsList');
  if (!list) return;
  list.innerHTML = '<span style="color:#888;">Đang tải...</span>';
  try {
    const res = await fetch('/api/org-join-requests', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    const rows = await res.json();
    if (!res.ok) { list.innerHTML = '<span style="color:#c0392b;">' + (rows.message || 'Lỗi tải yêu cầu.') + '</span>'; return; }
    if (!Array.isArray(rows) || !rows.length) {
      list.innerHTML = '<span style="color:#888;">Chưa có yêu cầu tham gia nào.</span>';
      return;
    }
    list.innerHTML = rows.map(r => `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:8px 0; border-bottom:1px solid #f0e6c8;">
        <div>
          <strong>${escapeHtml(r.user?.full_name || r.user?.email || 'Người dùng')}</strong>
          <span style="color:#888; font-size:12px;"> · ${escapeHtml(r.user?.email || '')}</span>
          ${r.message ? `<div style="font-size:12px; color:#666;">${escapeHtml(r.message)}</div>` : ''}
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn-create" style="padding:5px 10px;" onclick="approveJoinRequest('${r._id}')">Duyệt</button>
          <button class="btn-logout" style="padding:5px 10px; background:#e74c3c;" onclick="rejectJoinRequest('${r._id}')">Từ chối</button>
        </div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = '<span style="color:#c0392b;">Lỗi kết nối.</span>';
  }
}

async function approveJoinRequest(id) {
  if (!confirm('Duyệt yêu cầu này? Người dùng sẽ trở thành Quản trị tòa nhà của tổ chức.')) return;
  try {
    const res = await fetch('/api/org-join-requests/' + id + '/approve', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    const data = await res.json();
    _orgToast(data.message || (res.ok ? 'Đã duyệt.' : 'Không duyệt được.'), res.ok ? 'success' : 'error');
    loadOrgJoinRequests();
  } catch (e) { _orgToast('Lỗi kết nối.', 'error'); }
}

async function rejectJoinRequest(id) {
  if (!confirm('Từ chối yêu cầu này?')) return;
  try {
    const res = await fetch('/api/org-join-requests/' + id + '/reject', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    const data = await res.json();
    _orgToast(data.message || (res.ok ? 'Đã từ chối.' : 'Lỗi.'), res.ok ? 'info' : 'error');
    loadOrgJoinRequests();
  } catch (e) { _orgToast('Lỗi kết nối.', 'error'); }
}

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
    alert('Bạn không có quyền sửa thông tin tòa nhà. Chỉ được mở trình soạn bản đồ.');
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
    if (res.ok) {
      alert('Đã cập nhật tòa nhà!');
      closeEditBuildingModal();
      await fetchBuildings();
      if (getBuildingDetailId() === String(id)) await refreshBuildingDetail();
    }
    else { const d = await res.json(); alert('Lỗi: ' + d.message); }
  } catch (e) { alert('Lỗi kết nối!'); }
}

async function deleteBuilding(id) {
  if (!canDeleteBuilding()) {
    alert('Bạn không có quyền xóa tòa nhà. Chỉ Quản trị tổ chức hoặc Quản trị hệ thống mới được xóa.');
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
  tbody.innerHTML = dashUiTableLoading(7);
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
        ? '<span style="color:#27ae60;font-size:10px;"> bản lưu đủ</span>'
        : '<span style="color:#e67e22;font-size:10px;" title="Chỉ khôi phục nút đường đi và cạnh nối"> bản lưu một phần</span>';
      const rollbackBtn = isCurrent
        ? '<span style="color:#888;font-size:12px;">Đang dùng</span>'
        : (v.has_full_snapshot
          ? '<button type="button" class="btn-edit" style="background:#e67e22;color:#fff;font-size:12px;padding:4px 8px;" onclick="rollbackMapVersion(' + v.version + ',true)">Khôi phục</button>'
          : '<button type="button" class="btn-edit" style="background:#95a5a6;color:#fff;font-size:12px;padding:4px 8px;" disabled title="Bản cũ không có bản lưu phòng/cửa">Không khôi phục được</button>');
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
    alert('Phiên bản v' + version + ' được xuất bản trước khi có bản lưu đầy đủ.\n\nKhông thể khôi phục phòng/cửa từ bản này. Hãy chọn phiên bản có nhãn "bản lưu đủ" (thường từ v2 trở đi).');
    return;
  }
  let confirmMsg = 'Khôi phục bản đồ tầng ' + floor + ' về nội dung phiên bản v' + version + '?\n\n';
  confirmMsg += '• Máy chủ sẽ tạo phiên bản MỚI (vd. v7) — không thay thế số phiên bản hiện tại.\n';
  confirmMsg += '• Mở trình soạn bản đồ và Ctrl+F5 sau khi xong để xem bản đồ.\n';
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
        msg += '\n\n⚠️ Chỉ khôi phục nút đường đi và cạnh nối (bản cũ không có bản lưu phòng/cửa).';
      }
      msg += '\n\nBước tiếp: Dashboard → Vẽ bản đồ → Ctrl+F5.';
      if (statusEl) {
        statusEl.style.background = '#ecfdf5';
        statusEl.style.color = '#047857';
        statusEl.textContent = 'Đã khôi phục từ v' + version + ' → v' + newVer + (data.rollback_mode === 'graph_only' ? ' (chỉ nút đường đi và cạnh nối)' : '') + '. Mở trình soạn + Ctrl+F5.';
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
      statusEl.textContent = 'Lỗi kết nối khi khôi phục phiên bản.';
    }
    alert('Lỗi kết nối khi khôi phục phiên bản!');
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

/** Super Admin: lọc nhanh tài khoản bị khóa / chờ duyệt (Google cũ, v.v.) */
function filterPendingAccounts() {
  const statusEl = document.getElementById('filterUserStatus');
  if (statusEl) statusEl.value = 'inactive';
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
    SUPER_ADMIN: 'Quản trị hệ thống',
    FINANCE_ADMIN: 'Quản trị tài chính',
    ORG_ADMIN: 'Quản trị tổ chức',
    BUILDING_ADMIN: 'Quản trị tòa nhà',
    REGISTERED_USER: 'Tài khoản cá nhân'
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
      const btnTitle = isActive ? 'Khóa tài khoản (không cho đăng nhập)' : 'Mở khóa / duyệt tài khoản';
      actionBtn = '<button class="' + btnClass + '" onclick="toggleUserActive(\'' + u._id + '\', ' + isActive + ')" style="padding:6px 12px;" title="' + btnTitle + '">' + btnText + '</button>';
    }
    let editBtn = '';
    let pwdBtn = '';
    const canResetPwd = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ORG_ADMIN';
    if (!isAdminSelf) {
      editBtn = '<button class="btn-edit" onclick="openUpdateUserModal(\'' + u._id + '\')" style="font-size:13px;padding:6px 10px;" title="Sửa thông tin tài khoản">Sửa</button>';
      if (canResetPwd && !isSuperAdmin) {
        pwdBtn = '<button class="btn-edit" onclick="promptResetUserPassword(\'' + u._id + '\')" style="font-size:12px;padding:6px 8px;background:#8e44ad;color:#fff;" title="Cấp mật khẩu mới cho user">Cấp MK</button>';
      }
    }
    let roleClass = 'role-badge building-admin';
    if (isSuperAdmin) roleClass = 'role-badge super-admin';
    else if (u.role === 'ORG_ADMIN') roleClass = 'role-badge org-admin';
    else if (u.role === 'FINANCE_ADMIN') roleClass = 'role-badge finance-admin';
    else if (u.role === 'REGISTERED_USER') roleClass = 'role-badge registered-user';
    else if (u.role === 'BUILDING_ADMIN') roleClass = 'role-badge building-admin';
    let statusClass;
    let statusText;
    if (u.quota_locked) {
      statusClass = 'status-badge inactive badge-quota-locked';
      statusText = 'Khóa quota';
    } else {
      statusClass = u.is_active ? 'status-badge active' : 'status-badge inactive';
      statusText = u.is_active ? 'Hoạt động' : 'Chờ duyệt / khóa';
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
      '<td><span class="' + roleClass + '">' + escapeHtml(roleText) + '</span></td>' +
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
  MAP_VERSION_RETENTION: 'Dọn phiên bản bản đồ cũ',
  CREATE_BUILDING: 'Tạo tòa nhà',
  UPDATE_BUILDING: 'Cập nhật tòa nhà',
  ADD_FLOOR: 'Thêm tầng',
  REMOVE_FLOOR: 'Bớt tầng',
  DELETE_BUILDING: 'Xóa tòa nhà',
  DEACTIVATE_BUILDING: 'Vô hiệu hóa tòa nhà',
  ACTIVATE_BUILDING: 'Khôi phục tòa nhà',
  CREATE_USER: 'Tạo tài khoản',
  ADMIN_UPDATE_USER: 'Admin sửa tài khoản',
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
  SELF_SERVICE_ORG_TRIAL: 'Dùng thử tự đăng ký',
  UPDATE_ORGANIZATION: 'Cập nhật tổ chức',
  DEACTIVATE_ORGANIZATION: 'Tạm dừng tổ chức',
  ACTIVATE_ORGANIZATION: 'Kích hoạt tổ chức',
  ADMIN_RESET_PASSWORD: 'Admin đặt lại mật khẩu',
  CREATE_PLAN: 'Tạo gói dịch vụ',
  UPDATE_PLAN: 'Cập nhật / ngừng bán gói',
  DELETE_PLAN: 'Xóa gói dịch vụ',
  CREATE_INVOICE: 'Tạo hóa đơn',
  UPDATE_INVOICE: 'Sửa hóa đơn',
  VOID_INVOICE: 'Hủy hóa đơn',
  MARK_INVOICE_PAID: 'Ghi nhận thu hóa đơn',
  CHECKOUT_START: 'Bắt đầu thanh toán gói',
  SUBSCRIPTION_PAYMENT: 'Thanh toán gói thành công',
  ACTIVATE_SUBSCRIPTION: 'Kích hoạt / gia hạn gói',
  CANCEL_SUBSCRIPTION: 'Hủy gói đăng ký',
  EXPIRE_SUBSCRIPTION: 'Hết hạn gói',
  CREATE_BILLING_EVENT: 'Ghi sự kiện thanh toán',
  UPDATE_ORG_CONTACT: 'Cập nhật liên hệ tổ chức',
  SET_PUBLISH_PERMIT: 'Cấp quyền xuất bản',
  CLEAR_PUBLISH_PERMIT: 'Thu hồi quyền xuất bản'
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
  FINANCE_ADMIN: 'Quản trị tài chính',
  ORG_ADMIN: 'Quản trị tổ chức',
  BUILDING_ADMIN: 'Quản trị tòa nhà',
  REGISTERED_USER: 'Tài khoản cá nhân'
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
    LOAD_MAP: 'Mở bản đồ trên trình soạn' + name,
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

  tbody.innerHTML = dashUiTableLoading(7);

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

    const orgSec = document.getElementById('profileOrgSection');
    const org = user.organization || null;
    const contactEdit = document.getElementById('profileOrgContactEdit');
    if (orgSec && org && typeof org === 'object') {
      orgSec.style.display = 'block';
      const nameEl = document.getElementById('profileOrgName');
      const planEl = document.getElementById('profileOrgPlan');
      const billEl = document.getElementById('profileOrgBilling');
      const expEl = document.getElementById('profileOrgExpiry');
      const hintEl = document.getElementById('profileOrgHint');
      const orgPhoneEl = document.getElementById('profileOrgContactPhone');
      const orgAddrEl = document.getElementById('profileOrgContactAddress');
      if (nameEl) nameEl.value = org.name || '-';
      if (planEl) planEl.value = org.plan || 'FREE';
      if (billEl) billEl.value = org.billing_status || 'ACTIVE';
      let expiry = '-';
      if (org.plan_expires_at) {
        expiry = 'Hết hạn: ' + new Date(org.plan_expires_at).toLocaleString('vi-VN');
      } else if (org.grace_ends_at) {
        expiry = 'Ân hạn đến: ' + new Date(org.grace_ends_at).toLocaleString('vi-VN');
      } else if (org.plan === 'FREE') {
        expiry = 'Gói FREE — không có hạn thanh toán';
      }
      if (expEl) expEl.value = expiry;
      const canEditOrgContact = user.role === 'ORG_ADMIN';
      if (contactEdit) contactEdit.style.display = canEditOrgContact ? 'block' : 'none';
      if (orgPhoneEl) orgPhoneEl.value = org.contact_phone || '';
      if (orgAddrEl) orgAddrEl.value = org.contact_address || '';
      if (hintEl) {
        if (canEditOrgContact) {
          hintEl.textContent = !isPaidPlanUi(org.plan)
            ? 'Điền SĐT + địa chỉ tổ chức rồi Lưu — bắt buộc trước khi thanh toán bất kỳ gói trả phí nào.'
            : 'Có thể cập nhật SĐT/địa chỉ tổ chức. Chi tiết gói tại tab Gói & Thanh toán.';
        } else {
          hintEl.textContent = !isPaidPlanUi(org.plan)
            ? 'Nâng gói tại tab Gói & Thanh toán. Khi mua gói trả phí cần đủ SĐT + địa chỉ tổ chức (ORG_ADMIN điền).'
            : 'Xem chi tiết gia hạn / hóa đơn tại tab Gói & Thanh toán.';
        }
      }
    } else if (orgSec) {
      orgSec.style.display = 'none';
      if (contactEdit) contactEdit.style.display = 'none';
    }
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
    if (!res.ok) {
      msgEl.textContent = 'Lỗi: ' + (data.message || 'Không rõ');
      msgEl.style.display = 'block';
      msgEl.className = 'error-msg';
      return;
    }
    if (currentProfile) { currentProfile.full_name = fullName; currentProfile.phone = phone; }

    // Phase 8 — ORG_ADMIN lưu contact org (checkout PRO)
    let orgContactOk = true;
    let orgContactMsg = '';
    const role = (currentProfile && currentProfile.role) || (data && data.role) || '';
    const contactEdit = document.getElementById('profileOrgContactEdit');
    if (role === 'ORG_ADMIN' && contactEdit && contactEdit.style.display !== 'none') {
      const orgPhone = (document.getElementById('profileOrgContactPhone') || {}).value || '';
      const orgAddr = (document.getElementById('profileOrgContactAddress') || {}).value || '';
      const orgRes = await apiFetch('/organizations/me/contact', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_phone: String(orgPhone).trim(),
          contact_address: String(orgAddr).trim()
        })
      });
      const orgData = await orgRes.json().catch(() => ({}));
      if (!orgRes.ok) {
        orgContactOk = false;
        orgContactMsg = orgData.message || 'Không lưu được hồ sơ tổ chức';
      } else if (currentProfile && currentProfile.organization) {
        currentProfile.organization.contact_phone = String(orgPhone).trim();
        currentProfile.organization.contact_address = String(orgAddr).trim();
      }
    }

    if (orgContactOk) {
      msgEl.textContent = 'Cập nhật thành công!';
      msgEl.style.display = 'block';
      msgEl.className = 'success-msg';
    } else {
      msgEl.textContent = 'Đã lưu hồ sơ cá nhân, nhưng tổ chức lỗi: ' + orgContactMsg;
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
      setTimeout(() => { clearAuthStorage(); window.location.replace('/login'); }, 1500);
    } else {
      msgEl.textContent = 'Lỗi: ' + (data.message || 'Không rõ'); msgEl.style.display = 'block'; msgEl.className = 'error-msg';
    }
  } catch (e) {
    msgEl.textContent = 'Lỗi kết nối!';
    msgEl.style.display = 'block';
    msgEl.className = 'error-msg';
  }
};










