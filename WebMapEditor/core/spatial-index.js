// ============================================================
// SPATIAL-INDEX.JS — RTree hit-test / snap (Phase 1 skeleton)
// Spec: webedit_nangcap.md §5.15 — rbush + fallback SimpleIndex
// ============================================================
(function (root, factory) {
    var exported = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = exported;
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.SpatialIndex = exported;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var RBushCtor = null;
    if (typeof RBush !== 'undefined') {
        RBushCtor = RBush;
    } else if (typeof require === 'function') {
        try { RBushCtor = require('rbush'); } catch (e) { /* optional */ }
    }

    function SimpleSpatialIndex() {
        this._items = [];
    }

    SimpleSpatialIndex.prototype.clear = function () {
        this._items = [];
    };

    SimpleSpatialIndex.prototype.insert = function (item) {
        this._items.push(item);
        return item;
    };

    SimpleSpatialIndex.prototype.remove = function (item) {
        var idx = this._items.indexOf(item);
        if (idx >= 0) this._items.splice(idx, 1);
    };

    SimpleSpatialIndex.prototype.load = function (items) {
        this._items = items.slice();
    };

    SimpleSpatialIndex.prototype.all = function () {
        return this._items.slice();
    };

    SimpleSpatialIndex.prototype.search = function (bbox) {
        return this._items.filter(function (item) {
            return !(item.maxX < bbox.minX || item.minX > bbox.maxX ||
                item.maxY < bbox.minY || item.minY > bbox.maxY);
        });
    };

    function createTree() {
        if (RBushCtor) return new RBushCtor();
        return new SimpleSpatialIndex();
    }

    var tree = createTree();
    var idToItem = Object.create(null);
    var objectCount = 0;

    function normalizeBBox(input) {
        if (!input) return null;
        if (input.minX != null && input.minY != null && input.maxX != null && input.maxY != null) {
            return {
                minX: input.minX,
                minY: input.minY,
                maxX: input.maxX,
                maxY: input.maxY
            };
        }
        var x = Number(input.x) || 0;
        var y = Number(input.y) || 0;
        var w = Number(input.width) || 0;
        var h = Number(input.height) || 0;
        if (w === 0 && h === 0) {
            var pad = Number(input.radius) || 4;
            return { minX: x - pad, minY: y - pad, maxX: x + pad, maxY: y + pad };
        }
        return { minX: x, minY: y, maxX: x + w, maxY: y + h };
    }

    function pointsBBox(points) {
        if (!points || !points.length) return null;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach(function (p) {
            var px = Number(p.x) || 0;
            var py = Number(p.y) || 0;
            if (px < minX) minX = px;
            if (py < minY) minY = py;
            if (px > maxX) maxX = px;
            if (py > maxY) maxY = py;
        });
        if (!Number.isFinite(minX)) return null;
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    function getThreshold() {
        if (typeof globalThis !== 'undefined' && globalThis.EditorCore && globalThis.EditorCore.Config) {
            return globalThis.EditorCore.Config.get('performance.spatialIndexThreshold', 200);
        }
        return 200;
    }

    function shouldUseIndex(count) {
        return (count || 0) >= getThreshold();
    }

    function clear() {
        tree.clear();
        idToItem = Object.create(null);
        objectCount = 0;
    }

    function remove(objectId) {
        var item = idToItem[objectId];
        if (!item) return false;
        tree.remove(item);
        delete idToItem[objectId];
        objectCount = Math.max(0, objectCount - 1);
        return true;
    }

    /**
     * @param {string|number} objectId
     * @param {object} bbox — minX/maxX hoặc x/y/width/height
     * @param {object} [meta] — kind, ref, ...
     */
    function insert(objectId, bbox, meta) {
        var box = normalizeBBox(bbox);
        if (!box || objectId == null) return null;
        remove(objectId);
        var item = {
            minX: box.minX,
            minY: box.minY,
            maxX: box.maxX,
            maxY: box.maxY,
            id: objectId,
            meta: meta || {}
        };
        tree.insert(item);
        idToItem[objectId] = item;
        objectCount += 1;
        return item;
    }

    function update(objectId, bbox, meta) {
        return insert(objectId, bbox, meta);
    }

    /**
     * @param {object} rect — {minX,minY,maxX,maxY} hoặc {x,y,width,height}
     * @returns {Array}
     */
    function query(rect) {
        var box = normalizeBBox(rect);
        if (!box) return [];
        return tree.search(box).map(function (item) {
            return {
                id: item.id,
                bbox: { minX: item.minX, minY: item.minY, maxX: item.maxX, maxY: item.maxY },
                meta: item.meta
            };
        });
    }

    function dist2(px, py, item) {
        var cx = (item.minX + item.maxX) / 2;
        var cy = (item.minY + item.maxY) / 2;
        var dx = px - cx;
        var dy = py - cy;
        return dx * dx + dy * dy;
    }

    /**
     * @param {{x:number,y:number}} point
     * @param {number} radius
     */
    function nearest(point, radius) {
        var px = Number(point && point.x) || 0;
        var py = Number(point && point.y) || 0;
        var r = Number(radius) || 8;
        var hits = query({
            minX: px - r,
            minY: py - r,
            maxX: px + r,
            maxY: py + r
        });
        hits.sort(function (a, b) {
            var ia = idToItem[a.id];
            var ib = idToItem[b.id];
            return dist2(px, py, ia) - dist2(px, py, ib);
        });
        return hits;
    }

    function hitTest(point, tolerance) {
        var px = Number(point && point.x) || 0;
        var py = Number(point && point.y) || 0;
        var tol = Number(tolerance) || 4;
        var hits = query({
            minX: px - tol,
            minY: py - tol,
            maxX: px + tol,
            maxY: py + tol
        });
        return hits.length ? hits[0] : null;
    }

    function bboxFromRoom(room) {
        if (!room) return null;
        if (room.shape === 'polygon' && room.points) return pointsBBox(room.points);
        if (room.shape === 'circle') {
            var cx = Number(room.cx) || 0;
            var cy = Number(room.cy) || 0;
            var rad = Number(room.radius) || 0;
            return { minX: cx - rad, minY: cy - rad, maxX: cx + rad, maxY: cy + rad };
        }
        return normalizeBBox(room);
    }

    function bboxFromWall(wall) {
        if (!wall || !wall.points || !wall.points.length) return null;
        return pointsBBox(wall.points);
    }

    function bboxFromPointEntity(obj, pad) {
        return normalizeBBox({ x: obj.x, y: obj.y, radius: pad || 8 });
    }

    /**
     * Xây lại index từ legacy state (rooms, walls, doors, …).
     * @param {object} state
     */
    function rebuildFromLegacyState(state) {
        clear();
        state = state || {};
        (state.rooms || []).forEach(function (r) {
            insert('room:' + r.id, bboxFromRoom(r), { kind: 'room', ref: r });
        });
        (state.walls || []).forEach(function (w) {
            insert('wall:' + (w.id || w), bboxFromWall(w), { kind: 'wall', ref: w });
        });
        (state.doors || []).forEach(function (d) {
            insert('door:' + d.id, bboxFromPointEntity(d, 12), { kind: 'door', ref: d });
        });
        (state.pois || []).forEach(function (p) {
            insert('poi:' + p.id, bboxFromPointEntity(p, 12), { kind: 'poi', ref: p });
        });
        (state.pathNodes || []).forEach(function (n) {
            insert('node:' + n.id, bboxFromPointEntity(n, 8), { kind: 'node', ref: n });
        });
        (state.qrs || []).forEach(function (q) {
            insert('qr:' + q.id, bboxFromPointEntity(q, 14), { kind: 'qr', ref: q });
        });
        return getStats();
    }

    function syncFromLegacyWindow() {
        var rootRef = typeof globalThis !== 'undefined' ? globalThis : {};
        if (rootRef.EditorCore && rootRef.EditorCore.LegacyBridge) {
            return rebuildFromLegacyState(rootRef.EditorCore.LegacyBridge.captureLegacyState());
        }
        return rebuildFromLegacyState({
            rooms: rootRef.rooms || [],
            walls: rootRef.walls || [],
            doors: rootRef.doors || [],
            pois: rootRef.pois || [],
            pathNodes: rootRef.pathNodes || [],
            qrs: rootRef.qrs || []
        });
    }

    function getStats() {
        return {
            count: objectCount,
            threshold: getThreshold(),
            active: shouldUseIndex(objectCount),
            engine: RBushCtor ? 'rbush' : 'simple'
        };
    }

    return {
        clear: clear,
        insert: insert,
        update: update,
        remove: remove,
        query: query,
        nearest: nearest,
        hitTest: hitTest,
        normalizeBBox: normalizeBBox,
        bboxFromRoom: bboxFromRoom,
        rebuildFromLegacyState: rebuildFromLegacyState,
        syncFromLegacyWindow: syncFromLegacyWindow,
        shouldUseIndex: shouldUseIndex,
        getStats: getStats
    };
});
