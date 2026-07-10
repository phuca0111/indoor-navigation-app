// ============================================================
// VERSION-MANAGER.JS — Draft / Published / Archived (Phase 0.5 — §5.6)
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
    var _state = 'draft';
    var _revision = 0;
    var _publishedAt = null;
    var _bus = null;

    function init(opts) {
        opts = opts || {};
        _bus = opts.eventBus || null;
        _state = opts.state || 'draft';
        _revision = opts.revision || 0;
        _publishedAt = opts.publishedAt || null;
    }

    function emit(name, payload) {
        if (_bus && typeof _bus.emit === 'function') _bus.emit(name, payload);
    }

    function getState() {
        return {
            state: _state,
            revision: _revision,
            publishedAt: _publishedAt
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
        }
        emit('version:changed', getState());
        return { ok: true, from: from, to: to, state: getState() };
    }

    function markDirty() {
        if (_state === 'published') {
            transition('draft');
        }
    }

    return {
        STATES: STATES,
        init: init,
        getState: getState,
        canTransition: canTransition,
        transition: transition,
        markDirty: markDirty
    };
});
