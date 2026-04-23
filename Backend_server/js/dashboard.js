// ============================================
// FILE: dashboard.js
// MỤC ĐÍCH: Xử lý logic trang Dashboard sau khi đăng nhập
// CHỨC NĂNG: Hiển thị danh sách tòa nhà, tạo tài khoản, đăng xuất
// ============================================

const API_URL = 'http://localhost:5000/api';

// ==========================================
// KIỂM TRA: Admin đã đăng nhập chưa?
// ==========================================
// Lục tủ đồ trình duyệt xem có Thẻ JWT không
const token = localStorage.getItem('token');
const userEmail = localStorage.getItem('userEmail');
const userRole = localStorage.getItem('userRole');

// Nếu chưa đăng nhập (không có thẻ) → Đá về trang Login ngay
if (!token) {
    window.location.href = 'index.html';
}

// ==========================================
// HIỂN THỊ THÔNG TIN NGƯỜI DÙNG
// ==========================================
document.getElementById('userEmail').textContent = userEmail;
document.getElementById('userName').textContent = userEmail;
document.getElementById('userRole').textContent = userRole;

// Nếu là Super Admin → Hiện thêm khu vực quản lý tài khoản
if (userRole === 'SUPER_ADMIN') {
    document.getElementById('superAdminSection').style.display = 'block';
}

// ==========================================
// HÀM: TẢI DANH SÁCH TÒA NHÀ (TỪ SERVER)
// ==========================================
let allBuildings = []; // Biến lưu toàn bộ tòa nhà để dùng cho Checkbox

async function loadBuildings() {
    try {
        const response = await fetch(API_URL + '/buildings', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        const buildings = await response.json();
        allBuildings = buildings; // Lưu lại
        
        const tbody = document.getElementById('buildingsList');
        
        if (!buildings.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Chưa có tòa nhà nào. Bấm "Thêm Tòa Nhà Mới" để bắt đầu!</td></tr>';
            return;
        }

        tbody.innerHTML = buildings.map(b => {
            const date = new Date(b.updatedAt).toLocaleDateString('vi-VN');
            return '<tr>' +
                '<td><strong>' + b.name + '</strong></td>' +
                '<td>' + b.address + '</td>' +
                '<td><span class="badge">' + b.status + '</span></td>' +
                '<td>' + date + '</td>' +
                '<td>' +
                    '<button class="btn-edit" onclick="openEditor(\'' + b._id + '\')" style="margin-right: 5px;">🖊️ Vẽ Bản Đồ</button>' +
                    '<button class="btn-logout" onclick="deleteBuilding(\'' + b._id + '\')" style="background: #e74c3c; padding: 6px 14px;">🗑️ Xóa</button>' +
                '</td>' +
            '</tr>';
        }).join('');

    } catch (error) {
        console.error('Lỗi tải tòa nhà:', error);
    }
}

// Bắt sự kiện nút Thêm Tòa Nhà Mới
function openAddBuildingModal() {
    document.getElementById('addBuildingModal').style.display = 'flex';
}

function closeAddBuildingModal() {
    document.getElementById('addBuildingModal').style.display = 'none';
}

// ==========================================
// HÀM: MỞ WEB MAP EDITOR ĐỂ VẼ BẢN ĐỒ
// ==========================================
function openEditor(id) {
    // Chuyển hướng sang máy chủ Editor chạy chung cổng 5000
    window.location.href = '/editor/index.html?buildingId=' + id;
}

// ==========================================
// SỰ KIỆN: TẠO TÀI KHOẢN MỚI (CHỈ SUPER ADMIN)
// ==========================================
document.getElementById('btnCreateAccount').addEventListener('click', async function() {
    const email = document.getElementById('newEmail').value;
    const password = document.getElementById('newPassword').value;

    if (!email || !password) {
        alert('Vui lòng nhập đủ Email và Mật khẩu!');
        return;
    }

    try {
        const response = await fetch(API_URL + '/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ email, password, role: 'BUILDING_ADMIN' })
        });

        const data = await response.json();
        if (response.ok) {
            alert('Tạo tài khoản thành công cho: ' + email);
            document.getElementById('newEmail').value = '';
            document.getElementById('newPassword').value = '';
        } else {
            alert('Lỗi: ' + data.message);
        }
    } catch (error) {
        alert('Không thể kết nối Server!');
    }
});

// ==========================================
// SỰ KIỆN: ĐĂNG XUẤT
// ==========================================
document.getElementById('btnLogout').addEventListener('click', function() {
    // Xóa sạch Thẻ JWT và thông tin khỏi tủ đồ trình duyệt
    localStorage.clear();
    // Quay về trang Login
    window.location.href = 'index.html';
});

// ==========================================
// KHỞI CHẠY: Tải danh sách tòa nhà khi mở trang
// ==========================================
loadBuildings();

// ==========================================
// HÀM: TẢI DANH SÁCH ADMIN (DÀNH CHO SUPER ADMIN)
// ==========================================
let allUsers = []; // Lưu danh sách user để dùng khi Sửa

async function loadUsers() {
    try {
        const response = await fetch(API_URL + '/users', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        const users = await response.json();
        allUsers = users; // Lưu lại
        const tbody = document.getElementById('usersList');
        
        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Chưa có tài khoản Admin nào khác.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(u => {
            const status = u.is_active ? '<span style="color: green">🟢 Hoạt động</span>' : '<span style="color: red">🔴 Đã khóa</span>';
            const bNames = u.assigned_buildings && u.assigned_buildings.length > 0 
                ? u.assigned_buildings.map(id => {
                    const b = allBuildings.find(item => item._id === id);
                    return b ? b.name : 'ID:' + id;
                }).join(', ')
                : 'Chưa gán';

            return '<tr>' +
                '<td><strong>' + u.email + '</strong></td>' +
                '<td><span class="badge" style="background: #34495e">' + u.role + '</span></td>' +
                '<td>' + status + '</td>' +
                '<td style="font-size: 13px; color: #7f8c8d">' + bNames + '</td>' +
                '<td>' +
                    '<button class="btn-edit" onclick="openEditModal(\'' + u._id + '\')" style="background: #f1c40f; color: black; margin-right: 5px;">🖊️ Sửa</button>' +
                    '<button class="btn-edit" onclick="toggleUserStatus(\'' + u._id + '\', ' + !u.is_active + ')" style="margin-right: 5px;">' + (u.is_active ? 'Khóa' : 'Mở Khóa') + '</button>' +
                    '<button class="btn-logout" onclick="deleteUser(\'' + u._id + '\')" style="background: #e74c3c; padding: 10px 14px;">🗑️ Xóa</button>' +
                '</td>' +
            '</tr>';
        }).join('');
    } catch (error) {
        console.error('Lỗi tải danh sách Admin:', error);
        document.getElementById('usersList').innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">❌ Lỗi: Không thể kết nối API Admin. (Hãy thử Restart Server)</td></tr>';
    }
}

// ==========================================
// HÀM: XÓA TÀI KHOẢN ADMIN
// ==========================================
async function deleteUser(id) {
    if (!confirm('⚠️ KHIẾP ĐẢM: Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản này không?')) return;
    try {
        const response = await fetch(API_URL + '/users/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (response.ok) {
            alert('Đã xóa thành công!');
            loadUsers(); // Tải lại bảng sau khi xóa
        } else {
            alert('Lỗi khi xóa!');
        }
    } catch(e) { alert('Lỗi kết nối Server!'); }
}

// ==========================================
// HÀM: KHÓA / MỞ KHÓA TÀI KHOẢN
// ==========================================
async function toggleUserStatus(id, newStatus) {
    try {
        const response = await fetch(API_URL + '/users/' + id, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify({ is_active: newStatus })
        });
        if (response.ok) {
            loadUsers(); // Tải lại bảng
        }
    } catch(e) { alert('Lỗi kết nối!'); }
}

// ==========================================
// HÀM: MỞ/ĐÓNG MODAL THÊM TÒA NHÀ
// ==========================================
function closeAddBuildingModal() {
    document.getElementById('addBuildingModal').style.display = 'none';
}

async function saveNewBuilding() {
    const name = document.getElementById('addBuildingName').value;
    const address = document.getElementById('addBuildingAddress').value;
    const lat = document.getElementById('addBuildingLat').value;
    const lng = document.getElementById('addBuildingLng').value;

    if (!name) return alert('Vui lòng nhập tên tòa nhà!');

    try {
        const response = await fetch(API_URL + '/buildings', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify({ name, address, lat, lng })
        });

        if (response.ok) {
            alert('Đã thêm tòa nhà mới!');
            closeAddBuildingModal();
            loadBuildings();
        } else {
            const data = await response.json();
            alert('Lỗi: ' + data.message);
        }
    } catch (e) { alert('Lỗi kết nối!'); }
}

document.getElementById('btnSaveNewBuilding').onclick = saveNewBuilding;

async function deleteBuilding(id) {
    if (!confirm('Bạn có chắc muốn xóa tòa nhà này và toàn bộ bản đồ của nó?')) return;
    try {
        const response = await fetch(API_URL + '/buildings/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (response.ok) {
            alert('Đã xóa tòa nhà!');
            loadBuildings();
        }
    } catch (e) { alert('Lỗi kết nối!'); }
}

// ==========================================
// HÀM: MỞ BẢNG CHỈNH SỬA ADMIN (CÓ CHECKBOX TÒA NHÀ)
// ==========================================
function openEditModal(id) {
    // Tìm thông tin user trong mảng đã tải
    const user = allUsers.find(u => u._id === id);
    if (!user) return;

    document.getElementById('editUserId').value = id;
    document.getElementById('editEmail').value = user.email;
    document.getElementById('editRole').value = user.role;
    document.getElementById('editPassword').value = "";
    
    // Nạp danh sách Checkbox Tòa nhà
    const container = document.getElementById('editUserBuildingsList');
    container.innerHTML = allBuildings.map(b => {
        // Kiểm tra xem tòa nhà này có nằm trong danh sách được gán của User không
        const isAssigned = user.assigned_buildings && user.assigned_buildings.includes(b._id);
        
        return '<div style="margin-bottom: 5px;">' +
               '<label style="font-weight: normal; cursor: pointer;">' +
               '<input type="checkbox" class="building-checkbox" value="' + b._id + '" ' + (isAssigned ? 'checked' : '') + '> ' + b.name +
               '</label></div>';
    }).join('') || '<p style="color:#888; font-size: 13px;">Chưa có tòa nhà nào để gán. Hãy thêm tòa nhà trước!</p>';

    document.getElementById('editUserModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editUserModal').style.display = 'none';
}

// ==========================================
// HÀM: LƯU THÔNG TIN ADMIN SAU KHI SỬA
// ==========================================
async function saveEditAdmin() {
    const id = document.getElementById('editUserId').value;
    const email = document.getElementById('editEmail').value;
    const role = document.getElementById('editRole').value;
    const password = document.getElementById('editPassword').value;

    // Lấy danh sách các Tòa nhà được tích chọn
    const checkedBoxes = document.querySelectorAll('.building-checkbox:checked');
    const assigned_buildings = Array.from(checkedBoxes).map(cb => cb.value);

    try {
        const response = await fetch(API_URL + '/users/' + id, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify({ email, role, password, assigned_buildings })
        });

        if (response.ok) {
            alert('Đã cập nhật tài khoản thành công!');
            closeEditModal();
            loadUsers(); // Tải lại danh sách
        } else {
            const data = await response.json();
            alert('Lỗi: ' + data.message);
        }
    } catch(e) { alert('Lỗi kết nối Server!'); }
}

// Nếu là Super Admin thì gọi thêm hàm tải danh sách Admin
if (userRole === 'SUPER_ADMIN') {
    loadUsers();
}
