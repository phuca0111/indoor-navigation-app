// ============================================================
// DIST-MEASURE.JS — Dist (DI) geometry helper (Phase 3 Annotation)
// Spec: webedit_nangcap.md §3.4 — Dist (DI)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.DistMeasure = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var MIN_LEN_PX = 2;

    /**
     * Đo khoảng cách 2 điểm (AutoCAD Dist-like).
     * @returns {object|null} { distPx, distM, dxPx, dyPx, dxM, dyM, angleDeg, p1, p2 }
     */
    function measure(p1, p2, metersPerGrid, gridSize) {
        if (!p1 || !p2) return null;
        var mpg = metersPerGrid != null ? metersPerGrid : 0.5;
        var gs = gridSize != null ? gridSize : 40;
        var dxPx = p2.x - p1.x;
        var dyPx = p2.y - p1.y;
        var distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
        if (distPx < MIN_LEN_PX) return null;
        var toM = function (px) { return (px / gs) * mpg; };
        var angleDeg = Math.atan2(dyPx, dxPx) * 180 / Math.PI;
        if (angleDeg < 0) angleDeg += 360;
        return {
            p1: { x: p1.x, y: p1.y },
            p2: { x: p2.x, y: p2.y },
            distPx: distPx,
            distM: toM(distPx),
            dxPx: dxPx,
            dyPx: dyPx,
            dxM: toM(dxPx),
            dyM: toM(dyPx),
            angleDeg: angleDeg
        };
    }

    function formatResult(m, digits) {
        digits = digits != null ? digits : 2;
        if (!m) return '';
        return 'Khoảng cách: ' + m.distM.toFixed(digits) + ' m' +
            ' · ΔX: ' + m.dxM.toFixed(digits) + ' m' +
            ' · ΔY: ' + m.dyM.toFixed(digits) + ' m' +
            ' · góc: ' + m.angleDeg.toFixed(1) + '°';
    }

    return {
        MIN_LEN_PX: MIN_LEN_PX,
        measure: measure,
        formatResult: formatResult
    };
});
