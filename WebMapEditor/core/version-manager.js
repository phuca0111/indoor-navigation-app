// ============================================================
// VERSION-MANAGER.JS — Draft / Published / Archived UX (Phase 0.5 skeleton)
// Publish & rollback luôn qua API Backend — spec webedit_nangcap.md §5.8, §17.4
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.VersionManager = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var rootRef = typeof globalThis !== 'undefined' ? globalThis : this;

    var STATUS = {
        DRAFT: 'draft',
        PUBLISHED: 'published',
        ARCHIVED: 'archived'
    };

    var state = {
        status: STATUS.DRAFT,
        serverVersion: null,
        forkedFromVersion: null,
        isDirty: false
    };

    function emitChanged() {
        if (rootRef.EditorCore && rootRef.EditorCore.eventBus) {
            rootRef.EditorCore.eventBus.emit('VERSION_STATE_CHANGED', {
                state: getState()
            });
        }
    }

    function normalizeStatus(input) {
        if (!input) return STATUS.DRAFT;
        var s = String(input).toLowerCase();
        if (s === STATUS.PUBLISHED || s === 'publish') return STATUS.PUBLISHED;
        if (s === STATUS.ARCHIVED || s === 'archive') return STATUS.ARCHIVED;
        return STATUS.DRAFT;
    }

    function parseServerVersion(input) {
        if (input === null || input === undefined || input === '') return null;
        var n = Number(input);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function reset() {
        state = {
            status: STATUS.DRAFT,
            serverVersion: null,
            forkedFromVersion: null,
            isDirty: false
        };
        emitChanged();
        return getState();
    }

    function getState() {
        return {
            status: state.status,
            serverVersion: state.serverVersion,
            forkedFromVersion: state.forkedFromVersion,
            isDirty: state.isDirty
        };
    }

    function setState(partial) {
        partial = partial || {};
        if (partial.status !== undefined) {
            state.status = normalizeStatus(partial.status);
        }
        if (partial.serverVersion !== undefined) {
            state.serverVersion = parseServerVersion(partial.serverVersion);
        }
        if (partial.forkedFromVersion !== undefined) {
            state.forkedFromVersion = parseServerVersion(partial.forkedFromVersion);
        }
        if (partial.isDirty !== undefined) {
            state.isDirty = !!partial.isDirty;
        }
        emitChanged();
        return getState();
    }

    /**
     * Sau khi load map từ server (hoặc 404 — tầng trống).
     * @param {number|null|undefined} serverVersion — Floor.version từ API
     */
    function applyServerLoad(serverVersion) {
        var ver = parseServerVersion(serverVersion);
        if (ver === null) {
            return setState({
                status: STATUS.DRAFT,
                serverVersion: null,
                forkedFromVersion: null,
                isDirty: false
            });
        }
        return setState({
            status: STATUS.PUBLISHED,
            serverVersion: ver,
            forkedFromVersion: null,
            isDirty: false
        });
    }

    /**
     * Sau POST .../publish thành công.
     * @param {number} serverVersion
     */
    function applyPublishSuccess(serverVersion) {
        var ver = parseServerVersion(serverVersion);
        if (ver === null) return getState();
        if (rootRef.EditorCore && rootRef.EditorCore.ProjectManager) {
            rootRef.EditorCore.ProjectManager.updateVersion(String(ver));
        }
        return setState({
            status: STATUS.PUBLISHED,
            serverVersion: ver,
            forkedFromVersion: null,
            isDirty: false
        });
    }

    /** Bắt đầu chỉnh sửa trên bản đã publish → fork draft local. */
    function beginDraftFork() {
        if (state.status !== STATUS.PUBLISHED || state.serverVersion === null) {
            return setState({ status: STATUS.DRAFT, isDirty: true });
        }
        return setState({
            status: STATUS.DRAFT,
            forkedFromVersion: state.serverVersion,
            isDirty: true
        });
    }

    function markDirty() {
        if (!state.isDirty) {
            state.isDirty = true;
            if (state.status === STATUS.PUBLISHED && state.forkedFromVersion === null) {
                state.forkedFromVersion = state.serverVersion;
                state.status = STATUS.DRAFT;
            }
            emitChanged();
        }
        return getState();
    }

    function isEditingDraft() {
        return state.status === STATUS.DRAFT || state.isDirty || state.forkedFromVersion !== null;
    }

    function getDisplayLabel() {
        if (state.status === STATUS.PUBLISHED && state.serverVersion !== null && !state.isDirty) {
            return 'v' + state.serverVersion + ' (Published)';
        }
        if (state.forkedFromVersion !== null) {
            return 'Draft (fork từ v' + state.forkedFromVersion + ')';
        }
        if (state.serverVersion !== null && state.isDirty) {
            return 'Draft (chưa publish)';
        }
        return 'Draft';
    }

    function syncFromProjectManager() {
        if (!rootRef.EditorCore || !rootRef.EditorCore.ProjectManager) return getState();
        var ctx = rootRef.EditorCore.ProjectManager.getContext();
        if (!ctx || !ctx.version) return getState();
        var v = String(ctx.version).toLowerCase();
        if (v === 'draft') {
            return setState({ status: STATUS.DRAFT });
        }
        var num = parseServerVersion(ctx.version);
        if (num !== null) {
            return setState({ status: STATUS.PUBLISHED, serverVersion: num });
        }
        return getState();
    }

    function getVersionsListUrl(buildingId, floor, baseApiUrl) {
        var ctx = rootRef.EditorCore && rootRef.EditorCore.ProjectManager
            ? rootRef.EditorCore.ProjectManager.getContext()
            : null;
        var bId = buildingId || (ctx && ctx.buildingId);
        var fl = floor != null ? floor : (ctx && ctx.floor);
        if (!bId || fl == null) return null;
        var base = baseApiUrl || '/api';
        return base + '/map-versions/' + encodeURIComponent(bId) + '/' + encodeURIComponent(fl);
    }

    function getRollbackUrl(buildingId, floor, version, baseApiUrl) {
        var list = getVersionsListUrl(buildingId, floor, baseApiUrl);
        if (!list || version == null) return null;
        return list + '/' + encodeURIComponent(version) + '/rollback';
    }

    return {
        STATUS: STATUS,
        reset: reset,
        getState: getState,
        setState: setState,
        normalizeStatus: normalizeStatus,
        applyServerLoad: applyServerLoad,
        applyPublishSuccess: applyPublishSuccess,
        beginDraftFork: beginDraftFork,
        markDirty: markDirty,
        isEditingDraft: isEditingDraft,
        getDisplayLabel: getDisplayLabel,
        syncFromProjectManager: syncFromProjectManager,
        getVersionsListUrl: getVersionsListUrl,
        getRollbackUrl: getRollbackUrl
    };
});
