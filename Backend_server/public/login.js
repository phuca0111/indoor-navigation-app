// login.js (Landing) — POST /api/auth/login → Admin hoặc My Maps (/app)
(function () {
    var API_URL = '/api';

    function appHomeForRole(role) {
        if (role === 'REGISTERED_USER') return '/app';
        return '/admin/dashboard.html';
    }

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

    function showError(text) {
        var el = document.getElementById('errorMessage');
        if (!el) return;
        el.textContent = text || 'Đăng nhập thất bại.';
        el.style.display = 'block';
    }

    (function consumeGoogleCallback() {
        var hash = (window.location.hash || '').replace(/^#/, '');
        if (!hash) return;
        var params = new URLSearchParams(hash);
        if (params.get('google') !== '1' && params.get('google') !== '0') return;
        var token = params.get('token');
        var refreshToken = params.get('refreshToken');
        var err = params.get('error');
        var pending = params.get('pending');
        var reason = params.get('reason') || '';
        window.history.replaceState({}, '', window.location.pathname);

        function googleErrorText(raw) {
            var code = decodeURIComponent(raw || '').trim();
            var map = {
                ORG_MISSING: 'Tài khoản Google chưa gắn tổ chức. Hệ thống sẽ chuyển sang không gian cá nhân — hãy thử đăng nhập Google lại.',
                ORG_NOT_FOUND: 'Tổ chức của tài khoản không còn tồn tại. Liên hệ Super Admin.',
                ORG_INACTIVE: 'Tổ chức đã bị tạm dừng. Liên hệ Super Admin để kích hoạt lại.',
                OVER_QUOTA_USER_LOCKED: 'Tài khoản bị khóa do vượt hạn mức gói tổ chức.',
                disabled: 'Đăng nhập Google chưa được cấu hình.',
                missing_code: 'Google không trả về mã xác thực. Thử lại.',
                oauth_failed: 'Đăng nhập Google thất bại. Thử lại.'
            };
            if (map[code]) return map[code];
            return code ? ('Google: ' + code) : 'Đăng nhập Google thất bại.';
        }

        if (err || params.get('google') === '0') {
            showError(err ? googleErrorText(err) : 'Đăng nhập Google thất bại.');
            return;
        }
        if (pending === '1' && !token) {
            showError(reason === 'account_inactive'
                ? 'Email Google này đã có tài khoản đang bị khóa hoặc chờ Super Admin duyệt. Liên hệ quản trị để kích hoạt, hoặc dùng email khác.'
                : 'Không thể đăng nhập bằng Google. Liên hệ Super Admin nếu tài khoản đang chờ duyệt.');
            return;
        }
        if (token) {
            var role = params.get('role') || '';
            applyAuthTokens({
                token: token,
                refreshToken: refreshToken,
                user: {
                    email: params.get('email') || '',
                    role: role,
                    id: params.get('userId') || ''
                }
            });
            window.location.replace(appHomeForRole(role));
        }
    })();

    (async function showGoogleButtonIfEnabled() {
        var wrap = document.getElementById('googleLoginWrap');
        if (!wrap) return;
        try {
            var res = await fetch(API_URL + '/auth/google/status');
            var data = await res.json().catch(function () { return {}; });
            if (res.ok && data.enabled) {
                wrap.style.display = 'block';
            }
        } catch (_) { /* ẩn */ }
    })();

    (async function checkExistingSessionOnLoad() {
        if ((window.location.hash || '').indexOf('google=') >= 0) return;
        var token = localStorage.getItem('token');
        if (!token) return;
        try {
            var res = await fetch(API_URL + '/users/me', {
                method: 'GET',
                headers: { Authorization: 'Bearer ' + token }
            });
            if (res.ok) {
                var data = await res.json().catch(function () { return {}; });
                var role = data.role || (data.user && data.user.role) || localStorage.getItem('userRole') || '';
                window.location.replace(appHomeForRole(role));
            } else {
                clearAuthStorage();
            }
        } catch (_) {
            clearAuthStorage();
        }
    })();

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('loginForm');
        if (!form) return;

        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            var email = (document.getElementById('email') || {}).value || '';
            var password = (document.getElementById('password') || {}).value || '';
            var errEl = document.getElementById('errorMessage');
            if (errEl) errEl.style.display = 'none';

            email = String(email).trim();
            if (!email || !password) {
                showError('Vui lòng nhập email và mật khẩu.');
                return;
            }

            var btn = form.querySelector('button[type="submit"]');
            if (btn) btn.disabled = true;

            try {
                var response = await fetch(API_URL + '/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, password: password })
                });
                var data = await response.json().catch(function () { return {}; });

                if (response.ok && data.token) {
                    applyAuthTokens(data);
                    var role = (data.user && data.user.role) || '';
                    window.location.replace(appHomeForRole(role));
                    return;
                }
                showError(data.message || ('Đăng nhập thất bại (HTTP ' + response.status + ').'));
            } catch (_) {
                showError('Không thể kết nối tới máy chủ. Hãy kiểm tra Server đã bật chưa.');
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    });
})();
