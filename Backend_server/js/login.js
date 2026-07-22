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

function applyAuthTokens(data) {
    if (!data || !data.token) return;
    localStorage.setItem('token', data.token);
    if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
    }
    if (data.user) {
        if (data.user.email) localStorage.setItem('userEmail', data.user.email);
        if (data.user.role) localStorage.setItem('userRole', data.user.role);
        if (data.user.id) localStorage.setItem('userId', data.user.id);
    }
}

// Google OAuth callback (Landing WL4): /login#token=... — Admin page vẫn giữ form cũ nếu mở trực tiếp
(function consumeGoogleCallback() {
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get('google') !== '1' && params.get('google') !== '0') return;
    const token = params.get('token');
    const refreshToken = params.get('refreshToken');
    const err = params.get('error');
    const pending = params.get('pending');
    const reason = params.get('reason') || '';
    window.history.replaceState({}, '', window.location.pathname);

    function googleErrorText(raw) {
        const code = decodeURIComponent(raw || '').trim();
        const map = {
            ORG_MISSING: 'Tài khoản Google chưa gắn tổ chức. Hệ thống sẽ chuyển sang không gian cá nhân — hãy thử đăng nhập Google lại.',
            ORG_NOT_FOUND: 'Tổ chức của tài khoản không còn tồn tại. Liên hệ Super Admin.',
            ORG_INACTIVE: 'Tổ chức đã bị tạm dừng. Liên hệ Super Admin để kích hoạt lại.',
            OVER_QUOTA_USER_LOCKED: 'Tài khoản bị khóa do vượt hạn mức gói tổ chức.',
            disabled: 'Đăng nhập Google chưa được cấu hình.',
            missing_code: 'Google không trả về mã xác thực. Thử lại.',
            oauth_failed: 'Đăng nhập Google thất bại. Thử lại.'
        };
        if (map[code]) return map[code];
        if (/^ORG_|^OVER_|^disabled|^missing_|^oauth_/i.test(code)) return 'Google: ' + code;
        return code ? ('Google: ' + code) : 'Đăng nhập Google thất bại.';
    }

    if (err || params.get('google') === '0') {
        const errorMsg = document.getElementById('errorMessage');
        if (errorMsg) {
            errorMsg.textContent = err ? googleErrorText(err) : 'Đăng nhập Google thất bại.';
            errorMsg.style.display = 'block';
        }
        return;
    }
    if (pending === '1' && !token) {
        const errorMsg = document.getElementById('errorMessage');
        if (errorMsg) {
            errorMsg.textContent = (reason === 'account_inactive')
                ? 'Email Google này đã có tài khoản đang bị khóa hoặc chờ Super Admin duyệt. Liên hệ quản trị để kích hoạt, hoặc dùng email khác.'
                : 'Không thể đăng nhập bằng Google. Liên hệ Super Admin nếu tài khoản đang chờ duyệt.';
            errorMsg.style.display = 'block';
        }
        return;
    }
    if (token) {
        applyAuthTokens({
            token,
            refreshToken,
            user: {
                email: params.get('email') || '',
                role: params.get('role') || '',
                id: params.get('userId') || ''
            }
        });
        window.location.replace('/admin/dashboard.html');
    }
})();

// Hiện nút Google nếu backend bật OAuth
(async function showGoogleButtonIfEnabled() {
    const wrap = document.getElementById('googleLoginWrap');
    if (!wrap) return;
    try {
        const res = await fetch(API_URL + '/auth/google/status');
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.enabled) {
            wrap.style.display = 'block';
        }
    } catch (_) { /* ẩn nút */ }
})();

// ============================================
// KIỂM TRA SESSION HIỆN TẠI KHI MỞ LOGIN PAGE
// ============================================
// Nếu user đã login và token còn hợp lệ → tự redirect sang dashboard.
// Nếu token hết hạn/lỗi → xóa token, ở lại login.
(async function checkExistingSessionOnLoad() {
    if ((window.location.hash || '').indexOf('google=') >= 0) return;

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
            applyAuthTokens(data);
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
