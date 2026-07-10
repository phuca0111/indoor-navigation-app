// ============================================================
// PROJECT-MANAGER.JS — Ngữ cảnh dự án / user / tòa / tầng (Phase 0.5 — §5.5)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.ProjectManager = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var _context = {
        userId: null,
        projectId: null,
        buildingId: null,
        floor: '1',
        mapName: '',
        role: 'editor'
    };

    function parseQuery(search) {
        var out = {};
        if (!search) return out;
        var q = search.charAt(0) === '?' ? search.slice(1) : search;
        q.split('&').forEach(function (pair) {
            var kv = pair.split('=');
            if (kv[0]) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
        });
        return out;
    }

    function readLocalUserId() {
        try {
            if (typeof localStorage === 'undefined') return null;
            return localStorage.getItem('userId') || null;
        } catch (e) {
            return null;
        }
    }

    function resolveContext(opts) {
        opts = opts || {};
        var fromQuery = parseQuery(opts.search != null ? opts.search :
            (typeof location !== 'undefined' ? location.search : ''));
        var fromWindow = (typeof globalThis !== 'undefined') ? globalThis : {};

        _context = {
            userId: opts.userId || fromQuery.userId || fromWindow.userId || readLocalUserId() || 'anon',
            projectId: opts.projectId || fromQuery.projectId || fromWindow.projectId || null,
            buildingId: opts.buildingId || fromQuery.buildingId || fromWindow.buildingId || 'default',
            // floor "0" hợp lệ — không dùng || (falsy)
            floor: firstDefined(opts.floor, fromQuery.floor, fromWindow.currentFloor, '1'),
            mapName: opts.mapName || fromQuery.mapName || fromWindow.mapName || '',
            role: opts.role || fromQuery.role || 'editor'
        };
        return getContext();
    }

    function firstDefined() {
        for (var i = 0; i < arguments.length; i++) {
            var v = arguments[i];
            if (v != null && String(v) !== '') return String(v);
        }
        return '1';
    }

    function getContext() {
        return Object.assign({}, _context);
    }

    function setFloor(floor) {
        _context.floor = String(floor);
        return getContext();
    }

    function setBuildingId(buildingId) {
        _context.buildingId = buildingId != null && buildingId !== ''
            ? String(buildingId)
            : 'default';
        return getContext();
    }

    function setUserId(userId) {
        _context.userId = userId != null && String(userId).trim() !== ''
            ? String(userId)
            : 'anon';
        return getContext();
    }

    /** Namespace lưu trữ: userId_buildingId_floor — tách nháp theo tài khoản */
    function storageNamespace() {
        var c = getContext();
        var floor = (c.floor != null && String(c.floor) !== '') ? String(c.floor) : '1';
        return [c.userId || 'anon', c.buildingId || 'default', floor].join('_');
    }

    return {
        resolveContext: resolveContext,
        getContext: getContext,
        setFloor: setFloor,
        setBuildingId: setBuildingId,
        setUserId: setUserId,
        storageNamespace: storageNamespace,
        parseQuery: parseQuery
    };
});
