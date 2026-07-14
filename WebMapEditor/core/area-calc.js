// ============================================================
// AREA-CALC.JS — Area (AA) geometry helper (Phase 3 Annotation)
// Spec: webedit_nangcap.md §3.5 — Area (AA)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.AreaCalc = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var MIN_VERTICES = 3;
    var MIN_EDGE_PX = 1;

    function shoelaceAreaPx(points) {
        if (!points || points.length < MIN_VERTICES) return 0;
        var sum = 0;
        for (var i = 0; i < points.length; i++) {
            var j = (i + 1) % points.length;
            sum += points[i].x * points[j].y - points[j].x * points[i].y;
        }
        return Math.abs(sum) * 0.5;
    }

    function perimeterPx(points) {
        if (!points || points.length < 2) return 0;
        var total = 0;
        for (var i = 0; i < points.length; i++) {
            var j = (i + 1) % points.length;
            var dx = points[j].x - points[i].x;
            var dy = points[j].y - points[i].y;
            total += Math.sqrt(dx * dx + dy * dy);
        }
        return total;
    }

    function centroid(points) {
        if (!points || !points.length) return { x: 0, y: 0 };
        if (points.length < 3) {
            var sx = 0, sy = 0;
            for (var k = 0; k < points.length; k++) {
                sx += points[k].x;
                sy += points[k].y;
            }
            return { x: sx / points.length, y: sy / points.length };
        }
        var cx = 0, cy = 0, a = 0;
        for (var i = 0; i < points.length; i++) {
            var j = (i + 1) % points.length;
            var cross = points[i].x * points[j].y - points[j].x * points[i].y;
            a += cross;
            cx += (points[i].x + points[j].x) * cross;
            cy += (points[i].y + points[j].y) * cross;
        }
        a *= 0.5;
        if (Math.abs(a) < 1e-6) {
            return { x: points[0].x, y: points[0].y };
        }
        return { x: cx / (6 * a), y: cy / (6 * a) };
    }

    function clonePoints(points) {
        return (points || []).map(function (p) {
            return { x: p.x, y: p.y };
        });
    }

    /**
     * Đo diện tích/chu vi đa giác kín (AutoCAD Area-like).
     * @returns {object|null}
     */
    function measure(points, metersPerGrid, gridSize) {
        if (!points || points.length < MIN_VERTICES) return null;
        var mpg = metersPerGrid != null ? metersPerGrid : 0.5;
        var gs = gridSize != null ? gridSize : 40;
        var mPerPx = mpg / gs;
        var pts = clonePoints(points);
        var areaPx = shoelaceAreaPx(pts);
        var periPx = perimeterPx(pts);
        if (areaPx < MIN_EDGE_PX * MIN_EDGE_PX * 0.5) return null;
        var c = centroid(pts);
        return {
            points: pts,
            vertexCount: pts.length,
            areaPx: areaPx,
            perimeterPx: periPx,
            areaM2: areaPx * mPerPx * mPerPx,
            perimeterM: periPx * mPerPx,
            centroid: c,
            source: 'points'
        };
    }

    /** 4 góc phòng chữ nhật (không xoay phức tạp — đủ MVP). */
    function rectToPoints(room) {
        if (!room) return null;
        var x = room.x || 0;
        var y = room.y || 0;
        var w = room.width || 0;
        var h = room.height || 0;
        if (w < MIN_EDGE_PX || h < MIN_EDGE_PX) return null;
        return [
            { x: x, y: y },
            { x: x + w, y: y },
            { x: x + w, y: y + h },
            { x: x, y: y + h }
        ];
    }

    /**
     * Đo từ đối tượng phòng hiện có (rect / polygon / circle).
     */
    function measureFromRoom(room, metersPerGrid, gridSize) {
        if (!room) return null;
        var mpg = metersPerGrid != null ? metersPerGrid : 0.5;
        var gs = gridSize != null ? gridSize : 40;
        var mPerPx = mpg / gs;

        if (room.shape === 'circle' && room.radius > 0) {
            var r = room.radius;
            var areaPx = Math.PI * r * r;
            var periPx = 2 * Math.PI * r;
            return {
                points: null,
                vertexCount: 0,
                areaPx: areaPx,
                perimeterPx: periPx,
                areaM2: areaPx * mPerPx * mPerPx,
                perimeterM: periPx * mPerPx,
                centroid: { x: room.cx, y: room.cy },
                source: 'room',
                roomShape: 'circle',
                radiusPx: r
            };
        }

        var pts = null;
        if (room.shape === 'polygon' && room.points && room.points.length >= 3) {
            pts = clonePoints(room.points);
        } else {
            pts = rectToPoints(room);
        }
        var m = measure(pts, mpg, gs);
        if (!m) return null;
        m.source = 'room';
        m.roomShape = room.shape || 'rect';
        return m;
    }

    function formatResult(m, digits) {
        digits = digits != null ? digits : 2;
        if (!m) return '';
        return 'Diện tích: ' + m.areaM2.toFixed(digits) + ' m²' +
            ' · Chu vi: ' + m.perimeterM.toFixed(digits) + ' m';
    }

    return {
        MIN_VERTICES: MIN_VERTICES,
        shoelaceAreaPx: shoelaceAreaPx,
        perimeterPx: perimeterPx,
        centroid: centroid,
        measure: measure,
        measureFromRoom: measureFromRoom,
        rectToPoints: rectToPoints,
        formatResult: formatResult
    };
});
