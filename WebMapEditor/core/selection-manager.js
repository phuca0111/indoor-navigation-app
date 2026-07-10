// ============================================================
// SELECTION-MANAGER.JS — Quản lý chọn đối tượng (Phase 0 — §5.7)
// Trạng thái selection tách khỏi legacy selected* globals
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.SelectionManager = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var _selected = [];
    var _primary = null;
    var _bus = null;

    function init(opts) {
        opts = opts || {};
        _bus = opts.eventBus || null;
        _selected = [];
        _primary = null;
    }

    function emit(name, payload) {
        if (_bus && typeof _bus.emit === 'function') {
            _bus.emit(name, payload);
        }
    }

    function normalizeRef(ref) {
        if (!ref) return null;
        if (typeof ref === 'string') return { id: ref, type: null };
        return { id: ref.id, type: ref.type || null };
    }

    function sameRef(a, b) {
        return a && b && String(a.id) === String(b.id) &&
            (a.type == null || b.type == null || a.type === b.type);
    }

    function isSelected(ref) {
        ref = normalizeRef(ref);
        if (!ref) return false;
        return _selected.some(function (s) { return sameRef(s, ref); });
    }

    function select(ref, opts) {
        opts = opts || {};
        ref = normalizeRef(ref);
        if (!ref) return;
        if (!opts.add) {
            _selected = [ref];
        } else if (!isSelected(ref)) {
            _selected.push(ref);
        }
        _primary = ref;
        emit('selection:changed', { selected: _selected.slice(), primary: _primary });
    }

    function deselect(ref) {
        ref = normalizeRef(ref);
        if (!ref) {
            _selected = [];
            _primary = null;
        } else {
            _selected = _selected.filter(function (s) { return !sameRef(s, ref); });
            if (_primary && sameRef(_primary, ref)) {
                _primary = _selected.length ? _selected[_selected.length - 1] : null;
            }
        }
        emit('selection:changed', { selected: _selected.slice(), primary: _primary });
    }

    function toggle(ref, opts) {
        if (isSelected(ref)) deselect(ref);
        else select(ref, opts);
    }

    function clear() {
        deselect(null);
    }

    function getSelected() {
        return _selected.slice();
    }

    function getPrimary() {
        return _primary;
    }

    /** Box select skeleton — lọc refs trong rect world */
    function selectInRect(rect, candidates, opts) {
        if (!rect || !candidates) return;
        opts = opts || {};
        var hits = candidates.filter(function (c) {
            var x = c.x != null ? c.x : (c.cx != null ? c.cx : null);
            var y = c.y != null ? c.y : (c.cy != null ? c.cy : null);
            if (x == null || y == null) return false;
            return x >= rect.x && x <= rect.x + rect.width &&
                y >= rect.y && y <= rect.y + rect.height;
        }).map(function (c) {
            return normalizeRef({ id: c.id, type: c.type || c._type });
        });
        if (!opts.add) _selected = [];
        hits.forEach(function (h) {
            if (!isSelected(h)) _selected.push(h);
        });
        _primary = _selected.length ? _selected[_selected.length - 1] : null;
        emit('selection:changed', { selected: _selected.slice(), primary: _primary });
        return hits;
    }

    return {
        init: init,
        select: select,
        deselect: deselect,
        toggle: toggle,
        clear: clear,
        isSelected: isSelected,
        getSelected: getSelected,
        getPrimary: getPrimary,
        selectInRect: selectInRect
    };
});
