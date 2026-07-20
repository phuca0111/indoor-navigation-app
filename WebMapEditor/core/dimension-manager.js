// ============================================================
// DIMENSION-MANAGER.JS — Engine kích thước (Phase 3 Annotation)
// Hỗ trợ: dimlinear · dimaligned · dimcontinue · dimradius · dimdiameter · dimangular
// Model lưu: { id, type, p1, p2, p3?, orientation?, offset, textOverride?, color, layerId }
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.DimensionManager = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var MIN_LEN_PX = 2;

    // Kiểu chữ / mũi tên dùng chung (Dim Style)
    var style = {
        arrowPx: 8,      // nửa độ dài tick / kích thước mũi tên
        textPx: 12,
        decimals: 2,
        extGapPx: 2,     // khe hở đầu đường gióng
        extOverPx: 6     // đường gióng vượt quá đường dim
    };

    function getStyle() { return Object.assign({}, style); }
    function setStyle(partial) {
        if (!partial) return getStyle();
        Object.keys(partial).forEach(function (k) {
            if (style[k] !== undefined && typeof partial[k] === 'number' && isFinite(partial[k])) {
                style[k] = partial[k];
            }
        });
        return getStyle();
    }

    function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
    function toMeters(px, mpg, gs) {
        var m = (mpg != null ? mpg : 0.5);
        var g = (gs != null ? gs : 40);
        return (px / g) * m;
    }

    function formatLabel(lengthPx, mpg, gs, decimals) {
        var d = decimals != null ? decimals : style.decimals;
        return toMeters(lengthPx, mpg, gs).toFixed(d) + ' m';
    }

    // ---------- Khởi tạo dim ----------

    function baseDim(type, opts) {
        opts = opts || {};
        return {
            id: opts.id != null ? opts.id : Date.now(),
            type: type,
            offset: 0,
            textOverride: undefined,
            color: opts.color || defaultColor(type),
            layerId: opts.layerId || 'default'
        };
    }

    function defaultColor(type) {
        if (type === 'dimaligned') return '#c026d3';
        if (type === 'dimradius' || type === 'dimdiameter') return '#0891b2';
        if (type === 'dimangular') return '#d97706';
        return '#e11d48';
    }

    function createDimlinear(p1, p2, place, opts) {
        if (!p1 || !p2 || dist(p1, p2) < MIN_LEN_PX) return null;
        var dim = baseDim('dimlinear', opts);
        dim.p1 = { x: p1.x, y: p1.y };
        dim.p2 = { x: p2.x, y: p2.y };
        var dx = Math.abs(p2.x - p1.x), dy = Math.abs(p2.y - p1.y);
        dim.orientation = (opts && opts.orientation) || (dx >= dy ? 'horizontal' : 'vertical');
        dim.offset = 0;
        if (place) updateOffsetFromPlace(dim, place);
        else dim.offset = 24;
        return dim;
    }

    function createDimaligned(p1, p2, place, opts) {
        if (!p1 || !p2 || dist(p1, p2) < MIN_LEN_PX) return null;
        var dim = baseDim('dimaligned', opts);
        dim.p1 = { x: p1.x, y: p1.y };
        dim.p2 = { x: p2.x, y: p2.y };
        dim.offset = 0;
        if (place) updateOffsetFromPlace(dim, place);
        else dim.offset = 24;
        return dim;
    }

    /** Radius: p1 = tâm, p2 = điểm trên đường tròn */
    function createDimradius(center, edge, opts) {
        if (!center || !edge || dist(center, edge) < MIN_LEN_PX) return null;
        var dim = baseDim('dimradius', opts);
        dim.p1 = { x: center.x, y: center.y };
        dim.p2 = { x: edge.x, y: edge.y };
        dim.offset = 0;
        return dim;
    }

    /** Diameter: p1, p2 = 2 đầu đường kính (đi qua tâm) */
    function createDimdiameter(end1, end2, opts) {
        if (!end1 || !end2 || dist(end1, end2) < MIN_LEN_PX) return null;
        var dim = baseDim('dimdiameter', opts);
        dim.p1 = { x: end1.x, y: end1.y };
        dim.p2 = { x: end2.x, y: end2.y };
        dim.offset = 0;
        return dim;
    }

    /** Angular: p1 = đỉnh, p2 = điểm tia 1, p3 = điểm tia 2 */
    function createDimangular(vertex, ray1, ray2, place, opts) {
        if (!vertex || !ray1 || !ray2) return null;
        if (dist(vertex, ray1) < MIN_LEN_PX || dist(vertex, ray2) < MIN_LEN_PX) return null;
        var dim = baseDim('dimangular', opts);
        dim.p1 = { x: vertex.x, y: vertex.y };
        dim.p2 = { x: ray1.x, y: ray1.y };
        dim.p3 = { x: ray2.x, y: ray2.y };
        var r = place ? dist(vertex, place) : Math.min(dist(vertex, ray1), dist(vertex, ray2)) * 0.6;
        dim.offset = Math.max(12, r);
        return dim;
    }

    // ---------- Cập nhật vị trí ----------

    function updateOffsetFromPlace(dim, place) {
        if (!dim || !place || !dim.p1 || !dim.p2) return false;
        if (dim.type === 'dimlinear') {
            if (dim.orientation === 'vertical') {
                dim.offset = place.x - (dim.p1.x + dim.p2.x) / 2;
            } else {
                dim.offset = place.y - (dim.p1.y + dim.p2.y) / 2;
            }
            return true;
        }
        if (dim.type === 'dimaligned') {
            var ux = dim.p2.x - dim.p1.x, uy = dim.p2.y - dim.p1.y;
            var len = Math.hypot(ux, uy) || 1;
            var nx = -uy / len, ny = ux / len;
            dim.offset = (place.x - dim.p1.x) * nx + (place.y - dim.p1.y) * ny;
            return true;
        }
        if (dim.type === 'dimradius') {
            var r = dist(dim.p1, dim.p2);
            var a = Math.atan2(place.y - dim.p1.y, place.x - dim.p1.x);
            dim.p2 = { x: dim.p1.x + r * Math.cos(a), y: dim.p1.y + r * Math.sin(a) };
            return true;
        }
        if (dim.type === 'dimdiameter') {
            var c = { x: (dim.p1.x + dim.p2.x) / 2, y: (dim.p1.y + dim.p2.y) / 2 };
            var rr = dist(dim.p1, dim.p2) / 2;
            var ang = Math.atan2(place.y - c.y, place.x - c.x);
            dim.p1 = { x: c.x - rr * Math.cos(ang), y: c.y - rr * Math.sin(ang) };
            dim.p2 = { x: c.x + rr * Math.cos(ang), y: c.y + rr * Math.sin(ang) };
            return true;
        }
        if (dim.type === 'dimangular') {
            dim.offset = Math.max(12, dist(dim.p1, place));
            return true;
        }
        return false;
    }

    function setTextOverride(dim, text) {
        if (!dim) return;
        dim.textOverride = (text != null && String(text) !== '') ? String(text) : undefined;
    }

    // ---------- Layout hình học ----------

    function getLayout(dim) {
        if (!dim || !dim.p1 || !dim.p2) return null;
        if (dim.type === 'dimaligned') return layoutAligned(dim);
        if (dim.type === 'dimradius') return layoutRadius(dim);
        if (dim.type === 'dimdiameter') return layoutDiameter(dim);
        if (dim.type === 'dimangular') return layoutAngular(dim);
        return layoutLinear(dim);
    }

    function layoutLinear(dim) {
        var p1 = dim.p1, p2 = dim.p2;
        var over = style.extOverPx, gap = style.extGapPx;
        if (dim.orientation === 'vertical') {
            var dimX = (p1.x + p2.x) / 2 + (dim.offset || 0);
            var a = { x: dimX, y: p1.y }, b = { x: dimX, y: p2.y };
            return {
                orientation: 'vertical',
                ext1: [{ x: p1.x + Math.sign(dimX - p1.x) * gap, y: p1.y }, { x: dimX + Math.sign(dimX - p1.x) * over, y: p1.y }],
                ext2: [{ x: p2.x + Math.sign(dimX - p2.x) * gap, y: p2.y }, { x: dimX + Math.sign(dimX - p2.x) * over, y: p2.y }],
                dimLine: [a, b],
                label: { x: dimX, y: (p1.y + p2.y) / 2 },
                lengthPx: Math.abs(p2.y - p1.y),
                arrow: style.arrowPx
            };
        }
        var dimY = (p1.y + p2.y) / 2 + (dim.offset || 0);
        var a2 = { x: p1.x, y: dimY }, b2 = { x: p2.x, y: dimY };
        return {
            orientation: 'horizontal',
            ext1: [{ x: p1.x, y: p1.y + Math.sign(dimY - p1.y) * gap }, { x: p1.x, y: dimY + Math.sign(dimY - p1.y) * over }],
            ext2: [{ x: p2.x, y: p2.y + Math.sign(dimY - p2.y) * gap }, { x: p2.x, y: dimY + Math.sign(dimY - p2.y) * over }],
            dimLine: [a2, b2],
            label: { x: (p1.x + p2.x) / 2, y: dimY },
            lengthPx: Math.abs(p2.x - p1.x),
            arrow: style.arrowPx
        };
    }

    function layoutAligned(dim) {
        var p1 = dim.p1, p2 = dim.p2;
        var ux = p2.x - p1.x, uy = p2.y - p1.y;
        var len = Math.hypot(ux, uy) || 1;
        var nx = -uy / len, ny = ux / len;
        var off = dim.offset || 0;
        var a = { x: p1.x + nx * off, y: p1.y + ny * off };
        var b = { x: p2.x + nx * off, y: p2.y + ny * off };
        var over = style.extOverPx, gap = style.extGapPx;
        var s = off >= 0 ? 1 : -1;
        return {
            orientation: 'aligned',
            nx: nx, ny: ny,
            ext1: [{ x: p1.x + nx * gap * s, y: p1.y + ny * gap * s }, { x: a.x + nx * over * s, y: a.y + ny * over * s }],
            ext2: [{ x: p2.x + nx * gap * s, y: p2.y + ny * gap * s }, { x: b.x + nx * over * s, y: b.y + ny * over * s }],
            dimLine: [a, b],
            label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            lengthPx: len,
            arrow: style.arrowPx
        };
    }

    function layoutRadius(dim) {
        var c = dim.p1, e = dim.p2;
        var r = dist(c, e);
        var dx = e.x - c.x, dy = e.y - c.y;
        var ux = dx / (r || 1), uy = dy / (r || 1);
        return {
            type: 'dimradius',
            leader: [c, e],
            arrowAt: e, dir: { x: ux, y: uy },
            label: { x: e.x + ux * 14, y: e.y + uy * 14 },
            lengthPx: r,
            arrow: style.arrowPx
        };
    }

    function layoutDiameter(dim) {
        var p1 = dim.p1, p2 = dim.p2;
        var d = dist(p1, p2);
        var ux = (p2.x - p1.x) / (d || 1), uy = (p2.y - p1.y) / (d || 1);
        return {
            type: 'dimdiameter',
            dimLine: [p1, p2],
            arrowA: p1, arrowB: p2, dir: { x: ux, y: uy },
            label: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
            lengthPx: d,
            arrow: style.arrowPx
        };
    }

    function layoutAngular(dim) {
        var v = dim.p1, r1 = dim.p2, r2 = dim.p3 || dim.p2;
        var a1 = Math.atan2(r1.y - v.y, r1.x - v.x);
        var a2 = Math.atan2(r2.y - v.y, r2.x - v.x);
        var r = dim.offset || 24;
        var da = a2 - a1;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        var mid = a1 + da / 2;
        return {
            type: 'dimangular',
            vertex: v, r: r,
            startAng: a1, endAng: a1 + da, sweep: da,
            p1End: { x: v.x + r * Math.cos(a1), y: v.y + r * Math.sin(a1) },
            p2End: { x: v.x + r * Math.cos(a1 + da), y: v.y + r * Math.sin(a1 + da) },
            ray1: [v, r1], ray2: [v, r2],
            label: { x: v.x + (r + 14) * Math.cos(mid), y: v.y + (r + 14) * Math.sin(mid) },
            angleDeg: Math.abs(da) * 180 / Math.PI,
            arrow: style.arrowPx
        };
    }

    // ---------- Nhãn hiển thị ----------

    function getDisplayLabel(dim, mpg, gs, decimals) {
        if (dim && dim.textOverride != null && String(dim.textOverride) !== '') {
            return String(dim.textOverride);
        }
        var layout = getLayout(dim);
        if (!layout) return '';
        if (dim.type === 'dimangular') {
            return layout.angleDeg.toFixed(1) + '°';
        }
        var prefix = '';
        if (dim.type === 'dimradius') prefix = 'R ';
        else if (dim.type === 'dimdiameter') prefix = '\u2300 ';
        return prefix + formatLabel(layout.lengthPx, mpg, gs, decimals);
    }

    // ---------- Hit-test ----------

    function distToSeg(px, py, a, b) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var l2 = dx * dx + dy * dy;
        if (l2 < 1e-9) return Math.hypot(px - a.x, py - a.y);
        var t = ((px - a.x) * dx + (py - a.y) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
    }

    function hitTest(dim, wx, wy, threshold) {
        var layout = getLayout(dim);
        if (!layout) return false;
        var th = threshold != null ? threshold : 6;
        var p = { x: wx, y: wy };
        if (layout.label && Math.hypot(wx - layout.label.x, wy - layout.label.y) <= th * 2) return true;
        if (layout.dimLine) return distToSeg(wx, wy, layout.dimLine[0], layout.dimLine[1]) <= th;
        if (layout.leader) return distToSeg(wx, wy, layout.leader[0], layout.leader[1]) <= th;
        if (layout.type === 'dimangular') {
            var dd = Math.abs(Math.hypot(wx - layout.vertex.x, wy - layout.vertex.y) - layout.r);
            return dd <= th * 1.5;
        }
        return false;
    }

    return {
        MIN_LEN_PX: MIN_LEN_PX,
        createDimlinear: createDimlinear,
        createDimaligned: createDimaligned,
        createDimradius: createDimradius,
        createDimdiameter: createDimdiameter,
        createDimangular: createDimangular,
        updateOffsetFromPlace: updateOffsetFromPlace,
        setTextOverride: setTextOverride,
        getLayout: getLayout,
        formatLabel: formatLabel,
        getDisplayLabel: getDisplayLabel,
        hitTest: hitTest,
        getStyle: getStyle,
        setStyle: setStyle
    };
});
