// ============================================
// FILE: login.js
// MỤC ĐÍCH: Xử lý logic khi Admin bấm nút Đăng Nhập
// LUỒNG: Gom Email + Pass → Bắn API → Nhận JWT → Cất vào localStorage → Nhảy sang Dashboard
// ============================================

// Dùng relative URL để chạy được cả local và Render cùng domain.
const API_URL = '/api';

// ============================================
// HELPER: Xóa toàn bộ auth data khỏi localStorage
// ============================================
function clearAuthStorage() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
}

// ============================================
// KIỂM TRA SESSION HIỆN TẠI KHI MỞ LOGIN PAGE
// ============================================
// Nếu user đã login và token còn hợp lệ → tự redirect sang dashboard.
// Nếu token hết hạn/lỗi → xóa token, ở lại login.
(async function checkExistingSessionOnLoad() {
    const token = localStorage.getItem('token');
    if (!token) return; // Chưa login, ở lại trang login

    try {
        const res = await fetch(API_URL + '/users/me', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (res.ok) {
            // Token hợp lệ, user đang login → redirect dashboard
            window.location.replace('/admin/dashboard.html');
        } else {
            // Token không hợp lệ (401/403) → clear storage
            clearAuthStorage();
        }
    } catch (error) {
        console.error('Session check failed:', error);
        clearAuthStorage();
    }
})();

// ============================================
// XỬ LÝ ĐĂNG NHẬP
// ============================================
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('errorMessage');

    errorMsg.style.display = 'none';

    try {
        const response = await fetch(API_URL + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Lưu token và user info vào localStorage
            localStorage.setItem('token', data.token);
            if (data.refreshToken) {
                localStorage.setItem('refreshToken', data.refreshToken);
            }
            localStorage.setItem('userEmail', data.user.email);
            localStorage.setItem('userRole', data.user.role);
            localStorage.setItem('userId', data.user.id);

            // Redirect sang dashboard bằng replace (không lưu login page vào history)
            window.location.replace('/admin/dashboard.html');

        } else {
            errorMsg.textContent = data.message;
            errorMsg.style.display = 'block';
        }

    } catch (error) {
        errorMsg.textContent = 'Không thể kết nối tới máy chủ! Hãy kiểm tra Server đã bật chưa.';
        errorMsg.style.display = 'block';
    }
});
