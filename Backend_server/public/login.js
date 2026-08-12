// login.js (Landing) — portal theo role
(function () {
    var API_URL = '/api';

    /** Personal Workspace (REGISTERED_USER) → Admin dashboard; Org → /org; hệ thống → Admin */
    function portalHomeForRole(role) {
        var r = String(role || '').toUpperCase();
        if (r === 'REGISTERED_USER') return '/admin/dashboard.html';
        if (r === 'ORG_ADMIN' || r === 'BUILDING_ADMIN') return '/org';
        if (r === 'SUPER_ADMIN' || r === 'FINANCE_ADMIN' || r === 'MARKETING_MANAGER') {
            return '/admin/dashboard.html';
        }
        return '/login';
    }

    function roleAllowedForPath(role, path) {
        var r = String(role || '').toUpperCase();
        var p = String(path || '');
        // /get-app = trang hướng dẫn Android (mọi role đã login đều xem được)
        if (p.indexOf('/get-app') === 0) return true;
        if (p.indexOf('/app') === 0) return false; // STOPPED
        if (p.indexOf('/org') === 0) return r === 'ORG_ADMIN' || r === 'BUILDING_ADMIN' || r === 'SUPER_ADMIN';
        if (p.indexOf('/admin') === 0) {
            return r === 'SUPER_ADMIN' || r === 'FINANCE_ADMIN' || r === 'MARKETING_MANAGER'
                || r === 'ORG_ADMIN' || r === 'BUILDING_ADMIN' || r === 'REGISTERED_USER';
        }
        return p.charAt(0) === '/';
    }

    /** ?next= chỉ khi role được phép; /app luôn bỏ qua → home theo role */
    function resolvePostLoginUrl(role) {
        try {
            var params = new URLSearchParams(window.location.search || '');
            var next = params.get('next');
            if (next && next.indexOf('/app') === 0) {
                return portalHomeForRole(role);
            }
            if (next && next.charAt(0) === '/' && next.indexOf('//') !== 0 && next.indexOf('/login') !== 0) {
                if (roleAllowedForPath(role, next)) return next;
            }
        } catch (_) { /* ignore */ }
        return portalHomeForRole(role);
    }

    /** fresh=1: xóa session cũ */
    (function clearStaleIfFresh() {
        try {
            var params = new URLSearchParams(window.location.search || '');
            if (params.get('fresh') === '1') {
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('userRole');
                localStorage.removeItem('userId');
            }
        } catch (_) { /* ignore */ }
    })();

    function clearAuthStorage() {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userId');
        localStorage.removeItem('wme_editor_secure_lock_v1');
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
        localStorage.removeItem('wme_editor_secure_lock_v1');
    }

    function showError(text) {
        var el = document.getElementById('errorMessage');
        if (!el) return;
        el.textContent = text || 'Đăng nhập thất bại.';
        el.style.display = 'block';
    }

    var googleCallbackActive = false;

    (function consumeGoogleCallback() {
        var hash = (window.location.hash || '').replace(/^#/, '');
        if (!hash) return;
        var params = new URLSearchParams(hash);
        if (params.get('google') !== '1' && params.get('google') !== '0') return;
        googleCallbackActive = true;
        var token = params.get('token');
        var refreshToken = params.get('refreshToken');
        var err = params.get('error');
        var pending = params.get('pending');
        var reason = params.get('reason') || '';
        window.history.replaceState({}, '', window.location.pathname + window.location.search);

        function googleErrorText(raw) {
            var code = decodeURIComponent(raw || '').trim();
            var map = {
                ORG_MISSING: 'Email Google này đã gắn tài khoản tổ chức nhưng thiếu organization. Liên hệ Super Admin.',
                ORG_NOT_FOUND: 'Tổ chức của tài khoản không còn tồn tại. Liên hệ Super Admin.',
                ORG_INACTIVE: 'Tổ chức đã bị tạm dừng. Liên hệ Super Admin để kích hoạt lại.',
                OVER_QUOTA_USER_LOCKED: 'Tài khoản bị khóa do vượt hạn mức gói tổ chức.',
                USER_INACTIVE: 'Tài khoản Google này đã tồn tại nhưng đang bị khóa (is_active = false). Vào Admin → Tài khoản để mở khóa, hoặc liên hệ Super Admin.',
                MEMBER_INACTIVE: 'Tư cách thành viên tổ chức không hoạt động.',
                disabled: 'Đăng nhập Google chưa được cấu hình.',
                missing_code: 'Google không trả về mã xác thực. Thử lại.',
                oauth_failed: 'Đăng nhập Google thất bại. Thử lại.',
                INVALID_STATE: 'Phiên Google hết hạn (state). Thử đăng nhập lại.',
                STATE_EXPIRED: 'Phiên Google hết hạn. Thử đăng nhập lại.'
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
                ? 'Email Google này đã có tài khoản đang bị khóa. Vào Admin → Tài khoản để mở khóa.'
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
            if (!role) {
                fetch(API_URL + '/users/me', {
                    headers: { Authorization: 'Bearer ' + token }
                })
                    .then(function (r) { return r.json().catch(function () { return {}; }); })
                    .then(function (data) {
                        var u = data.user || data || {};
                        role = u.role || '';
                        if (role) localStorage.setItem('userRole', role);
                        if (u.email) localStorage.setItem('userEmail', u.email);
                        if (u.id || u._id) localStorage.setItem('userId', String(u.id || u._id));
                        window.location.replace(resolvePostLoginUrl(role));
                    })
                    .catch(function () {
                        window.location.replace('/admin/dashboard.html');
                    });
                return;
            }
            window.location.replace(resolvePostLoginUrl(role));
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
        if (googleCallbackActive) return;
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
                window.location.replace(resolvePostLoginUrl(role));
            } else if (res.status === 401 || res.status === 403) {
                clearAuthStorage();
            }
        } catch (_) {
            // Lỗi mạng / abort khi đang chuyển trang — không xóa session.
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
                    window.location.replace(resolvePostLoginUrl(role));
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
