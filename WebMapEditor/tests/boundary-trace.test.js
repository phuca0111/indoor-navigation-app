import { describe, it, expect } from 'vitest';
import BT from '../core/geometry/boundary-trace.js';

// Tiện ích tạo đoạn từ danh sách đỉnh khép kín (ví dụ hình vuông 4 đoạn)
function loop(points) {
    var segs = [];
    for (var i = 0; i < points.length; i++) {
        var a = points[i], b = points[(i + 1) % points.length];
        segs.push({ a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });
    }
    return segs;
}
function seg(ax, ay, bx, by) { return { a: { x: ax, y: ay }, b: { x: bx, y: by } }; }

function area(poly) { return Math.abs(BT.signedArea(poly)); }

describe('BoundaryTrace — tạo vùng kín (BO)', function () {
    it('hình vuông kín + điểm bên trong → polygon 4 đỉnh, đúng diện tích', function () {
        var segs = loop([[0, 0], [100, 0], [100, 100], [0, 100]]);
        var poly = BT.trace(segs, { x: 50, y: 50 });
        expect(poly).not.toBeNull();
        expect(poly.length).toBe(4);
        expect(area(poly)).toBeCloseTo(10000, 3);
    });

    it('điểm bên ngoài hình vuông → null', function () {
        var segs = loop([[0, 0], [100, 0], [100, 100], [0, 100]]);
        expect(BT.trace(segs, { x: 200, y: 200 })).toBeNull();
    });

    it('vùng bao HỞ (thiếu 1 cạnh) → null', function () {
        var segs = [seg(0, 0, 100, 0), seg(100, 0, 100, 100), seg(100, 100, 0, 100)];
        expect(BT.trace(segs, { x: 50, y: 50 })).toBeNull();
    });

    it('2 ô liền kề chung tường → click trái ra ô trái, click phải ra ô phải', function () {
        // Đường bao ngoài 0..200 x 0..100 + vách giữa x=100
        var segs = loop([[0, 0], [200, 0], [200, 100], [0, 100]]);
        segs.push(seg(100, 0, 100, 100));
        var left = BT.trace(segs, { x: 50, y: 50 });
        var right = BT.trace(segs, { x: 150, y: 50 });
        expect(left).not.toBeNull();
        expect(right).not.toBeNull();
        expect(area(left)).toBeCloseTo(10000, 3);
        expect(area(right)).toBeCloseTo(10000, 3);
        // ô trái mọi đỉnh x ≤ 100, ô phải mọi đỉnh x ≥ 100
        expect(left.every(function (p) { return p.x <= 100 + 1e-6; })).toBe(true);
        expect(right.every(function (p) { return p.x >= 100 - 1e-6; })).toBe(true);
    });

    it('tường vượt biên (cần cắt tại giao điểm) vẫn tạo ô đúng', function () {
        // Vách giữa dài quá, thò ra ngoài -20..120
        var segs = loop([[0, 0], [200, 0], [200, 100], [0, 100]]);
        segs.push(seg(100, -20, 100, 120));
        var right = BT.trace(segs, { x: 150, y: 50 });
        expect(right).not.toBeNull();
        expect(area(right)).toBeCloseTo(10000, 3);
    });

    it('hai đoạn cắt chữ thập trong khung → chọn ô con nhỏ nhất chứa điểm', function () {
        var segs = loop([[0, 0], [100, 0], [100, 100], [0, 100]]);
        segs.push(seg(50, 0, 50, 100)); // dọc giữa
        segs.push(seg(0, 50, 100, 50)); // ngang giữa
        var poly = BT.trace(segs, { x: 25, y: 25 }); // góc trên-trái
        expect(poly).not.toBeNull();
        expect(area(poly)).toBeCloseTo(2500, 3); // 50x50
    });

    it('polygon xiên (tam giác) + điểm trong → diện tích đúng', function () {
        var segs = loop([[0, 0], [100, 0], [0, 100]]);
        var poly = BT.trace(segs, { x: 20, y: 20 });
        expect(poly).not.toBeNull();
        expect(poly.length).toBe(3);
        expect(area(poly)).toBeCloseTo(5000, 3);
    });

    it('đỉnh gần trùng (sai số nhỏ) vẫn khép kín', function () {
        var segs = [
            seg(0, 0, 100, 0),
            seg(100, 0, 100, 100),
            seg(100, 100, 0, 100),
            seg(0.0004, 100, 0, 0) // lệch < MERGE(1e-3)
        ];
        var poly = BT.trace(segs, { x: 50, y: 50 });
        expect(poly).not.toBeNull();
        expect(area(poly)).toBeCloseTo(10000, 1);
    });

    it('input rỗng / thiếu tham số → null (không crash)', function () {
        expect(BT.trace([], { x: 0, y: 0 })).toBeNull();
        expect(BT.trace(null, { x: 0, y: 0 })).toBeNull();
        expect(BT.trace(loop([[0, 0], [10, 0], [10, 10], [0, 10]]), null)).toBeNull();
    });

    it('polylineToSegments tách đúng số đoạn', function () {
        var s = BT.polylineToSegments([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
        expect(s.length).toBe(2);
    });

    it('vùng L-shape (6 đỉnh) + điểm trong → 6 đỉnh, diện tích đúng', function () {
        // L: (0,0)-(100,0)-(100,50)-(50,50)-(50,100)-(0,100)
        var segs = loop([[0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]]);
        var poly = BT.trace(segs, { x: 10, y: 10 });
        expect(poly).not.toBeNull();
        expect(poly.length).toBe(6);
        // Diện tích L = 100*100 - 50*50 = 7500
        expect(area(poly)).toBeCloseTo(7500, 3);
    });

    it('điểm nằm trong phần lõm của L (ngoài vùng) → null', function () {
        var segs = loop([[0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]]);
        // (75,75) nằm trong ô vuông lõm bị bỏ đi
        expect(BT.trace(segs, { x: 75, y: 75 })).toBeNull();
    });

    it('T-junction chạm giữa cạnh → đỉnh thẳng hàng bị loại, còn 4 đỉnh', function () {
        var segs = loop([[0, 0], [100, 0], [100, 100], [0, 100]]);
        // tường thò từ ngoài chạm điểm giữa cạnh trên (50,0)
        segs.push(seg(50, -30, 50, 0));
        var poly = BT.trace(segs, { x: 50, y: 50 });
        expect(poly).not.toBeNull();
        expect(poly.length).toBe(4); // (50,0) collinear đã bị loại
        expect(area(poly)).toBeCloseTo(10000, 3);
    });
});
