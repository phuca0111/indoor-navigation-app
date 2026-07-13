// ============================================================
// CRASH-RECOVERY.JS — Snapshot Document / autosave an toàn (§5.21)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.CrashRecovery = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STORAGE_PREFIX = 'wme_crash_';
    var MAX_BYTES = 4 * 1024 * 1024;

    function buildKey(buildingId, floor, userId) {
        var uid = (userId != null && String(userId).trim() !== '') ? String(userId) : 'anon';
        // floor "0" hợp lệ — không dùng || vì 0/falsy sẽ thành '1'
        var fl = (floor != null && String(floor) !== '') ? String(floor) : '0';
        return STORAGE_PREFIX + uid + '_' + (buildingId || 'default') + '_' + fl;
    }

    function safeStringify(data) {
        try {
            var json = JSON.stringify(data);
            if (json.length > MAX_BYTES) {
                return { ok: false, error: 'payload_too_large', size: json.length };
            }
            return { ok: true, json: json };
        } catch (e) {
            return { ok: false, error: 'stringify_failed', message: e.message };
        }
    }

    function buildSnapshot(legacySnapshot, meta) {
        meta = meta || {};
        var g = typeof globalThis !== 'undefined' ? globalThis : this;
        var doc = null;
        if (g.EditorCore && g.EditorCore.Document && typeof g.EditorCore.Document.toJSON === 'function') {
            try {
                doc = g.EditorCore.Document.toJSON();
            } catch (e) { /* legacy only */ }
        }
        return {
            version: 1,
            savedAt: new Date().toISOString(),
            buildingId: meta.buildingId || 'default',
            floor: meta.floor || '1',
            document: doc,
            legacy: legacySnapshot || null
        };
    }

    function saveSession(buildingId, floor, payload, userId) {
        if (typeof localStorage === 'undefined') return { ok: false, error: 'no_storage' };
        var uid = userId || (payload && payload.userId) || null;
        var packed = safeStringify(payload);
        if (!packed.ok) return packed;
        try {
            var key = buildKey(buildingId, floor, uid);
            localStorage.setItem(key, packed.json);
            return { ok: true, key: key };
        } catch (e) {
            return { ok: false, error: 'storage_write_failed', message: e.message };
        }
    }

    function loadSession(buildingId, floor, userId) {
        if (typeof localStorage === 'undefined') return { ok: false, error: 'no_storage' };
        var raw = localStorage.getItem(buildKey(buildingId, floor, userId));
        if (!raw) return { ok: false, error: 'not_found' };
        try {
            var data = JSON.parse(raw);
            if (!data || typeof data !== 'object') {
                return { ok: false, error: 'corrupt', raw: raw.slice(0, 200) };
            }
            return { ok: true, data: data };
        } catch (e) {
            return { ok: false, error: 'parse_failed', message: e.message };
        }
    }

    function clearSession(buildingId, floor, userId) {
        if (typeof localStorage === 'undefined') return;
        localStorage.removeItem(buildKey(buildingId, floor, userId));
    }

    function restoreDocument(data) {
        if (!data || !data.document) return false;
        var g = typeof globalThis !== 'undefined' ? globalThis : this;
        if (g.EditorCore && g.EditorCore.Document &&
            typeof g.EditorCore.Document.fromJSON === 'function') {
            g.EditorCore.Document.fromJSON(data.document);
            return true;
        }
        return false;
    }

    return {
        STORAGE_PREFIX: STORAGE_PREFIX,
        buildKey: buildKey,
        buildSnapshot: buildSnapshot,
        saveSession: saveSession,
        loadSession: loadSession,
        clearSession: clearSession,
        restoreDocument: restoreDocument,
        safeStringify: safeStringify
    };
});
