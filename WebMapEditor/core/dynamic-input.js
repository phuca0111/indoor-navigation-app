// ============================================================
// DYNAMIC-INPUT.JS — Nhập chiều dài/góc khi vẽ (Phase 1)
// Giống AutoCAD dynamic input khi đang vẽ Wall/Line:
//   100      — chiều dài (px) theo hướng con trỏ
//   2.5m     — chiều dài mét (theo scale editor)
//   @100<45  — cực: dài 100px, góc 45° (0° = +X, ngược chiều kim)
//   @50,30   — tương đối Cartesian từ điểm neo
//   <45      — giữ khoảng cách hiện tới con trỏ, đổi góc 45°
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.DynamicInput = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function toPixels(val, isMeters) {
        if (!isMeters) return val;
        if (typeof globalThis.metersToPixels === 'function') {
            return globalThis.metersToPixels(val);
        }
        var gs = typeof globalThis.GRID_SIZE === 'number' ? globalThis.GRID_SIZE : 40;
        var mpg = typeof globalThis.metersPerGrid === 'number' ? globalThis.metersPerGrid : 0.5;
        if (!(mpg > 0)) mpg = 0.5;
        return (val / mpg) * gs;
    }

    function normalizeText(text) {
        return String(text || '').trim().replace(/\s+/g, '');
    }

    /**
     * @param {string} text
     * @param {{x:number,y:number}} anchor — điểm neo
     * @param {{x:number,y:number}} [reference] — hướng tham chiếu (con trỏ / preview)
     * @returns {{ok:boolean, x?:number, y?:number, error?:string, mode?:string}}
     */
    function resolvePoint(text, anchor, reference) {
        if (!anchor || anchor.x == null || anchor.y == null) {
            return { ok: false, error: 'no_anchor' };
        }
        var raw = normalizeText(text);
        if (!raw) return { ok: false, error: 'empty' };

        // @dx,dy — tương đối Cartesian
        var cart = raw.match(/^@?(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
        if (cart) {
            return {
                ok: true,
                mode: 'cartesian',
                x: anchor.x + parseFloat(cart[1]),
                y: anchor.y + parseFloat(cart[2])
            };
        }

        // L<A hoặc @L<A — cực (L có thể kèm m)
        var polar = raw.match(/^@?(-?\d+(?:\.\d+)?)(m)?<(-?\d+(?:\.\d+)?)$/i);
        if (polar) {
            var lenP = toPixels(parseFloat(polar[1]), !!polar[2]);
            var angP = parseFloat(polar[3]) * Math.PI / 180;
            return {
                ok: true,
                mode: 'polar',
                x: anchor.x + Math.cos(angP) * lenP,
                y: anchor.y + Math.sin(angP) * lenP
            };
        }

        // <A — chỉ góc, giữ khoảng cách anchor → reference
        var angOnly = raw.match(/^<(-?\d+(?:\.\d+)?)$/);
        if (angOnly) {
            if (!reference) return { ok: false, error: 'no_reference' };
            var angA = parseFloat(angOnly[1]) * Math.PI / 180;
            var distA = Math.hypot(reference.x - anchor.x, reference.y - anchor.y);
            if (distA < 1e-6) return { ok: false, error: 'zero_distance' };
            return {
                ok: true,
                mode: 'angle',
                x: anchor.x + Math.cos(angA) * distA,
                y: anchor.y + Math.sin(angA) * distA
            };
        }

        // L hoặc @L — chiều dài theo hướng reference
        var distOnly = raw.match(/^@?(-?\d+(?:\.\d+)?)(m)?$/i);
        if (distOnly) {
            if (!reference) return { ok: false, error: 'no_reference' };
            var lenD = toPixels(parseFloat(distOnly[1]), !!distOnly[2]);
            var dx = reference.x - anchor.x;
            var dy = reference.y - anchor.y;
            var d = Math.hypot(dx, dy);
            if (d < 1e-6) {
                // Không có hướng — mặc định +X
                return { ok: true, mode: 'length', x: anchor.x + lenD, y: anchor.y };
            }
            return {
                ok: true,
                mode: 'length',
                x: anchor.x + (dx / d) * lenD,
                y: anchor.y + (dy / d) * lenD
            };
        }

        return { ok: false, error: 'parse_failed' };
    }

    /** Góc độ (0–360) từ anchor tới reference. */
    function angleDegBetween(anchor, reference) {
        if (!anchor || !reference) return null;
        var dx = reference.x - anchor.x;
        var dy = reference.y - anchor.y;
        if (Math.hypot(dx, dy) < 1e-6) return null;
        var deg = Math.atan2(dy, dx) * 180 / Math.PI;
        if (deg < 0) deg += 360;
        return deg;
    }

    /** Khoảng cách px giữa 2 điểm. */
    function distanceBetween(a, b) {
        if (!a || !b) return 0;
        return Math.hypot(b.x - a.x, b.y - a.y);
    }

    return {
        resolvePoint: resolvePoint,
        toPixels: toPixels,
        angleDegBetween: angleDegBetween,
        distanceBetween: distanceBetween,
        normalizeText: normalizeText
    };
});
