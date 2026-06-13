// ============================================================
// SECURE-LOCK.JS - Khóa phiên chỉnh sửa map tạm thời
// ============================================================
(function () {
    var MAX_FAILED_ATTEMPTS = 10;

    var overlay = document.getElementById('secureLockOverlay');
    var unlockInput = document.getElementById('unlockPassword');
    var unlockBtn = document.getElementById('btnUnlockEditor');
    var lockBtn = document.getElementById('btnLockEditor');
    var logoutBtn = document.getElementById('btnForceLogout');
    var unlockError = document.getElementById('unlockError');
    var subtitle = document.getElementById('secureLockSubtitle');

    function lockSnapshotText() {
        var lockTime = window.secureLockStore.lockTimestamp;
        if (!lockTime) return 'Nhập mật khẩu để tiếp tục chỉnh sửa bản đồ.';
        var d = new Date(lockTime);
        return 'Phiên đã khóa lúc ' + d.toLocaleTimeString('vi-VN') + '.';
    }

    function applyLockUi() {
        if (!overlay) return;
        var locked = !!window.secureLockStore.isLocked;
        overlay.classList.toggle('active', locked);
        overlay.setAttribute('aria-hidden', locked ? 'false' : 'true');
        document.body.classList.toggle('editor-locked', locked);
        if (locked) {
            if (subtitle) subtitle.textContent = lockSnapshotText();
            if (unlockInput) {
                unlockInput.value = '';
                unlockInput.focus();
            }
            if (unlockError) unlockError.textContent = '';
        }
    }

    function setUnlockLoading(loading) {
        window.secureLockStore.unlockLoading = !!loading;
        if (unlockBtn) unlockBtn.disabled = loading;
        if (unlockInput) unlockInput.disabled = loading;
        if (unlockBtn) unlockBtn.textContent = loading ? 'Đang xác thực...' : 'Mở khóa';
    }

    async function forceLogout() {
        var refreshToken = localStorage.getItem('refreshToken');
        try {
            await fetch(BASE_API_URL + '/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: refreshToken })
            });
        } catch (_) { }
        localStorage.clear();
        window.location.href = '/admin/index.html';
    }

    async function unlockEditor() {
        if (!window.secureLockStore.isLocked) return;
        var password = unlockInput ? unlockInput.value : '';
        if (!password) {
            if (unlockError) unlockError.textContent = 'Vui lòng nhập mật khẩu.';
            return;
        }
        setUnlockLoading(true);
        if (unlockError) unlockError.textContent = '';
        try {
            var response = await apiFetch(BASE_API_URL + '/auth/unlock-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: password })
            });
            var payload = await response.json().catch(function () { return {}; });
            if (response.ok && payload.success) {
                window.secureLockStore.isLocked = false;
                window.secureLockStore.failedAttempts = 0;
                applyLockUi();
                if (payload && payload.unlockUser && subtitle) {
                    subtitle.textContent = 'Đã mở khóa cho: ' + payload.unlockUser.email;
                }
                if (typeof showToast === 'function') showToast('Đã mở khóa editor.', 'success');
                return;
            }

            // Token/phiên không hợp lệ thì không tính là "sai mật khẩu".
            var message = (payload && payload.message) ? payload.message : '';
            if (response.status === 401 && (
                message.indexOf('Thẻ không hợp lệ') >= 0 ||
                message.indexOf('Phiên đăng nhập không hợp lệ') >= 0 ||
                message.indexOf('Truy cập bị từ chối') >= 0
            )) {
                if (unlockError) unlockError.textContent = 'Phiên đăng nhập hiện tại không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.';
                return;
            }

            window.secureLockStore.failedAttempts += 1;
            var attempts = window.secureLockStore.failedAttempts;
            if (unlockError) {
                var wrongMsg = (payload && payload.message ? payload.message : 'Mật khẩu không đúng.');
                if (payload && payload.unlockUser && payload.unlockUser.email) {
                    wrongMsg += ' (đang xác thực user: ' + payload.unlockUser.email + ')';
                }
                unlockError.textContent = wrongMsg +
                    ' (Sai ' + attempts + '/' + MAX_FAILED_ATTEMPTS + ')';
            }
            if (attempts >= MAX_FAILED_ATTEMPTS) {
                if (typeof showToast === 'function') showToast('Sai quá nhiều lần, phiên sẽ đăng xuất.', 'error');
                await forceLogout();
            }
        } catch (error) {
            if (unlockError) unlockError.textContent = 'Không thể xác thực. Vui lòng thử lại.';
        } finally {
            setUnlockLoading(false);
            if (unlockInput) unlockInput.focus();
        }
    }

    function lockEditor() {
        if (window.secureLockStore.isLocked) return;
        window.secureLockStore.isLocked = true;
        window.secureLockStore.lockTimestamp = Date.now();
        window.secureLockStore.failedAttempts = 0;
        applyLockUi();
        if (typeof showToast === 'function') showToast('Editor đã được khóa.', 'success');
    }

    window.secureLockStore = window.secureLockStore || {
        isLocked: false,
        lockTimestamp: null,
        failedAttempts: 0,
        unlockLoading: false,
        lockEditor: lockEditor,
        unlockEditor: unlockEditor,
        forceLogout: forceLogout
    };

    window.isEditorLocked = function () {
        return !!(window.secureLockStore && window.secureLockStore.isLocked);
    };

    if (lockBtn) {
        lockBtn.addEventListener('click', function () {
            window.secureLockStore.lockEditor();
        });
    }
    if (unlockBtn) {
        unlockBtn.addEventListener('click', function () {
            window.secureLockStore.unlockEditor();
        });
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
            window.secureLockStore.forceLogout();
        });
    }
    if (unlockInput) {
        unlockInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.secureLockStore.unlockEditor();
            }
        });
    }

    document.addEventListener('keydown', function (e) {
        if (window.isEditorLocked()) {
            if (e.key === 'Escape') {
                e.preventDefault();
                return;
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            window.secureLockStore.lockEditor();
        }
    });

    if (overlay) {
        overlay.addEventListener('mousedown', function (e) {
            if (e.target === overlay) e.preventDefault();
        });
    }
})();
