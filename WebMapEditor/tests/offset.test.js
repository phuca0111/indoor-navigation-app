// Test Offset (O): offsetPolyline — bản song song cách đều (miter join).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GE = require('../core/geometry/geometry-engine.js');

describe('GeometryEngine.offsetPolyline', function () {
    it('đoạn ngang, dist>0 → dịch theo pháp tuyến trái (+y)', function () {
        var out = GE.offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2, false);
        expect(out.length).toBe(2);
        expect(out[0].x).toBeCloseTo(0, 5);
        expect(out[0].y).toBeCloseTo(2, 5);
        expect(out[1].x).toBeCloseTo(10, 5);
        expect(out[1].y).toBeCloseTo(2, 5);
    });

    it('dist<0 → dịch ngược phía', function () {
        var out = GE.offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], -3, false);
        expect(out[0].y).toBeCloseTo(-3, 5);
        expect(out[1].y).toBeCloseTo(-3, 5);
    });

    it('góc vuông (L) → miter join giữ góc', function () {
        var out = GE.offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 2, false);
        expect(out.length).toBe(3);
        expect(out[0].x).toBeCloseTo(0, 5);
        expect(out[0].y).toBeCloseTo(2, 5);
        // đỉnh giữa = giao 2 đường offset: (8, 2)
        expect(out[1].x).toBeCloseTo(8, 5);
        expect(out[1].y).toBeCloseTo(2, 5);
        expect(out[2].x).toBeCloseTo(8, 5);
        expect(out[2].y).toBeCloseTo(10, 5);
    });

    it('hình vuông kín, pháp tuyến trái hướng vào trong → offset dương thu nhỏ đều', function () {
        var sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        var out = GE.offsetPolyline(sq, 2, true);
        expect(out.length).toBe(4);
        var xs = out.map(function (p) { return p.x; });
        var ys = out.map(function (p) { return p.y; });
        var w = Math.max.apply(null, xs) - Math.min.apply(null, xs);
        var h = Math.max.apply(null, ys) - Math.min.apply(null, ys);
        expect(w).toBeCloseTo(6, 5); // 10 - 2*2 (thu nhỏ vào trong)
        expect(h).toBeCloseTo(6, 5);
        // Vuông thu nhỏ nằm ở [2,8] x [2,8]
        expect(Math.min.apply(null, xs)).toBeCloseTo(2, 5);
        expect(Math.max.apply(null, xs)).toBeCloseTo(8, 5);
    });

    it('ít hơn 2 đỉnh → rỗng', function () {
        expect(GE.offsetPolyline([{ x: 1, y: 1 }], 2, false)).toEqual([]);
        expect(GE.offsetPolyline(null, 2, false)).toEqual([]);
    });
});
