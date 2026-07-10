// ============================================================
// CONFIG.JS — Load & merge cấu hình editor (Phase 0 — §5.4)
// Browser: defaults + optional fetch config/*.json
// Node/tests: defaults + merge override
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

    var DEFAULTS = {
        grid: { size: 40, visible: true },
        snap: {
            tolerancePx: 12,
            modes: {
                grid: true,
                endpoint: true,
                midpoint: true,
                intersection: true,
                perpendicular: true
            }
        },
        zoom: { min: 0.1, max: 5, step: 0.1 },
        autosave: { intervalMs: 30000 },
        units: { display: 'meters', metersPerGrid: 0.5 },
        validation: {
            rules: {
                duplicateId: { enabled: true, severity: 'error' },
                isolatedNode: { enabled: true, severity: 'error' }
            }
        },
        navigation: {
            node: { defaultRadius: 8 },
            qr: { defaultSize: 40 }
        }
    };

    var _config = null;

    function deepMerge(target, source) {
        if (!source || typeof source !== 'object') return target;
        var out = Object.assign({}, target);
        Object.keys(source).forEach(function (key) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                out[key] = deepMerge(out[key] || {}, source[key]);
            } else {
                out[key] = source[key];
            }
        });
        return out;
    }

    function getByPath(obj, path, fallback) {
        if (!path) return obj;
        var parts = String(path).split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null || typeof cur !== 'object') return fallback;
            cur = cur[parts[i]];
        }
        return cur === undefined ? fallback : cur;
    }

    function load(overrides) {
        _config = deepMerge(DEFAULTS, overrides || {});
        return _config;
    }

    function get(path, fallback) {
        if (!_config) load();
        return getByPath(_config, path, fallback);
    }

    function getAll() {
        if (!_config) load();
        return deepMerge({}, _config);
    }

    /** Fetch JSON từ config/ (cần HTTP server) */
    function loadFromUrls(urls) {
        urls = urls || {};
        var editorUrl = urls.editor || 'config/editor.json';
        var validationUrl = urls.validation || 'config/validation.json';
        var navigationUrl = urls.navigation || 'config/navigation.json';

        if (typeof fetch !== 'function') {
            load();
            return Promise.resolve(getAll());
        }

        return Promise.all([
            fetch(editorUrl).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(validationUrl).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(navigationUrl).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
        ]).then(function (parts) {
            load(deepMerge(parts[0], {
                validation: parts[1],
                navigation: parts[2]
            }));
            return getAll();
        });
    }

    /** Áp tolerance/grid lên globals legacy nếu có */
    function applyToLegacy() {
        if (!_config) load();
        if (typeof globalThis !== 'undefined') {
            var g = globalThis;
            if (g.GRID_SIZE == null && _config.grid) {
                g.GRID_SIZE = _config.grid.size;
            }
        }
        return _config;
    }

    return {
        DEFAULTS: DEFAULTS,
        load: load,
        get: get,
        getAll: getAll,
        loadFromUrls: loadFromUrls,
        applyToLegacy: applyToLegacy,
        deepMerge: deepMerge
    };
});
