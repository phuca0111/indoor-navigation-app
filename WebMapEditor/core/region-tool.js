(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.RegionTool = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function distance(a, b) {
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function normalizeClosedPolyline(object, tolerance) {
        tolerance = Number.isFinite(tolerance) ? Math.max(0, tolerance) : 1e-6;
        var points = object && Array.isArray(object.points) ? object.points : [];
        if (points.length < 3) {
            return { ok: false, code: 'REGION_TOO_FEW_POINTS', points: [] };
        }

        var out = points.map(function (p) {
            return { x: Number(p.x), y: Number(p.y) };
        });
        if (out.some(function (p) { return !Number.isFinite(p.x) || !Number.isFinite(p.y); })) {
            return { ok: false, code: 'REGION_INVALID_POINT', points: [] };
        }

        var closeByGeometry = distance(out[0], out[out.length - 1]) <= tolerance;
        if (!object.closed && !closeByGeometry) {
            return { ok: false, code: 'REGION_NOT_CLOSED', points: out };
        }
        if (closeByGeometry) out.pop();
        if (out.length < 3) {
            return { ok: false, code: 'REGION_TOO_FEW_POINTS', points: [] };
        }
        return { ok: true, points: out };
    }

    function createRegionData(object, options) {
        options = options || {};
        var normalized = normalizeClosedPolyline(object, options.tolerance);
        if (!normalized.ok) return normalized;
        return {
            ok: true,
            points: normalized.points,
            layerId: object.layerId || options.layerId || 'default',
            sourceId: object.id != null ? object.id : null
        };
    }

    return {
        normalizeClosedPolyline: normalizeClosedPolyline,
        createRegionData: createRegionData
    };
});
