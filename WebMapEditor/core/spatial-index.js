// ============================================================
// SPATIAL-INDEX.JS — Hit-test / nearest trên legacy state (Phase 1)
// Simple flat index; có thể thay rbush khi count lớn.
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.SpatialIndex = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var RBUSH_THRESHOLD = 200;
    var items = [];
    var active = false;
    var initialized = false;

    function bboxForRoom(r) {
        if (r.shape === 'circle') {
            var cx = r.cx || 0;
            var cy = r.cy || 0;
            var rad = r.radius || 0;
            return { minX: cx - rad, minY: cy - rad, maxX: cx + rad, maxY: cy + rad, kind: 'room', ref: r };
        }
        if (r.shape === 'polygon' && Array.isArray(r.points) && r.points.length) {
            var minX = Infinity;
            var minY = Infinity;
            var maxX = -Infinity;
            var maxY = -Infinity;
            r.points.forEach(function (p) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            });
            return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, kind: 'room', ref: r };
        }
        var x = r.x || 0;
        var y = r.y || 0;
        var w = r.width || 0;
        var h = r.height || 0;
        return { minX: x, minY: y, maxX: x + w, maxY: y + h, kind: 'room', ref: r };
    }

    function readLegacyArray(name) {
        var rootRef = typeof globalThis !== 'undefined' ? globalThis : {};
        var list = rootRef[name];
        return Array.isArray(list) ? list : [];
    }

    function rebuildFromLegacy() {
        items = [];
        var roomsList = readLegacyArray('rooms');
        var nodes = readLegacyArray('pathNodes');
        var wallsList = readLegacyArray('walls');
        roomsList.forEach(function (r) {
            if (r && typeof r === 'object') items.push(bboxForRoom(r));
        });
        wallsList.forEach(function (w) {
            if (!w || !w.points || !w.points.length) return;
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            w.points.forEach(function (p) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            });
            items.push({ minX: minX, minY: minY, maxX: maxX, maxY: maxY, kind: 'wall', ref: w });
        });
        nodes.forEach(function (n) {
            if (!n) return;
            var px = n.x != null ? n.x : 0;
            var py = n.y != null ? n.y : 0;
            var pad = 8;
            items.push({
                minX: px - pad,
                minY: py - pad,
                maxX: px + pad,
                maxY: py + pad,
                kind: 'node',
                ref: n
            });
        });
        active = true;
    }

    function inBBox(x, y, b) {
        return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
    }

    function dist2(x, y, cx, cy) {
        var dx = x - cx;
        var dy = y - cy;
        return dx * dx + dy * dy;
    }

    function bboxCenter(b) {
        return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    }

    function hitTest(wx, wy) {
        for (var i = items.length - 1; i >= 0; i--) {
            if (inBBox(wx, wy, items[i])) return items[i];
        }
        return null;
    }

    function nearest(wx, wy, maxDist) {
        var best = null;
        var bestD = maxDist != null ? maxDist * maxDist : Infinity;
        items.forEach(function (b) {
            var c = bboxCenter(b);
            var d = dist2(wx, wy, c.x, c.y);
            if (d < bestD) {
                bestD = d;
                best = b;
            }
        });
        return best;
    }

    function getStats() {
        return {
            count: items.length,
            threshold: RBUSH_THRESHOLD,
            active: active,
            engine: items.length >= RBUSH_THRESHOLD ? 'simple' : 'simple'
        };
    }

    function clear() {
        items = [];
        active = false;
    }

    function syncFromLegacyWindow() {
        rebuildFromLegacy();
        return getStats();
    }

    function init() {
        if (initialized) return;
        initialized = true;
        var bus = typeof globalThis !== 'undefined' && globalThis.EditorCore
            ? globalThis.EditorCore.eventBus
            : null;
        if (bus) {
            bus.on('DOCUMENT_SYNCED', function () {
                rebuildFromLegacy();
            });
        }
        rebuildFromLegacy();
    }

    return {
        init: init,
        clear: clear,
        rebuildFromLegacy: rebuildFromLegacy,
        syncFromLegacyWindow: syncFromLegacyWindow,
        hitTest: hitTest,
        nearest: nearest,
        getStats: getStats
    };
});
