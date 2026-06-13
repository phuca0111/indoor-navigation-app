// Dùng relative URL để dashboard gọi đúng backend trên cùng domain.
const API_URL = '/api';

// WHY: phải là `let` để có thể cập nhật access token sau khi refresh (15 phút hết hạn).
let token       = localStorage.getItem('token');
const userEmail = localStorage.getItem('userEmail');
const userRole  = localStorage.getItem('userRole');

if (!token) window.location.href = 'index.html';

// ============================================================
// HELPER: apiFetch() — tự động refresh access token khi gặp 401
// ----------------------------------------------------------------
// Access token hết hạn 15 phút (xem authController.js). Nếu không có
// cơ chế auto-refresh, mọi request sau 15 phút đều 401 → UI hiển thị
// rỗng (ví dụ "Chưa có tòa nhà nào"). Helper này:
//   1. Gắn Authorization Bearer vào mỗi request
//   2. Khi 401 → gọi /auth/refresh bằng refreshToken (7 ngày) rồi retry 1 lần
//   3. Nếu refresh fail → clear storage + redirect login
// ============================================================
async function tryRefreshToken() {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) return false;
    try {
        const r = await fetch(API_URL + '/auth/refresh', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ refreshToken: rt })
        });
        if (!r.ok) return false;
        const j = await r.json();
        if (!j.token) return false;
        token = j.token;
        localStorage.setItem('token', j.token);
        return true;
    } catch (_) {
        return false;
    }
}

async function apiFetch(path, options = {}) {
    const opts = {
        ...options,
        headers: {
            ...(options.headers || {}),
            'Authorization': 'Bearer ' + token
        }
    };
    let res = await fetch(API_URL + path, opts);

    if (res.status === 401) {
        const ok = await tryRefreshToken();
        if (ok) {
            opts.headers['Authorization'] = 'Bearer ' + token;
            res = await fetch(API_URL + path, opts);
        } else {
            alert('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            localStorage.clear();
            window.location.href = 'index.html';
        }
    }
    return res;
}

document.getElementById('userEmail').textContent = userEmail;
document.getElementById('userName').textContent  = userEmail;
document.getElementById('userRole').textContent  = userRole;

// Super Admin thấy đủ 3 tab
if (userRole === 'SUPER_ADMIN') {
    document.getElementById('tabNav').style.display = 'flex';
}

// ============================================================
// TAB SWITCHING
// ============================================================
function switchTab(name) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + name).style.display = 'block';
    event.target.classList.add('active');

    if (name === 'users')  loadUsers();
    if (name === 'logs')   loadLogs();
}

// ============================================================
// BUILDINGS
// ============================================================
let allBuildings = [];

async function loadBuildings() {
    const tbody = document.getElementById('buildingsList');
    try {
        const res  = await apiFetch('/buildings');
        if (!res.ok) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">❌ Không tải được danh sách tòa nhà (HTTP ' + res.status + '). Thử đăng nhập lại.</td></tr>';
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
                <td>${b.address || '—'}</td>
                <td style="text-align:center;">${b.total_floors || 1}</td>
                <td><span class="badge">${b.status}</span></td>
                <td>${date}</td>
                <td>
                    <button class="btn-edit" onclick="openEditor('${b._id}')" style="margin-right:4px;">🖊️ Vẽ Bản Đồ</button>
                    <button class="btn-edit" onclick="openEditBuildingModal('${b._id}')" style="background:#f39c12; color:white; margin-right:4px;">✏️ Sửa</button>
                    <button class="btn-edit" onclick="openMapVersionModal('${b._id}', '${b.name}')" style="background:#3498db; color:white; margin-right:4px;">📜 Lịch sử</button>
                    <button class="btn-logout" onclick="deleteBuilding('${b._id}')" style="background:#e74c3c; padding:6px 12px;">🗑️ Xóa</button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        console.error('Lỗi tải tòa nhà:', e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">❌ Lỗi kết nối API: ' + (e.message || e) + '</td></tr>';
    }
}

function openEditor(id) {
    window.location.href = '/editor/index.html?buildingId=' + id;
}

// --- Thêm tòa nhà mới ---
function openAddBuildingModal()  { document.getElementById('addBuildingModal').style.display = 'flex'; }
function closeAddBuildingModal() { document.getElementById('addBuildingModal').style.display = 'none'; }

async function saveNewBuilding() {
    const name    = document.getElementById('addBuildingName').value.trim();
    const address = document.getElementById('addBuildingAddress').value.trim();
    const desc    = document.getElementById('addBuildingDesc').value.trim();
    const floors  = parseInt(document.getElementById('addBuildingFloors').value) || 1;
    const lat     = parseFloat(document.getElementById('addBuildingLat').value)  || 0;
    const lng     = parseFloat(document.getElementById('addBuildingLng').value)  || 0;

    if (!name) return alert('Vui lòng nhập tên tòa nhà!');

    try {
        const res = await apiFetch('/buildings', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name, address, description: desc, total_floors: floors, lat, lng })
        });
        if (res.ok) {
            alert('Đã thêm tòa nhà mới!');
            closeAddBuildingModal();
            loadBuildings();
        } else {
            const d = await res.json();
            alert('Lỗi: ' + d.message);
        }
    } catch (e) { alert('Lỗi kết nối!'); }
}

document.getElementById('btnSaveNewBuilding').onclick = saveNewBuilding;

// --- Sửa tòa nhà ---
function openEditBuildingModal(id) {
    const b = allBuildings.find(x => x._id === id);
    if (!b) return;
    document.getElementById('editBuildingId').value      = id;
    document.getElementById('editBuildingName').value    = b.name    || '';
    document.getElementById('editBuildingAddress').value = b.address || '';
    document.getElementById('editBuildingDesc').value    = b.description  || '';
    document.getElementById('editBuildingFloors').value  = b.total_floors || 1;
    document.getElementById('editBuildingLat').value     = b.gps_location ? b.gps_location.lat : 0;
    document.getElementById('editBuildingLng').value     = b.gps_location ? b.gps_location.lng : 0;
    document.getElementById('editBuildingStatus').value  = b.status || 'DRAFT';
    document.getElementById('editBuildingModal').style.display = 'flex';
}

function closeEditBuildingModal() { document.getElementById('editBuildingModal').style.display = 'none'; }

async function saveEditBuilding() {
    const id     = document.getElementById('editBuildingId').value;
    const name   = document.getElementById('editBuildingName').value.trim();
    const address= document.getElementById('editBuildingAddress').value.trim();
    const desc   = document.getElementById('editBuildingDesc').value.trim();
    const floors = parseInt(document.getElementById('editBuildingFloors').value) || 1;
    const lat    = parseFloat(document.getElementById('editBuildingLat').value)  || 0;
    const lng    = parseFloat(document.getElementById('editBuildingLng').value)  || 0;
    const status = document.getElementById('editBuildingStatus').value;

    try {
        const res = await apiFetch('/buildings/' + id, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name, address, description: desc, total_floors: floors, lat, lng, status })
        });
        if (res.ok) {
            alert('Đã cập nhật tòa nhà!');
            closeEditBuildingModal();
            loadBuildings();
        } else {
            const d = await res.json();
            alert('Lỗi: ' + d.message);
        }
    } catch (e) { alert('Lỗi kết nối!'); }
}

// --- Xóa tòa nhà ---
async function deleteBuilding(id) {
    if (!confirm('Bạn có chắc muốn xóa tòa nhà này và toàn bộ bản đồ của nó?')) return;
    try {
        const res = await apiFetch('/buildings/' + id, { method: 'DELETE' });
        if (res.ok) {
            alert('Đã xóa tòa nhà!');
            loadBuildings();
        } else {
            alert('Lỗi khi xóa!');
        }
    } catch (e) { alert('Lỗi kết nối!'); }
}

// ============================================================
// MAP VERSIONS
// ============================================================
function openMapVersionModal(buildingId, buildingName) {
    document.getElementById('mapVersionTitle').textContent = 'Tòa nhà: ' + buildingName;
    document.getElementById('mapVersionModal').style.display = 'flex';
    loadMapVersions(buildingId);
}

function closeMapVersionModal() { document.getElementById('mapVersionModal').style.display = 'none'; }

async function loadMapVersions(buildingId) {
    const tbody = document.getElementById('mapVersionsList');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Đang tải...</td></tr>';
    try {
        // Tải versions cho tầng 1 mặc định, sau đó có thể mở rộng
        const res  = await apiFetch('/map-versions/' + buildingId + '/1');
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
            <td>${v.published_by ? v.published_by.email : '—'}</td>
            <td>${new Date(v.published_at).toLocaleString('vi-VN')}</td>
        </tr>`).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Lỗi tải dữ liệu.</td></tr>';
    }
}

// ============================================================
// USERS (Super Admin)
// ============================================================
let allUsers = [];

async function loadUsers() {
    try {
        const res   = await apiFetch('/users');
        const users = await res.json();
        allUsers    = Array.isArray(users) ? users : [];
        const tbody = document.getElementById('usersList');

        if (!allUsers.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Chưa có tài khoản Admin nào khác.</td></tr>';
            return;
        }

        tbody.innerHTML = allUsers.map(u => {
            const statusHtml = u.is_active
                ? '<span style="color:green">🟢 Hoạt động</span>'
                : '<span style="color:red">🔴 Đã khóa</span>';
            const bNames = u.assigned_buildings && u.assigned_buildings.length
                ? u.assigned_buildings.map(id => {
                    const b = allBuildings.find(x => x._id === id);
                    return b ? b.name : 'ID:' + id;
                }).join(', ')
                : 'Chưa gán';

            return `<tr>
                <td><strong>${u.email}</strong>${u.full_name ? '<br><small style="color:#888">' + u.full_name + '</small>' : ''}</td>
                <td><span class="badge" style="background:#34495e">${u.role}</span></td>
                <td>${statusHtml}</td>
                <td style="font-size:13px; color:#7f8c8d;">${bNames}</td>
                <td>
                    <button class="btn-edit" onclick="openEditModal('${u._id}')" style="background:#f1c40f; color:black; margin-right:4px;">🖊️ Sửa</button>
                    <button class="btn-edit" onclick="toggleUserStatus('${u._id}', ${!u.is_active})" style="margin-right:4px;">${u.is_active ? 'Khóa' : 'Mở Khóa'}</button>
                    <button class="btn-logout" onclick="deleteUser('${u._id}')" style="background:#e74c3c; padding:10px 14px;">🗑️ Xóa</button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        console.error('Lỗi tải danh sách Admin:', e);
        document.getElementById('usersList').innerHTML =
            '<tr><td colspan="5" style="text-align:center;color:red;">❌ Lỗi kết nối API.</td></tr>';
    }
}

document.getElementById('btnCreateAccount').addEventListener('click', async () => {
    const email    = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newPassword').value;
    if (!email || !password) return alert('Vui lòng nhập đủ Email và Mật khẩu!');

    try {
        const res  = await apiFetch('/auth/register', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email, password, role: 'BUILDING_ADMIN' })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Tạo tài khoản thành công cho: ' + email);
            document.getElementById('newEmail').value    = '';
            document.getElementById('newPassword').value = '';
            loadUsers();
        } else {
            alert('Lỗi: ' + data.message);
        }
    } catch (e) { alert('Không thể kết nối Server!'); }
});

async function deleteUser(id) {
    if (!confirm('⚠️ Bạn có chắc muốn XÓA VĨNH VIỄN tài khoản này?')) return;
    try {
        const res = await apiFetch('/users/' + id, { method: 'DELETE' });
        if (res.ok) { alert('Đã xóa!'); loadUsers(); }
        else alert('Lỗi khi xóa!');
    } catch (e) { alert('Lỗi kết nối!'); }
}

async function toggleUserStatus(id, newStatus) {
    try {
        const res = await apiFetch('/users/' + id, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ is_active: newStatus })
        });
        if (res.ok) loadUsers();
    } catch (e) { alert('Lỗi kết nối!'); }
}

function openEditModal(id) {
    const user = allUsers.find(u => u._id === id);
    if (!user) return;
    document.getElementById('editUserId').value    = id;
    document.getElementById('editEmail').value     = user.email;
    document.getElementById('editRole').value      = user.role;
    document.getElementById('editPassword').value  = '';

    const container = document.getElementById('editUserBuildingsList');
    container.innerHTML = allBuildings.map(b => {
        const checked = user.assigned_buildings && user.assigned_buildings.includes(b._id) ? 'checked' : '';
        return `<div style="margin-bottom:5px;">
            <label style="font-weight:normal; cursor:pointer;">
                <input type="checkbox" class="building-checkbox" value="${b._id}" ${checked}> ${b.name}
            </label>
        </div>`;
    }).join('') || '<p style="color:#888; font-size:13px;">Chưa có tòa nhà nào để gán.</p>';

    document.getElementById('editUserModal').style.display = 'flex';
}

function closeEditModal() { document.getElementById('editUserModal').style.display = 'none'; }

async function saveEditAdmin() {
    const id     = document.getElementById('editUserId').value;
    const email  = document.getElementById('editEmail').value.trim();
    const role   = document.getElementById('editRole').value;
    const password = document.getElementById('editPassword').value;
    const assigned_buildings = Array.from(
        document.querySelectorAll('.building-checkbox:checked')
    ).map(cb => cb.value);

    try {
        const res = await apiFetch('/users/' + id, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email, role, password, assigned_buildings })
        });
        if (res.ok) {
            alert('Đã cập nhật tài khoản!');
            closeEditModal();
            loadUsers();
        } else {
            const d = await res.json();
            alert('Lỗi: ' + d.message);
        }
    } catch (e) { alert('Lỗi kết nối Server!'); }
}

// ============================================================
// ACTIVITY LOGS
// ============================================================
async function loadLogs() {
    const action = document.getElementById('filterAction').value;
    const path   = '/activity-logs?limit=100' + (action ? '&action=' + action : '');
    const tbody  = document.getElementById('logsList');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Đang tải...</td></tr>';

    try {
        const res  = await apiFetch(path);
        const data = await res.json();
        const logs = data.logs || [];

        document.getElementById('logsTotal').textContent = `Tổng: ${data.total || 0} bản ghi`;

        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;">Chưa có log nào.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(l => {
            const time  = new Date(l.createdAt).toLocaleString('vi-VN');
            const email = l.user_id ? l.user_id.email : '—';
            const actionBadgeColor = l.action.startsWith('DELETE') ? '#e74c3c'
                : l.action.startsWith('CREATE') ? '#27ae60'
                : l.action === 'LOGIN' || l.action === 'LOGOUT' ? '#3498db' : '#7f8c8d';
            return `<tr>
                <td style="font-size:12px;">${time}</td>
                <td>${email}</td>
                <td><span class="badge" style="background:${actionBadgeColor}; font-size:11px;">${l.action}</span></td>
                <td style="font-size:12px;">${l.target || l.target_id || '—'}</td>
                <td style="font-size:12px; color:#999;">${l.ip_address || '—'}</td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">❌ Lỗi tải logs.</td></tr>';
    }
}

// ============================================================
// ĐĂNG XUẤT
// ============================================================
document.getElementById('btnLogout').addEventListener('click', async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
        await fetch(API_URL + '/auth/logout', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ refreshToken })
        });
    } catch (_) {}
    localStorage.clear();
    window.location.href = 'index.html';
});

// ============================================================
// KHỞI CHẠY
// ============================================================
loadBuildings();
if (userRole === 'SUPER_ADMIN') loadUsers();
