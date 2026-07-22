(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.FromSnap = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var state = null;
    function validPoint(point) {
        return point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
    }
    function arm(base, offset) {
        if (!validPoint(base) || !validPoint(offset)) return false;
        state = {
            base: { x: Number(base.x), y: Number(base.y) },
            offset: { x: Number(offset.x), y: Number(offset.y) }
        };
        return true;
    }
    function enrich(options) {
        options = Object.assign({}, options || {});
        if (state) {
            options.from = state.base;
            options.fromOffset = state.offset;
        }
        return options;
    }
    function consume() {
        var value = state;
        state = null;
        return value;
    }
    function cancel() { state = null; }
    function getState() {
        return state ? {
            base: Object.assign({}, state.base),
            offset: Object.assign({}, state.offset)
        } : null;
    }
    return { arm: arm, enrich: enrich, consume: consume, cancel: cancel, getState: getState };
});
