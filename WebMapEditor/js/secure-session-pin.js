// ============================================================
// SECURE SESSION PIN — Bắt buộc tạo mã tạm trước khi khóa Editor
// ============================================================
(function () {
    'use strict';

    var MAX_FAILED_ATTEMPTS = 10;
    var STORAGE_KEY = 'wme_editor_secure_lock_v1';
    var MIN_PIN_LEN = 4;
    var MAX_PIN_LEN = 12;

    var overlay = document.getElementById('secureLockOverlay');
    var titleEl = document.getElementById('secureLockTitle');
    var subtitle = document.getElementById('secureLockSubtitle');
    var hintEl = document.getElementById('secureLockHint');
    var setFields = document.getElementById('secureLockSetFields');
    var unlockFields = document.getElementById('secureLockUnlockFields');
    var pinInput = document.getElementById('lockPinInput');
    var pinConfirmInput = document.getElementById('lockPinConfirmInput');
    var unlockInput = document.getElementById('unlockPinInput');
    var confirmBtn = document.getElementById('btnConfirmSecureLock');
    var cancelBtn = document.getElementById('btnCancelSetPin');
    var logoutBtn = document.getElementById('btnForceLogout');
    var unlockError = document.getElementById('unlockError');

    function currentUserId() {
        try { return localStorage.getItem('userId') || ''; } catch (_) { return ''; }
    }
    function currentUserEmail() {
        try { return String(localStorage.getItem('userEmail') || '').toLowerCase(); } catch (_) { return ''; }
    }

    function randomSalt() {
        try {
            var bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            return Array.from(bytes).map(function (b) {
                return b.toString(16).padStart(2, '0');
            }).join('');
        } catch (_) {
            return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
        }
    }

    function hashPin(pin, salt) {
        var payload = String(salt || '') + ':' + String(pin || '');
        if (window.crypto && crypto.subtle && crypto.subtle.digest) {
            return crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)).then(function (buf) {
                return Array.from(new Uint8Array(buf)).map(function (b) {
                    return b.toString(16).padStart(2, '0');
                }).join('');
            });
        }
        var h = 2166136261;
        for (var i = 0; i < payload.length; i++) {
            h ^= payload.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return Promise.resolve(('00000000' + (h >>> 0).toString(16)).slice(-8));
    }

    function validatePin(pin) {
        var value = String(pin || '');
        if (value.length < MIN_PIN_LEN || value.length > MAX_PIN_LEN) {
            return 'Mã khóa phải từ ' + MIN_PIN_LEN + ' đến ' + MAX_PIN_LEN + ' ký tự.';
        }
        if (/\s/.test(value)) return 'Mã khóa không được chứa khoảng trắng.';
        return '';
    }

    function clearPersistedLock() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
    }

    function persistLockState() {
        try {
            if (!window.secureLockStore.isLocked || !window.secureLockStore.pinHash) {
                clearPersistedLock();
                return;
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: 4,
                userId: currentUserId(),
                userEmail: currentUserEmail(),
                userKey: currentUserId() || currentUserEmail(),
                locked: true,
                lockTimestamp: window.secureLockStore.lockTimestamp || Date.now(),
                failedAttempts: window.secureLockStore.failedAttempts || 0,
                pinHash: window.secureLockStore.pinHash,
                pinSalt: window.secureLockStore.pinSalt
            }));
        } catch (_) { /* ignore */ }
    }

    function isSameLockOwner(data) {
        if (!data) return false;
        var id = currentUserId();
        var email = currentUserEmail();
        var storedId = String(data.userId || '');
        var storedEmail = String(data.userEmail || '').toLowerCase();
        var legacy = String(data.userKey || '');
        var legacyLower = legacy.toLowerCase();
        if (!id && !email) return true;
        if (storedId && id && storedId === id) return true;
        if (storedEmail && email && storedEmail === email) return true;
        if (legacy && ((id && legacy === id) || (email && legacyLower === email))) return true;
        if ((storedId || storedEmail || legacy) && (id || email)) return false;
        return true;
    }

    function readPersistedLock() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (!data || !data.locked || !data.pinHash || !data.pinSalt) {
                clearPersistedLock();
                return null;
            }
            if (!isSameLockOwner(data)) {
                clearPersistedLock();
                return null;
            }
            return data;
        } catch (_) {
            return null;
        }
    }

    function setError(msg) {
        if (unlockError) unlockError.textContent = msg || '';
    }

    function setBusy(loading) {
        window.secureLockStore.unlockLoading = !!loading;
        if (confirmBtn) confirmBtn.disabled = !!loading;
        if (pinInput) pinInput.disabled = !!loading;
        if (pinConfirmInput) pinConfirmInput.disabled = !!loading;
        if (unlockInput) unlockInput.disabled = !!loading;
    }

    function focusActiveInput() {
        setTimeout(function () {
            try {
                if (window.secureLockStore.mode === 'set' && pinInput) pinInput.focus();
                else if (unlockInput) unlockInput.focus();
            } catch (_) { /* ignore */ }
        }, 30);
    }

    function applyModeUi() {
        if (!overlay) return;
        var mode = window.secureLockStore.mode || 'idle';
        var locked = !!(window.secureLockStore.isLocked && window.secureLockStore.pinHash);
        if (window.secureLockStore.isLocked && !window.secureLockStore.pinHash) {
            window.secureLockStore.isLocked = false;
            locked = false;
        }

        var show = mode === 'set' || locked;
        overlay.classList.toggle('active', show);
        overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
        document.body.classList.toggle('editor-locked', locked);
        document.body.classList.toggle('editor-setting-lock', mode === 'set' && !locked);

        if (setFields) setFields.style.display = mode === 'set' ? 'block' : 'none';
        if (unlockFields) unlockFields.style.display = locked ? 'block' : 'none';
        if (cancelBtn) cancelBtn.style.display = mode === 'set' && !locked ? 'inline-flex' : 'none';
        if (logoutBtn) logoutBtn.style.display = locked ? 'inline-flex' : 'none';
        if (hintEl) {
            hintEl.style.display = (mode === 'set' || locked) ? 'block' : 'none';
            hintEl.textContent = locked
                ? 'Quên mã? Đăng xuất rồi đăng nhập lại để bỏ khóa.'
                : 'Bạn phải tạo mã khóa tạm thời trước khi khóa giao diện.';
        }

        if (mode === 'set' && !locked) {
            if (titleEl) titleEl.textContent = 'Tạo mã khóa tạm thời';
            if (subtitle) {
                subtitle.textContent = 'Nhập mã 4–12 ký tự. Đây là bước bắt buộc trước khi khóa. Áp dụng cả tài khoản Google.';
            }
            if (confirmBtn) confirmBtn.textContent = 'Xác nhận và khóa';
        } else if (locked) {
            var lockTime = window.secureLockStore.lockTimestamp;
            var timeText = lockTime
                ? ('Đã khóa lúc ' + new Date(lockTime).toLocaleTimeString('vi-VN') + '. ')
                : '';
            if (titleEl) titleEl.textContent = 'Phiên đã khóa';
            if (subtitle) subtitle.textContent = timeText + 'Nhập mã khóa tạm thời để tiếp tục.';
            if (confirmBtn) confirmBtn.textContent = 'Mở khóa';
        }

        if (!show) setError('');
    }

    async function forceLogout() {
        var refreshToken = null;
        try { refreshToken = localStorage.getItem('refreshToken'); } catch (_) { /* ignore */ }
        try {
            await fetch(BASE_API_URL + '/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: refreshToken })
            });
        } catch (_) { /* ignore */ }
        clearPersistedLock();
        try {
            if (typeof clearEditorAuthStorage === 'function') clearEditorAuthStorage();
            else localStorage.clear();
        } catch (_) {
            try { localStorage.clear(); } catch (e2) { /* ignore */ }
        }
        window.location.href = '/admin/index.html';
    }

    function cancelSetPin() {
        if (window.secureLockStore.isLocked && window.secureLockStore.pinHash) return;
        window.secureLockStore.mode = 'idle';
        window.secureLockStore.isLocked = false;
        if (pinInput) pinInput.value = '';
        if (pinConfirmInput) pinConfirmInput.value = '';
        setError('');
        applyModeUi();
    }

    async function confirmSetPin() {
        if (window.secureLockStore.mode !== 'set') return;
        if (window.secureLockStore.isLocked && window.secureLockStore.pinHash) return;

        var pin = pinInput ? pinInput.value : '';
        var confirmPin = pinConfirmInput ? pinConfirmInput.value : '';
        var err = validatePin(pin);
        if (err) {
            setError(err);
            focusActiveInput();
            return;
        }
        if (pin !== confirmPin) {
            setError('Hai lần nhập mã khóa chưa khớp.');
            if (pinConfirmInput) pinConfirmInput.focus();
            return;
        }

        setBusy(true);
        setError('');
        try {
            var salt = randomSalt();
            var hash = await hashPin(pin, salt);
            if (!hash) throw new Error('hash_failed');

            window.secureLockStore.isLocked = true;
            window.secureLockStore.mode = 'locked';
            window.secureLockStore.lockTimestamp = Date.now();
            window.secureLockStore.failedAttempts = 0;
            window.secureLockStore.pinSalt = salt;
            window.secureLockStore.pinHash = hash;
            persistLockState();

            if (pinInput) pinInput.value = '';
            if (pinConfirmInput) pinConfirmInput.value = '';
            if (unlockInput) unlockInput.value = '';
            applyModeUi();
            if (typeof showToast === 'function') {
                showToast('Đã khóa. Cần mã vừa tạo để mở lại.', 'success');
            }
        } catch (_) {
            window.secureLockStore.isLocked = false;
            window.secureLockStore.pinHash = '';
            window.secureLockStore.pinSalt = '';
            setError('Không thể tạo mã khóa. Vui lòng thử lại.');
        } finally {
            setBusy(false);
            focusActiveInput();
        }
    }

    async function unlockWithPin() {
        if (!(window.secureLockStore.isLocked && window.secureLockStore.pinHash)) return;
        var pin = unlockInput ? unlockInput.value : '';
        var err = validatePin(pin);
        if (err) { setError(err); return; }

        setBusy(true);
        setError('');
        try {
            var hash = await hashPin(pin, window.secureLockStore.pinSalt);
            if (hash === window.secureLockStore.pinHash) {
                window.secureLockStore.isLocked = false;
                window.secureLockStore.mode = 'idle';
                window.secureLockStore.failedAttempts = 0;
                window.secureLockStore.lockTimestamp = null;
                window.secureLockStore.pinHash = '';
                window.secureLockStore.pinSalt = '';
                clearPersistedLock();
                if (unlockInput) unlockInput.value = '';
                applyModeUi();
                if (typeof showToast === 'function') showToast('Đã mở khóa trình soạn.', 'success');
                return;
            }

            window.secureLockStore.failedAttempts += 1;
            persistLockState();
            var attempts = window.secureLockStore.failedAttempts;
            setError('Mã khóa không đúng. (Sai ' + attempts + '/' + MAX_FAILED_ATTEMPTS + ')');
            if (attempts >= MAX_FAILED_ATTEMPTS) {
                if (typeof showToast === 'function') {
                    showToast('Sai quá nhiều lần, sẽ đăng xuất.', 'error');
                }
                await forceLogout();
            }
        } catch (_) {
            setError('Không thể xác thực mã khóa.');
        } finally {
            setBusy(false);
            focusActiveInput();
        }
    }

    function onPrimaryAction() {
        if (window.secureLockStore.isLocked && window.secureLockStore.pinHash) {
            unlockWithPin();
            return;
        }
        if (window.secureLockStore.mode === 'set') {
            confirmSetPin();
        }
    }

    /** Bấm icon khóa: CHỈ mở form tạo mã, KHÔNG khóa ngay. */
    function beginLockFlow() {
        if (window.secureLockStore.isLocked && window.secureLockStore.pinHash) {
            applyModeUi();
            focusActiveInput();
            return;
        }
        window.secureLockStore.isLocked = false;
        window.secureLockStore.mode = 'set';
        window.secureLockStore.pinHash = '';
        window.secureLockStore.pinSalt = '';
        if (pinInput) pinInput.value = '';
        if (pinConfirmInput) pinConfirmInput.value = '';
        setError('');
        applyModeUi();
        focusActiveInput();
        if (typeof showToast === 'function') {
            showToast('Hãy tạo mã khóa tạm thời, rồi bấm Xác nhận và khóa.', 'info');
        }
    }

    function restoreLockFromStorage() {
        var data = readPersistedLock();
        if (!data) {
            if (window.secureLockStore.isLocked && !window.secureLockStore.pinHash) {
                window.secureLockStore.isLocked = false;
                window.secureLockStore.mode = 'idle';
                applyModeUi();
            }
            return false;
        }
        window.secureLockStore.isLocked = true;
        window.secureLockStore.mode = 'locked';
        window.secureLockStore.lockTimestamp = data.lockTimestamp || Date.now();
        window.secureLockStore.failedAttempts = Number(data.failedAttempts) || 0;
        window.secureLockStore.pinHash = data.pinHash;
        window.secureLockStore.pinSalt = data.pinSalt;
        persistLockState();
        applyModeUi();
        return true;
    }

    window.secureLockStore = {
        isLocked: false,
        mode: 'idle',
        lockTimestamp: null,
        failedAttempts: 0,
        unlockLoading: false,
        pinHash: '',
        pinSalt: '',
        lockEditor: beginLockFlow,
        unlockEditor: unlockWithPin,
        forceLogout: forceLogout,
        restoreFromStorage: restoreLockFromStorage
    };

    window.isEditorLocked = function () {
        return !!(window.secureLockStore && window.secureLockStore.isLocked && window.secureLockStore.pinHash);
    };
    window.ensureEditorSecureLockRestored = restoreLockFromStorage;
    window.beginEditorSecureLock = beginLockFlow;

    function bindLockButton() {
        var btn = document.getElementById('btnLockEditor');
        if (!btn || btn.getAttribute('data-secure-pin-bound') === '1') return;
        btn.setAttribute('data-secure-pin-bound', '1');
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            beginLockFlow();
        });
    }
    bindLockButton();

    if (confirmBtn) {
        confirmBtn.addEventListener('click', function (e) {
            e.preventDefault();
            onPrimaryAction();
        });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function (e) {
            e.preventDefault();
            cancelSetPin();
        });
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function (e) {
            e.preventDefault();
            forceLogout();
        });
    }

    function bindEnter(el) {
        if (!el) return;
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                onPrimaryAction();
            }
        });
    }
    bindEnter(pinInput);
    bindEnter(pinConfirmInput);
    bindEnter(unlockInput);

    document.addEventListener('keydown', function (e) {
        if (window.secureLockStore.mode === 'set' || window.isEditorLocked()) {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (window.secureLockStore.mode === 'set' && !window.isEditorLocked()) {
                    cancelSetPin();
                }
                return;
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            beginLockFlow();
        }
    });

    if (overlay) {
        overlay.addEventListener('mousedown', function (e) {
            if (e.target === overlay) e.preventDefault();
        });
    }

    window.addEventListener('storage', function (e) {
        if (e.key !== STORAGE_KEY) return;
        if (!e.newValue) {
            window.secureLockStore.isLocked = false;
            window.secureLockStore.mode = 'idle';
            window.secureLockStore.pinHash = '';
            window.secureLockStore.pinSalt = '';
            applyModeUi();
            return;
        }
        restoreLockFromStorage();
    });

    window.addEventListener('pageshow', function () {
        restoreLockFromStorage();
    });

    setTimeout(bindLockButton, 500);
    setTimeout(bindLockButton, 1500);

    restoreLockFromStorage();
})();
