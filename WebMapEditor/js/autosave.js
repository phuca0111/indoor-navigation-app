// ============================================================
// AUTOSAVE.JS - Tự động lưu nháp vào LocalStorage (KHÔNG lên server)
// - Lần đầu sau 3s, sau đó mỗi 30s
// - Chỉ ghi khi có thay đổi (dirty) → không spam / không đốt quota
// - Không tạo MapVersion trên server (không đụng giới hạn 50 phiên bản)
// ============================================================

var AUTOSAVE_INTERVAL = 30000;
var AUTOSAVE_FIRST_DELAY = 3000;
var AUTOSAVE_DIRTY_DELAY = 2000; // sau khi sửa → lưu nháp sau 2s
var _autosaveTimerId = null;
var _autosaveFirstTimeoutId = null;
var _autosaveDirtyTimeoutId = null;
var _autosaveStarted = false;
var _autosaveKeyStarted = null;
var _autosaveDirty = true;
var _autosaveLastOkAt = null;
var _autosaveLastError = null;
/** true khi đang load map — chặn ghi đè nháp bằng canvas trống */
var _autosavePaused = false;
var _autosavePauseReason = '';

function getAutosaveIntervalMs() {
    if (window.EditorCore && EditorCore.Config) {
        return EditorCore.Config.get('autosave.intervalMs', AUTOSAVE_INTERVAL);
    }
    return AUTOSAVE_INTERVAL;
}

function getCurrentFloor() {
    var floorSelect = document.getElementById('floorSelect');
    // Lưu ý: value "0" (tầng trệt) là falsy — không dùng if (value)
    if (floorSelect && floorSelect.value != null && String(floorSelect.value) !== '') {
        return String(floorSelect.value);
    }
    if (window.EditorCore && EditorCore.ProjectManager) {
        var ctx = EditorCore.ProjectManager.getContext();
        if (ctx && ctx.floor != null && String(ctx.floor) !== '') {
            return String(ctx.floor);
        }
    }
    return '1';
}

/** Đọc userId đang đăng nhập (localStorage). */
function getCurrentUserId() {
    try {
        if (typeof localStorage !== 'undefined') {
            var id = localStorage.getItem('userId');
            if (id) return String(id);
        }
    } catch (e) { /* ignore */ }
    if (window.EditorCore && EditorCore.ProjectManager) {
        var ctx = EditorCore.ProjectManager.getContext();
        if (ctx && ctx.userId) return String(ctx.userId);
    }
    return 'anon';
}

/** Đồng bộ ProjectManager với user / building / floor thực tế trên trang. */
function syncAutosaveProjectContext() {
    if (!window.EditorCore || !EditorCore.ProjectManager) return;
    var pm = EditorCore.ProjectManager;
    if (typeof pm.setUserId === 'function') {
        pm.setUserId(getCurrentUserId());
    }
    if (typeof pm.setBuildingId === 'function' && window.buildingId) {
        pm.setBuildingId(window.buildingId);
    }
    if (typeof pm.setFloor === 'function') {
        pm.setFloor(getCurrentFloor());
    }
}

function getAutosaveKey() {
    syncAutosaveProjectContext();
    if (window.EditorCore && EditorCore.ProjectManager && EditorCore.ProjectManager.storageNamespace) {
        return 'floorplan_autosave_' + EditorCore.ProjectManager.storageNamespace();
    }
    return 'floorplan_autosave_' + getCurrentUserId() + '_' +
        (window.buildingId || 'default') + '_' + getCurrentFloor();
}

function setAutosaveStatus(text, isError) {
    var statusEl = document.getElementById('autosaveStatus');
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.style.color = isError ? '#f87171' : '';
    statusEl.style.opacity = text ? '1' : '0.7';
}

function markAutosaveDirty() {
    if (window.editorFloorLockReadOnly) return;
    _autosaveDirty = true;
    if (_autosavePaused && window.editorMapLoadHandled && _autosavePauseReason !== 'floor-lock-readonly') {
        console.warn('[Autosave] dirty khi vẫn pause (' + _autosavePauseReason + ') — tự resume');
        _autosavePaused = false;
        _autosavePauseReason = '';
    }
    scheduleDirtyAutosave();
    if (typeof console !== 'undefined' && console.debug) {
        console.debug('[Autosave] dirty=true', {
            paused: _autosavePaused,
            key: (typeof getAutosaveKey === 'function') ? getAutosaveKey() : '?'
        });
    }
}
window.markAutosaveDirty = markAutosaveDirty;

/** Lưu nháp sớm sau khi user sửa (không đợi đủ 30s). */
function scheduleDirtyAutosave() {
    if (_autosaveDirtyTimeoutId != null) {
        clearTimeout(_autosaveDirtyTimeoutId);
        _autosaveDirtyTimeoutId = null;
    }
    if (!_autosaveStarted || _autosavePaused) return;
    _autosaveDirtyTimeoutId = setTimeout(function () {
        _autosaveDirtyTimeoutId = null;
        console.log('[Autosave] Tick sớm sau chỉnh sửa');
        runAutoSaveTick();
    }, AUTOSAVE_DIRTY_DELAY);
    setAutosaveStatus('Có thay đổi — sẽ lưu nháp sau ' + (AUTOSAVE_DIRTY_DELAY / 1000) + 's...', false);
}

function buildAutosaveSnapshot() {
    if (typeof getMapSnapshot !== 'function') {
        throw new Error('getMapSnapshot chưa sẵn sàng');
    }
    var snapshot = getMapSnapshot();
    snapshot.autosaveAt = new Date().toISOString();
    snapshot.userId = getCurrentUserId();
    snapshot.buildingId = window.buildingId || 'default';
    snapshot.floor = getCurrentFloor();
    return snapshot;
}

function writeAutosaveSnapshot(snapshot) {
    var key = getAutosaveKey();
    var json = JSON.stringify(snapshot);
    try {
        localStorage.setItem(key, json);
        return { ok: true, bytes: json.length };
    } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)))) {
            var keptUrl = (snapshot && snapshot.bgLastPersistedUrl) || '';
            if (!keptUrl && snapshot && snapshot.bgImageBase64 &&
                typeof snapshot.bgImageBase64 === 'string' &&
                snapshot.bgImageBase64.indexOf('/uploads/') === 0) {
                keptUrl = snapshot.bgImageBase64;
            }
            var lite = Object.assign({}, snapshot, {
                bgImageBase64: keptUrl,
                autosaveBgStripped: true
            });
            try {
                var liteJson = JSON.stringify(lite);
                localStorage.setItem(key, liteJson);
                return { ok: true, strippedBg: !keptUrl, bytes: liteJson.length };
            } catch (e2) {
                return { ok: false, error: e2 };
            }
        }
        return { ok: false, error: e };
    }
}

function tryCrashRecoverySave(snapshot) {
    if (!window.EditorCore || !window.EditorCore.CrashRecovery) return;
    try {
        var uid = snapshot.userId || getCurrentUserId();
        var liteLegacy = Object.assign({}, snapshot, { bgImageBase64: '' });
        var packed = window.EditorCore.CrashRecovery.buildSnapshot(liteLegacy, {
            buildingId: snapshot.buildingId,
            floor: snapshot.floor,
            userId: uid
        });
        packed.userId = uid;
        window.EditorCore.CrashRecovery.saveSession(
            snapshot.buildingId,
            snapshot.floor,
            packed,
            uid
        );
    } catch (e) {
        console.warn('[Autosave] CrashRecovery bỏ qua:', e && e.message ? e.message : e);
    }
}

function formatTime(d) {
    return d.getHours().toString().padStart(2, '0') + ':' +
        d.getMinutes().toString().padStart(2, '0') + ':' +
        d.getSeconds().toString().padStart(2, '0');
}

function runAutoSaveTick() {
    try {
        if (_autosavePaused) {
            console.log('[Autosave] Tạm dừng (' + (_autosavePauseReason || '?') + ') — bỏ qua tick');
            return;
        }
        // Không có thay đổi → không ghi lại (tránh spam localStorage)
        if (!_autosaveDirty) {
            if (_autosaveLastOkAt) {
                setAutosaveStatus('Nháp ổn định · lần lưu ' + formatTime(_autosaveLastOkAt), false);
            }
            return;
        }

        var snapshot = buildAutosaveSnapshot();
        tryCrashRecoverySave(snapshot);

        var result = writeAutosaveSnapshot(snapshot);
        if (!result.ok) {
            throw result.error || new Error('Không ghi được localStorage');
        }

        _autosaveDirty = false;
        _autosaveLastOkAt = new Date();
        _autosaveLastError = null;

        var msg = 'Đã lưu nháp: ' + formatTime(_autosaveLastOkAt);
        if (result.strippedBg) msg += ' (bỏ ảnh nền — quá lớn)';
        setAutosaveStatus(msg, false);
        console.log('[Autosave] OK', getAutosaveKey(), result.bytes != null ? (result.bytes + ' bytes') : '');
        if (typeof scheduleDraftServerSync === 'function') scheduleDraftServerSync();
    } catch (e) {
        _autosaveLastError = e;
        console.error('[Autosave] Lỗi:', e);
        setAutosaveStatus('Lỗi lưu nháp: ' + (e.message || e), true);
    }
}

function pauseAutoSave(reason) {
    _autosavePaused = true;
    _autosavePauseReason = reason || '';
    if (_autosaveDirtyTimeoutId != null) {
        clearTimeout(_autosaveDirtyTimeoutId);
        _autosaveDirtyTimeoutId = null;
    }
    console.log('[Autosave] Pause', _autosavePauseReason);
}

function resumeAutoSave(opts) {
    opts = opts || {};
    _autosavePaused = false;
    _autosavePauseReason = '';
    if (opts.clean) _autosaveDirty = false;
    console.log('[Autosave] Resume', opts.clean ? '(clean — chờ user sửa)' : '');
}

function stopAutoSave() {
    if (_autosaveFirstTimeoutId != null) {
        clearTimeout(_autosaveFirstTimeoutId);
        _autosaveFirstTimeoutId = null;
    }
    if (_autosaveTimerId != null) {
        clearInterval(_autosaveTimerId);
        _autosaveTimerId = null;
    }
    if (_autosaveDirtyTimeoutId != null) {
        clearTimeout(_autosaveDirtyTimeoutId);
        _autosaveDirtyTimeoutId = null;
    }
    _autosaveStarted = false;
    _autosaveKeyStarted = null;
}

/**
 * @param {boolean} [forceRestart]
 * @param {{cleanStart?: boolean}} [options]
 *   cleanStart: không đánh dirty — tránh ghi đè nháp bằng bản server ngay sau F5
 */
function startAutoSave(forceRestart, options) {
    options = options || {};
    if (window.editorFloorLockReadOnly) {
        pauseAutoSave('floor-lock-readonly');
        return;
    }
    syncAutosaveProjectContext();
    var key = getAutosaveKey();

    // Đã chạy đúng key → giữ timer, không restart (tránh race editor.js ↔ initEditor)
    if (_autosaveStarted && !forceRestart && _autosaveKeyStarted === key) {
        console.log('[Autosave] Đã chạy — giữ timer. Key:', key);
        if (options.cleanStart) _autosaveDirty = false;
        // Quan trọng: start = không còn pause
        _autosavePaused = false;
        _autosavePauseReason = '';
        return;
    }

    stopAutoSave();
    _autosaveStarted = true;
    _autosaveKeyStarted = key;
    _autosavePaused = false;
    _autosavePauseReason = '';
    // Mặc định clean khi vừa load xong; chỉ dirty khi user sửa (saveState → markAutosaveDirty)
    _autosaveDirty = !options.cleanStart;

    if (!window.buildingId) {
        console.warn('[Autosave] Chưa có buildingId — dùng khóa mặc định.');
    }

    var intervalMs = getAutosaveIntervalMs();
    console.log('[Autosave] Bật — lần đầu sau ' + (AUTOSAVE_FIRST_DELAY / 1000) +
        's, sau đó mỗi ' + (intervalMs / 1000) + 's (chỉ khi có thay đổi). Key:', key,
        options.cleanStart ? '[cleanStart]' : '',
        'paused=', _autosavePaused);

    setAutosaveStatus(options.cleanStart
        ? 'Tự lưu nháp: sẵn sàng (chờ chỉnh sửa)'
        : 'Tự lưu nháp: chờ lần đầu...', false);

    _autosaveFirstTimeoutId = setTimeout(function () {
        _autosaveFirstTimeoutId = null;
        runAutoSaveTick();
        _autosaveTimerId = setInterval(runAutoSaveTick, intervalMs);
    }, AUTOSAVE_FIRST_DELAY);
}

function contentFingerprint(data) {
    if (!data) return '';
    try {
        return JSON.stringify({
            rooms: data.rooms || [],
            walls: data.walls || [],
            lines: data.lines || [],
            doors: data.doors || [],
            pois: data.pois || [],
            pathNodes: data.pathNodes || [],
            pathEdges: data.pathEdges || [],
            qrs: data.qrs || [],
            blocks: data.blocks || [],
            blockInserts: data.blockInserts || [],
            dimensions: data.dimensions || [],
            advancedFeatures: data.advancedFeatures || {},
            // WE6: fingerprint gồm nền — tránh bỏ qua restore khi chỉ đổi ảnh nền
            bg: data.bgImageBase64 || data.background_image || '',
            ltScale: data.ltScale != null ? data.ltScale : 1
        });
    } catch (e) {
        return '';
    }
}

function getCanvasContentFingerprint() {
    return contentFingerprint({
        rooms: typeof rooms !== 'undefined' ? rooms : [],
        walls: typeof walls !== 'undefined' ? walls : [],
        lines: typeof lines !== 'undefined' ? lines : [],
        doors: typeof doors !== 'undefined' ? doors : [],
        pois: typeof pois !== 'undefined' ? pois : [],
        pathNodes: typeof pathNodes !== 'undefined' ? pathNodes : [],
        pathEdges: typeof pathEdges !== 'undefined' ? pathEdges : [],
        qrs: typeof qrs !== 'undefined' ? qrs : [],
        blocks: typeof blocks !== 'undefined' ? blocks : [],
        blockInserts: typeof blockInserts !== 'undefined' ? blockInserts : [],
        dimensions: typeof dimensions !== 'undefined' ? dimensions : [],
        advancedFeatures: (typeof window !== 'undefined' && window.editorAdvanced)
            ? window.editorAdvanced : {},
        bgImageBase64: (typeof window !== 'undefined' && window.bgImageBase64) ? window.bgImageBase64 : '',
        ltScale: (typeof getLtScale === 'function') ? getLtScale() : ((typeof window !== 'undefined' && window.ltScale != null) ? window.ltScale : 1)
    });
}

/** Ghi nháp ngay (không đợi dirty delay) — dùng sau Block/Insert. */
function flushAutosaveNow() {
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
    if (_autosaveDirtyTimeoutId != null) {
        clearTimeout(_autosaveDirtyTimeoutId);
        _autosaveDirtyTimeoutId = null;
    }
    _autosaveDirty = true;
    if (_autosavePaused) {
        console.warn('[Autosave] flush bỏ qua — đang pause:', _autosavePauseReason);
        return false;
    }
    runAutoSaveTick();
    return true;
}
window.flushAutosaveNow = flushAutosaveNow;

function readAutosaveRaw() {
    syncAutosaveProjectContext();
    var uid = getCurrentUserId();
    var primaryKey = getAutosaveKey();
    var currentFloor = getCurrentFloor();
    var savedData = null;
    var foundKey = null;

    try {
        savedData = localStorage.getItem(primaryKey);
        if (savedData) foundKey = primaryKey;
    } catch (e) { /* ignore */ }

    /**
     * Legacy ONLY for tầng trệt: trước đây "0" falsy → nháp tầng 0 từng ghi nhầm key *_1.
     * KHÔNG lấy nháp tầng khác (vd. *_0 khi đang ở tầng 1) — gây hiện bản tầng trệt trên tầng 1.
     */
    if (!savedData && currentFloor === '0') {
        var bid = window.buildingId || 'default';
        var legacyCandidates = [
            'floorplan_autosave_' + uid + '_' + bid + '_1',
            'floorplan_autosave_anon_' + bid + '_0',
            'floorplan_autosave_anon_' + bid + '_1'
        ];
        for (var c = 0; c < legacyCandidates.length; c++) {
            try {
                var raw = localStorage.getItem(legacyCandidates[c]);
                if (!raw) continue;
                var parsed = JSON.parse(raw);
                // Chỉ nhận nếu nháp thuộc tầng 0 (hoặc thiếu floor = legacy tầng trệt)
                var draftFloor = parsed && parsed.floor != null ? String(parsed.floor) : '0';
                if (draftFloor !== '0') continue;
                savedData = raw;
                foundKey = legacyCandidates[c];
                console.warn('[Autosave] Legacy nháp tầng 0 từ key:', foundKey);
                break;
            } catch (e3) { /* ignore */ }
        }
    }

    if (!savedData) {
        if (window.EditorCore && EditorCore.CrashRecovery && EditorCore.CrashRecovery.loadSession) {
            var crashRes = EditorCore.CrashRecovery.loadSession(
                window.buildingId || 'default',
                currentFloor,
                uid
            );
            if (crashRes && crashRes.ok && crashRes.data && crashRes.data.legacy) {
                var crashUser = crashRes.data.userId || (crashRes.data.legacy && crashRes.data.legacy.userId);
                var crashFloor = crashRes.data.floor != null
                    ? String(crashRes.data.floor)
                    : (crashRes.data.legacy.floor != null ? String(crashRes.data.legacy.floor) : currentFloor);
                if ((!crashUser || String(crashUser) === String(uid)) && crashFloor === currentFloor) {
                    savedData = JSON.stringify(Object.assign({}, crashRes.data.legacy, {
                        autosaveAt: crashRes.data.savedAt || null,
                        userId: uid,
                        buildingId: crashRes.data.buildingId,
                        floor: currentFloor
                    }));
                    foundKey = 'CrashRecovery';
                }
            }
        }
    }

    // Chỉ migrate khi nháp đúng tầng hiện tại (tránh copy geometry tầng 0 → key tầng 1)
    if (savedData && foundKey && foundKey !== primaryKey && foundKey !== 'CrashRecovery') {
        try {
            var migrateParsed = JSON.parse(savedData);
            var migrateFloor = migrateParsed && migrateParsed.floor != null
                ? String(migrateParsed.floor)
                : currentFloor;
            if (migrateFloor === currentFloor) {
                localStorage.setItem(primaryKey, savedData);
                console.log('[Autosave] Đã migrate nháp', foundKey, '→', primaryKey);
            } else {
                console.warn('[Autosave] Bỏ migrate — nháp tầng', migrateFloor, '≠', currentFloor);
                savedData = null;
                foundKey = null;
            }
        } catch (e4) {
            console.warn('[Autosave] Migrate thất bại:', e4);
        }
    }

    return savedData;
}

/**
 * Khôi phục nháp local sau F5 / load server.
 * Mặc định tự restore khi nháp khác canvas (không hỏi confirm — tránh mất việc).
 * @param {{serverLoaded?: boolean, askConfirm?: boolean}} [opts]
 * @returns {boolean} true nếu đã apply nháp
 */
function checkAutoSave(opts) {
    opts = opts || {};
    var uid = getCurrentUserId();
    var savedData = readAutosaveRaw();
    if (!savedData) {
        console.log('[Autosave] Không có nháp local cho key', getAutosaveKey());
        return false;
    }

    try {
        var data = JSON.parse(savedData);
        if (data.userId && String(data.userId) !== String(uid) && uid !== 'anon') {
            console.warn('[Autosave] Bỏ qua nháp của user khác:', data.userId);
            return false;
        }

        // WHY: Không bao giờ apply nháp của tầng khác lên canvas tầng đang mở
        var currentFloor = getCurrentFloor();
        if (data.floor != null && String(data.floor) !== String(currentFloor)) {
            console.warn('[Autosave] Bỏ qua nháp tầng', data.floor, '— đang ở tầng', currentFloor);
            return false;
        }

        var draftFp = contentFingerprint(data);
        var canvasFp = getCanvasContentFingerprint();
        var draftHasBlocks = (data.blocks && data.blocks.length) || (data.blockInserts && data.blockInserts.length);
        var canvasHasBlocks = (typeof blockInserts !== 'undefined' && blockInserts.length)
            || (typeof blocks !== 'undefined' && blocks.length);
        var draftHasDims = data.dimensions && data.dimensions.length;
        var canvasHasDims = typeof dimensions !== 'undefined' && dimensions.length;
        var draftBg = data.bgImageBase64 || data.background_image || '';
        var canvasBg = (typeof window !== 'undefined' && window.bgImageBase64) ? window.bgImageBase64 : '';
        // Nếu nháp có Block/Insert/Dim/ảnh nền mà canvas không → luôn khôi phục (tránh mất sau F5)
        var forceBlockRestore = !!(draftHasBlocks && !canvasHasBlocks)
            || !!(draftHasDims && !canvasHasDims)
            || !!(draftBg && !canvasBg);
        if (draftFp && draftFp === canvasFp && !forceBlockRestore) {
            console.log('[Autosave] Nháp trùng bản đang mở — không cần khôi phục');
            return false;
        }

        var mapName = data.mapName || 'không tên';
        var savedAt = data.autosaveAt
            ? new Date(data.autosaveAt).toLocaleString()
            : 'không rõ thời gian';

        var shouldRestore = true;
        if (opts.askConfirm) {
            var msg = opts.serverLoaded
                ? ('💾 Có bản nháp trên máy ("' + mapName + '", tầng ' + getCurrentFloor() + ').\n' +
                    'Lưu lúc: ' + savedAt + '\n\nKhôi phục nháp (chưa xuất bản)?')
                : ('💾 Tìm thấy nháp "' + mapName + '" (' + savedAt + '). Khôi phục?');
            shouldRestore = confirm(msg);
        }

        if (!shouldRestore) {
            console.log('[Autosave] User giữ bản server — giữ nguyên nháp local (không ghi đè)');
            return false;
        }

        if (typeof applyMapSnapshot !== 'function') {
            console.error('[Autosave] applyMapSnapshot không có');
            return false;
        }

        applyMapSnapshot(data);
        _autosaveDirty = false;
        console.log('[Autosave] Đã tự khôi phục nháp', uid, getAutosaveKey(), savedAt);
        setAutosaveStatus('Đã khôi phục nháp: ' + savedAt, false);
        if (typeof showToast === 'function') {
            showToast('Đã khôi phục nháp lúc ' + savedAt + ' (chưa xuất bản lên server)', 'success');
        }
        return true;
    } catch (e) {
        console.error('[Autosave] Lỗi đọc nháp:', e);
        return false;
    }
}

function clearAutoSave() {
    syncAutosaveProjectContext();
    var uid = getCurrentUserId();
    localStorage.removeItem(getAutosaveKey());
    if (window.EditorCore && window.EditorCore.CrashRecovery) {
        window.EditorCore.CrashRecovery.clearSession(
            window.buildingId || 'default',
            getCurrentFloor(),
            uid
        );
    }
    _autosaveDirty = false;
    setAutosaveStatus('', false);
}

window.startAutoSave = startAutoSave;
window.stopAutoSave = stopAutoSave;
window.pauseAutoSave = pauseAutoSave;
window.resumeAutoSave = resumeAutoSave;
window.checkAutoSave = checkAutoSave;
window.clearAutoSave = clearAutoSave;
window.runAutoSaveTick = runAutoSaveTick;
window.getAutosaveKey = getAutosaveKey;
window.markAutosaveDirty = markAutosaveDirty;

/** Gõ trong Console: debugAutosave() — xem trạng thái + mọi key nháp. */
function debugAutosave() {
    syncAutosaveProjectContext();
    var key = getAutosaveKey();
    var keys = [];
    var totalBytes = 0;
    try {
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf('floorplan_autosave_') === 0) {
                var v = localStorage.getItem(k) || '';
                keys.push({ key: k, bytes: v.length, isCurrent: k === key });
                totalBytes += v.length;
            }
        }
    } catch (e) {
        keys.push({ error: String(e) });
    }
    var report = {
        key: key,
        started: _autosaveStarted,
        paused: _autosavePaused,
        pauseReason: _autosavePauseReason,
        dirty: _autosaveDirty,
        lastOkAt: _autosaveLastOkAt,
        lastError: _autosaveLastError && (_autosaveLastError.message || String(_autosaveLastError)),
        floor: getCurrentFloor(),
        userId: getCurrentUserId(),
        buildingId: window.buildingId || null,
        editorMapLoadHandled: !!window.editorMapLoadHandled,
        draftKeys: keys,
        totalDraftBytes: totalBytes,
        currentDraftExists: !!localStorage.getItem(key)
    };
    console.log('[Autosave] debugAutosave()', report);
    return report;
}
window.debugAutosave = debugAutosave;
