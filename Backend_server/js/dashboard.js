// ============================================================
// 1. CONFIG & CONSTANTS
// Dùng relative URL để dashboard gọi đúng backend trên cùng domain.
// Khi deploy lên Render, cùng domain nên không cần CORS.
const API_URL = '/api';

const PAGE_SIZE = 15;
const LOGS_PAGE_SIZE = 20;

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

const WIDE_LAYOUT_TABS = new Set(['buildings', 'users', 'logs', 'organizations', 'registrations']);

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
function applyCurrentUserToUI(user) {
  if (!user) return;
  currentUser = user;
  const emailEl = document.getElementById('userEmail');
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  if (emailEl) emailEl.textContent = user.email || '';
  if (nameEl) nameEl.textContent = user.full_name || user.email || 'User';
  if (roleEl) roleEl.textContent = user.role || '';
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
  if (usersBtn) usersBtn.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  if (logsBtn) logsBtn.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  if (orgTabBtn) orgTabBtn.style.display = isSuperAdmin ? '' : 'none';

  const btnAddUser = document.getElementById('btnAddUser');
  const btnAddBuilding = document.getElementById('btnAddBuilding');
  if (btnAddUser) btnAddUser.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';
  if (btnAddBuilding) btnAddBuilding.style.display = (isSuperAdmin || isOrgAdmin) ? '' : 'none';

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

// ============================================================
// DASHBOARD STARTUP INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await syncCurrentSession('initial-load');
  if (!currentUser) return;

  if (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ORG_ADMIN') {
    fetchOrganizations();
  }

  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  let initialTab = localStorage.getItem('activeDashboardTab') || 'buildings';
  if (currentUser.role === 'BUILDING_ADMIN') {
    if (initialTab === 'users' || initialTab === 'logs' || initialTab === 'organizations') {
      initialTab = 'buildings';
    }
  }
  if (currentUser.role === 'ORG_ADMIN' && initialTab === 'organizations') {
    initialTab = 'buildings';
  }
  if (currentUser.role !== 'SUPER_ADMIN' && initialTab === 'registrations') {
    initialTab = 'buildings';
  }

  await switchTab(initialTab);
});
// MULTI-TAB SYNC LISTENERS (TEMPORARILY DISABLED)
// ============================================================
// 1. Storage event: khi tab khác thay đổi localStorage
// window.addEventListener('storage', (event) => {
//   if (['token', 'refreshToken', 'userEmail', 'userRole', 'userId', 'authEvent'].includes(event.key)) {
//     syncCurrentSession('storage-change');
//   }
// });

// 2. Visibility change: khi tab được focus lại
// document.addEventListener('visibilitychange', () => {
//   if (document.visibilityState === 'visible') {
//     syncCurrentSession('tab-visible');
//   }
// });

// 3. Page show (bfcache restore)
// window.addEventListener('pageshow', (event) => {
//   if (event.persisted) {
//     syncCurrentSession('pageshow');
//   }
// });

// ============================================================
// TAB SWITCHING
async function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).style.display = 'block';
  const btns = document.querySelectorAll('.tab-btn');
  for (const btn of btns) {
    if (btn.getAttribute('onclick').includes("'" + name + "'")) {
      btn.classList.add('active');
      break;
    }
  }
  localStorage.setItem('activeDashboardTab', name);
  applyDashboardLayout(name);

  if (name === 'buildings') { restoreBuildingFilters(); await fetchBuildings(); }
  if (name === 'users') { restoreUserFilters(); await fetchUsers(); }
  if (name === 'logs') await loadLogs();
  if (name === 'profile') await loadProfile();
  if (name === 'organizations') {
    restoreOrganizationFilters();
    await fetchOrganizations();
    if (!allBuildings.length) await fetchBuildings();
    if (!allUsers.length) await fetchUsers();
  }
  if (name === 'registrations') await fetchRegistrations();
}

// ============================================================
// BUILDINGS
let allBuildings = [];
let displayedBuildings = [];

function getOrgName(orgId) {
  if (!orgId) return '—';
  const id = String(orgId);
  const org = allOrganizations.find(o => String(o._id) === id);
  return org ? org.name : id.slice(0, 8) + '…';
}

async function fetchBuildings() {
  const tbody = document.getElementById('buildingsList');
  if (currentUser?.role === 'SUPER_ADMIN' && allOrganizations.length === 0) {
    await fetchOrganizations();
  }
  try {
    const res = await apiFetch('/buildings');
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
  localStorage.setItem('buildingsFilters', JSON.stringify({ orgId, keyword, status }));
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

function clearBuildingFilters() {
  ['filterBuildingOrg', 'filterBuildingKeyword', 'filterBuildingStatus'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  localStorage.removeItem('buildingsFilters');
  window._buildingsPage = 1;
  applyBuildingFilters(false);
}

function restoreBuildingFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem('buildingsFilters') || '{}');
    if (saved.orgId != null) { const el = document.getElementById('filterBuildingOrg'); if (el) el.value = saved.orgId; }
    if (saved.keyword != null) { const el = document.getElementById('filterBuildingKeyword'); if (el) el.value = saved.keyword; }
    if (saved.status != null) { const el = document.getElementById('filterBuildingStatus'); if (el) el.value = saved.status; }
  } catch (e) {}
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
  const list = displayedBuildings.length ? displayedBuildings : allBuildings;
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
    let actions = '<button class="btn-edit" onclick="openEditor(\'' + b._id + '\')" style="margin-right:4px;">Vẽ bản đồ</button>' +
      '<button class="btn-edit" onclick="openMapVersionModal(\'' + b._id + '\', ' + (b.total_floors || 1) + ')" style="background:#8e44ad;color:white;margin-right:4px;">Phiên bản</button>';
    if (canEditMeta) {
      actions += '<button class="btn-edit" onclick="openEditBuildingModal(\'' + b._id + '\')" style="background:#f39c12;color:white;margin-right:4px;">Sửa</button>';
    }
    if (canDelete) {
      actions += '<button class="btn-logout" onclick="deleteBuilding(\'' + b._id + '\')" style="background:#e74c3c;padding:6px 12px;">Xóa</button>';
    }
    return '<tr>' +
      tdEllipsis(b.name, '<strong>' + escapeHtml(b.name) + '</strong>' + desc) +
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
}


function renderOrganizationsFromCache() {
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
  if (status === 'active') list = list.filter(o => o.is_active);
  if (status === 'inactive') list = list.filter(o => !o.is_active);
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
    const statusBadge = org.is_active
      ? '<span class="status-badge active">Hoạt động</span>'
      : '<span class="status-badge inactive">Tạm dừng</span>';
    const bCount = org.building_count != null ? org.building_count : '—';
    const uCount = org.user_count != null ? org.user_count : '—';
    const admin = org.org_admin ? escapeHtml(org.org_admin.full_name || org.org_admin.email || '') : '—';
    const oid = String(org._id);
    return '<tr>' +
      tdEllipsis(org.name, '<strong>' + escapeHtml(org.name) + '</strong>') +
      tdEllipsis(org.slug) +
      '<td><span class="badge">' + escapeHtml(org.plan || 'FREE') + '</span></td>' +
      '<td>' + statusBadge + '</td>' +
      '<td style="text-align:center;cursor:pointer;" onclick="jumpToBuildings(\'' + oid + '\')" title="Xem tòa nhà">' + bCount + '</td>' +
      '<td style="text-align:center;cursor:pointer;" onclick="jumpToUsers(\'' + oid + '\')" title="Xem tài khoản">' + uCount + '</td>' +
      tdEllipsis(org.org_admin ? (org.org_admin.full_name || org.org_admin.email) : '', admin) +
      '<td>' + date + '</td>' +
      '<td class="actions-cell"><div class="building-actions">' +
        '<button type="button" class="btn-edit" onclick="jumpToBuildings(\'' + oid + '\')">Tòa nhà</button>' +
        '<button type="button" class="btn-edit" onclick="jumpToUsers(\'' + oid + '\')" style="background:#f39c12;color:#fff;">User</button>' +
      '</div></td></tr>';
  }).join('');
  renderPagination('organizations', list.length, page);
}

function applyOrganizationFilters(resetPage) {
  if (resetPage !== false) window._organizationsPage = 1;
  const keyword = document.getElementById('filterOrgKeyword')?.value || '';
  const code = document.getElementById('filterOrgCode')?.value || '';
  const plan = document.getElementById('filterOrgPlan')?.value || '';
  const status = document.getElementById('filterOrgStatus')?.value || '';
  localStorage.setItem('organizationsFilters', JSON.stringify({ keyword, code, plan, status }));
  renderOrganizationsFromCache();
}

function clearOrganizationFilters() {
  ['filterOrgKeyword', 'filterOrgCode', 'filterOrgPlan', 'filterOrgStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  localStorage.removeItem('organizationsFilters');
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
  const modal = document.getElementById('createUserModal');
  if (!modal) return;

  document.getElementById('createUserEmail').value = '';
  document.getElementById('createUserFullName').value = '';
  document.getElementById('createUserPhone').value = '';
  document.getElementById('createUserPassword').value = '';

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

  if (roleSelect) {
    roleSelect.value = 'BUILDING_ADMIN';
    roleSelect.onchange = () => {
      const role = roleSelect.value;
      if (buildingsGroup) buildingsGroup.style.display = role === 'BUILDING_ADMIN' ? '' : 'none';
      if (orgGroup) orgGroup.style.display = role === 'SUPER_ADMIN' ? 'none' : '';
    };
  }

  if (isSuperAdmin && allOrganizations.length === 0) {
    await fetchOrganizations();
  } else if (isSuperAdmin) {
    populateOrganizationDropdown();
  }
  if (orgSelect && isSuperAdmin) orgSelect.value = '';

  if (!allBuildings.length) await fetchBuildings();
  populateUserBuildingsSelect('createUserAssignedBuildings', []);
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

function populateUserBuildingsSelect(selectId, selectedIds) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const ids = (selectedIds || []).map(id => String(id));
  if (!allBuildings || allBuildings.length === 0) {
    sel.innerHTML = '<option value="">Chưa có tòa nhà nào để gán</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = allBuildings.map(b =>
    `<option value="${b._id}">${escapeHtml(b.name)} (${escapeHtml(b.address || '-')})</option>`
  ).join('');
  Array.from(sel.options).forEach(opt => {
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
  if (!password || password.length < 8) return alert('Mật khẩu phải có ít nhất 8 ký tự.');
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
  document.getElementById('editBuildingFloors').value = b.total_floors || 1;
  document.getElementById('editBuildingLat').value = b.gps_location ? b.gps_location.lat : 0;
  document.getElementById('editBuildingLng').value = b.gps_location ? b.gps_location.lng : 0;
  document.getElementById('editBuildingStatus').value = b.status || 'DRAFT';
  document.getElementById('editBuildingOrganizationId').value = b.organization_id || '';
  document.getElementById('editBuildingModal').style.display = 'flex';
}

function closeEditBuildingModal() { document.getElementById('editBuildingModal').style.display = 'none'; }

async function saveEditBuilding() {
  const id = document.getElementById('editBuildingId').value;
  const name = document.getElementById('editBuildingName').value.trim();
  const address = document.getElementById('editBuildingAddress').value.trim();
  const desc = document.getElementById('editBuildingDesc').value.trim();
  const floors = parseInt(document.getElementById('editBuildingFloors').value) || 1;
  const lat = parseFloat(document.getElementById('editBuildingLat').value) || 0;
  const lng = parseFloat(document.getElementById('editBuildingLng').value) || 0;
  const status = document.getElementById('editBuildingStatus').value;
  const orgId = document.getElementById('editBuildingOrganizationId')?.value?.trim() || '';
  try {
    const payload = { name, address, description: desc, total_floors: floors, lat, lng, status };
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
  if (!confirm('Bạn có chắc muốn xóa tòa nhà này và toàn bộ bản đồ của nó?')) return;
  try {
    const res = await apiFetch('/buildings/' + id, { method: 'DELETE' });
    if (res.ok) { alert('Đã xóa tòa nhà!'); fetchBuildings(); }
    else {
      const d = await res.json().catch(() => ({}));
      alert('Lỗi khi xóa: ' + (d.message || ('HTTP ' + res.status)));
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

async function fetchUsers() {
  if (currentUser?.role === 'SUPER_ADMIN' && allOrganizations.length === 0) {
    await fetchOrganizations();
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
    localStorage.setItem('usersFilters', JSON.stringify({ orgId, keyword, role, status }));
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
  } catch (e) {}
}

let allUsers = [];

function renderUsersFromCache() {
  const page = window._usersPage || 1;
  const start = (page - 1) * PAGE_SIZE;
  const slice = allUsers.slice(start, start + PAGE_SIZE);
  renderUsers(slice);
  renderPagination('users', allUsers.length, page);
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
    if (!isAdminSelf) {
      editBtn = '<button class="btn-edit" onclick="openUpdateUserModal(\'' + u._id + '\')" style="font-size:13px;padding:6px 10px;">Sửa</button>';
    }
    const roleClass = isSuperAdmin ? 'role-badge super-admin' : (u.role === 'ORG_ADMIN' ? 'role-badge org-admin' : 'role-badge building-admin');
    const statusClass = u.is_active ? 'status-badge active' : 'status-badge inactive';
    const statusText = u.is_active ? 'Hoạt động' : 'Bị khóa';
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
      '<td class="actions-cell"><div class="user-actions">' + actionBtn + editBtn + '</div></td></tr>';
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
    populateUserBuildingsSelect('updateUserAssignedBuildings', assignedIds);

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
  PUBLISH_MAP: 'Xuất bản bản đồ',
  LOAD_MAP: 'Tải bản đồ',
  ROLLBACK_MAP: 'Khôi phục phiên bản bản đồ',
  CREATE_BUILDING: 'Tạo tòa nhà',
  UPDATE_BUILDING: 'Cập nhật tòa nhà',
  DELETE_BUILDING: 'Xóa tòa nhà',
  DEACTIVATE_BUILDING: 'Vô hiệu hóa tòa nhà',
  CREATE_USER: 'Tạo tài khoản',
  ADMIN_UPDATE_USER: 'Admin sửa user',
  ACTIVATE_USER: 'Kích hoạt tài khoản',
  DEACTIVATE_USER: 'Vô hiệu hóa tài khoản',
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
  SELF_SERVICE_ORG_TRIAL: 'Trial tự động (self-service)'
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
  source: 'Nguồn'
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
    'Vô hiệu hóa tòa nhà (soft delete)': 'Vô hiệu hóa tòa nhà (không xóa dữ liệu)'
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
    DEACTIVATE_BUILDING: 'Vô hiệu hóa tòa nhà' + name,
    DELETE_BUILDING: 'Xóa tòa nhà' + name,
    PUBLISH_MAP: 'Xuất bản bản đồ lên server' + name,
    LOAD_MAP: 'Mở bản đồ trên Editor' + name,
    ROLLBACK_MAP: 'Khôi phục phiên bản bản đồ cũ' + name,
    BUILDING_ASSIGN: 'Gán quyền quản lý tòa nhà' + name,
    BUILDING_UNASSIGN: 'Thu hồi quyền quản lý tòa nhà' + name,
    CHANGE_PASSWORD: 'Đổi mật khẩu tài khoản',
    CREATE_ORG: 'Tạo tổ chức' + name,
    APPROVE_ORG_REGISTRATION: 'Duyệt hồ sơ đăng ký tổ chức' + name,
    REJECT_ORG_REGISTRATION: 'Từ chối hồ sơ đăng ký' + name,
    ADMIN_UPDATE_USER: 'Admin cập nhật tài khoản' + name,
    ACTIVATE_USER: 'Kích hoạt tài khoản' + name,
    DEACTIVATE_USER: 'Vô hiệu hóa tài khoản' + name,
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
        l.action.startsWith('DELETE') || l.action === 'DEACTIVATE_BUILDING' || l.action === 'DEACTIVATE_USER' ? '#e74c3c' :
        l.action.startsWith('CREATE') ? '#27ae60' :
        l.action === 'LOGIN' ? '#3498db' :
        l.action === 'LOGOUT' ? '#e67e22' :
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
  short: 'Mật khẩu mới phải có ít nhất 8 ký tự.',
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
  if (newPassword.length < 8) { msgEl.textContent = passMsgs.short; msgEl.style.display = 'block'; msgEl.className = 'error-msg'; return; }
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










