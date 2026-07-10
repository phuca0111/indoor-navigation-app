// ============================================================
// SNAP-ENGINE.JS — OSNAP (Phase 1)
// Grid + Endpoint + Midpoint + Intersection + Perpendicular — spec webedit_nangcap.md §4.1
// Bridge: snap-bridge.js + snapWorldPoint()
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.SnapEngine = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var SNAP = {
        GRID: 'grid',
        ENDPOINT: 'endpoint',
        MIDPOINT: 'midpoint',
        INTERSECTION: 'intersection',
        PERPENDICULAR: 'perpendicular'
    };

    /** Ưu tiên khi khoảng cách gần bằng nhau (trong ε²). */
    var KIND_PRIORITY = {
        endpoint: 3,
        midpoint: 2,
        intersection: 1,
        perpendicular: 0.5,
        grid: 0
    };

    var settings = {
        gridEnabled: true,
        objectSnapEnabled: true,
        gridSize: 40,
        tolerancePx: 12,
        modes: { grid: true, endpoint: true, midpoint: true, intersection: true, perpendicular: true }
    };

    function dist2(ax, ay, bx, by) {
        var dx = ax - bx;
        var dy = ay - by;
        return dx * dx + dy * dy;
    }

    function getGridSize() {
        if (typeof globalThis.GRID_SIZE === 'number' && globalThis.GRID_SIZE > 0) {
            return globalThis.GRID_SIZE;
        }
        if (globalThis.EditorCore && globalThis.EditorCore.Config) {
            return globalThis.EditorCore.Config.get('grid.size', 40);
        }
        return settings.gridSize;
    }

    function getTolerance() {
        if (globalThis.EditorCore && globalThis.EditorCore.Config) {
            return globalThis.EditorCore.Config.get('snap.gridTolerancePx', settings.tolerancePx);
        }
        return settings.tolerancePx;
    }

    function isGridSnapEnabled() {
        if (typeof document !== 'undefined') {
            var el = document.getElementById('snapCheck');
            if (el) return el.checked;
        }
        return settings.gridEnabled;
    }

    function snapToGridPoint(point) {
        if (!settings.modes.grid || !isGridSnapEnabled()) return null;
        var gs = getGridSize();
        var tol = getTolerance();
        var sx = Math.round(point.x / gs) * gs;
        var sy = Math.round(point.y / gs) * gs;
        if (dist2(point.x, point.y, sx, sy) > tol * tol) return null;
        return { x: sx, y: sy, kind: SNAP.GRID, source: 'grid' };
    }

    function pushEndpoint(list, x, y, source) {
        list.push({ x: x, y: y, kind: SNAP.ENDPOINT, source: source });
    }

    function pushMidpoint(list, ax, ay, bx, by, source) {
        list.push({
            x: (ax + bx) / 2,
            y: (ay + by) / 2,
            kind: SNAP.MIDPOINT,
            source: source
        });
    }

    /**
     * Giao điểm đoạn AB ∩ CD (tham số đoạn [0,1]).
     * Trả null nếu song song / không cắt trong đoạn.
     */
    function segmentIntersection(a, b, c, d) {
        var ax = a.x, ay = a.y, bx = b.x, by = b.y;
        var cx = c.x, cy = c.y, dx = d.x, dy = d.y;
        var rX = bx - ax, rY = by - ay;
        var sX = dx - cx, sY = dy - cy;
        var denom = rX * sY - rY * sX;
        if (Math.abs(denom) < 1e-10) return null; // song song / trùng

        var qpX = cx - ax, qpY = cy - ay;
        var t = (qpX * sY - qpY * sX) / denom;
        var u = (qpX * rY - qpY * rX) / denom;
        // Chỉ giao trong đoạn mở rộng nhẹ ở đầu (ε) để bắt góc chia sẻ đỉnh
        var eps = 1e-6;
        if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;

        return { x: ax + t * rX, y: ay + t * rY };
    }

    /** Thu thập mọi đoạn (cạnh) từ walls. */
    function collectWallSegments() {
        var segs = [];
        var walls = globalThis.walls || [];
        for (var wi = 0; wi < walls.length; wi++) {
            var w = walls[wi];
            var pts = w.points || [];
            var wid = w.id != null ? w.id : wi;
            for (var i = 1; i < pts.length; i++) {
                segs.push({
                    a: pts[i - 1],
                    b: pts[i],
                    wallId: wid,
                    segIndex: i - 1
                });
            }
        }
        return segs;
    }

    /**
     * Giao điểm các đoạn tường (O(n²) — đủ với floorplan nhỏ/trung bình).
     * Bỏ qua cặp cùng một wall liên tiếp (chung đỉnh = endpoint đã có).
     */
    function collectIntersectionPoints() {
        if (!settings.modes.intersection) return [];
        var segs = collectWallSegments();
        var points = [];
        var seen = Object.create(null);
        var tol = getTolerance();

        for (var i = 0; i < segs.length; i++) {
            for (var j = i + 1; j < segs.length; j++) {
                var s1 = segs[i];
                var s2 = segs[j];
                // Cùng wall và đoạn kề → giao ở đỉnh = endpoint, bỏ qua
                if (s1.wallId === s2.wallId && Math.abs(s1.segIndex - s2.segIndex) <= 1) {
                    continue;
                }
                var hit = segmentIntersection(s1.a, s1.b, s2.a, s2.b);
                if (!hit) continue;

                // Key làm tròn theo tolerance/2 để tránh trùng gần nhau
                var key = Math.round(hit.x / (tol * 0.5 || 1)) + ',' + Math.round(hit.y / (tol * 0.5 || 1));
                if (seen[key]) continue;
                seen[key] = true;

                points.push({
                    x: hit.x,
                    y: hit.y,
                    kind: SNAP.INTERSECTION,
                    source: 'intersect:wall:' + s1.wallId + ':wall:' + s2.wallId
                });
            }
        }
        return points;
    }

    /**
     * Chân vuông góc từ anchor xuống đoạn segA–segB (trong phạm vi đoạn).
     * AutoCAD PER: đoạn từ điểm neo tới P vuông góc với cạnh tường tại P.
     */
    function footPerpendicularToSegment(anchor, segA, segB) {
        var vx = segB.x - segA.x;
        var vy = segB.y - segA.y;
        var len2 = vx * vx + vy * vy;
        if (len2 < 1e-10) return null;

        var t = ((anchor.x - segA.x) * vx + (anchor.y - segA.y) * vy) / len2;
        var eps = 1e-6;
        if (t < -eps || t > 1 + eps) return null;
        t = Math.max(0, Math.min(1, t));

        var px = segA.x + t * vx;
        var py = segA.y + t * vy;
        // Bỏ qua nếu trùng điểm neo (độ dài ~0)
        if (dist2(anchor.x, anchor.y, px, py) < 1) return null;

        return { x: px, y: py, t: t };
    }

    /**
     * PER snap — cần opts.anchor (điểm neo đang vẽ). Lọc theo khoảng cách tới con trỏ.
     */
    function collectPerpendicularPoints(anchor, cursor) {
        if (!settings.modes.perpendicular || !anchor || !cursor) return [];

        var tol = getTolerance();
        var tol2 = tol * tol;
        var points = [];
        var seen = Object.create(null);
        var segs = collectWallSegments();

        for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            var foot = footPerpendicularToSegment(anchor, seg.a, seg.b);
            if (!foot) continue;
            if (dist2(cursor.x, cursor.y, foot.x, foot.y) > tol2) continue;

            var key = Math.round(foot.x / (tol * 0.5 || 1)) + ',' + Math.round(foot.y / (tol * 0.5 || 1));
            if (seen[key]) continue;
            seen[key] = true;

            points.push({
                x: foot.x,
                y: foot.y,
                kind: SNAP.PERPENDICULAR,
                source: 'perp:wall:' + seg.wallId
            });
        }
        return points;
    }

    function collectSnapPointsFromLegacy() {
        var rootRef = globalThis;
        var points = [];

        (rootRef.walls || []).forEach(function (w, wi) {
            var pts = w.points || [];
            for (var i = 0; i < pts.length; i++) {
                pushEndpoint(points, pts[i].x, pts[i].y, 'wall:' + (w.id || wi));
                if (settings.modes.midpoint && i > 0) {
                    pushMidpoint(points, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, 'wall:' + (w.id || wi));
                }
            }
        });

        (rootRef.pathNodes || []).forEach(function (n) {
            pushEndpoint(points, n.x, n.y, 'node:' + n.id);
        });

        (rootRef.doors || []).forEach(function (d) {
            pushEndpoint(points, d.x, d.y, 'door:' + d.id);
        });

        (rootRef.pois || []).forEach(function (p) {
            pushEndpoint(points, p.x, p.y, 'poi:' + p.id);
        });

        (rootRef.rooms || []).forEach(function (r) {
            if (r.shape === 'polygon' && r.points) {
                r.points.forEach(function (p, i) {
                    pushEndpoint(points, p.x, p.y, 'room:' + r.id);
                    if (settings.modes.midpoint && i > 0) {
                        var prev = r.points[i - 1];
                        pushMidpoint(points, prev.x, prev.y, p.x, p.y, 'room:' + r.id);
                    }
                });
            } else {
                pushEndpoint(points, r.x, r.y, 'room:' + r.id);
                pushEndpoint(points, r.x + r.width, r.y, 'room:' + r.id);
                pushEndpoint(points, r.x, r.y + r.height, 'room:' + r.id);
                pushEndpoint(points, r.x + r.width, r.y + r.height, 'room:' + r.id);
            }
        });

        return points;
    }

    function findBestObjectSnap(point, candidates) {
        var tol = getTolerance();
        var tol2 = tol * tol;
        var best = null;
        var bestD = tol2;
        var bestPri = -1;
        // ε² để coi khoảng cách “bằng nhau” → dùng KIND_PRIORITY
        var eps2 = 0.25; // 0.5px

        candidates.forEach(function (c) {
            if (c.kind === SNAP.ENDPOINT && !settings.modes.endpoint) return;
            if (c.kind === SNAP.MIDPOINT && !settings.modes.midpoint) return;
            if (c.kind === SNAP.INTERSECTION && !settings.modes.intersection) return;
            if (c.kind === SNAP.PERPENDICULAR && !settings.modes.perpendicular) return;

            var d = dist2(point.x, point.y, c.x, c.y);
            if (d > bestD + eps2) return;

            var pri = KIND_PRIORITY[c.kind] != null ? KIND_PRIORITY[c.kind] : 0;
            if (d < bestD - eps2 || (Math.abs(d - bestD) <= eps2 && pri > bestPri) || best == null) {
                bestD = d;
                bestPri = pri;
                best = c;
            }
        });

        return best;
    }

    /**
     * @param {{x:number,y:number}} point — world coords
     * @param {object} [opts]
     * @returns {{x:number,y:number,kind:string,source:string}}
     */
    function snapPoint(point, opts) {
        opts = opts || {};
        point = { x: Number(point.x) || 0, y: Number(point.y) || 0 };
        var result = { x: point.x, y: point.y, kind: 'none', source: 'raw' };

        if (settings.objectSnapEnabled && opts.objectSnap !== false) {
            var candidates = collectSnapPointsFromLegacy();

            if (globalThis.EditorCore && globalThis.EditorCore.SpatialIndex) {
                var stats = globalThis.EditorCore.SpatialIndex.getStats();
                if (stats.active) {
                    var near = globalThis.EditorCore.SpatialIndex.nearest(point.x, point.y, getTolerance() * 2);
                    if (near && near.kind) {
                        var filtered = candidates.filter(function (c) {
                            return String(c.source).indexOf(near.kind) >= 0;
                        });
                        // Chỉ lọc khi vẫn tìm được snap — tránh loại nhầm endpoint tường
                        if (filtered.length) {
                            var narrowed = findBestObjectSnap(point, filtered);
                            if (narrowed) candidates = filtered;
                        }
                    }
                }
            }

            // Intersection luôn merge thêm (không lọc theo SpatialIndex — tránh mất giao điểm)
            if (settings.modes.intersection) {
                candidates = candidates.concat(collectIntersectionPoints());
            }

            var anchor = opts.anchor;
            if (anchor && anchor.x != null && anchor.y != null && settings.modes.perpendicular) {
                candidates = candidates.concat(collectPerpendicularPoints(anchor, point));
            }

            var objSnap = findBestObjectSnap(point, candidates);
            if (objSnap) return objSnap;
        }

        if (opts.gridSnap !== false) {
            var gridSnap = snapToGridPoint(point);
            if (gridSnap) return gridSnap;
        }

        return result;
    }

    function setMode(mode, enabled) {
        if (settings.modes[mode] === undefined) return false;
        settings.modes[mode] = !!enabled;
        return true;
    }

    function getModes() {
        return Object.assign({}, settings.modes);
    }

    function configure(partial) {
        if (!partial) return getSettings();
        Object.keys(partial).forEach(function (k) {
            if (k === 'modes' && partial.modes) {
                Object.assign(settings.modes, partial.modes);
            } else if (Object.prototype.hasOwnProperty.call(settings, k)) {
                settings[k] = partial[k];
            }
        });
        return getSettings();
    }

    function getSettings() {
        return {
            gridEnabled: settings.gridEnabled,
            objectSnapEnabled: settings.objectSnapEnabled,
            gridSize: getGridSize(),
            tolerancePx: getTolerance(),
            modes: Object.assign({}, settings.modes)
        };
    }

    return {
        SNAP: SNAP,
        snapPoint: snapPoint,
        collectSnapPointsFromLegacy: collectSnapPointsFromLegacy,
        collectIntersectionPoints: collectIntersectionPoints,
        collectPerpendicularPoints: collectPerpendicularPoints,
        footPerpendicularToSegment: footPerpendicularToSegment,
        segmentIntersection: segmentIntersection,
        setMode: setMode,
        getModes: getModes,
        configure: configure,
        getSettings: getSettings
    };
});
