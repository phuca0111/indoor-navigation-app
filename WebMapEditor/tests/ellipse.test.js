// Test Ellipse (EL): ellipsePolyline — polyline kín xấp xỉ hình elip.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GE = require('../core/geometry/geometry-engine.js');

describe('GeometryEngine.ellipsePolyline', function () {
    it('trả về segs+1 điểm và khép kín (điểm cuối trùng điểm đầu)', function () {
        var pts = GE.ellipsePolyline(0, 0, 10, 5, 0, 48);
        expect(pts.length).toBe(49);
        expect(pts[0].x).toBeCloseTo(pts[48].x, 9);
        expect(pts[0].y).toBeCloseTo(pts[48].y, 9);
    });

    it('không xoay: các điểm mốc nằm đúng trên trục lớn/nhỏ (segs=8)', function () {
        var pts = GE.ellipsePolyline(0, 0, 10, 5, 0, 8);
        // i=0→0°, i=2→90°, i=4→180°, i=6→270°
        expect(pts[0].x).toBeCloseTo(10, 6);
        expect(pts[0].y).toBeCloseTo(0, 6);
        expect(pts[2].x).toBeCloseTo(0, 6);
        expect(pts[2].y).toBeCloseTo(5, 6);
        expect(pts[4].x).toBeCloseTo(-10, 6);
        expect(pts[4].y).toBeCloseTo(0, 6);
        expect(pts[6].x).toBeCloseTo(0, 6);
        expect(pts[6].y).toBeCloseTo(-5, 6);
    });

    it('tôn trọng tâm lệch (cx,cy)', function () {
        var pts = GE.ellipsePolyline(100, 50, 20, 10, 0, 8);
        expect(pts[0].x).toBeCloseTo(120, 6); // 100+20
        expect(pts[0].y).toBeCloseTo(50, 6);
        expect(pts[2].x).toBeCloseTo(100, 6);
        expect(pts[2].y).toBeCloseTo(60, 6); // 50+10
    });

    it('xoay 90°: trục lớn quay theo góc', function () {
        var pts = GE.ellipsePolyline(0, 0, 10, 5, Math.PI / 2, 8);
        // i=0: điểm (rx,0) quay 90° → (0, rx)
        expect(pts[0].x).toBeCloseTo(0, 6);
        expect(pts[0].y).toBeCloseTo(10, 6);
        // i=2: điểm (0,ry) quay 90° → (-ry, 0)
        expect(pts[2].x).toBeCloseTo(-5, 6);
        expect(pts[2].y).toBeCloseTo(0, 6);
    });

    it('tròn (rx=ry): mọi điểm cách tâm đúng bán kính', function () {
        var r = 7;
        var pts = GE.ellipsePolyline(0, 0, r, r, 0, 32);
        for (var i = 0; i < pts.length; i++) {
            expect(Math.hypot(pts[i].x, pts[i].y)).toBeCloseTo(r, 6);
        }
    });

    it('segs quá nhỏ được nâng lên tối thiểu 8', function () {
        var pts = GE.ellipsePolyline(0, 0, 10, 5, 0, 2);
        expect(pts.length).toBe(9); // 8 + 1 điểm khép kín
    });
});
