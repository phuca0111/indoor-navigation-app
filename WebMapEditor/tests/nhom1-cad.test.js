// Test Nhóm 1 CAD: Arc (3 điểm), Align (2 cặp điểm), Linetype/LWeight helpers.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GE = require('../core/geometry/geometry-engine.js');
const U = require('../js/utils.js');

describe('GeometryEngine.arcFrom3Points', function () {
    it('dựng cung nửa đường tròn qua (1,0)-(0,1)-(-1,0) → tâm gốc, R=1', function () {
        var arc = GE.arcFrom3Points({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 });
        expect(arc).not.toBeNull();
        expect(arc.cx).toBeCloseTo(0, 6);
        expect(arc.cy).toBeCloseTo(0, 6);
        expect(arc.radius).toBeCloseTo(1, 6);
    });

    it('3 điểm thẳng hàng → null', function () {
        var arc = GE.arcFrom3Points({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 });
        expect(arc).toBeNull();
    });

    it('arcToPolyline: điểm đầu/cuối trùng start/end và mọi điểm cách tâm = R', function () {
        var arc = GE.arcFrom3Points({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 });
        var pts = GE.arcToPolyline(arc, 16);
        expect(pts.length).toBe(17);
        expect(pts[0].x).toBeCloseTo(1, 6);
        expect(pts[0].y).toBeCloseTo(0, 6);
        expect(pts[pts.length - 1].x).toBeCloseTo(-1, 6);
        expect(pts[pts.length - 1].y).toBeCloseTo(0, 6);
        pts.forEach(function (p) {
            expect(Math.hypot(p.x - arc.cx, p.y - arc.cy)).toBeCloseTo(1, 5);
        });
    });

    it('cung đi qua điểm giữa: điểm giữa (0,1) nằm trên polyline (y>0)', function () {
        var arc = GE.arcFrom3Points({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 });
        var pts = GE.arcToPolyline(arc, 32);
        var maxY = Math.max.apply(null, pts.map(function (p) { return p.y; }));
        expect(maxY).toBeCloseTo(1, 5); // cung phồng lên phía y dương
    });

    it('cung phía dưới: điểm giữa (0,-1) → polyline phồng xuống (y<0)', function () {
        var arc = GE.arcFrom3Points({ x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 });
        var pts = GE.arcToPolyline(arc, 32);
        var minY = Math.min.apply(null, pts.map(function (p) { return p.y; }));
        expect(minY).toBeCloseTo(-1, 5);
    });
});

describe('GeometryEngine.computeAlignTransform', function () {
    it('tịnh tiến thuần: s1→d1, s2→d2 cùng vector dịch', function () {
        var m = GE.computeAlignTransform(
            { x: 0, y: 0 }, { x: 2, y: 0 },
            { x: 5, y: 5 }, { x: 7, y: 5 }
        );
        expect(m.scale).toBeCloseTo(1, 6);
        expect(m.rotation).toBeCloseTo(0, 6);
        var p = GE.applyTransformPoint(m, { x: 0, y: 0 });
        expect(p.x).toBeCloseTo(5, 6);
        expect(p.y).toBeCloseTo(5, 6);
        var q = GE.applyTransformPoint(m, { x: 2, y: 0 });
        expect(q.x).toBeCloseTo(7, 6);
        expect(q.y).toBeCloseTo(5, 6);
    });

    it('scale ×2 + xoay 90°: đưa (0,0)-(1,0) tới (0,0)-(0,2)', function () {
        var m = GE.computeAlignTransform(
            { x: 0, y: 0 }, { x: 1, y: 0 },
            { x: 0, y: 0 }, { x: 0, y: 2 }
        );
        expect(m.scale).toBeCloseTo(2, 6);
        expect(m.rotation).toBeCloseTo(Math.PI / 2, 6);
        var end = GE.applyTransformPoint(m, { x: 1, y: 0 });
        expect(end.x).toBeCloseTo(0, 6);
        expect(end.y).toBeCloseTo(2, 6);
    });

    it('ánh xạ đúng cả 2 cặp điểm bất kỳ', function () {
        var s1 = { x: 3, y: 1 }, s2 = { x: 5, y: 4 };
        var d1 = { x: -2, y: 7 }, d2 = { x: 1, y: 9 };
        var m = GE.computeAlignTransform(s1, s2, d1, d2);
        var a = GE.applyTransformPoint(m, s1);
        var b = GE.applyTransformPoint(m, s2);
        expect(a.x).toBeCloseTo(d1.x, 6);
        expect(a.y).toBeCloseTo(d1.y, 6);
        expect(b.x).toBeCloseTo(d2.x, 6);
        expect(b.y).toBeCloseTo(d2.y, 6);
    });

    it('2 điểm nguồn trùng nhau → null', function () {
        var m = GE.computeAlignTransform({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 2 });
        expect(m).toBeNull();
    });
});

describe('Utils linetype / lweight', function () {
    it('normalizeLineStyle: giá trị lạ → solid', function () {
        expect(U.normalizeLineStyle('dashed')).toBe('dashed');
        expect(U.normalizeLineStyle('dotted')).toBe('dotted');
        expect(U.normalizeLineStyle('dashdot')).toBe('dashdot');
        expect(U.normalizeLineStyle('xyz')).toBe('solid');
        expect(U.normalizeLineStyle(undefined)).toBe('solid');
    });

    it('clampLineWeight: kẹp trong [0.5, 20], mặc định 2', function () {
        expect(U.clampLineWeight(3)).toBe(3);
        expect(U.clampLineWeight(0)).toBe(0.5);
        expect(U.clampLineWeight(999)).toBe(20);
        expect(U.clampLineWeight('abc')).toBe(2);
    });

    it('getLineDashPattern: solid → [], khác → mảng > 0, chia zoom', function () {
        expect(U.getLineDashPattern('solid', 1)).toEqual([]);
        expect(U.getLineDashPattern('dashed', 1).length).toBe(2);
        expect(U.getLineDashPattern('dashdot', 1).length).toBe(4);
        var d1 = U.getLineDashPattern('dashed', 1);
        var d2 = U.getLineDashPattern('dashed', 2);
        expect(d2[0]).toBeCloseTo(d1[0] / 2, 6);
    });

    it('clampLtScale / getLineDashPattern: LTScale nhân dash', function () {
        expect(U.clampLtScale(2)).toBe(2);
        expect(U.clampLtScale(0)).toBe(1);
        expect(U.clampLtScale(99)).toBe(10);
        expect(U.clampLtScale(-1)).toBe(1);
        var base = U.getLineDashPattern('dashed', 1, 1);
        var scaled = U.getLineDashPattern('dashed', 1, 2);
        expect(scaled[0]).toBeCloseTo(base[0] * 2, 6);
        expect(scaled[1]).toBeCloseTo(base[1] * 2, 6);
        var dotted = U.getLineDashPattern('dotted', 1, 0.5);
        var dotted1 = U.getLineDashPattern('dotted', 1, 1);
        expect(dotted[0]).toBeCloseTo(dotted1[0] * 0.5, 6);
    });
});
