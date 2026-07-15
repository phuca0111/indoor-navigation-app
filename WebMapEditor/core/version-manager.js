// ============================================================
// VERSION-MANAGER.JS — Draft / Published / Archived (Phase 5 UX)
// Publish/rollback thật luôn qua API Backend — module này = state local + UI
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

    var STATES = ['draft', 'published', 'archived'];
    var STATE_LABEL_VI = {
        draft: 'Nháp (Draft)',
        published: 'Đã xuất bản',
        archived: 'Lưu trữ'
    };

    var _state = 'draft';
    var _revision = 0;
    var _publishedAt = null;
    var _bus = null;
    var _serverVersion = null;
    var _dirtySincePublish = false;

    function init(opts) {
        opts = opts || {};
        _bus = opts.eventBus || null;
        _state = opts.state || 'draft';
        _revision = opts.revision != null ? opts.revision : 0;
        _publishedAt = opts.publishedAt || null;
        _serverVersion = opts.serverVersion != null ? opts.serverVersion : (_revision || null);
        _dirtySincePublish = !!opts.dirtySincePublish;
    }

    function emit(name, payload) {
        if (_bus && typeof _bus.emit === 'function') _bus.emit(name, payload);
    }

    function getState() {
        return {
            state: _state,
            revision: _revision,
            publishedAt: _publishedAt,
            serverVersion: _serverVersion,
            dirtySincePublish: _dirtySincePublish,
            labelVi: STATE_LABEL_VI[_state] || _state
        };
    }

    function canTransition(to) {
        if (STATES.indexOf(to) === -1) return false;
        if (_state === 'archived') return false;
        if (_state === 'draft' && to === 'published') return true;
        if (_state === 'published' && (to === 'draft' || to === 'archived')) return true;
        if (_state === 'draft' && to === 'archived') return true;
        return false;
    }

    function transition(to) {
        if (!canTransition(to)) return { ok: false, error: 'invalid_transition', from: _state, to: to };
        var from = _state;
        _state = to;
        if (to === 'published') {
            _revision += 1;
            _publishedAt = new Date().toISOString();
            _dirtySincePublish = false;
        }
        if (to === 'draft') {
            _dirtySincePublish = true;
        }
        emit('version:changed', getState());
        return { ok: true, from: from, to: to, state: getState() };
    }

    function syncAfterPublish(serverVersion, publishedAt) {
        _state = 'published';
        if (serverVersion != null && Number.isFinite(Number(serverVersion))) {
            _revision = Number(serverVersion);
            _serverVersion = Number(serverVersion);
        } else {
            _revision += 1;
            _serverVersion = _revision;
        }
        _publishedAt = publishedAt || new Date().toISOString();
        _dirtySincePublish = false;
        emit('version:changed', getState());
        return getState();
    }

    function syncFromServer(opts) {
        opts = opts || {};
        var ver = opts.serverVersion != null ? Number(opts.serverVersion) : null;
        if (ver != null && Number.isFinite(ver)) {
            _serverVersion = ver;
            _revision = ver;
        }
        if (opts.buildingStatus === 'PUBLISHED' && !_dirtySincePublish) {
            _state = 'published';
            _publishedAt = opts.publishedAt || _publishedAt;
        } else {
            _state = 'draft';
        }
        emit('version:changed', getState());
        return getState();
    }

    function syncAfterRollback(serverVersion) {
        _dirtySincePublish = false;
        if (serverVersion != null && Number.isFinite(Number(serverVersion))) {
            _serverVersion = Number(serverVersion);
            _revision = Number(serverVersion);
        }
        _state = 'published';
        _publishedAt = new Date().toISOString();
        emit('version:changed', getState());
        return getState();
    }

    function markDirty() {
        if (_state === 'published') {
            transition('draft');
        } else if (_state === 'draft' && _serverVersion != null) {
            _dirtySincePublish = true;
            emit('version:changed', getState());
        }
    }

    return {
        STATES: STATES,
        STATE_LABEL_VI: STATE_LABEL_VI,
        init: init,
        getState: getState,
        canTransition: canTransition,
        transition: transition,
        markDirty: markDirty,
        syncAfterPublish: syncAfterPublish,
        syncFromServer: syncFromServer,
        syncAfterRollback: syncAfterRollback
    };
});
