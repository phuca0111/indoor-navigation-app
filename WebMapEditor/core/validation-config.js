// ============================================================
// VALIDATION-CONFIG.JS — config/validation.json (Phase 0)
// rules: enabled, severity (error | warning)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.ValidationConfig = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var DEFAULT_RULES = {
        MAP_DATA_MISSING: { enabled: true, severity: 'error' },
        SCALE_INVALID: { enabled: true, severity: 'error' },
        DUPLICATE_ROOM_ID: { enabled: true, severity: 'error' },
        DUPLICATE_DOOR_ID: { enabled: true, severity: 'error' },
        DUPLICATE_NODE_ID: { enabled: true, severity: 'error' },
        DUPLICATE_WALL_ID: { enabled: true, severity: 'error' },
        ROOM_NOT_CLOSED: { enabled: true, severity: 'error' },
        NODE_ISOLATED: { enabled: true, severity: 'error' },
        GRAPH_DISCONNECTED: { enabled: true, severity: 'warning' },
        QR_NO_NODE: { enabled: true, severity: 'warning' },
        POI_OUTSIDE_ROOM: { enabled: true, severity: 'warning' }
    };

    var DEFAULT_THRESHOLDS = {
        polygonMinVertices: 3
    };

    var state = {
        version: 1,
        rules: deepClone(DEFAULT_RULES),
        thresholds: deepClone(DEFAULT_THRESHOLDS)
    };

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

    function normalizeRule(code, partial) {
        var base = DEFAULT_RULES[code] || { enabled: true, severity: 'error' };
        partial = partial || {};
        var severity = partial.severity === 'warning' ? 'warning' : 'error';
        if (base.severity === 'warning' && partial.severity == null) {
            severity = 'warning';
        }
        return {
            enabled: partial.enabled !== false,
            severity: partial.severity === 'warning' || partial.severity === 'error' ? partial.severity : severity
        };
    }

    function getRule(code) {
        var partial = state.rules && state.rules[code];
        return normalizeRule(code, partial);
    }

    function getThreshold(key, fallback) {
        if (state.thresholds && state.thresholds[key] != null) {
            return state.thresholds[key];
        }
        if (DEFAULT_THRESHOLDS[key] != null) return DEFAULT_THRESHOLDS[key];
        return fallback;
    }

    return {
        DEFAULT_RULES: DEFAULT_RULES,
        DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,

        reset: function () {
            state = {
                version: 1,
                rules: deepClone(DEFAULT_RULES),
                thresholds: deepClone(DEFAULT_THRESHOLDS)
            };
            return state;
        },

        merge: function (partial) {
            if (!partial) return state;
            if (partial.rules) {
                Object.keys(partial.rules).forEach(function (code) {
                    state.rules[code] = normalizeRule(code, partial.rules[code]);
                });
            }
            if (partial.thresholds) {
                deepMerge(state.thresholds, partial.thresholds);
            }
            if (partial.version != null) state.version = partial.version;
            return state;
        },

        getRule: getRule,
        getThreshold: getThreshold,

        getAll: function () {
            return deepClone(state);
        },

        loadFromUrl: function (url) {
            if (typeof fetch === 'undefined') return Promise.resolve(state);
            return fetch(url)
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (json) {
                    if (json) this.merge(json);
                    return state;
                }.bind(this))
                .catch(function () { return state; });
        }
    };
});
