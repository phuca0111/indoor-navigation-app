import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ImageTools = require('../core/image-tools.js');

describe('ImageTools Phase 4', function () {
    it('calibrateMetersPerGrid: 2 điểm + mét thật → metersPerGrid', function () {
        var p1 = { x: 0, y: 0 };
        var p2 = { x: 80, y: 0 }; // 2 ô nếu GRID=40
        var r = ImageTools.calibrateMetersPerGrid(p1, p2, 4, 40);
        expect(r).not.toBeNull();
        expect(r.metersPerGrid).toBeCloseTo(2, 5); // 4m / 2 ô
        expect(r.distPx).toBe(80);
    });

    it('calibrateMetersPerGrid: khoảng cách mét ≤ 0 → null', function () {
        expect(ImageTools.calibrateMetersPerGrid({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, 40)).toBeNull();
        expect(ImageTools.calibrateMetersPerGrid({ x: 0, y: 0 }, { x: 10, y: 0 }, -1, 40)).toBeNull();
    });

    it('calibrateMetersPerGrid: 2 điểm quá gần → null', function () {
        expect(ImageTools.calibrateMetersPerGrid({ x: 0, y: 0 }, { x: 1, y: 0 }, 5, 40)).toBeNull();
    });

    it('applyContrastBrightness: contrast 1 brightness 0 giữ gần nguyên', function () {
        var data = new Uint8ClampedArray([100, 120, 140, 255, 50, 50, 50, 255]);
        var id = { data: data, width: 2, height: 1 };
        ImageTools.applyContrastBrightness(id, 1, 0);
        expect(data[0]).toBe(100);
        expect(data[4]).toBe(50);
    });

    it('applyContrastBrightness: brightness dương làm sáng', function () {
        var data = new Uint8ClampedArray([50, 50, 50, 255]);
        var id = { data: data, width: 1, height: 1 };
        ImageTools.applyContrastBrightness(id, 1, 40);
        expect(data[0]).toBe(90);
    });

    it('estimateDeskewAngleDeg: ImageData rỗng/null → 0', function () {
        expect(ImageTools.estimateDeskewAngleDeg(null)).toBe(0);
    });

    it('estimateDeskewAngleDeg: ảnh ngang đơn giản không crash', function () {
        var w = 40, h = 40;
        var data = new Uint8ClampedArray(w * h * 4);
        for (var i = 0; i < data.length; i += 4) {
            data[i] = data[i + 1] = data[i + 2] = 255;
            data[i + 3] = 255;
        }
        // Vẽ cạnh ngang đen ở giữa
        for (var x = 0; x < w; x++) {
            var y = 20;
            var idx = (y * w + x) * 4;
            data[idx] = data[idx + 1] = data[idx + 2] = 0;
        }
        var ang = ImageTools.estimateDeskewAngleDeg({ data: data, width: w, height: h }, 2);
        expect(typeof ang).toBe('number');
        expect(Math.abs(ang)).toBeLessThan(15);
    });
});

function approxPt(p, x, y, prec) {
    expect(p.x).toBeCloseTo(x, prec == null ? 5 : prec);
    expect(p.y).toBeCloseTo(y, prec == null ? 5 : prec);
}

describe('ImageTools — Perspective warp (nắn phối cảnh)', function () {
    var unit = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

    it('computeHomography: đồng nhất (src==dst) → ánh xạ giữ nguyên điểm', function () {
        var H = ImageTools.computeHomography(unit, unit);
        expect(H).not.toBeNull();
        approxPt(ImageTools.applyHomography(H, { x: 0.5, y: 0.5 }), 0.5, 0.5);
        approxPt(ImageTools.applyHomography(H, { x: 0.2, y: 0.9 }), 0.2, 0.9);
    });

    it('computeHomography: tịnh tiến + scale', function () {
        var dst = [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 40 }, { x: 10, y: 40 }];
        var H = ImageTools.computeHomography(unit, dst);
        approxPt(ImageTools.applyHomography(H, { x: 0, y: 0 }), 10, 20);
        approxPt(ImageTools.applyHomography(H, { x: 1, y: 1 }), 30, 40);
        approxPt(ImageTools.applyHomography(H, { x: 0.5, y: 0.5 }), 20, 30);
    });

    it('computeHomography: projective thật (round-trip src→dst→recompute)', function () {
        var src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
        // quad hình thang (nghiêng phối cảnh)
        var dst = [{ x: 10, y: 12 }, { x: 90, y: 5 }, { x: 120, y: 110 }, { x: -5, y: 95 }];
        var H = ImageTools.computeHomography(src, dst);
        expect(H).not.toBeNull();
        for (var i = 0; i < 4; i++) {
            approxPt(ImageTools.applyHomography(H, src[i]), dst[i].x, dst[i].y, 4);
        }
    });

    it('computeHomography: điểm suy biến (trùng nhau) → null', function () {
        var bad = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
        expect(ImageTools.computeHomography(bad, unit)).toBeNull();
    });

    it('applyHomography: mẫu số ~0 → null', function () {
        expect(ImageTools.applyHomography([1, 0, 0, 0, 1, 0, 0, 0, 0], { x: 1, y: 1 })).toBeNull();
    });

    it('suggestWarpSize: quad hình thang → kích thước trung bình cạnh', function () {
        var quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 80, y: 60 }, { x: 0, y: 60 }];
        var s = ImageTools.suggestWarpSize(quad);
        expect(s.width).toBe(90);  // (100 + 80)/2
        // hLeft=60, hRight=√(20²+60²)=63.25 → (60+63.25)/2 ≈ 61.6 → 62
        expect(s.height).toBe(62);
    });

    it('warpImageData: nắn nửa-trái đỏ / nửa-phải xanh với quad đầy đủ → giữ 2 vùng màu', function () {
        var w = 4, h = 2;
        var data = new Uint8ClampedArray(w * h * 4);
        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var i = (y * w + x) * 4;
                if (x < 2) { data[i] = 255; data[i + 1] = 0; data[i + 2] = 0; }
                else { data[i] = 0; data[i + 1] = 0; data[i + 2] = 255; }
                data[i + 3] = 255;
            }
        }
        var src = { width: w, height: h, data: data };
        // quad = toàn ảnh (TL,TR,BR,BL) → warp gần như copy
        var quad = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
        var out = ImageTools.warpImageData(src, quad, w, h);
        expect(out.width).toBe(w);
        expect(out.height).toBe(h);
        // pixel (0,0) phải đỏ, pixel (3,0) phải xanh
        var p0 = 0, p3 = 3 * 4;
        expect(out.data[p0]).toBeGreaterThan(200);      // R cao
        expect(out.data[p0 + 2]).toBeLessThan(60);       // B thấp
        expect(out.data[p3 + 2]).toBeGreaterThan(200);   // B cao
        expect(out.data[p3]).toBeLessThan(60);           // R thấp
    });

    it('warpImageData: điểm ngoài biên nguồn → trắng', function () {
        var w = 2, h = 2;
        var data = new Uint8ClampedArray(w * h * 4);
        for (var i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = 0; data[i + 3] = 255; }
        var src = { width: w, height: h, data: data };
        // quad vượt ra ngoài ảnh nguồn → phần lớn pixel out-of-bounds
        var quad = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }];
        var out = ImageTools.warpImageData(src, quad, 4, 4);
        expect(out.data[0]).toBe(255);
        expect(out.data[1]).toBe(255);
        expect(out.data[2]).toBe(255);
    });

    it('warpImageData: input thiếu → null', function () {
        expect(ImageTools.warpImageData(null, [], 4, 4)).toBeNull();
        expect(ImageTools.warpImageData({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, [{ x: 0, y: 0 }], 4, 4)).toBeNull();
    });
});
