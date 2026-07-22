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
        PERPENDICULAR: 'perpendicular',
        CENTER: 'center',
        QUADRANT: 'quadrant',
        EXTENSION: 'extension',
        FROM: 'from',
        NEAREST: 'nearest',
        NODE: 'node'
    };

    /** Ưu tiên khi khoảng cách gần bằng nhau (trong ε²). */
    var KIND_PRIORITY = {
        endpoint: 3,
        node: 2.8,
        quadrant: 2.7,
        center: 2.6,
        midpoint: 2,
        intersection: 1,
        perpendicular: 0.5,
        from: 0.45,
        extension: 0.4,
        nearest: 0.2,
        grid: 0
    };

    var settings = {
        gridEnabled: true,
        objectSnapEnabled: true,
        gridSize: 40,
        tolerancePx: 12,
        modes: {
            grid: true, endpoint: true, midpoint: true, intersection: true,
            perpendicular: true, center: true, quadrant: true,
            extension: false, from: false, nearest: false, node: true
        }
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

    function projectPointToInfiniteLine(point, a, b) {
        var vx = b.x - a.x;
        var vy = b.y - a.y;
        var len2 = vx * vx + vy * vy;
        if (len2 < 1e-10) return null;
        var t = ((point.x - a.x) * vx + (point.y - a.y) * vy) / len2;
        return { x: a.x + t * vx, y: a.y + t * vy, t: t };
    }

    function collectExtensionPoints(cursor) {
        if (!settings.modes.extension || !cursor) return [];
        var tol = getTolerance();
        var tol2 = tol * tol;
        var segs = collectExtensionSegments();
        var out = [];
        for (var i = 0; i < segs.length; i++) {
            var hit = projectPointToInfiniteLine(cursor, segs[i].a, segs[i].b);
            if (!hit || (hit.t >= 0 && hit.t <= 1)) continue;
            if (dist2(cursor.x, cursor.y, hit.x, hit.y) > tol2) continue;
            out.push({
                x: hit.x,
                y: hit.y,
                kind: SNAP.EXTENSION,
                source: 'extension:' + segs[i].source
            });
        }
        return out;
    }

    function collectExtensionSegments() {
        var out = [];
        function addPolyline(object, type, index) {
            var points = object && object.points;
            if (!Array.isArray(points) || points.length < 2 || object.closed) return;
            if (type === 'line' && (object.type === 'arc' || object.type === 'ellipse')) return;
            var id = object.id != null ? object.id : index;
            out.push({
                a: points[0], b: points[1],
                source: type + ':' + id + ':start'
            });
            if (points.length > 2) {
                out.push({
                    a: points[points.length - 2], b: points[points.length - 1],
                    source: type + ':' + id + ':end'
                });
            }
        }
        (globalThis.walls || []).forEach(function (wall, index) {
            addPolyline(wall, 'wall', index);
        });
        (globalThis.lines || []).forEach(function (line, index) {
            addPolyline(line, 'line', index);
        });
        return out;
    }

    function collectFromPoint(from, offset) {
        if (!settings.modes.from || !from || !offset) return null;
        var fx = Number(from.x), fy = Number(from.y);
        var ox = Number(offset.x), oy = Number(offset.y);
        if (![fx, fy, ox, oy].every(Number.isFinite)) return null;
        return {
            x: fx + ox,
            y: fy + oy,
            kind: SNAP.FROM,
            source: 'from'
        };
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

        (rootRef.lines || []).forEach(function (ln, li) {
            var lpts = ln.points || [];
            var lineSource = 'line:' + (ln.id != null ? ln.id : li);
            for (var i = 0; i < lpts.length; i++) {
                pushEndpoint(points, lpts[i].x, lpts[i].y, lineSource);
                if (settings.modes.midpoint && i > 0) {
                    pushMidpoint(points, lpts[i - 1].x, lpts[i - 1].y, lpts[i].x, lpts[i].y, lineSource);
                }
            }
            if (ln.type === 'arc' && ln.arc) {
                if (settings.modes.center) {
                    points.push({
                        x: ln.arc.cx, y: ln.arc.cy,
                        kind: SNAP.CENTER, source: lineSource
                    });
                }
                if (settings.modes.quadrant && ln.arc.radius > 0) {
                    var arcQuadrants = [
                        { x: ln.arc.cx + ln.arc.radius, y: ln.arc.cy },
                        { x: ln.arc.cx - ln.arc.radius, y: ln.arc.cy },
                        { x: ln.arc.cx, y: ln.arc.cy + ln.arc.radius },
                        { x: ln.arc.cx, y: ln.arc.cy - ln.arc.radius }
                    ];
                    var arcThreshold2 = Math.pow(Math.max(2, ln.arc.radius * 0.12), 2);
                    arcQuadrants.forEach(function (quadrant) {
                        if (lpts.some(function (p) {
                            return dist2(p.x, p.y, quadrant.x, quadrant.y) <= arcThreshold2;
                        })) {
                            points.push({
                                x: quadrant.x, y: quadrant.y,
                                kind: SNAP.QUADRANT, source: lineSource
                            });
                        }
                    });
                }
            } else if (ln.type === 'ellipse' && ln.ellipse) {
                var ellipse = ln.ellipse;
                if (settings.modes.center) {
                    points.push({
                        x: ellipse.cx, y: ellipse.cy,
                        kind: SNAP.CENTER, source: lineSource
                    });
                }
                if (settings.modes.quadrant && ellipse.rx > 0 && ellipse.ry > 0) {
                    var cos = Math.cos(ellipse.rotation || 0);
                    var sin = Math.sin(ellipse.rotation || 0);
                    [
                        { lx: ellipse.rx, ly: 0 }, { lx: -ellipse.rx, ly: 0 },
                        { lx: 0, ly: ellipse.ry }, { lx: 0, ly: -ellipse.ry }
                    ].forEach(function (local) {
                        points.push({
                            x: ellipse.cx + local.lx * cos - local.ly * sin,
                            y: ellipse.cy + local.lx * sin + local.ly * cos,
                            kind: SNAP.QUADRANT,
                            source: lineSource
                        });
                    });
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

        // CAD Point → OSNAP NODE (khác pathNodes vẫn dùng ENDPOINT)
        if (settings.modes.node) {
            (rootRef.cadPoints || []).forEach(function (cp) {
                if (!cp || cp.x == null || cp.y == null) return;
                points.push({
                    x: cp.x, y: cp.y,
                    kind: SNAP.NODE,
                    source: 'cadPoint:' + cp.id
                });
            });
        }

        (rootRef.rooms || []).forEach(function (r) {
            if (r.shape === 'circle') {
                if (settings.modes.center && r.cx != null && r.cy != null) {
                    points.push({ x: r.cx, y: r.cy, kind: SNAP.CENTER, source: 'room:' + r.id });
                }
                if (settings.modes.quadrant && r.cx != null && r.cy != null && r.radius > 0) {
                    points.push(
                        { x: r.cx + r.radius, y: r.cy, kind: SNAP.QUADRANT, source: 'room:' + r.id },
                        { x: r.cx - r.radius, y: r.cy, kind: SNAP.QUADRANT, source: 'room:' + r.id },
                        { x: r.cx, y: r.cy + r.radius, kind: SNAP.QUADRANT, source: 'room:' + r.id },
                        { x: r.cx, y: r.cy - r.radius, kind: SNAP.QUADRANT, source: 'room:' + r.id }
                    );
                }
            } else if (r.shape === 'polygon' && r.points) {
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
                if (settings.modes.center && r.width != null && r.height != null) {
                    points.push({
                        x: r.x + r.width / 2, y: r.y + r.height / 2,
                        kind: SNAP.CENTER, source: 'room:' + r.id
                    });
                }
            }
        });

        return points;
    }

    /** Mọi đoạn (tường + đoạn thẳng + cạnh phòng) — dùng Nearest. */
    function collectAllSegments() {
        var segs = collectWallSegments();
        var lines = globalThis.lines || [];
        for (var li = 0; li < lines.length; li++) {
            var lp = lines[li].points || [];
            for (var i = 1; i < lp.length; i++) segs.push({ a: lp[i - 1], b: lp[i] });
        }
        var rooms = globalThis.rooms || [];
        for (var ri = 0; ri < rooms.length; ri++) {
            var rm = rooms[ri];
            if (rm.shape === 'polygon' && rm.points && rm.points.length > 1) {
                for (var pi = 1; pi < rm.points.length; pi++) {
                    segs.push({ a: rm.points[pi - 1], b: rm.points[pi] });
                }
                segs.push({ a: rm.points[rm.points.length - 1], b: rm.points[0] });
            } else if (rm.shape !== 'circle' && rm.width != null && rm.height != null) {
                var c1 = { x: rm.x, y: rm.y }, c2 = { x: rm.x + rm.width, y: rm.y };
                var c3 = { x: rm.x + rm.width, y: rm.y + rm.height }, c4 = { x: rm.x, y: rm.y + rm.height };
                segs.push({ a: c1, b: c2 }, { a: c2, b: c3 }, { a: c3, b: c4 }, { a: c4, b: c1 });
            }
        }
        return segs;
    }

    /** NEAREST — điểm gần nhất trên cạnh bất kỳ trong phạm vi tolerance. */
    function collectNearestPoint(cursor) {
        if (!settings.modes.nearest || !cursor) return null;
        var tol = getTolerance();
        var tol2 = tol * tol;
        var segs = collectAllSegments();
        var best = null, bestD = tol2;
        for (var i = 0; i < segs.length; i++) {
            var foot = footPerpendicularToSegment(cursor, segs[i].a, segs[i].b);
            if (!foot) continue;
            var d = dist2(cursor.x, cursor.y, foot.x, foot.y);
            if (d < bestD) {
                bestD = d;
                best = { x: foot.x, y: foot.y, kind: SNAP.NEAREST, source: 'nearest' };
            }
        }
        return best;
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
            if (c.kind === SNAP.CENTER && !settings.modes.center) return;
            if (c.kind === SNAP.QUADRANT && !settings.modes.quadrant) return;
            if (c.kind === SNAP.EXTENSION && !settings.modes.extension) return;
            if (c.kind === SNAP.FROM && !settings.modes.from) return;
            if (c.kind === SNAP.NEAREST && !settings.modes.nearest) return;
            if (c.kind === SNAP.NODE && !settings.modes.node) return;

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

            // Nearest: điểm gần nhất trên cạnh (ưu tiên thấp nhất — chỉ khi bật)
            if (settings.modes.nearest) {
                var nearestPt = collectNearestPoint(point);
                if (nearestPt) candidates = candidates.concat(nearestPt);
            }

            if (settings.modes.extension) {
                candidates = candidates.concat(collectExtensionPoints(point));
            }

            var fromPt = collectFromPoint(opts.from, opts.fromOffset);
            if (fromPt) candidates.push(fromPt);

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
        collectExtensionPoints: collectExtensionPoints,
        collectExtensionSegments: collectExtensionSegments,
        collectFromPoint: collectFromPoint,
        collectNearestPoint: collectNearestPoint,
        collectAllSegments: collectAllSegments,
        footPerpendicularToSegment: footPerpendicularToSegment,
        projectPointToInfiniteLine: projectPointToInfiniteLine,
        segmentIntersection: segmentIntersection,
        setMode: setMode,
        getModes: getModes,
        configure: configure,
        getSettings: getSettings
    };
});
