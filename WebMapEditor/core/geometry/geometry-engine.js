// ============================================================
// GEOMETRY-ENGINE.JS — Toán hình học 2D (Phase 0 skeleton — §5.23)
// Trim / intersect / point-in-polygon — dùng chung Snap + Phase 2 editing
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.GeometryEngine = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function dist2(ax, ay, bx, by) {
        var dx = ax - bx, dy = ay - by;
        return dx * dx + dy * dy;
    }

    function segmentIntersection(a, b, c, d) {
        var ax = a.x, ay = a.y, bx = b.x, by = b.y;
        var cx = c.x, cy = c.y, dx = d.x, dy = d.y;
        var rX = bx - ax, rY = by - ay;
        var sX = dx - cx, sY = dy - cy;
        var denom = rX * sY - rY * sX;
        if (Math.abs(denom) < 1e-10) return null;
        var qpX = cx - ax, qpY = cy - ay;
        var t = (qpX * sY - qpY * sX) / denom;
        var u = (qpX * rY - qpY * rX) / denom;
        var eps = 1e-6;
        if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
        return { x: ax + t * rX, y: ay + t * rY, t: t, u: u };
    }

    function distance(a, b) {
        return Math.sqrt(dist2(a.x, a.y, b.x, b.y));
    }

    /** Ray-casting — point trong polygon (đỉnh đóng hoặc mở) */
    function pointInPolygon(point, polygon) {
        if (!point || !polygon || polygon.length < 3) return false;
        var x = point.x, y = point.y;
        var inside = false;
        for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            var xi = polygon[i].x, yi = polygon[i].y;
            var xj = polygon[j].x, yj = polygon[j].y;
            var intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-10) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /** Chiếu điểm P lên đoạn AB — trả t trong [0,1] nếu trên đoạn */
    function projectOnSegment(p, a, b) {
        var vx = b.x - a.x, vy = b.y - a.y;
        var len2 = vx * vx + vy * vy;
        if (len2 < 1e-10) return { x: a.x, y: a.y, t: 0, onSegment: true };
        var t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
        var onSegment = t >= 0 && t <= 1;
        t = Math.max(0, Math.min(1, t));
        return { x: a.x + t * vx, y: a.y + t * vy, t: t, onSegment: onSegment };
    }

    /**
     * Trim đoạn target theo cutting: bỏ phần cùng phía với clickPt.
     * @returns {{a:{x,y}, b:{x,y}}|null} đoạn còn lại
     */
    function trimSegment(targetA, targetB, cutA, cutB, clickPt) {
        var hit = segmentIntersection(targetA, targetB, cutA, cutB);
        if (!hit) return null;
        var proj = projectOnSegment(clickPt, targetA, targetB);
        var hitT = hit.t;
        if (hitT < 0) hitT = 0;
        if (hitT > 1) hitT = 1;
        var keepStart = proj.t >= hitT;
        if (keepStart) {
            return { a: { x: hit.x, y: hit.y }, b: { x: targetB.x, y: targetB.y } };
        }
        return { a: { x: targetA.x, y: targetA.y }, b: { x: hit.x, y: hit.y } };
    }

    /**
     * Trim đối với nhiều biên cắt: tìm giao gần click nhất (phía bỏ), giữ phần còn lại.
     * @param {{x,y}} targetA
     * @param {{x,y}} targetB
     * @param {Array<{a:{x,y},b:{x,y}}>} cutters
     * @param {{x,y}} clickPt
     */
    function trimAgainstCutters(targetA, targetB, cutters, clickPt) {
        if (!cutters || !cutters.length) return null;
        var proj = projectOnSegment(clickPt, targetA, targetB);
        var clickT = proj.t;
        var best = null;
        var bestDist = Infinity;
        for (var i = 0; i < cutters.length; i++) {
            var hit = segmentIntersection(targetA, targetB, cutters[i].a, cutters[i].b);
            if (!hit) continue;
            var d = Math.abs(hit.t - clickT);
            if (d < bestDist) {
                bestDist = d;
                best = hit;
            }
        }
        if (!best) return null;
        var hitT = Math.max(0, Math.min(1, best.t));
        if (clickT >= hitT) {
            return { a: { x: best.x, y: best.y }, b: { x: targetB.x, y: targetB.y } };
        }
        return { a: { x: targetA.x, y: targetA.y }, b: { x: best.x, y: best.y } };
    }

    /**
     * Cắt đôi đoạn tại điểm chiếu của click (Break).
     * @returns {{left:{a,b}, right:{a,b}}|null}
     */
    function breakSegmentAt(targetA, targetB, clickPt) {
        var proj = projectOnSegment(clickPt, targetA, targetB);
        if (!proj.onSegment && (proj.t <= 0.02 || proj.t >= 0.98)) return null;
        var mid = { x: proj.x, y: proj.y };
        var leftLen = Math.hypot(mid.x - targetA.x, mid.y - targetA.y);
        var rightLen = Math.hypot(targetB.x - mid.x, targetB.y - mid.y);
        if (leftLen < 2 || rightLen < 2) return null;
        return {
            left: { a: { x: targetA.x, y: targetA.y }, b: mid },
            right: { a: { x: mid.x, y: mid.y }, b: { x: targetB.x, y: targetB.y } },
            mid: mid,
            t: proj.t
        };
    }

    /**
     * Extend đoạn target tới giao với đường cắt (kéo dài vô hạn target + đoạn cut).
     */
    function extendSegment(targetA, targetB, cutA, cutB) {
        var ax = targetA.x, ay = targetA.y, bx = targetB.x, by = targetB.y;
        var cx = cutA.x, cy = cutA.y, dx = cutB.x, dy = cutB.y;
        var rX = bx - ax, rY = by - ay;
        var sX = dx - cx, sY = dy - cy;
        var denom = rX * sY - rY * sX;
        if (Math.abs(denom) < 1e-10) return null;
        var qpX = cx - ax, qpY = cy - ay;
        var t = (qpX * sY - qpY * sX) / denom;
        var u = (qpX * rY - qpY * rX) / denom;
        // cut phải nằm trên đoạn cắt (u in [0,1]); target có thể ngoài [0,1]
        if (u < -1e-6 || u > 1 + 1e-6) return null;
        var ix = ax + t * rX, iy = ay + t * rY;
        // Nếu giao đã nằm trên đoạn target → không cần extend
        if (t >= -1e-6 && t <= 1 + 1e-6) return null;
        // Kéo endpoint gần phía giao
        if (t < 0) {
            return { a: { x: ix, y: iy }, b: { x: bx, y: by } };
        }
        return { a: { x: ax, y: ay }, b: { x: ix, y: iy } };
    }

    /** Offset đoạn AB sang 2 phía theo khoảng cách d (px) — dùng MLine */
    function offsetSegment(a, b, dist) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-10) return null;
        var nx = -dy / len, ny = dx / len;
        return {
            left: [
                { x: a.x + nx * dist, y: a.y + ny * dist },
                { x: b.x + nx * dist, y: b.y + ny * dist }
            ],
            right: [
                { x: a.x - nx * dist, y: a.y - ny * dist },
                { x: b.x - nx * dist, y: b.y - ny * dist }
            ],
            center: [a, b]
        };
    }

    return {
        segmentIntersection: segmentIntersection,
        distance: distance,
        pointInPolygon: pointInPolygon,
        projectOnSegment: projectOnSegment,
        trimSegment: trimSegment,
        trimAgainstCutters: trimAgainstCutters,
        breakSegmentAt: breakSegmentAt,
        extendSegment: extendSegment,
        offsetSegment: offsetSegment
    };
});
