// ============================================================
// API.JS - Kết nối Web Map Editor với Backend Server
// ============================================================

// Dùng relative URL để editor chạy được cả local và Render cùng domain.
const BASE_API_URL = '/api';

/** Khôi phục token từ dashboard (sessionStorage) khi localStorage trống — tránh logout giả khi đổi trang. */
(function restoreAuthHandoffFromDashboard() {
    try {
        var raw = sessionStorage.getItem('editorAuthHandoff');
        if (!raw) return;
        sessionStorage.removeItem('editorAuthHandoff');
        var handoff = JSON.parse(raw);
        if (!handoff || !handoff.token) return;
        if (handoff.ts && Date.now() - handoff.ts > 60000) return;
        if (!localStorage.getItem('token')) {
            localStorage.setItem('token', handoff.token);
            if (handoff.refreshToken) localStorage.setItem('refreshToken', handoff.refreshToken);
            if (handoff.userEmail) localStorage.setItem('userEmail', handoff.userEmail);
            if (handoff.userRole) localStorage.setItem('userRole', handoff.userRole);
            if (handoff.userId) localStorage.setItem('userId', handoff.userId);
        }
    } catch (_) { /* ignore */ }
})();

// 1. Lấy thông tin từ URL và LocalStorage
const urlParams = new URLSearchParams(window.location.search);
const buildingId = urlParams.get('buildingId') || urlParams.get('building'); // Chấp nhận cả 2 cách gọi cho chắc chắn
let token = localStorage.getItem('token');   // WHY: dùng let để có thể cập nhật khi refresh
window.buildingId = buildingId;
window.editorBuildingMeta = null;
window.editorAccessBlocked = false;

function getCurrentAccessToken() {
    try {
        const latest = localStorage.getItem('token');
        token = latest || '';
        return token;
    } catch (_) {
        return token || '';
    }
}

// Đồng bộ tầng từ URL (?floor=0) — chạy sớm; rebuildFloorSelect sẽ ưu tiên lại sau khi có đủ option
(function syncFloorFromUrl() {
    var floorParam = urlParams.get('floor');
    if (floorParam == null || floorParam === '') return;
    var sel = document.getElementById('floorSelect');
    if (!sel) return;
    var exists = Array.prototype.some.call(sel.options, function (o) {
        return String(o.value) === String(floorParam);
    });
    if (exists) sel.value = String(floorParam);
})();

/** Đọc tầng ưu tiên: URL ?floor= → sessionStorage → null */
function resolvePreferredEditorFloor(totalFloors) {
    var n = Math.max(1, parseInt(totalFloors, 10) || 1);
    var fromUrl = null;
    try {
        fromUrl = new URLSearchParams(window.location.search).get('floor');
    } catch (e) { /* ignore */ }
    var fromSession = null;
    try {
        if (buildingId) fromSession = sessionStorage.getItem('editorFloor_' + buildingId);
    } catch (e2) { /* ignore */ }
    var candidate = (fromUrl != null && fromUrl !== '') ? fromUrl : fromSession;
    if (candidate != null && candidate !== '' && Number(candidate) >= 0 && Number(candidate) < n) {
        return String(candidate);
    }
    return null;
}

/** Ghi tầng đang chọn vào URL + session — F5 giữ đúng tầng */
function persistEditorFloor(floor) {
    var f = String(floor);
    try {
        if (buildingId) sessionStorage.setItem('editorFloor_' + buildingId, f);
    } catch (e) { /* ignore */ }
    try {
        var url = new URL(window.location.href);
        url.searchParams.set('floor', f);
        history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e2) { /* ignore */ }
}
window.persistEditorFloor = persistEditorFloor;
window.resolvePreferredEditorFloor = resolvePreferredEditorFloor;

// 2. Kiểm tra quyền truy cập (chỉ warning, không chặn)
if (!token && buildingId) {
    // alert('Vui lòng đăng nhập để sử dụng tính năng lưu trữ đám mây!');
}

// ==========================================
// AUTH GUARD - Web Map Editor
// ==========================================
function clearEditorAuthStorage() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    localStorage.removeItem('activeDashboardTab');
}

/** Chỉ logout khi token hiện tại vẫn là token đã verify — tránh tab cũ xóa session tab mới (race đa tab). */
function shouldInvalidateEditorSession(tokenAtStart) {
    return getCurrentAccessToken() === tokenAtStart;
}

function redirectEditorToLogin() {
    window.location.replace('/admin/index.html');
}

var _editorVerifyPromise = null;
var _editorInitDone = false;

function isNetworkFetchError(error) {
    if (!error) return false;
    if (error instanceof TypeError) return true;
    var msg = String(error.message || error);
    return /failed to fetch|network|connection refused|load failed/i.test(msg);
}

function getOfflineEditorUser() {
    const email = localStorage.getItem('userEmail');
    if (!email) return null;
    return {
        email: email,
        role: localStorage.getItem('userRole') || 'BUILDING_ADMIN',
        _offline: true
    };
}

async function verifyEditorSessionCore(depth) {
    depth = depth || 0;
    const tokenAtStart = getCurrentAccessToken();
    if (!tokenAtStart) {
        console.warn('🔒 Editor: Không có token - redirect đến login');
        clearEditorAuthStorage();
        redirectEditorToLogin();
        return null;
    }

    try {
        const response = await apiFetch(BASE_API_URL + '/users/me', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                if (!shouldInvalidateEditorSession(tokenAtStart)) {
                    if (depth < 2) {
                        console.warn('🔒 Editor: Bỏ qua 401 cũ — token đã đổi ở tab khác');
                        return verifyEditorSessionCore(depth + 1);
                    }
                    return null;
                }
                console.warn('🔒 Editor: Token không hợp lệ - redirect đến login');
                clearEditorAuthStorage();
                redirectEditorToLogin();
                return null;
            }
            console.warn('🔒 Editor: verify session HTTP', response.status);
            const offlineUser = getOfflineEditorUser();
            if (offlineUser) {
                if (typeof showToast === 'function') {
                    showToast('Máy chủ lỗi tạm thời — chỉnh sửa ngoại tuyến (chưa đồng bộ đám mây)', 'warning');
                }
                return offlineUser;
            }
            return null;
        }

        const currentUser = await response.json();
        console.log('✅ Editor session verified:', currentUser.email);
        var uid = currentUser._id || currentUser.id || null;
        if (uid) {
            try { localStorage.setItem('userId', String(uid)); } catch (e) { /* ignore */ }
            if (window.EditorCore && EditorCore.ProjectManager && EditorCore.ProjectManager.setUserId) {
                EditorCore.ProjectManager.setUserId(uid);
            }
        }
        return currentUser;
    } catch (error) {
        if (isNetworkFetchError(error)) {
            console.warn('⚠️ Editor: Không kết nối được server — chế độ offline', error.message || error);
            const offlineUser = getOfflineEditorUser();
            if (offlineUser) {
                if (typeof showToast === 'function') {
                    showToast('Không kết nối máy chủ — vẫn chỉnh sửa cục bộ. Hãy khởi động lại backend.', 'warning');
                }
                return offlineUser;
            }
        }
        if (!shouldInvalidateEditorSession(tokenAtStart)) {
            if (depth < 2) {
                console.warn('🔒 Editor: Bỏ qua lỗi verify cũ — token đã đổi');
                return verifyEditorSessionCore(depth + 1);
            }
            return null;
        }
        console.error('🔒 Editor: Lỗi verify session:', error);
        clearEditorAuthStorage();
        redirectEditorToLogin();
        return null;
    }
}

function verifyEditorSession() {
    if (_editorVerifyPromise) return _editorVerifyPromise;
    _editorVerifyPromise = verifyEditorSessionCore().finally(function () {
        _editorVerifyPromise = null;
    });
    return _editorVerifyPromise;
}

async function initEditor() {
    window.editorMapLoadStarted = true;
    console.log('🚀 Editor: Khởi tạo...');
    if (typeof pauseAutoSave === 'function') pauseAutoSave('initEditor');

    const currentUser = await verifyEditorSession();
    if (!currentUser) {
        console.log('🛑 Editor: Dừng init - không có session hợp lệ');
        return;
    }
    _editorInitDone = true;

    // Đồng bộ userId sớm — key autosave phải khớp trước khi đọc nháp
    try {
        if (currentUser.id != null) localStorage.setItem('userId', String(currentUser.id));
        else if (currentUser._id != null) localStorage.setItem('userId', String(currentUser._id));
        if (window.EditorCore && EditorCore.ProjectManager && EditorCore.ProjectManager.setUserId) {
            EditorCore.ProjectManager.setUserId(localStorage.getItem('userId'));
        }
    } catch (e) { /* ignore */ }

    renderEditorUser(currentUser);
    updateEditorFloorLabel();

    const building = await loadBuildingContext();
    if (window.editorAccessBlocked) {
        window.editorMapLoadHandled = true;
        console.warn('🛑 Editor: Không có quyền tòa nhà — chỉ chỉnh local, vẫn bật auto-save');
        if (typeof checkAutoSave === 'function') checkAutoSave({ serverLoaded: false });
    } else {
        console.log('📥 Editor: Tự động load map cho tầng:', document.getElementById('floorSelect')?.value);
        if (window.EditorCore && EditorCore.SpatialIndex) {
            EditorCore.SpatialIndex.syncFromLegacyWindow();
            console.log('🗺️ Spatial index:', EditorCore.SpatialIndex.getStats());
        }
        if (window.EditorCore && EditorCore.SnapEngine) {
            console.log('🧲 OSNAP:', EditorCore.SnapEngine.getSettings());
        }
        if (window.EditorCore && EditorCore.LayerManager) {
            console.log('📑 Layers:', EditorCore.LayerManager.getAll().length,
                '— active:', EditorCore.LayerManager.getActiveLayer().name);
        }
        const loadResult = await loadMapFromServer();
        if (window.EditorCore && EditorCore.SpatialIndex) {
            console.log('🗺️ Spatial index (sau load map):', EditorCore.SpatialIndex.getStats());
        }
        if (loadResult && loadResult.loaded && loadResult.version != null) {
            updateEditorMapVersion(loadResult.version);
        }
        if (typeof syncActiveFloor === 'function') syncActiveFloor();
        window.editorMapLoadHandled = true;
        // Phase 8 — floor edit lock
        await acquireFloorLock(false);
        startFloorLockHeartbeat();
        // Tự khôi phục nháp nếu khác bản server (không hỏi confirm — F5 không mất việc)
        if (typeof checkAutoSave === 'function') {
            checkAutoSave({
                serverLoaded: !!(loadResult && loadResult.loaded),
                serverDraftLoaded: !!(loadResult && loadResult.draftLoaded)
            });
        }
    }

    if (typeof resumeAutoSave === 'function' && !isFloorLockReadOnly()) {
        resumeAutoSave({ clean: true });
    }
    if (typeof startAutoSave === 'function' && !isFloorLockReadOnly()) {
        startAutoSave(true, { cleanStart: true });
    }
}

// ==========================================
// UI: Hiển thị user hiện tại đang chỉnh sửa
// ==========================================
function renderEditorUser(currentUser) {
    const el = document.getElementById('editorCurrentUser');
    if (!el) return;

    const fullName = currentUser.full_name || currentUser.fullName || currentUser.name || '';
    const email = currentUser.email || '';
    const role = currentUser.role || '';

    let displayHtml = '';
    if (fullName) {
        displayHtml = `Đang chỉnh sửa bởi: <strong>${escapeHtml(fullName)} — ${escapeHtml(email)} (${escapeHtml(role)})</strong>`;
    } else {
        displayHtml = `Đang chỉnh sửa bởi: <strong>${escapeHtml(email)} (${escapeHtml(role)})</strong>`;
    }

    el.innerHTML = displayHtml;
}

const BUILDING_STATUS_LABELS = {
    DRAFT: 'Nháp',
    PUBLISHED: 'Đã xuất bản'
};

function updateEditorFloorLabel() {
    const floor = document.getElementById('floorSelect')?.value ?? '1';
    const label = document.getElementById('editorFloorLabel');
    if (label) label.textContent = floor;
}

function updateEditorMapVersion(version) {
    const el = document.getElementById('editorMapVersion');
    if (!el) return;
    if (version === null || version === undefined || version === '') {
        el.textContent = '—';
        return;
    }
    el.textContent = String(version);
}

function renderEditorBuildingContext(building) {
    const nameEl = document.getElementById('editorBuildingName');
    const statusEl = document.getElementById('editorBuildingStatus');
    if (!nameEl || !statusEl) return;

    if (!building) {
        nameEl.textContent = buildingId ? 'Không tải được tòa nhà' : 'Chưa chọn tòa nhà';
        statusEl.textContent = '—';
        statusEl.className = 'editor-status-badge editor-status-draft';
        return;
    }

    nameEl.textContent = building.name || buildingId;
    const status = building.status || 'DRAFT';
    statusEl.textContent = BUILDING_STATUS_LABELS[status] || status;
    statusEl.className = 'editor-status-badge ' + (status === 'PUBLISHED' ? 'editor-status-published' : 'editor-status-draft');
}

function showEditorAccessBanner(message) {
    window.editorAccessBlocked = true;
    const banner = document.getElementById('editorAccessBanner');
    const msgEl = document.getElementById('editorAccessBannerMsg');
    if (msgEl && message) msgEl.textContent = message;
    if (banner) banner.style.display = 'flex';
    const bar = document.getElementById('editorBuildingBar');
    if (bar) bar.style.opacity = '0.5';
}

function hideEditorAccessBanner() {
    window.editorAccessBlocked = false;
    const banner = document.getElementById('editorAccessBanner');
    if (banner) banner.style.display = 'none';
    const bar = document.getElementById('editorBuildingBar');
    if (bar) bar.style.opacity = '';
}

/** Rebuild #floorSelect theo total_floors (0 .. N-1). Ưu tiên URL/session, rồi selection cũ. */
function rebuildFloorSelect(totalFloors) {
    const sel = document.getElementById('floorSelect');
    if (!sel) return;
    const n = Math.max(1, parseInt(totalFloors, 10) || 1);
    const prev = sel.value;
    let html = '';
    for (let i = 0; i < n; i++) {
        const label = i === 0 ? 'Tầng trệt' : ('Tầng ' + i);
        html += '<option value="' + i + '">' + label + '</option>';
    }
    sel.innerHTML = html;
    const preferred = typeof resolvePreferredEditorFloor === 'function'
        ? resolvePreferredEditorFloor(n)
        : null;
    if (preferred != null) {
        sel.value = preferred;
    } else if (prev !== '' && Number(prev) >= 0 && Number(prev) < n) {
        sel.value = String(prev);
    } else {
        sel.value = '0';
    }
    if (typeof persistEditorFloor === 'function') persistEditorFloor(sel.value);
    if (typeof updateEditorFloorLabel === 'function') updateEditorFloorLabel();
}

async function loadBuildingContext() {
    hideEditorAccessBanner();
    updateEditorFloorLabel();
    updateEditorMapVersion(null);

    if (!buildingId) {
        renderEditorBuildingContext(null);
        rebuildFloorSelect(1);
        return null;
    }

    try {
        const response = await apiFetch(`${BASE_API_URL}/buildings/${buildingId}`);
        const data = await response.json().catch(() => ({}));

        if (response.status === 403) {
            renderEditorBuildingContext(null);
            showEditorAccessBanner(data.message || 'Bạn không có quyền truy cập tòa nhà này.');
            showToast(data.message || 'Không có quyền truy cập tòa nhà này.', 'error');
            return null;
        }

        if (response.status === 404) {
            renderEditorBuildingContext(null);
            showToast('Không tìm thấy tòa nhà.', 'error');
            return null;
        }

        if (!response.ok) {
            renderEditorBuildingContext(null);
            showToast(data.message || 'Không tải được thông tin tòa nhà.', 'error');
            return null;
        }

        window.editorBuildingMeta = data;
        rebuildFloorSelect(data.total_floors || 1);
        renderEditorBuildingContext(data);
        return data;
    } catch (error) {
        console.error('loadBuildingContext error:', error);
        renderEditorBuildingContext(null);
        return null;
    }
}

function getEditorForbiddenMessage(data, fallback) {
    if (data && data.message) return data.message;
    return fallback || 'Bạn không có quyền thực hiện thao tác này.';
}

// Helper: escape HTML để tránh XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// SYNC LOGOUT: Đồng bộ logout giữa các tab
// ==========================================
window.addEventListener('storage', event => {
    if (['token', 'refreshToken', 'userEmail', 'userRole', 'userId', 'authEvent'].includes(event.key)) {
        // Đồng bộ biến token giữa nhiều tab trước khi verify (tránh dùng token cũ -> 401 giả).
        getCurrentAccessToken();
        console.log('🔄 Editor: Phát hiện thay đổi storage - kiểm tra session...');
        verifyEditorSession();
    }
});

window.addEventListener('focus', () => {
    if (!_editorInitDone) return;
    verifyEditorSession();
});

// Đăng ký initEditor khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', initEditor);

// ============================================================
// HELPER: Tự động gia hạn thẻ (Refresh Token)
// ------------------------------------------------------------
// WHY: Access token hết hạn sau 15p. Nếu đang vẽ dở mà không tự refresh
// sẽ khiến user bị văng ra ngoài, mất công sức.
// ============================================================
async function tryRefreshToken() {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) return false;
    try {
        const r = await fetch(BASE_API_URL + '/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt })
        });
        if (!r.ok) return false;
        const j = await r.json();
        if (!j.token) return false;

        token = j.token; // Cập nhật biến local
        localStorage.setItem('token', j.token);
        return true;
    } catch (_) {
        return false;
    }
}

async function apiFetch(url, options = {}) {
    const activeToken = getCurrentAccessToken();
    const opts = {
        ...options,
        headers: {
            ...(options.headers || {}),
            'Authorization': 'Bearer ' + activeToken
        }
    };
    let res = await fetch(url, opts);

    if (res.status === 401) {
        console.warn('🔑 Access Token hết hạn, đang thử refresh...');
        const ok = await tryRefreshToken();
        if (ok) {
            opts.headers['Authorization'] = 'Bearer ' + getCurrentAccessToken();
            res = await fetch(url, opts); // Thử lại lần 2 với token mới
        }
    }
    return res;
}

// ==========================================
// HÀM: HIỂN THỊ LOADING & THÔNG BÁO
// ==========================================
function showLoading(text) {
    var overlay = document.getElementById('loadingOverlay');
    var txt = document.getElementById('loadingText');
    if (overlay && txt) {
        txt.textContent = text || 'Đang xử lý...';
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

function showToast(message, type = 'success') {
    // Tạo container cho toast
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '12px';
    toast.style.background = type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)';
    toast.style.backdropFilter = 'blur(8px)';
    toast.style.color = 'white';
    toast.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.3)';
    toast.style.zIndex = '10000';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.fontSize = '0.9rem';
    toast.style.fontWeight = '500';
    toast.style.animation = 'slideIn 0.3s ease-out';

    // Icon mapping
    const icon = type === 'success' ? 'check-circle' : 'alert-circle';
    toast.innerHTML = `<i data-lucide="${icon}" style="width:18px;height:18px"></i> <span>${message}</span>`;

    document.body.appendChild(toast);

    // Khởi tạo icon mới
    if (typeof lucide !== 'undefined') lucide.createIcons();

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function showPublishValidationErrors(validation) {
    var errors = (validation && validation.errors) || [];
    if (!errors.length) {
        showToast('Không thể xuất bản — dữ liệu chưa hợp lệ.', 'error');
        return;
    }
    var lines = errors.map(function (e) { return '• ' + e.message; }).join('\n');
    console.warn('[Validation]', validation);
    showToast(errors[0].message, 'error');
    alert('Không thể xuất bản — sửa các lỗi sau:\n\n' + lines);
}

function confirmPublishWarnings(warnings) {
    if (!warnings || !warnings.length) return true;
    var lines = warnings.map(function (w) { return '• ' + w.message; }).join('\n');
    return confirm('Cảnh báo trước khi xuất bản:\n\n' + lines + '\n\nVẫn xuất bản?');
}

function getEditSessionId() {
    var key = 'editorEditSession';
    var sid = sessionStorage.getItem(key);
    if (!sid) {
        sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(key, sid);
    }
    return sid;
}

function setFloorLockBanner(opts) {
    opts = opts || {};
    var banner = document.getElementById('editorFloorLockBanner');
    var title = document.getElementById('editorFloorLockTitle');
    var msg = document.getElementById('editorFloorLockMsg');
    var forceBtn = document.getElementById('editorFloorLockForceBtn');
    if (!banner) return;
    if (!opts.show) {
        banner.style.display = 'none';
        return;
    }
    banner.style.display = 'flex';
    if (title) title.textContent = opts.title || 'Khóa tầng';
    if (msg) msg.textContent = opts.message || '';
    if (forceBtn) forceBtn.style.display = opts.showForce ? 'inline-block' : 'none';
}

window.editorFloorLockOwned = false;
window.editorFloorLockReadOnly = false;
window.editorFloorLockHolder = null;

function isFloorLockReadOnly() {
    return !!window.editorFloorLockReadOnly;
}
window.isFloorLockReadOnly = isFloorLockReadOnly;

function canForceFloorLock() {
    var role = localStorage.getItem('userRole') || '';
    return role === 'SUPER_ADMIN' || role === 'ORG_ADMIN';
}

function formatFloorLockHolder(holder) {
    if (window.LockApi && typeof LockApi.formatHolder === 'function') {
        return LockApi.formatHolder(holder);
    }
    if (!holder) return 'người khác';
    return holder.user_email || holder.email || holder.full_name || holder.name || 'người khác';
}

function updateFloorLockWriteControls(writeEnabled) {
    ['btnProjectDraft', 'btnProjectPublish'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (!el.dataset.titleDefault) el.dataset.titleDefault = el.title || '';
        el.disabled = !writeEnabled;
        el.title = writeEnabled ? el.dataset.titleDefault : 'Tầng đang bị khóa — chỉ xem';
    });
    document.querySelectorAll('.tool-btn[data-tool]').forEach(function (btn) {
        var isSelect = btn.dataset.tool === 'select';
        btn.disabled = !writeEnabled && !isSelect;
        btn.classList.toggle('tool-readonly-disabled', !writeEnabled && !isSelect);
    });
    var statusEl = document.getElementById('editorFloorLockStatus');
    if (statusEl) {
        statusEl.textContent = writeEnabled ? 'Đang sửa' : 'Chỉ xem';
        statusEl.className = 'editor-floor-lock-status ' +
            (writeEnabled ? 'editor-floor-lock-status--write' : 'editor-floor-lock-status--readonly');
    }
}

function applyFloorLockWriteMode() {
    window.editorFloorLockOwned = true;
    window.editorFloorLockReadOnly = false;
    window.editorFloorLockHolder = null;
    setFloorLockBanner({ show: false });
    document.body.classList.remove('editor-floor-readonly');
    updateFloorLockWriteControls(true);
    if (typeof resumeAutoSave === 'function') resumeAutoSave({ clean: false });
}

function applyFloorLockReadOnlyMode(holder, opts) {
    opts = opts || {};
    window.editorFloorLockOwned = false;
    window.editorFloorLockReadOnly = true;
    window.editorFloorLockHolder = holder || null;
    var holderLabel = formatFloorLockHolder(holder);
    setFloorLockBanner({
        show: true,
        title: opts.title || 'Chế độ chỉ xem — tầng đang bị khóa',
        message: opts.message || ('Đang chỉnh bởi ' + holderLabel + '. Bạn xem được bản đồ; không lưu nháp / xuất bản.'),
        showForce: opts.showForce != null ? opts.showForce : canForceFloorLock()
    });
    document.body.classList.add('editor-floor-readonly');
    updateFloorLockWriteControls(false);
    if (typeof pauseAutoSave === 'function') pauseAutoSave('floor-lock-readonly');
    if (_draftServerSyncTimer != null) {
        clearTimeout(_draftServerSyncTimer);
        _draftServerSyncTimer = null;
    }
    if (typeof selectTool === 'function') selectTool('select');
}

function getCurrentEditorFloor() {
    var el = document.getElementById('floorSelect');
    return el ? el.value : '0';
}

async function acquireFloorLock(force) {
    if (!buildingId || window.editorAccessBlocked) return null;
    var floor = getCurrentEditorFloor();

    if (window.LockApi && typeof LockApi.acquireLock === 'function') {
        try {
            var v1 = await LockApi.acquireLock(buildingId, floor, getEditSessionId(), !!force, apiFetch);
            if (v1.ok) {
                applyFloorLockWriteMode();
                console.log('[FloorLock] acquired v1', floor, v1.lock && v1.lock.user_email);
                return v1;
            }
            if (v1.conflict) {
                applyFloorLockReadOnlyMode(v1.holder, {
                    message: (v1.message || ('Đang chỉnh bởi ' + formatFloorLockHolder(v1.holder))) +
                        ' — bạn xem được; không lưu nháp / xuất bản.'
                });
                console.warn('[FloorLock] denied v1', v1.code, formatFloorLockHolder(v1.holder));
                return null;
            }
        } catch (e) {
            console.warn('[FloorLock] acquire v1 failed, thử legacy', e);
        }
    }

    try {
        var response = await apiFetch(`${BASE_API_URL}/maps/${buildingId}/${floor}/lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: getEditSessionId(), force: !!force })
        });
        var result = await response.json().catch(function () { return {}; });
        if (response.ok) {
            applyFloorLockWriteMode();
            console.log('[FloorLock] acquired legacy', floor, result.lock && result.lock.user_email);
            return result;
        }
        applyFloorLockReadOnlyMode(result.holder, {
            message: (result.message || ('Đang chỉnh bởi ' + formatFloorLockHolder(result.holder))) +
                ' — bạn xem được; xuất bản có thể bị chặn.'
        });
        console.warn('[FloorLock] denied legacy', response.status, result.code);
        return null;
    } catch (e) {
        console.warn('[FloorLock] acquire failed', e);
        return null;
    }
}

async function forceAcquireFloorLock() {
    if (!confirm('Cướp quyền sửa tầng này? Phiên kia sẽ mất khóa.')) return;
    var result = await acquireFloorLock(true);
    if (result) showToast('Đã giữ quyền sửa tầng này.', 'success');
}
window.forceAcquireFloorLock = forceAcquireFloorLock;

async function heartbeatFloorLock() {
    if (!buildingId || !window.editorFloorLockOwned) return;
    var floor = getCurrentEditorFloor();

    if (window.LockApi && typeof LockApi.heartbeatLock === 'function') {
        try {
            var v1 = await LockApi.heartbeatLock(buildingId, floor, getEditSessionId(), apiFetch);
            if (v1.ok) return;
            if (v1.conflict) {
                applyFloorLockReadOnlyMode(v1.holder, {
                    title: 'Mất quyền sửa',
                    message: (v1.message || 'Khóa đã hết hạn hoặc bị người khác giữ') + ' — chuyển sang chỉ xem.'
                });
            }
            return;
        } catch (e) {
            console.warn('[FloorLock] heartbeat v1 failed', e);
        }
    }

    try {
        var response = await apiFetch(`${BASE_API_URL}/maps/${buildingId}/${floor}/lock/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: getEditSessionId() })
        });
        if (response.status === 409) {
            var result = await response.json().catch(function () { return {}; });
            applyFloorLockReadOnlyMode(result.holder, {
                title: 'Mất quyền sửa',
                message: 'Khóa đã hết hạn hoặc bị người khác giữ — chuyển sang chỉ xem.'
            });
        }
    } catch (_) { /* ignore */ }
}

async function releaseFloorLock(floorOverride) {
    if (!buildingId) return;
    var floor = floorOverride != null ? floorOverride : getCurrentEditorFloor();
    if (floor == null || floor === '') return;

    if (window.LockApi && typeof LockApi.releaseLock === 'function') {
        try {
            await LockApi.releaseLock(buildingId, floor, getEditSessionId(), apiFetch);
        } catch (_) { /* ignore */ }
    } else {
        try {
            await apiFetch(`${BASE_API_URL}/maps/${buildingId}/${floor}/lock/release`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: getEditSessionId() })
            });
        } catch (_) { /* ignore */ }
    }
    window.editorFloorLockOwned = false;
}

function startFloorLockHeartbeat() {
    if (window._floorLockHeartbeat) clearInterval(window._floorLockHeartbeat);
    window._floorLockHeartbeat = setInterval(function () {
        heartbeatFloorLock();
    }, 45000);
    if (!window._floorLockUnloadBound) {
        window._floorLockUnloadBound = true;
        window.addEventListener('beforeunload', function () {
            try {
                var floor = getCurrentEditorFloor();
                if (!buildingId || floor == null || floor === '' || !window.editorFloorLockOwned) return;
                var payload = JSON.stringify({ session_id: getEditSessionId() });
                var releaseUrl = (window.LockApi && typeof LockApi.buildLockUrl === 'function')
                    ? LockApi.buildLockUrl(buildingId, floor, '/release')
                    : `${BASE_API_URL}/maps/${buildingId}/${floor}/lock/release`;
                navigator.sendBeacon(releaseUrl, new Blob([payload], { type: 'application/json' }));
            } catch (_) { /* ignore */ }
        });
    }
}

function buildCurrentMapDataForDraftOrPublish() {
    var pipelineResult;
    if (window.EditorCore && EditorCore.ExportPipeline) {
        pipelineResult = EditorCore.ExportPipeline.run({ skipValidation: true });
    } else {
        pipelineResult = {
            ok: true,
            mapData: buildPublishPayloadInline(),
            validation: { ok: true, errors: [], warnings: [] }
        };
    }
    if (!pipelineResult.ok || !pipelineResult.mapData) {
        return buildPublishPayloadInline();
    }
    return attachEditorCadExtras(pipelineResult.mapData);
}

var _draftServerSyncTimer = null;
var DRAFT_SERVER_SYNC_DELAY_MS = 8000;

function scheduleDraftServerSync() {
    if (!buildingId || !getCurrentAccessToken() || window.editorAccessBlocked || isFloorLockReadOnly()) return;
    if (_draftServerSyncTimer != null) clearTimeout(_draftServerSyncTimer);
    _draftServerSyncTimer = setTimeout(syncDraftToServerQuiet, DRAFT_SERVER_SYNC_DELAY_MS);
}
window.scheduleDraftServerSync = scheduleDraftServerSync;

async function syncDraftToServerQuiet() {
    _draftServerSyncTimer = null;
    if (!buildingId || !getCurrentAccessToken() || window.editorAccessBlocked || isFloorLockReadOnly()) return;
    if (!window.DraftApi || typeof DraftApi.putDraft !== 'function') return;
    var floorEl = document.getElementById('floorSelect');
    var floor = floorEl ? floorEl.value : '0';
    var mapData = buildCurrentMapDataForDraftOrPublish();
    try {
        var result = await DraftApi.putDraft(buildingId, floor, mapData, apiFetch);
        if (result.ok) {
            console.log('[Draft] Autosync OK — v' + (result.version != null ? result.version : '?'));
        } else if (result.unauthorized) {
            console.warn('[Draft] Autosync — phiên hết hạn');
        } else {
            console.warn('[Draft] Autosync thất bại:', result.status, result.data);
        }
    } catch (e) {
        console.warn('[Draft] Autosync lỗi:', e.message || e);
    }
}

async function loadDraftOverlay(floor) {
    if (!window.DraftApi || typeof DraftApi.fetchDraft !== 'function') {
        return { draftLoaded: false, skipped: true };
    }
    var draftRes = await DraftApi.fetchDraft(buildingId, floor, apiFetch);
    if (draftRes.unauthorized) return { unauthorized: true };
    if (draftRes.forbidden) return { forbidden: true, data: draftRes.data };
    if (!draftRes.ok || !draftRes.payload) return { draftLoaded: false };
    if (!DraftApi.isDraftPayloadMeaningful(draftRes.payload)) {
        return { draftLoaded: false, empty: true };
    }
    applyMapData(draftRes.payload);
    updateEditorFloorLabel();
    return { draftLoaded: true, version: draftRes.version, updatedAt: draftRes.updatedAt };
}

async function saveDraftToServer() {
    if (!buildingId) {
        alert('Lỗi: Không tìm thấy mã tòa nhà! Vui lòng mở từ Bảng điều khiển.');
        return;
    }
    if (window.editorAccessBlocked) {
        showToast('Không có quyền lưu nháp tòa nhà này.', 'error');
        return;
    }
    if (isFloorLockReadOnly()) {
        showToast('Tầng đang bị khóa — chỉ xem, không lưu nháp.', 'error');
        return;
    }
    const floor = document.getElementById('floorSelect').value;
    const mapData = buildCurrentMapDataForDraftOrPublish();
    showLoading('Đang lưu nháp lên máy chủ...');
    try {
        if (window.DraftApi && typeof DraftApi.putDraft === 'function') {
            const result = await DraftApi.putDraft(buildingId, floor, mapData, apiFetch);
            hideLoading();
            if (result.ok) {
                var verMsg = result.version != null ? ' (v' + result.version + ')' : '';
                showToast('Đã lưu nháp tầng ' + floor + verMsg + ' — chưa xuất bản lên điện thoại.');
                if (result.bgStripped && typeof showToast === 'function') {
                    showToast('Ảnh nền Base64 đã bỏ trước khi gửi server — hãy upload qua Storage.', 'warning');
                }
                return;
            }
            if (result.unauthorized) {
                showToast('Phiên đăng nhập hết hạn! Vui lòng đăng nhập lại.', 'error');
                return;
            }
            const errMsg = (result.data && result.data.message) ||
                ('Lỗi lưu nháp (HTTP ' + (result.status || '?') + ')');
            showToast(errMsg, 'error');
            return;
        }

        const response = await apiFetch(`${BASE_API_URL}/maps/${buildingId}/${floor}/draft`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ map_data: mapData })
        });
        const legacyResult = await response.json().catch(function () { return {}; });
        hideLoading();
        if (response.ok) {
            showToast('Đã lưu nháp tầng ' + floor + ' (legacy API).');
        } else if (response.status === 401) {
            showToast('Phiên đăng nhập hết hạn! Vui lòng đăng nhập lại.', 'error');
        } else {
            showToast(legacyResult.message || ('Lỗi lưu nháp (HTTP ' + response.status + ')'), 'error');
        }
    } catch (error) {
        hideLoading();
        showToast('Lỗi kết nối máy chủ', 'error');
    }
}

window._publishJobInFlight = false;

function setPublishPipelineUi(phase, detail) {
    var el = document.getElementById('editorVersionLifecycle');
    var btn = document.getElementById('btnProjectPublish');
    var label = (window.PublishApi && typeof PublishApi.statusLabelVi === 'function')
        ? PublishApi.statusLabelVi(phase)
        : (phase || '');

    if (el) {
        if (phase === 'SUCCESS' || phase === 'published') {
            el.textContent = 'Đã xuất bản';
            el.className = 'editor-status-badge editor-status-published';
        } else if (phase === 'FAILED') {
            el.textContent = 'Xuất bản lỗi';
            el.className = 'editor-status-badge editor-status-draft editor-status-publish-failed';
            el.title = detail || 'Thử lại Xuất bản';
        } else if (phase === 'QUEUED' || phase === 'RUNNING' || phase === 'publishing') {
            el.textContent = label || 'Đang xuất bản…';
            el.className = 'editor-status-badge editor-status-publishing';
            el.title = detail || 'Job đang chạy trên máy chủ';
        }
    }
    if (btn) {
        var busy = phase === 'QUEUED' || phase === 'RUNNING' || phase === 'publishing';
        btn.disabled = busy || isFloorLockReadOnly();
        if (!btn.dataset.titleDefault) btn.dataset.titleDefault = btn.title || 'Xuất bản Android';
        btn.title = busy ? 'Đang xuất bản…' : btn.dataset.titleDefault;
        btn.textContent = busy ? 'Đang XB…' : 'Xuất bản';
    }
}

function applyPublishSuccessUi(floor, newVersion, publishedAt, pipelineResult) {
    showToast('Đã xuất bản bản đồ tầng ' + floor + ' thành công!');
    if (typeof clearAutoSave === 'function') clearAutoSave();
    if (newVersion != null) updateEditorMapVersion(newVersion);
    window.editorBuildingMeta = Object.assign({}, window.editorBuildingMeta || {}, { status: 'PUBLISHED' });
    renderEditorBuildingContext(window.editorBuildingMeta);
    if (window.EditorCore && EditorCore.VersionManager &&
        typeof EditorCore.VersionManager.syncAfterPublish === 'function') {
        EditorCore.VersionManager.syncAfterPublish(newVersion, publishedAt);
    }
    setPublishPipelineUi('SUCCESS');
    if (typeof renderVersionBadge === 'function') renderVersionBadge();
    if (pipelineResult && pipelineResult.navigationPayload && typeof console !== 'undefined' && console.debug) {
        console.debug('[Publish] Navigation payload (Android):', {
            rooms: (pipelineResult.navigationPayload.rooms || []).length,
            nodes: (pipelineResult.navigationPayload.nodes || []).length,
            edges: (pipelineResult.navigationPayload.edges || []).length
        });
    }
}

function formatPublishJobError(jobRes) {
    var err = jobRes && jobRes.error;
    if (!err) return (jobRes && jobRes.message) || 'Xuất bản thất bại.';
    var msg = err.message || 'Xuất bản thất bại.';
    if (err.code) msg = '[' + err.code + '] ' + msg;
    return msg;
}

async function publishViaV1Async(floor, mapData, pipelineResult) {
    if (!window.PublishApi || typeof PublishApi.enqueuePublish !== 'function') {
        return { used: false };
    }

    setPublishPipelineUi('QUEUED');
    showLoading('Đang xếp hàng xuất bản…');

    var enq = await PublishApi.enqueuePublish(buildingId, floor, mapData, apiFetch, {
        editSessionId: getEditSessionId()
    });

    if (enq.unauthorized) {
        hideLoading();
        setPublishPipelineUi('FAILED', 'Phiên hết hạn');
        showToast('Phiên đăng nhập hết hạn! Vui lòng đăng nhập lại để lưu.', 'error');
        return { used: true };
    }
    if (enq.forbidden) {
        hideLoading();
        setPublishPipelineUi('FAILED');
        showToast(getEditorForbiddenMessage(enq.data, 'Bạn không có quyền xuất bản bản đồ tòa nhà này.'), 'error');
        return { used: true };
    }
    if (enq.conflict) {
        hideLoading();
        setPublishPipelineUi('FAILED');
        showToast(enq.message || 'Tầng đang bị người khác khóa — không xuất bản được.', 'error');
        return { used: true };
    }
    if (enq.validateFailed) {
        hideLoading();
        setPublishPipelineUi('FAILED');
        var lines = (enq.errors || []).map(function (e) {
            return '• ' + (e.message || e.code || JSON.stringify(e));
        }).join('\n');
        showToast(enq.message || 'Validate map thất bại.', 'error');
        if (lines) alert('Không thể xuất bản — sửa các lỗi sau:\n\n' + lines);
        return { used: true };
    }
    if (enq.rateLimited) {
        hideLoading();
        setPublishPipelineUi('FAILED');
        showToast(enq.message || 'Xuất bản quá nhiều lần — thử lại sau.', 'error');
        return { used: true };
    }
    if (!enq.ok || !enq.jobId) {
        hideLoading();
        console.warn('[Publish] v1 enqueue không 202 — fallback legacy', enq.status, enq.data);
        return { used: false, enqueue: enq };
    }

    if (enq.bgStripped) {
        showToast('Ảnh nền Base64 đã bỏ trước khi xuất bản — hãy upload qua Storage.', 'warning');
    }

    showLoading('Đang xuất bản (job ' + enq.jobId.slice(-6) + ')…');
    var job = await PublishApi.pollPublishJob(enq.jobId, apiFetch, {
        onProgress: function (status) {
            setPublishPipelineUi(status);
            if (typeof showLoading === 'function') {
                showLoading((PublishApi.statusLabelVi(status) || 'Đang xuất bản…') +
                    ' (job …' + enq.jobId.slice(-6) + ')');
            }
        }
    });

    hideLoading();

    if (job.timeout) {
        setPublishPipelineUi('RUNNING', 'Timeout — job có thể vẫn chạy');
        showToast(job.message || 'Hết thời gian chờ. Kiểm tra lại sau hoặc thử Xuất bản lại.', 'error');
        return { used: true, jobId: enq.jobId, timeout: true };
    }
    if (!job.ok) {
        setPublishPipelineUi('FAILED');
        showToast(job.message || 'Không lấy được trạng thái job.', 'error');
        return { used: true, jobId: enq.jobId };
    }
    if (job.status === 'SUCCESS') {
        applyPublishSuccessUi(floor, job.version, job.finishedAt, pipelineResult);
        return { used: true, success: true, jobId: enq.jobId, version: job.version };
    }

    setPublishPipelineUi('FAILED', formatPublishJobError(job));
    showToast(formatPublishJobError(job), 'error');
    return { used: true, failed: true, jobId: enq.jobId };
}

async function publishViaLegacySync(floor, mapData, pipelineResult) {
    showLoading('Đang lưu bản đồ lên máy chủ (sync)…');
    setPublishPipelineUi('publishing');
    try {
        const response = await apiFetch(`${BASE_API_URL}/maps/${buildingId}/${floor}/publish`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Edit-Session': getEditSessionId()
            },
            body: JSON.stringify({
                map_data: mapData,
                edit_session_id: getEditSessionId()
            })
        });

        const result = await response.json().catch(() => ({}));
        hideLoading();

        if (response.ok) {
            const newVersion = result.map && result.map.version != null
                ? result.map.version
                : (result.version != null ? result.version : null);
            applyPublishSuccessUi(
                floor,
                newVersion,
                result.map && result.map.published_at,
                pipelineResult
            );
        } else if (response.status === 401) {
            setPublishPipelineUi('FAILED');
            showToast('Phiên đăng nhập hết hạn! Vui lòng đăng nhập lại để lưu.', 'error');
        } else if (response.status === 403) {
            setPublishPipelineUi('FAILED');
            showToast(getEditorForbiddenMessage(result, 'Bạn không có quyền xuất bản bản đồ tòa nhà này.'), 'error');
        } else if (response.status === 409) {
            setPublishPipelineUi('FAILED');
            showToast(result.message || 'Tầng đang bị người khác khóa — không xuất bản được.', 'error');
        } else if (response.status === 429) {
            setPublishPipelineUi('FAILED');
            showToast(result.message || 'Xuất bản quá nhiều lần — thử lại sau.', 'error');
        } else {
            setPublishPipelineUi('FAILED');
            showToast(result.message || ('Lỗi lưu trữ (HTTP ' + response.status + ')'), 'error');
        }
    } catch (error) {
        hideLoading();
        setPublishPipelineUi('FAILED');
        console.error('API Error:', error);
        showToast('Lỗi kết nối máy chủ', 'error');
    }
}

async function saveMapToServer() {
    if (!buildingId) {
        alert('Lỗi: Không tìm thấy mã tòa nhà! Vui lòng mở từ Bảng điều khiển.');
        return;
    }
    if (isFloorLockReadOnly()) {
        showToast('Tầng đang bị khóa — chỉ xem, không xuất bản.', 'error');
        return;
    }
    if (window._publishJobInFlight) {
        showToast('Đang xuất bản — vui lòng chờ.', 'warning');
        return;
    }

    const floor = document.getElementById('floorSelect').value;

    var pipelineResult;
    try {
        if (window.EditorCore && EditorCore.ExportPipeline) {
            pipelineResult = EditorCore.ExportPipeline.run({ skipValidation: false });
        } else {
            pipelineResult = {
                ok: true,
                mapData: buildPublishPayloadInline(),
                validation: { ok: true, errors: [], warnings: [] }
            };
        }
    } catch (err) {
        console.error('Export pipeline error:', err);
        showToast('Lỗi chuẩn bị xuất bản: ' + err.message, 'error');
        return;
    }

    if (!pipelineResult.ok) {
        showPublishValidationErrors(pipelineResult.validation);
        return;
    }

    if (pipelineResult.validation && pipelineResult.validation.warnings.length > 0) {
        if (!confirmPublishWarnings(pipelineResult.validation.warnings)) {
            return;
        }
    }

    const mapData = attachEditorCadExtras(pipelineResult.mapData);

    console.log('📤 SENDING publish…', {
        buildingId: buildingId,
        floor: floor,
        rooms: (mapData.rooms || []).length,
        nodes: (mapData.nodes || []).length
    });

    window._publishJobInFlight = true;
    try {
        var v1 = await publishViaV1Async(floor, mapData, pipelineResult);
        if (!v1.used) {
            await publishViaLegacySync(floor, mapData, pipelineResult);
        }
    } finally {
        window._publishJobInFlight = false;
        var btn = document.getElementById('btnProjectPublish');
        if (btn && !isFloorLockReadOnly()) {
            btn.disabled = false;
            btn.textContent = 'Xuất bản';
            if (btn.dataset.titleDefault) btn.title = btn.dataset.titleDefault;
        }
    }
}

// ==========================================
// HÀM: TẢI BẢN ĐỒ TỪ SERVER VỀ
// ==========================================
/**
 * Xóa dữ liệu trên canvas.
 * @param {{clearAutosave?: boolean}} [opts]
 *   clearAutosave=true chỉ khi user bấm «Xóa sạch» / tạo mới.
 *   loadMapFromServer KHÔNG được xóa nháp — nếu không F5 sẽ mất vòng tròn vừa vẽ.
 */
function clearCanvasData(opts) {
    opts = opts || {};
    // Xóa sạch các mảng dữ liệu
    rooms = [];
    doors = [];
    pois = [];
    pathNodes = [];
    pathEdges = [];
    walls = [];
    lines = [];
    qrs = [];
    bgImage = null;
    bgImageBase64 = '';
    blocks = [];
    blockInserts = [];
    dimensions = [];

    // Reset các ID tự tăng
    nextRoomId = 1;
    nextDoorId = 1;
    nextPoiId = 1;
    nextQrId = 1;
    nextNodeId = 1;
    nextWallId = 1;
    nextLineId = 1;
    nextBlockDefId = 1;
    nextBlockInsertId = 1;
    nextDimId = 1;

    // Reset tên bản đồ về mặc định khi tạo mới
    var mapNameInput = document.getElementById('mapName');
    if (mapNameInput) mapNameInput.value = 'Bản đồ mới';

    // Chỉ xóa nháp khi user cố ý (nút Xóa sạch). loadMapFromServer truyền clearAutosave:false.
    if (opts.clearAutosave) {
        if (typeof clearAutoSave === 'function') clearAutoSave();
    }

    // Vẽ lại canvas trống
    if (typeof draw === 'function') draw();

    console.log('🧹 Đã xóa sạch dữ liệu trên Canvas.' +
        (opts.clearAutosave ? ' (đã xóa nháp local)' : ' (giữ nháp local)'));
}

async function loadMapFromServer() {
    if (!buildingId) return { loaded: false, skipped: true };

    if (typeof pauseAutoSave === 'function') pauseAutoSave('loadMapFromServer');

    // QUAN TRỌNG: Xóa dữ liệu cũ trước khi nạp — nhưng GIỮ nháp local để checkAutoSave khôi phục
    clearCanvasData({ clearAutosave: false });

    const floor = document.getElementById('floorSelect').value;
    showLoading('Đang tải dữ liệu tầng ' + floor + '...');

    // WHY: Tách thành 1 helper để thử endpoint private (chỉ có auth)
    async function tryFetch(url, useAuth) {
        const resp = useAuth
            ? await apiFetch(url)
            : await fetch(url);

        if (resp.status === 404) return { notFound: true, resp };
        if (resp.status === 401) return { unauthorized: true, resp };
        if (resp.status === 403) {
            const data = await resp.json().catch(() => ({}));
            return { forbidden: true, data, resp };
        }
        const data = await resp.json().catch(() => null);
        return { ok: resp.ok, data, resp };
    }

    try {
        const privateUrl = `${BASE_API_URL}/maps/${buildingId}/${floor}`;

        const mapToken = getCurrentAccessToken();
        let result = mapToken
            ? await tryFetch(privateUrl, true)
            : { unauthorized: true };

        if (result.unauthorized) {
            console.warn('🔒 Editor: Token không hợp lệ - redirect login');
            if (shouldInvalidateEditorSession(mapToken)) {
                clearEditorAuthStorage();
                redirectEditorToLogin();
            }
            return { loaded: false, unauthorized: true };
        }

        hideLoading();

        if (result.forbidden) {
            const msg = getEditorForbiddenMessage(result.data, 'Bạn không có quyền tải bản đồ tòa nhà này.');
            showEditorAccessBanner(msg);
            showToast(msg, 'error');
            return { loaded: false, forbidden: true };
        }

        var publishedLoaded = false;
        var publishedVersion = null;

        if (result.notFound) {
            console.warn('Tầng này chưa có bản đồ published trên Server.');
            updateEditorMapVersion(null);
        } else if (result.ok && result.data && result.data.map_data) {
            console.log('📥 Đã tải bản đồ published từ Server:', result.data);
            applyMapData(result.data.map_data);
            updateEditorFloorLabel();
            publishedVersion = result.data.version;
            publishedLoaded = true;
            if (window.EditorCore && EditorCore.VersionManager &&
                typeof EditorCore.VersionManager.syncFromServer === 'function') {
                EditorCore.VersionManager.syncFromServer({
                    serverVersion: publishedVersion,
                    buildingStatus: (window.editorBuildingMeta && window.editorBuildingMeta.status) || null,
                    publishedAt: result.data.published_at || null
                });
            }
            if (typeof renderVersionBadge === 'function') renderVersionBadge();
        } else if (!result.notFound) {
            const msg = (result.data && result.data.message) || 'Không tải được bản đồ (HTTP ' + (result.resp && result.resp.status) + ')';
            showToast(msg, 'error');
            return { loaded: false };
        }

        var draftOverlay = await loadDraftOverlay(floor);
        if (draftOverlay.unauthorized) {
            console.warn('🔒 Editor: Draft API 401');
            if (shouldInvalidateEditorSession(mapToken)) {
                clearEditorAuthStorage();
                redirectEditorToLogin();
            }
            return { loaded: publishedLoaded, unauthorized: true };
        }
        if (draftOverlay.forbidden) {
            console.warn('Draft API forbidden — giữ bản published');
        } else if (draftOverlay.draftLoaded) {
            console.log('📥 Đã áp draft v1 lên canvas (ưu tiên hơn published)');
            if (typeof renderVersionBadge === 'function') renderVersionBadge();
        }

        return {
            loaded: publishedLoaded,
            draftLoaded: !!draftOverlay.draftLoaded,
            notFound: !!result.notFound && !draftOverlay.draftLoaded,
            version: publishedVersion
        };
    } catch (error) {
        hideLoading();
        console.error('Load Error:', error);
        showToast('Lỗi kết nối máy chủ: ' + error.message, 'error');
        return { loaded: false, error: true };
    }
}

// Hàm bổ trợ để đổ dữ liệu vào state của Editor
function applyMapData(data) {
    if (data.mapName) document.getElementById('mapName').value = data.mapName;

    // 1. Phục hồi Tỷ lệ (scale_ratio -> metersPerGrid)
    var rawScale = null;
    if (data.scale_ratio !== undefined && data.scale_ratio !== null) {
        rawScale = data.scale_ratio;
    } else if (data.metersPerGrid !== undefined && data.metersPerGrid !== null) {
        rawScale = data.metersPerGrid;
    }
    var parsedScale = parseFloat(rawScale);
    metersPerGrid = (Number.isFinite(parsedScale) && parsedScale > 0) ? parsedScale : 0.5;
    document.getElementById('scaleInput').value = metersPerGrid.toFixed(2);

    window.mapBearingOffset = Number(data.map_bearing_offset) || 0;
    var bearingInp = document.getElementById('mapBearingInput');
    if (bearingInp) bearingInp.value = window.mapBearingOffset;

    // 2. Khôi phục Ảnh nền
    if (data.background_image) {
        bgImageBase64 = data.background_image;
        var img = new Image();
        img.onload = function () {
            bgImage = img;
            draw();
        };
        img.src = bgImageBase64;
    } else {
        bgImage = null;
        bgImageBase64 = '';
    }

    rooms = data.rooms || [];

    // Tự sửa lỗi ID cho các bản đồ cũ
    let maxId = 0;
    rooms.forEach(function (r, index) {
        applyDefaultRoomLabelStyle(r);
        if (!r.id || isNaN(r.id)) r.id = index + 1;
        if (r.id > maxId) maxId = r.id;
    });
    nextRoomId = maxId + 1;

    doors = data.doors || [];
    let maxDoorId = 0;
    doors.forEach(function (d, index) {
        if (!d.id || isNaN(d.id)) d.id = index + 1;
        if (d.id > maxDoorId) maxDoorId = d.id;
    });
    nextDoorId = maxDoorId + 1;

    pois = data.pois || [];
    let maxPoiId = 0;
    pois.forEach(function (p, index) {
        if (!p.id || isNaN(p.id)) p.id = index + 1;
        if (p.id > maxPoiId) maxPoiId = p.id;
    });
    nextPoiId = maxPoiId + 1;

    // 3. Khôi phục Nodes (nodes -> pathNodes)
    pathNodes = (data.nodes || data.pathNodes || []).map(n => ({
        id: parseInt(n.id),
        x: n.x,
        y: n.y,
        neighbors: (n.neighbors || []).map(nid => parseInt(nid)),
        nodeType: n.is_elevator ? 'elevator' : (n.is_stairs ? 'stairs' : 'normal')
    }));
    let maxNodeId = 0;
    pathNodes.forEach(function (n) {
        if (n.id > maxNodeId) maxNodeId = n.id;
    });
    nextNodeId = maxNodeId + 1;

    // 4. Khôi phục Edges (edges -> pathEdges)
    pathEdges = (data.edges || data.pathEdges || []).map(e => ({
        from: parseInt(e.source || e.from),
        to: parseInt(e.target || e.to),
        distance: e.distance || 0
    }));

    // 5. Khôi phục QRs (qr_anchors -> qrs)
    qrs = (data.qr_anchors || data.qrs || []).map(q => ({
        id: q.id || Math.floor(Math.random() * 1000),
        name: q.room_name || q.name,
        serial: q.qr_id || q.serial,
        x: q.x,
        y: q.y,
        node_id: q.node_id ? parseInt(q.node_id) : null
    }));
    let maxQrId = 0;
    qrs.forEach(function (q) {
        if (q.id > maxQrId) maxQrId = q.id;
    });
    nextQrId = maxQrId + 1;

    // 6. Khôi phục Walls
    walls = (data.walls || []).map(w => ({
        id: w.id || Math.floor(Math.random() * 100000),
        type: w.type || 'segment',
        thickness: w.thickness || 4,
        is_outer: !!w.is_outer,
        points: Array.isArray(w.points) ? w.points.map(p => ({ x: p.x, y: p.y })) : []
    }));
    let maxWallId = 0;
    walls.forEach(function (w) {
        if (w.id > maxWallId) maxWallId = w.id;
    });
    nextWallId = maxWallId + 1;

    // 6b. Khôi phục Lines (hỗ trợ vẽ — chỉ editor, không publish)
    lines = (data.lines || []).map(function (ln) {
        return {
            id: ln.id || Math.floor(Math.random() * 100000),
            type: ln.type || 'segment',
            color: ln.color || '#3b82f6',
            lineWeight: ln.lineWeight || 2,
            points: Array.isArray(ln.points) ? ln.points.map(function (p) { return { x: p.x, y: p.y }; }) : []
        };
    });
    var maxLineId = 0;
    lines.forEach(function (ln) {
        if (ln.id > maxLineId) maxLineId = ln.id;
    });
    nextLineId = maxLineId + 1;

    // 6c. Block library + inserts (editor local — autosave/export)
    blocks = Array.isArray(data.blocks) ? data.blocks : [];
    blockInserts = Array.isArray(data.blockInserts) ? data.blockInserts : [];
    nextBlockDefId = 1;
    blocks.forEach(function (b) {
        var m = String(b && b.id || '').match(/blk_(\d+)/);
        if (m) {
            var n = parseInt(m[1], 10);
            if (n >= nextBlockDefId) nextBlockDefId = n + 1;
        }
    });
    nextBlockInsertId = 1;
    blockInserts.forEach(function (bi) {
        if (bi && bi.id && bi.id >= nextBlockInsertId) nextBlockInsertId = bi.id + 1;
    });

    // 6d. Dimensions (annotation — editor only)
    dimensions = Array.isArray(data.dimensions) ? data.dimensions : [];
    nextDimId = 1;
    dimensions.forEach(function (d) {
        if (d && d.id && d.id >= nextDimId) nextDimId = d.id + 1;
    });

    // Phase 1b Layer system: gán layerId mặc định cho dữ liệu legacy
    // (map hiện tại chưa chắc có layerId trong payload publish)
    var defaultLayerId = 'default';
    try {
        if (window.EditorCore && EditorCore.LayerManager && EditorCore.LayerManager.DEFAULT_LAYER_ID) {
            defaultLayerId = EditorCore.LayerManager.DEFAULT_LAYER_ID;
        }
    } catch (_) { }
    [rooms, doors, pois, pathNodes, walls, qrs, blockInserts, dimensions].forEach(function (arr) {
        if (!Array.isArray(arr)) return;
        arr.forEach(function (o) {
            if (!o || typeof o !== 'object') return;
            if (o.layerId == null) o.layerId = defaultLayerId;
        });
    });

    // Vẽ lại toàn bộ
    updateObjectList();
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    draw();

    if (window.EditorCore && EditorCore.LegacyBridge) {
        EditorCore.LegacyBridge.syncDocumentFromLegacy();
    }
    if (window.EditorCore && EditorCore.SpatialIndex) {
        EditorCore.SpatialIndex.syncFromLegacyWindow();
    }
}

/** EditorCore publish — bật khi Phase 0 checklist 100% (core/index.js) */
function isEditorCorePublishReady() {
    return !!(window.EditorCore &&
        EditorCore.PHASE0_STABLE === true &&
        EditorCore.LegacyBridge &&
        typeof EditorCore.LegacyBridge.buildPublishPayloadFromEditor === 'function' &&
        typeof EditorCore.assertPublishSchema === 'function');
}

/** Inline publish — không phụ thuộc EditorCore (Phần 17.5) */
function buildPublishPayloadInline() {
    var payload = {
        scale_ratio: (Number.isFinite(metersPerGrid) && metersPerGrid > 0) ? metersPerGrid : 0.5,
        map_bearing_offset: Number.isFinite(window.mapBearingOffset) ? window.mapBearingOffset : 0,
        background_image: bgImageBase64 || '',

        rooms: rooms.filter(r => typeof r === 'object').map(r => ({
            id: r.id,
            name: r.name || 'Phòng mới',
            shape: r.shape || 'rect',
            color: r.color || '#ccc',
            labelRotation: Number.isFinite(r.labelRotation) ? r.labelRotation : 0,
            labelFontSize: Number.isFinite(r.labelFontSize) ? r.labelFontSize : 14,
            labelAutoScale: typeof r.labelAutoScale === 'boolean' ? r.labelAutoScale : true,
            labelLineHeight: Number.isFinite(r.labelLineHeight) ? r.labelLineHeight : 1.2,
            x: Math.round(r.x || 0),
            y: Math.round(r.y || 0),
            width: Math.round(r.width || 0),
            height: Math.round(r.height || 0),
            points: Array.isArray(r.points) ? r.points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })) : [],
            cx: r.cx ? Math.round(r.cx) : undefined,
            cy: r.cy ? Math.round(r.cy) : undefined,
            radius: r.radius ? Math.round(r.radius) : undefined
        })),

        doors: doors.filter(d => typeof d === 'object').map(d => ({
            id: d.id,
            name: d.name || 'Cửa',
            x: Math.round(d.x || 0),
            y: Math.round(d.y || 0),
            width: d.width || 40,
            type: d.type || 'Đơn',
            rotation: d.rotation || 0
        })),

        pois: pois.filter(p => typeof p === 'object').map(p => ({
            id: p.id,
            name: p.name || 'P.O.I',
            x: Math.round(p.x || 0),
            y: Math.round(p.y || 0),
            type: p.type || 'Điểm mốc',
            typeIndex: p.typeIndex || 0
        })),

        nodes: pathNodes.filter(n => typeof n === 'object').map(n => ({
            id: n.id,
            x: Math.round(n.x || 0),
            y: Math.round(n.y || 0),
            neighbors: Array.isArray(n.neighbors) ? n.neighbors : [],
            is_elevator: n.nodeType === 'elevator',
            is_stairs: n.nodeType === 'stairs'
        })),

        edges: pathEdges.filter(e => typeof e === 'object').map(e => ({
            source: String(e.from),
            target: String(e.to),
            distance: e.distance || 0
        })),

        walls: (walls || []).filter(w => typeof w === 'object').map(w => ({
            id: w.id,
            type: w.type || 'segment',
            thickness: w.thickness || 4,
            is_outer: !!w.is_outer,
            points: Array.isArray(w.points)
                ? w.points.map(p => ({ x: Math.round(p.x || 0), y: Math.round(p.y || 0) }))
                : []
        })),

        qr_anchors: qrs.filter(q => typeof q === 'object').map(q => ({
            qr_id: q.serial || String(q.id),
            x: Math.round(q.x || 0),
            y: Math.round(q.y || 0),
            room_name: q.name || 'Vị trí QR',
            node_id: q.node_id != null ? q.node_id : null
        }))
    };
    return attachEditorCadExtras(payload);
}

/**
 * Field chỉ editor (Android bỏ qua): Block/Insert + lines + dimensions — round-trip sau publish/F5.
 */
function attachEditorCadExtras(mapData) {
    if (!mapData || typeof mapData !== 'object') return mapData;
    mapData.blocks = JSON.parse(JSON.stringify(blocks || []));
    mapData.blockInserts = (blockInserts || []).filter(function (bi) {
        return bi && typeof bi === 'object';
    }).map(function (bi) {
        return {
            id: bi.id,
            blockId: bi.blockId,
            name: bi.name || 'Insert',
            x: Math.round(bi.x || 0),
            y: Math.round(bi.y || 0),
            rotation: bi.rotation || 0,
            scale: bi.scale != null ? bi.scale : 1,
            layerId: bi.layerId || 'default'
        };
    });
    mapData.lines = (lines || []).filter(function (ln) {
        return ln && typeof ln === 'object';
    }).map(function (ln) {
        return {
            id: ln.id,
            type: ln.type || 'segment',
            color: ln.color || '#3b82f6',
            lineWeight: ln.lineWeight || 2,
            layerId: ln.layerId || 'default',
            points: Array.isArray(ln.points)
                ? ln.points.map(function (p) {
                    return { x: Math.round(p.x || 0), y: Math.round(p.y || 0) };
                })
                : []
        };
    });
    mapData.dimensions = (dimensions || []).filter(function (d) {
        return d && typeof d === 'object';
    }).map(function (d) {
        return {
            id: d.id,
            type: d.type || 'dimlinear',
            orientation: d.type === 'dimaligned' ? undefined : (d.orientation || 'horizontal'),
            p1: d.p1 ? { x: Math.round(d.p1.x || 0), y: Math.round(d.p1.y || 0) } : null,
            p2: d.p2 ? { x: Math.round(d.p2.x || 0), y: Math.round(d.p2.y || 0) } : null,
            offset: d.offset || 0,
            textOverride: d.textOverride != null && String(d.textOverride) !== '' ? String(d.textOverride) : undefined,
            color: d.color || (d.type === 'dimaligned' ? '#c026d3' : '#e11d48'),
            layerId: d.layerId || 'default'
        };
    });
    return mapData;
}
window.attachEditorCadExtras = attachEditorCadExtras;
