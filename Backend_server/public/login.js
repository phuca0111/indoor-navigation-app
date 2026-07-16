// login.js (Landing WL4) — POST /api/auth/login → lưu token → /admin/dashboard.html
(function () {
    var API_URL = '/api';
    var APP_HOME = '/admin/dashboard.html';

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

    // Google OAuth callback: /login#token=...&refreshToken=...&google=1
    (function consumeGoogleCallback() {
        var hash = (window.location.hash || '').replace(/^#/, '');
        if (!hash) return;
        var params = new URLSearchParams(hash);
        if (params.get('google') !== '1' && params.get('google') !== '0') return;
        var token = params.get('token');
        var refreshToken = params.get('refreshToken');
        var err = params.get('error');
        var pending = params.get('pending');
        window.history.replaceState({}, '', window.location.pathname);

        if (err || params.get('google') === '0') {
            showError(err
                ? ('Google: ' + decodeURIComponent(err))
                : (pending === '1'
                    ? 'Tài khoản Google đã tạo — chờ Super Admin duyệt trước khi đăng nhập.'
                    : 'Đăng nhập Google thất bại.'));
            return;
        }
        if (pending === '1' && !token) {
            showError('Tài khoản Google đã tạo — chờ Super Admin duyệt.');
            return;
        }
        if (token) {
            applyAuthTokens({
                token: token,
                refreshToken: refreshToken,
                user: {
                    email: params.get('email') || '',
                    role: params.get('role') || '',
                    id: params.get('userId') || ''
                }
            });
            window.location.replace(APP_HOME);
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
                window.location.replace(APP_HOME);
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
                    window.location.replace(APP_HOME);
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
