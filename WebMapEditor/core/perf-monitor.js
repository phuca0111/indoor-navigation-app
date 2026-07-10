// ============================================================
// PERF-MONITOR.JS — FPS / mark-measure skeleton (§5.22)
// Bật: ?debug=perf hoặc EditorCore.PerfMonitor.enable()
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PerfMonitor = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var _enabled = false;
    var _marks = {};
    var _frameTimes = [];
    var _lastFrame = 0;
    var _rafId = null;

    function enable() {
        _enabled = true;
        if (typeof requestAnimationFrame === 'function' && _rafId == null) {
            _lastFrame = performance && performance.now ? performance.now() : Date.now();
            function tick(now) {
                if (!_enabled) return;
                var t = now || (performance && performance.now ? performance.now() : Date.now());
                _frameTimes.push(t - _lastFrame);
                _lastFrame = t;
                if (_frameTimes.length > 120) _frameTimes.shift();
                _rafId = requestAnimationFrame(tick);
            }
            _rafId = requestAnimationFrame(tick);
        }
    }

    function disable() {
        _enabled = false;
        if (_rafId != null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(_rafId);
            _rafId = null;
        }
    }

    function isEnabled() {
        return _enabled;
    }

    function mark(name) {
        if (!_enabled) return;
        var t = performance && performance.now ? performance.now() : Date.now();
        _marks[name] = t;
    }

    function measure(name, startMark) {
        if (!_enabled) return null;
        var end = performance && performance.now ? performance.now() : Date.now();
        var start = _marks[startMark];
        if (start == null) return null;
        var ms = end - start;
        if (!_marks['__measures']) _marks['__measures'] = {};
        _marks['__measures'][name] = ms;
        return ms;
    }

    function getStats() {
        var fps = 0;
        if (_frameTimes.length > 1) {
            var avg = _frameTimes.reduce(function (a, b) { return a + b; }, 0) / _frameTimes.length;
            fps = avg > 0 ? Math.round(1000 / avg) : 0;
        }
        return {
            enabled: _enabled,
            fps: fps,
            frameSamples: _frameTimes.length,
            measures: _marks['__measures'] ? Object.assign({}, _marks['__measures']) : {}
        };
    }

    function autoInitFromQuery() {
        if (typeof location !== 'undefined' && /debug=perf/.test(location.search)) {
            enable();
        }
    }

    return {
        enable: enable,
        disable: disable,
        isEnabled: isEnabled,
        mark: mark,
        measure: measure,
        getStats: getStats,
        autoInitFromQuery: autoInitFromQuery
    };
});
