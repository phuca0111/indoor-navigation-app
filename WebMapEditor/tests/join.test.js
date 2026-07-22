// Test Join (J): joinPolylines — nối 2 polyline theo cặp đầu mút gần nhất.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GE = require('../core/geometry/geometry-engine.js');

describe('GeometryEngine.joinPolylines', function () {
    it('đuôi A trùng đầu B → nối, bỏ điểm lặp', function () {
        var A = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
        var B = [{ x: 10, y: 0 }, { x: 10, y: 10 }];
        var res = GE.joinPolylines(A, B, 1e-6);
        expect(res).toBeTruthy();
        expect(res.gap).toBeCloseTo(0, 6);
        expect(res.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    });

    it('tự đảo chiều B khi đuôi A gần đuôi B', function () {
        var A = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
        var B = [{ x: 20, y: 0 }, { x: 10, y: 0 }]; // đuôi B (10,0) trùng đuôi A
        var res = GE.joinPolylines(A, B, 1e-6);
        expect(res.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]);
    });

    it('tự đảo chiều A khi đầu A gần đầu B', function () {
        var A = [{ x: 10, y: 0 }, { x: 0, y: 0 }]; // đầu A (10,0)
        var B = [{ x: 10, y: 0 }, { x: 20, y: 0 }]; // đầu B (10,0)
        var res = GE.joinPolylines(A, B, 1e-6);
        // rev(A)=[(0,0),(10,0)] + B bỏ điểm trùng → [(0,0),(10,0),(20,0)]
        expect(res.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]);
    });

    it('có khe hở → bắc cầu, giữ cả 2 điểm và báo gap', function () {
        var A = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
        var B = [{ x: 13, y: 0 }, { x: 20, y: 0 }];
        var res = GE.joinPolylines(A, B, 1e-6);
        expect(res.gap).toBeCloseTo(3, 6);
        expect(res.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 13, y: 0 }, { x: 20, y: 0 }]);
    });

    it('polyline nhiều đỉnh giữ nguyên thứ tự', function () {
        var A = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
        var B = [{ x: 10, y: 0 }, { x: 15, y: 5 }];
        var res = GE.joinPolylines(A, B, 1e-6);
        expect(res.points.length).toBe(4);
        expect(res.points[3]).toEqual({ x: 15, y: 5 });
    });

    it('thiếu điểm → null', function () {
        expect(GE.joinPolylines([{ x: 0, y: 0 }], [{ x: 1, y: 1 }, { x: 2, y: 2 }], 1e-6)).toBeNull();
        expect(GE.joinPolylines(null, null, 1e-6)).toBeNull();
    });
});

describe('GeometryEngine.closePolyline', function () {
    it('đóng polyline mở bằng cách thêm đỉnh đầu', function () {
        var pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
        var res = GE.closePolyline(pts, 1e-6);
        expect(res).toBeTruthy();
        expect(res.alreadyClosed).toBe(false);
        expect(res.closed).toBe(true);
        expect(res.points.length).toBe(4);
        expect(res.points[3]).toEqual({ x: 0, y: 0 });
    });

    it('đã gần khép → snap đuôi về đầu', function () {
        var pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0.0000001 }];
        var res = GE.closePolyline(pts, 1e-3);
        expect(res.alreadyClosed).toBe(true);
        expect(res.points[2]).toEqual({ x: 0, y: 0 });
    });

    it('< 3 đỉnh → null', function () {
        expect(GE.closePolyline([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1e-6)).toBeNull();
    });
});

describe('GeometryEngine PEdit Fit/Spline', function () {
    var points = [{ x: 0, y: 0 }, { x: 40, y: 50 }, { x: 100, y: 0 }];

    it('Fit làm mượt và giữ hai đầu polyline mở', function () {
        var fitted = GE.fitPolyline(points, false);
        expect(fitted.length).toBeGreaterThan(points.length);
        expect(fitted[0]).toEqual(points[0]);
        expect(fitted[fitted.length - 1]).toEqual(points[2]);
    });

    it('Spline nội suy qua các đỉnh và giữ hai đầu', function () {
        var spline = GE.splinePolyline(points, false, 4);
        expect(spline).toHaveLength(9);
        expect(spline[0]).toEqual(points[0]);
        expect(spline[4].x).toBeCloseTo(points[1].x, 6);
        expect(spline[4].y).toBeCloseTo(points[1].y, 6);
        expect(spline[8]).toEqual(points[2]);
    });

    it('đường kín sau Fit/Spline vẫn khép kín', function () {
        var closed = points.concat([{ x: 0, y: 0 }]);
        var fitted = GE.fitPolyline(closed, true);
        var spline = GE.splinePolyline(closed, true, 3);
        expect(fitted[0]).toEqual(fitted[fitted.length - 1]);
        expect(spline[0]).toEqual(spline[spline.length - 1]);
    });

    it('dữ liệu không hợp lệ trả null', function () {
        expect(GE.fitPolyline([{ x: 0, y: 0 }], false)).toBeNull();
        expect(GE.splinePolyline([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: NaN, y: 4 }], false)).toBeNull();
    });
});
