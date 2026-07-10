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

    return {
        segmentIntersection: segmentIntersection,
        distance: distance,
        pointInPolygon: pointInPolygon,
        projectOnSegment: projectOnSegment
    };
});
