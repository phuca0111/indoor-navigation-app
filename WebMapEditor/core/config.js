// ============================================================
// CONFIG.JS — Cấu hình editor (Phase 0 skeleton)
// Nguồn: config/editor.json — default nhúng cho load đồng bộ
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.Config = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var DEFAULT_CONFIG = {
        grid: { size: 40, visible: true },
        snap: {
            gridEnabled: false,
            edgeEnabled: false,
            gridTolerancePx: 10,
            roomEdgeThresholdPx: 24
        },
        zoom: { min: 0.1, max: 5 },
        autosave: { intervalMs: 30000 },
        ui: {
            handleSize: 8,
            poiRadius: 12,
            nodeRadius: 8,
            qrSize: 14,
            dimVisible: true
        },
        ruler: { defaultMode: 'measure' },
        scale: {
            ratio: 0.5,
            locked: true,
            hint: '1 ô lưới (40px) = 0.5m — chuẩn dự án indoor nav'
        },
        performance: { spatialIndexThreshold: 200 }
    };

    var state = deepClone(DEFAULT_CONFIG);

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function deepMerge(target, source) {
        if (!source || typeof source !== 'object') return target;
        Object.keys(source).forEach(function (key) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key] || typeof target[key] !== 'object') target[key] = {};
                deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        });
        return target;
    }

    function get(path, fallback) {
        if (!path) return state;
        var parts = String(path).split('.');
        var cur = state;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null || typeof cur !== 'object') return fallback;
            cur = cur[parts[i]];
        }
        return cur === undefined ? fallback : cur;
    }

    function applyToCheckboxes() {
        if (typeof document === 'undefined') return;
        var gridCheck = document.getElementById('gridCheck');
        var snapCheck = document.getElementById('snapCheck');
        var edgeSnapCheck = document.getElementById('edgeSnapCheck');
        var dimCheck = document.getElementById('dimCheck');
        if (gridCheck) gridCheck.checked = !!get('grid.visible', true);
        if (snapCheck) snapCheck.checked = !!get('snap.gridEnabled', false);
        if (edgeSnapCheck) edgeSnapCheck.checked = !!get('snap.edgeEnabled', false);
        if (dimCheck) dimCheck.checked = !!get('ui.dimVisible', true);
        var rulerModeSel = document.getElementById('rulerModeSelect');
        if (rulerModeSel) rulerModeSel.value = get('ruler.defaultMode', 'measure');
    }

    return {
        DEFAULT_CONFIG: DEFAULT_CONFIG,

        reset: function () {
            state = deepClone(DEFAULT_CONFIG);
        },

        merge: function (partial) {
            deepMerge(state, partial || {});
            return state;
        },

        get: get,

        getAll: function () {
            return deepClone(state);
        },

        init: function (overrides) {
            state = deepClone(DEFAULT_CONFIG);
            if (overrides) deepMerge(state, overrides);
            applyToCheckboxes();
            return state;
        },

        loadFromUrl: function (url) {
            if (typeof fetch === 'undefined') return Promise.resolve(state);
            return fetch(url)
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (json) {
                    if (json) {
                        deepMerge(state, json);
                        applyToCheckboxes();
                    }
                    return state;
                })
                .catch(function () { return state; });
        }
    };
});
