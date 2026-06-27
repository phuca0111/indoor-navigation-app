// ============================================================
// 1. CONFIG & CONSTANTS
// Dùng relative URL để dashboard gọi đúng backend trên cùng domain.
// Khi deploy lên Render, cùng domain nên không cần CORS.
const API_URL = '/api';

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
function applyCurrentUserToUI(currentUser) {
  if (!currentUser) return;

  // Update header
  const emailEl = document.getElementById('userEmail');
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  if (emailEl) emailEl.textContent = currentUser.email || '';
  if (nameEl) nameEl.textContent = currentUser.full_name || currentUser.email || 'User';
  if (roleEl) roleEl.textContent = currentUser.role || '';

  // Update localStorage để các tab khác biết (nếu chưa có)
  localStorage.setItem('userEmail', currentUser.email || '');
  localStorage.setItem('userRole', currentUser.role || '');
  localStorage.setItem('userId', currentUser._id || currentUser.id || '');

  // Show/hide Super Admin tabs
  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';
  document.querySelectorAll('.super-admin-only').forEach(el => {
    el.style.display = isSuperAdmin ? '' : 'none';
  });

  // If not Super Admin and currently on users/logs tab, switch away
  const currentTab = document.querySelector('.tab-btn.active');
  if (currentTab && !isSuperAdmin) {
    const tabName = currentTab.getAttribute('onclick')?.match(/'([^']+)'/) ?.[1];
    if (tabName === 'users' || tabName === 'logs') {
      switchTab('buildings');
    }
  }

  // Show tab navigation
  const tabNav = document.getElementById('tabNav');
  if (tabNav) {
    tabNav.style.display = 'flex';
  }
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
    const currentUser = await res.json();
    applyCurrentUserToUI(currentUser);
    if (currentUser.role !== 'SUPER_ADMIN') {
      const currentTab = document.querySelector('.tab-btn.active');
      const onclick = currentTab ? (currentTab.getAttribute('onclick') || '') : '';
      const match = onclick.match(/'([^']+)'/);
      const tabName = match ? match[1] : null;
      if (tabName === 'users' || tabName === 'logs') {
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
  try {
    if (refreshToken) {
      await apiFetch('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
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
  const currentUser = await syncCurrentSession('initial-load');
  if (!currentUser) return;

  // Load organizations for Super Admin (for building creation)
  if (currentUser.role === 'SUPER_ADMIN') {
    fetchOrganizations();
  }

  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Hide tabs that require SUPER_ADMIN role
  if (currentUser.role !== 'SUPER_ADMIN') {
    const usersBtn = document.querySelector('button[onclick*="users"]');
    const logsBtn = document.querySelector('button[onclick*="logs"]');
    if (usersBtn) usersBtn.style.display = 'none';
    if (logsBtn) logsBtn.style.display = 'none';
  }

  // Determine initial tab based on saved preference, with role validation
  let initialTab = localStorage.getItem('activeDashboardTab') || 'buildings';
  if (currentUser.role !== 'SUPER_ADMIN') {
    if (initialTab === 'users' || initialTab === 'logs') {
      initialTab = 'buildings';
    }
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

  // Save active tab to localStorage
  localStorage.setItem('activeDashboardTab', name);

  if (name === 'buildings') await fetchBuildings();
  if (name === 'users') {
    // Reset filter về "all" mỗi khi vào tab
    const filterSelect = document.getElementById('userFilter');
    if (filterSelect) filterSelect.value = 'all';
    await fetchUsers();
  }
  if (name === 'logs') await loadLogs();
  if (name === 'profile') await loadProfile();
}

// ============================================================
// BUILDINGS
let allBuildings = [];

async function fetchBuildings() {
  const tbody = document.getElementById('buildingsList');
  try {
    const res = await apiFetch('/buildings');
    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Không tải được danh sách tòa nhà (HTTP ' + res.status + '). Thử đăng nhập lại.</td></tr>';
      return;
    }
    const data = await res.json();
    allBuildings = Array.isArray(data) ? data : [];
    if (!allBuildings.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Chưa có tòa nhà nào. Bấm "Thêm Tòa Nhà Mới"!</td></tr>';
      return;
    }
    tbody.innerHTML = allBuildings.map(b => {
      const date = new Date(b.updatedAt).toLocaleDateString('vi-VN');
      return `<tr>
<td><strong>${b.name}</strong>${b.description ? '<br><small style="color:#888">' + b.description + '</small>' : ''}</td>
<td>${b.address || '-'}</td>
<td style="text-align:center;">${b.total_floors || 1}</td>
<td><span class="badge">${b.status}</span></td>
<td>${date}</td>
<td>
<button class="btn-edit" onclick="openEditor('${b._id}')" style="margin-right:4px;">Vẽ bản đồ</button>
<button class="btn-edit" onclick="openEditBuildingModal('${b._id}')" style="background:#f39c12; color:white; margin-right:4px;">Sửa</button>
<button class="btn-logout" onclick="deleteBuilding('${b._id}')" style="background:#e74c3c; padding:6px 12px;">Xóa</button>
</td>
</tr>`;
    }).join('');
  } catch (e) {
    console.error('Lỗi tải tòa nhà:', e);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Lỗi kết nối API: ' + (e.message || e) + '</td></tr>';
  }
}

// ============================================================
// ORGANIZATIONS
async function fetchOrganizations() {
  try {
    const res = await apiFetch('/organizations');
    if (!res.ok) {
      console.error('Failed to fetch organizations:', res.status);
      return;
    }
    const data = await res.json();
    allOrganizations = Array.isArray(data) ? data : [];
    populateOrganizationDropdown();
  } catch (e) {
    console.error('Error fetching organizations:', e);
  }
}

function populateOrganizationDropdown() {
  const options = '<option value="">Chọn organization...</option>' +
    allOrganizations.map(org =>
      `<option value="${org._id}">${org.name} (${org.slug})${org.is_active ? '' : ' [inactive]'}</option>`
    ).join('');

  const addSelect = document.getElementById('addBuildingOrganizationId');
  if (addSelect) addSelect.innerHTML = options;

  const editSelect = document.getElementById('editBuildingOrganizationId');
  if (editSelect) editSelect.innerHTML = options;
}

function openEditor(id) { window.location.href = '/editor/index.html?buildingId=' + id; }

function openAddBuildingModal() {
  // Nếu là Super Admin và chưa load organizations, load ngay
  if (currentUser?.role === 'SUPER_ADMIN' && allOrganizations.length === 0) {
    fetchOrganizations();
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
  const orgId = document.getElementById('addBuildingOrganizationId').value.trim();
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
  if (!confirm('Bạn có chắc muốn xóa tòa nhà này và toàn bộ bản đồ của nó?')) return;
  try {
    const res = await apiFetch('/buildings/' + id, { method: 'DELETE' });
    if (res.ok) { alert('Đã xóa tòa nhà!'); fetchBuildings(); }
    else alert('Lỗi khi xóa!');
  } catch (e) { alert('Lỗi kết nối!'); }
}

// ============================================================
// MAP VERSIONS
function openMapVersionModal(buildingId, buildingName) {
  document.getElementById('mapVersionTitle').textContent = 'tòa nhà: ' + buildingName;
  document.getElementById('mapVersionModal').style.display = 'flex';
  loadMapVersions(buildingId);
}

function closeMapVersionModal() { document.getElementById('mapVersionModal').style.display = 'none'; }

async function loadMapVersions(buildingId) {
  const tbody = document.getElementById('mapVersionsList');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Đang tải...</td></tr>';
  try {
    const res = await apiFetch('/map-versions/' + buildingId + '/1');
    const data = await res.json();
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">Chưa có phiên bản nào được publish.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(v => `<tr>
<td style="text-align:center;"><strong>v${v.version}</strong></td>
<td style="text-align:center;">${v.rooms_count}</td>
<td style="text-align:center;">${v.nodes_count}</td>
<td style="text-align:center;">${v.edges_count}</td>
<td>${v.published_by ? v.published_by.email : '-'}</td>
<td>${new Date(v.published_at).toLocaleString('vi-VN')}</td>
</tr>`).join('');
  } catch (e) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Lỗi tải dữ liệu.</td></tr>'; }
}

// ============================================================
// NEW USER MANAGEMENT FUNCTIONS (THEO YÊU CẦU TASK UI FIX ROUND 3)

async function fetchUsers() {
  const filter = document.getElementById('userFilter')?.value || 'all';
  let url = '/users';
  if (filter === 'active') url += '?is_active=true';
  else if (filter === 'inactive') url += '?is_active=false';
  // 'all' thì Không query

  try {
    const res = await apiFetch(url);
    if (!res.ok) {
      const tbody = document.getElementById('usersList');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:red;">Không tải được danh sách user (HTTP ' + res.status + '). Vui lòng tải lại trang.</td></tr>';
      return;
    }
    const data = await res.json();
    const users = Array.isArray(data) ? data : (data.users || data.data || []);
    renderUsers(users);
  } catch (err) {
    const tbody = document.getElementById('usersList');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:red;">Lỗi khi tải danh sách user: ' + (err.message || err) + '</td></tr>';
    console.error('Fetch users error:', err);
  }
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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#888;">Không có tài khoản.</td></tr>';
    return;
  }
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
      actionBtn = `<button class="${btnClass}" onclick="toggleUserActive('${u._id}', ${isActive})" style="padding:6px 12px;">${btnText}</button>`;
    }
    let editBtn = '';
    if (!isAdminSelf) {
      editBtn = `<button class="btn-edit" onclick="openUpdateUserModal('${u._id}')" style="font-size:13px;padding:6px 10px;">Sửa</button>`;
    }
    const roleClass = isSuperAdmin ? 'role-badge super-admin' : 'role-badge building-admin';
    const statusClass = u.is_active ? 'status-badge active' : 'status-badge inactive';
    const statusText = u.is_active ? 'Hoạt động' : 'Bị khóa';
    const roleText = isSuperAdmin ? 'Super Admin' : 'Quản trị tòa nhà';
    return `<tr>
<td>${u.email || '-'}</td>
<td>${u.full_name || '-'}</td>
<td>${u.phone || '-'}</td>
<td><span class="${roleClass}" style="font-size:12px;">${roleText}</span></td>
<td><span class="${statusClass}">${statusText}</span></td>
<td>${formatAssignedBuildings(u.assigned_buildings)}</td>
<td>${createdAtStr}</td>
<td class="actions-cell"><div class="user-actions">${actionBtn}${editBtn}</div></td>
</tr>`;
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
    document.getElementById('updateUserRole').value = user.role;

    const sel = document.getElementById('updateUserAssignedBuildings');
    if (sel) {
      if (allBuildings && allBuildings.length > 0) {
        sel.innerHTML = allBuildings.map(b => `<option value="${b._id}">${b.name} (${b.address || '-'})</option>`).join('');
        // Preselect assigned buildings
        if (user.assigned_buildings && user.assigned_buildings.length) {
          const ids = user.assigned_buildings.map(b => typeof b === 'string' ? b : (b._id || b.id));
          Array.from(sel.options).forEach(opt => { if (ids.includes(opt.value)) opt.selected = true; });
        }
      } else {
        sel.innerHTML = '<option value="">Chưa có tòa nhà nào để gán</option>';
        sel.disabled = true;
      }
    }

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
  const role = document.getElementById('updateUserRole').value;
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
  UNLOCK_SESSION: 'Mở khóa phiên'
};

const FIELD_LABELS = {
  full_name: 'Họ tên',
  phone: 'Số điện thoại',
  role: 'Vai trò',
  is_active: 'Trạng thái',
  assigned_buildings: 'Tòa nhà được gán'
};

const ROLE_LABELS = {
  SUPER_ADMIN: 'Quản trị hệ thống',
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
    BUILDING_ASSIGN: 'Gán quyền quản lý tòa nhà' + name,
    BUILDING_UNASSIGN: 'Thu hồi quyền quản lý tòa nhà' + name,
    CHANGE_PASSWORD: 'Đổi mật khẩu tài khoản',
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
    let url = '/activity-logs?limit=100';
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
        l.action === 'LOGIN' || l.action === 'LOGOUT' ? '#3498db' :
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










