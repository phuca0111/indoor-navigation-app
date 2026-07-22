// Test Polygon đều (POL): regularPolygon
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GE = require('../core/geometry/geometry-engine.js');
const RP = require('../js/regpoly-tool.js');

describe('GeometryEngine.regularPolygon', function () {
    it('tam giác đều 3 đỉnh, đỉnh đầu theo góc 0', function () {
        var pts = GE.regularPolygon(0, 0, 10, 3, 0);
        expect(pts.length).toBe(3);
        expect(pts[0].x).toBeCloseTo(10, 6);
        expect(pts[0].y).toBeCloseTo(0, 6);
        // khoảng cách cạnh đều
        var e01 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        var e12 = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);
        var e20 = Math.hypot(pts[0].x - pts[2].x, pts[0].y - pts[2].y);
        expect(e01).toBeCloseTo(e12, 6);
        expect(e12).toBeCloseTo(e20, 6);
    });

    it('vuông 4 cạnh, xoay 0: đỉnh tại (±r,0)/(0,±r) xen kẽ', function () {
        var pts = GE.regularPolygon(0, 0, 5, 4, 0);
        expect(pts.length).toBe(4);
        expect(pts[0].x).toBeCloseTo(5, 6);
        expect(pts[0].y).toBeCloseTo(0, 6);
        expect(pts[1].x).toBeCloseTo(0, 6);
        expect(pts[1].y).toBeCloseTo(5, 6);
        expect(pts[2].x).toBeCloseTo(-5, 6);
        expect(pts[2].y).toBeCloseTo(0, 6);
        expect(pts[3].x).toBeCloseTo(0, 6);
        expect(pts[3].y).toBeCloseTo(-5, 6);
    });

    it('tôn trọng tâm lệch', function () {
        var pts = GE.regularPolygon(100, 50, 20, 4, 0);
        expect(pts[0].x).toBeCloseTo(120, 6);
        expect(pts[0].y).toBeCloseTo(50, 6);
    });

    it('mọi đỉnh cách tâm đúng bán kính', function () {
        var r = 12;
        var pts = GE.regularPolygon(3, -4, r, 7, 0.3);
        pts.forEach(function (p) {
            expect(Math.hypot(p.x - 3, p.y + 4)).toBeCloseTo(r, 6);
        });
    });

    it('sides < 3 → nâng lên 3; > 64 → hạ xuống 64', function () {
        expect(GE.regularPolygon(0, 0, 10, 2, 0).length).toBe(3);
        expect(GE.regularPolygon(0, 0, 10, 100, 0).length).toBe(64);
    });

    it('radius = 0 → mọi điểm trùng tâm', function () {
        var pts = GE.regularPolygon(7, 8, 0, 5, 0);
        pts.forEach(function (p) {
            expect(p.x).toBeCloseTo(7, 9);
            expect(p.y).toBeCloseTo(8, 9);
        });
    });
});

describe('clampRegPolySides', function () {
    it('kẹp 3–64', function () {
        expect(RP.clampRegPolySides(2)).toBe(3);
        expect(RP.clampRegPolySides(6.7)).toBe(7);
        expect(RP.clampRegPolySides(100)).toBe(64);
        expect(RP.clampRegPolySides(null)).toBe(6);
    });
});
