// ============================================================
// PROJECT-MANAGER.JS — Hierarchy context (Phase 0.5 skeleton)
// Organization → Project → Building → Floor → Version → Document
// Spec: webedit_nangcap.md §5.7
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

    var rootRef = typeof globalThis !== 'undefined' ? globalThis : this;
    var currentContext = null;

    function normalizeFloor(floor) {
        if (floor === null || floor === undefined || floor === '') return '0';
        return String(floor);
    }

    function normalizeVersion(version) {
        if (version === null || version === undefined || version === '') return 'draft';
        return String(version);
    }

    /**
     * @param {URLSearchParams|string|object} input
     * @returns {object}
     */
    function parseFromSearchParams(input) {
        var params = input;
        if (typeof input === 'string') {
            params = new URLSearchParams(input.charAt(0) === '?' ? input.slice(1) : input);
        } else if (input && typeof input === 'object' && !(input instanceof URLSearchParams)) {
            return resolveContext(input);
        }

        var get = function (key, alt) {
            if (!params || typeof params.get !== 'function') return null;
            return params.get(key) || (alt ? params.get(alt) : null);
        };

        return resolveContext({
            orgId: get('orgId') || get('organizationId') || null,
            projectId: get('projectId') || null,
            buildingId: get('buildingId') || get('building') || null,
            floor: normalizeFloor(get('floor')),
            version: normalizeVersion(get('version') || get('mapVersion'))
        });
    }

    function buildDocumentId(ctx) {
        ctx = ctx || currentContext;
        if (!ctx) return null;
        var parts = [];
        if (ctx.orgId) parts.push('org:' + ctx.orgId);
        if (ctx.projectId) parts.push('proj:' + ctx.projectId);
        if (ctx.buildingId) parts.push('bld:' + ctx.buildingId);
        parts.push('floor:' + normalizeFloor(ctx.floor));
        parts.push('ver:' + normalizeVersion(ctx.version));
        return parts.join('/');
    }

    /**
     * @param {object} partial
     * @returns {object}
     */
    function resolveContext(partial) {
        partial = partial || {};
        var ctx = {
            orgId: partial.orgId || null,
            projectId: partial.projectId || null,
            buildingId: partial.buildingId || null,
            floor: normalizeFloor(partial.floor),
            version: normalizeVersion(partial.version),
            documentId: null
        };
        ctx.documentId = buildDocumentId(ctx);
        currentContext = ctx;
        if (typeof rootRef !== 'undefined') {
            if (ctx.buildingId) rootRef.buildingId = ctx.buildingId;
            rootRef.editorProjectContext = ctx;
        }
        if (rootRef.EditorCore && rootRef.EditorCore.eventBus) {
            rootRef.EditorCore.eventBus.emit('PROJECT_CONTEXT_RESOLVED', { context: ctx });
        }
        return ctx;
    }

    function getContext() {
        return currentContext ? Object.assign({}, currentContext) : null;
    }

    function setContext(ctx) {
        if (!ctx) {
            currentContext = null;
            return null;
        }
        return resolveContext(ctx);
    }

    function syncFromWindowLocation(loc) {
        loc = loc || (typeof window !== 'undefined' ? window.location : null);
        if (!loc || !loc.search) {
            return resolveContext({ floor: '0', version: 'draft' });
        }
        return parseFromSearchParams(loc.search);
    }

    function updateFloor(floor) {
        if (!currentContext) {
            return resolveContext({ floor: floor, version: 'draft' });
        }
        currentContext.floor = normalizeFloor(floor);
        currentContext.documentId = buildDocumentId(currentContext);
        if (rootRef.EditorCore && rootRef.EditorCore.eventBus) {
            rootRef.EditorCore.eventBus.emit('PROJECT_CONTEXT_FLOOR_CHANGED', {
                context: getContext()
            });
        }
        return getContext();
    }

    function updateVersion(version) {
        if (!currentContext) return null;
        currentContext.version = normalizeVersion(version);
        currentContext.documentId = buildDocumentId(currentContext);
        return getContext();
    }

    function getAutosaveKey() {
        var ctx = currentContext;
        if (!ctx || !ctx.buildingId) return null;
        return 'floorplan_autosave_' + ctx.buildingId + '_' + normalizeFloor(ctx.floor);
    }

    function getMapApiPath(baseApiUrl) {
        var ctx = currentContext;
        var base = baseApiUrl || '/api';
        if (!ctx || !ctx.buildingId) return null;
        return base + '/maps/' + encodeURIComponent(ctx.buildingId) + '/' + encodeURIComponent(ctx.floor);
    }

    function toQueryString(ctx) {
        ctx = ctx || currentContext;
        if (!ctx) return '';
        var q = new URLSearchParams();
        if (ctx.orgId) q.set('orgId', ctx.orgId);
        if (ctx.projectId) q.set('projectId', ctx.projectId);
        if (ctx.buildingId) q.set('buildingId', ctx.buildingId);
        q.set('floor', normalizeFloor(ctx.floor));
        q.set('version', normalizeVersion(ctx.version));
        return q.toString();
    }

    return {
        parseFromSearchParams: parseFromSearchParams,
        resolveContext: resolveContext,
        getContext: getContext,
        setContext: setContext,
        syncFromWindowLocation: syncFromWindowLocation,
        updateFloor: updateFloor,
        updateVersion: updateVersion,
        buildDocumentId: buildDocumentId,
        getAutosaveKey: getAutosaveKey,
        getMapApiPath: getMapApiPath,
        toQueryString: toQueryString
    };
});
