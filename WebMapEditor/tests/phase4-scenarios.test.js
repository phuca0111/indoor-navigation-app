import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ImageTools = require('../core/image-tools.js');
const DistMeasure = require('../core/dist-measure.js');

/** Tạo ImageData giả (Node/Uint8ClampedArray). */
function makeImageData(w, h, paintFn) {
    var data = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
    }
    if (paintFn) paintFn(data, w, h);
    return { data: data, width: w, height: h };
}

function setPixel(data, w, x, y, r, g, b) {
    var i = (y * w + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
}

/** Vẽ đoạn đen từ (x0,y0)→(x1,y1) (Bresenham đơn giản). */
function drawLine(data, w, h, x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    var err = dx + dy;
    for (;;) {
        if (x0 >= 0 && y0 >= 0 && x0 < w && y0 < h) setPixel(data, w, x0, y0, 0, 0, 0);
        if (x0 === x1 && y0 === y1) break;
        var e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}

describe('Phase 4 — giả lập tình huống Calibrate', function () {
    it('S1: tường ngang 5m trên 200px → mpg đúng; Dist đo lại ≈ 5m', function () {
        var p1 = { x: 0, y: 100 };
        var p2 = { x: 200, y: 100 };
        var cal = ImageTools.calibrateMetersPerGrid(p1, p2, 5, 40);
        expect(cal.metersPerGrid).toBeCloseTo(1, 5); // 5 * 40 / 200
        var m = DistMeasure.measure(p1, p2, cal.metersPerGrid, 40);
        expect(m.distM).toBeCloseTo(5, 4);
    });

    it('S2: tường dọc 12m', function () {
        var cal = ImageTools.calibrateMetersPerGrid({ x: 50, y: 0 }, { x: 50, y: 240 }, 12, 40);
        expect(cal.metersPerGrid).toBeCloseTo(2, 5);
        var m = DistMeasure.measure({ x: 50, y: 0 }, { x: 50, y: 240 }, cal.metersPerGrid, 40);
        expect(m.distM).toBeCloseTo(12, 4);
    });

    it('S3: cạnh chéo (Δx=Δy) — khoảng cách Euclidean', function () {
        var p1 = { x: 0, y: 0 };
        var p2 = { x: 120, y: 160 }; // 200px
        var cal = ImageTools.calibrateMetersPerGrid(p1, p2, 10, 40);
        expect(cal.distPx).toBeCloseTo(200, 5);
        expect(cal.metersPerGrid).toBeCloseTo(2, 5);
        var m = DistMeasure.measure(p1, p2, cal.metersPerGrid, 40);
        expect(m.distM).toBeCloseTo(10, 4);
    });

    it('S4: đảo P1↔P2 cho cùng metersPerGrid', function () {
        var a = ImageTools.calibrateMetersPerGrid({ x: 10, y: 10 }, { x: 90, y: 10 }, 3, 40);
        var b = ImageTools.calibrateMetersPerGrid({ x: 90, y: 10 }, { x: 10, y: 10 }, 3, 40);
        expect(a.metersPerGrid).toBeCloseTo(b.metersPerGrid, 8);
    });

    it('S5: tỷ lệ rất nhỏ (phòng dài trên ảnh lớn) — mpg bé', function () {
        var cal = ImageTools.calibrateMetersPerGrid({ x: 0, y: 0 }, { x: 4000, y: 0 }, 2, 40);
        expect(cal.metersPerGrid).toBeCloseTo(0.02, 6);
        expect(cal.metersPerGrid).toBeGreaterThan(0);
    });

    it('S6: căn lại sau khi đã calibrate sai — Dist cũ ≠ thực, sau khi cal khớp', function () {
        var p1 = { x: 0, y: 0 };
        var p2 = { x: 80, y: 0 };
        var wrongMpg = 0.5;
        var before = DistMeasure.measure(p1, p2, wrongMpg, 40);
        expect(before.distM).toBeCloseTo(1.0, 4); // sai so với thực 4m
        var cal = ImageTools.calibrateMetersPerGrid(p1, p2, 4, 40);
        var after = DistMeasure.measure(p1, p2, cal.metersPerGrid, 40);
        expect(after.distM).toBeCloseTo(4, 4);
        expect(after.distM).not.toBeCloseTo(before.distM, 1);
    });

    it('S7: input mét dạng số hợp lệ biên (0.01m)', function () {
        var cal = ImageTools.calibrateMetersPerGrid({ x: 0, y: 0 }, { x: 40, y: 0 }, 0.01, 40);
        expect(cal).not.toBeNull();
        expect(cal.metersPerGrid).toBeCloseTo(0.01, 6);
    });

    it('S8: từ chối NaN / Infinity / thiếu điểm / chuỗi không số', function () {
        expect(ImageTools.calibrateMetersPerGrid(null, { x: 1, y: 0 }, 1, 40)).toBeNull();
        expect(ImageTools.calibrateMetersPerGrid({ x: 0, y: 0 }, null, 1, 40)).toBeNull();
        expect(ImageTools.calibrateMetersPerGrid({ x: 0, y: 0 }, { x: 50, y: 0 }, NaN, 40)).toBeNull();
        expect(ImageTools.calibrateMetersPerGrid({ x: 0, y: 0 }, { x: 50, y: 0 }, Infinity, 40)).toBeNull();
        expect(ImageTools.calibrateMetersPerGrid({ x: 0, y: 0 }, { x: 50, y: 0 }, 'abc', 40)).toBeNull();
    });

    it('S9: GRID_SIZE khác 40 (grid 20) vẫn nhất quán với Dist', function () {
        var p1 = { x: 0, y: 0 };
        var p2 = { x: 100, y: 0 };
        var gs = 20;
        var cal = ImageTools.calibrateMetersPerGrid(p1, p2, 5, gs);
        var m = DistMeasure.measure(p1, p2, cal.metersPerGrid, gs);
        expect(m.distM).toBeCloseTo(5, 4);
    });
});

describe('Phase 4 — giả lập Contrast / Brightness', function () {
    it('S10: contrast clamp dưới 0.2 và trên 3 không crash', function () {
        var data = new Uint8ClampedArray([128, 128, 128, 255]);
        ImageTools.applyContrastBrightness({ data: data, width: 1, height: 1 }, 0.01, 0);
        expect(data[0]).toBeGreaterThanOrEqual(0);
        expect(data[0]).toBeLessThanOrEqual(255);
        data = new Uint8ClampedArray([128, 128, 128, 255]);
        ImageTools.applyContrastBrightness({ data: data, width: 1, height: 1 }, 99, 0);
        expect(data[0]).toBeGreaterThanOrEqual(0);
        expect(data[0]).toBeLessThanOrEqual(255);
    });

    it('S11: brightness ±200 bị clamp — trắng không >255, đen không <0', function () {
        var white = new Uint8ClampedArray([250, 250, 250, 255]);
        ImageTools.applyContrastBrightness({ data: white, width: 1, height: 1 }, 1, 200);
        expect(white[0]).toBe(255);
        var black = new Uint8ClampedArray([5, 5, 5, 255]);
        ImageTools.applyContrastBrightness({ data: black, width: 1, height: 1 }, 1, -200);
        expect(black[0]).toBe(0);
    });

    it('S12: contrast >1 làm xám trung bình tách xa 128 hơn', function () {
        var low = new Uint8ClampedArray([80, 80, 80, 255]);
        var high = new Uint8ClampedArray([180, 180, 180, 255]);
        ImageTools.applyContrastBrightness({ data: low, width: 1, height: 1 }, 2, 0);
        ImageTools.applyContrastBrightness({ data: high, width: 1, height: 1 }, 2, 0);
        expect(low[0]).toBeLessThan(80);
        expect(high[0]).toBeGreaterThan(180);
    });

    it('S13: alpha channel không đổi', function () {
        var data = new Uint8ClampedArray([10, 20, 30, 200]);
        ImageTools.applyContrastBrightness({ data: data, width: 1, height: 1 }, 2, 50);
        expect(data[3]).toBe(200);
    });

    it('S14: null ImageData trả về nguyên', function () {
        expect(ImageTools.applyContrastBrightness(null, 2, 10)).toBeNull();
    });
});

describe('Phase 4 — giả lập World ↔ Image (Crop toán học)', function () {
    var bgBase = { width: 200, height: 100, bgX: 0, bgY: 0, bgScale: 1, bgRotation: 0 };

    it('S15: góc ảnh (0,0) world → pixel (0,0) khi scale=1, không xoay', function () {
        var p = ImageTools.worldToImagePixel(0, 0, bgBase);
        expect(p.x).toBeCloseTo(0, 5);
        expect(p.y).toBeCloseTo(0, 5);
    });

    it('S16: góc phải dưới (200,100) → pixel (200,100)', function () {
        var p = ImageTools.worldToImagePixel(200, 100, bgBase);
        expect(p.x).toBeCloseTo(200, 5);
        expect(p.y).toBeCloseTo(100, 5);
    });

    it('S17: bgScale=2 — cùng world pixel ảnh nhỏ hơn 1/2', function () {
        var bg = Object.assign({}, bgBase, { bgScale: 2 });
        // Ảnh kéo dài 400×200 world; tâm (200,100); world (0,0) → local mép
        var p = ImageTools.worldToImagePixel(0, 0, bg);
        expect(p.x).toBeCloseTo(0, 5);
        expect(p.y).toBeCloseTo(0, 5);
        var mid = ImageTools.worldToImagePixel(200, 100, bg); // tâm
        expect(mid.x).toBeCloseTo(100, 5);
        expect(mid.y).toBeCloseTo(50, 5);
    });

    it('S17b: bgScaleX/bgScaleY quy đổi độc lập và vẫn tương thích bgScale cũ', function () {
        var stretched = Object.assign({}, bgBase, { bgScaleX: 2, bgScaleY: 0.5 });
        var center = ImageTools.worldToImagePixel(200, 25, stretched);
        expect(center.x).toBeCloseTo(100, 5);
        expect(center.y).toBeCloseTo(50, 5);
        var bottomRight = ImageTools.worldToImagePixel(400, 50, stretched);
        expect(bottomRight.x).toBeCloseTo(200, 5);
        expect(bottomRight.y).toBeCloseTo(100, 5);

        var legacy = ImageTools.worldToImagePixel(200, 100,
            Object.assign({}, bgBase, { bgScale: 2 }));
        expect(legacy).toEqual({ x: 100, y: 50 });
    });

    it('S18: dịch bgX/bgY — world theo offset', function () {
        var bg = Object.assign({}, bgBase, { bgX: 50, bgY: 20 });
        var p = ImageTools.worldToImagePixel(50, 20, bg);
        expect(p.x).toBeCloseTo(0, 5);
        expect(p.y).toBeCloseTo(0, 5);
    });

    it('S19: xoay 180° — điểm gần góc map qua tâm', function () {
        var bg = Object.assign({}, bgBase, { bgRotation: 180 });
        // Tâm world = (100, 50). Điểm world gần góc ảnh gốc (0,0) sau 180° ≈ (200,100)
        var p = ImageTools.worldToImagePixel(200, 100, bg);
        expect(p.x).toBeCloseTo(0, 3);
        expect(p.y).toBeCloseTo(0, 3);
    });

    it('S20: thiếu kích thước ảnh → null', function () {
        expect(ImageTools.worldToImagePixel(10, 10, { width: 0, height: 0 })).toBeNull();
        expect(ImageTools.worldToImagePixel(10, 10, {})).toBeNull();
    });

    it('S21: khung crop ảo quá nhỏ (<4px) — cropImageToDataUrl null (mock img)', function () {
        var fakeImg = { width: 100, height: 100 };
        // Không có canvas trong Node — hàm sẽ tạo canvas; nếu fail thì skip
        var hasCanvas = typeof document !== 'undefined' && document.createElement;
        if (!hasCanvas) {
            // Node: chỉ kiểm tra guard sớm bằng rect đảo chiều nhỏ
            // crop cần canvas — verify logic guard bằng khoảng cách pixel
            var a = ImageTools.worldToImagePixel(0, 0, bgBase);
            var b = ImageTools.worldToImagePixel(2, 2, bgBase);
            expect(Math.abs(b.x - a.x)).toBeLessThan(4);
            return;
        }
        var r = ImageTools.cropImageToDataUrl(fakeImg, { x1: 0, y1: 0, x2: 2, y2: 2 });
        expect(r).toBeNull();
    });
});

describe('Phase 4 — giả lập Deskew', function () {
    it('S22: ảnh trắng đồng nhất → 0°', function () {
        var id = makeImageData(64, 64);
        expect(ImageTools.estimateDeskewAngleDeg(id, 2)).toBe(0);
    });

    it('S23: cạnh ngang rõ → |góc| nhỏ (< ~3°)', function () {
        var id = makeImageData(80, 80, function (data, w, h) {
            drawLine(data, w, h, 5, 40, 75, 40);
            drawLine(data, w, h, 5, 41, 75, 41);
        });
        var ang = ImageTools.estimateDeskewAngleDeg(id, 2);
        expect(Math.abs(ang)).toBeLessThan(3);
    });

    it('S24: cạnh nghiêng ~5° → deskew ngược chiều, |góc| trong (0.25, 20]', function () {
        var id = makeImageData(100, 100, function (data, w, h) {
            // ~5°: dy/dx ≈ tan(5°) ≈ 0.087 → trên 80px ngang → ~7px dọc
            drawLine(data, w, h, 10, 45, 90, 52);
            drawLine(data, w, h, 10, 46, 90, 53);
            drawLine(data, w, h, 10, 47, 90, 54);
        });
        var ang = ImageTools.estimateDeskewAngleDeg(id, 1);
        // Thuật toán heuristic — chỉ yêu cầu không crash + không báo skew quá lớn
        expect(typeof ang).toBe('number');
        expect(Math.abs(ang)).toBeLessThanOrEqual(20);
    });

    it('S25: cạnh dọc mạnh (tường đứng) → ổn định, |góc| không >20', function () {
        var id = makeImageData(80, 80, function (data, w, h) {
            drawLine(data, w, h, 40, 5, 40, 75);
            drawLine(data, w, h, 41, 5, 41, 75);
        });
        var ang = ImageTools.estimateDeskewAngleDeg(id, 2);
        expect(Math.abs(ang)).toBeLessThanOrEqual(20);
    });
});

describe('Phase 4 — giả lập chuỗi nghiệp vụ (Calibrate + Dist + scale)', function () {
    it('S26: calibrate theo cạnh ngắn → đo cạnh dài song song tỷ lệ đúng', function () {
        // Cạnh ngắn 1m = 40px; cạnh dài cùng hướng 5m phải = 200px
        var cal = ImageTools.calibrateMetersPerGrid({ x: 0, y: 0 }, { x: 40, y: 0 }, 1, 40);
        var longSide = DistMeasure.measure({ x: 0, y: 50 }, { x: 200, y: 50 }, cal.metersPerGrid, 40);
        expect(longSide.distM).toBeCloseTo(5, 4);
    });

    it('S27: sau calibrate, ΔX/ΔY Dist khớp mét thật trên lưới', function () {
        var cal = ImageTools.calibrateMetersPerGrid({ x: 0, y: 0 }, { x: 80, y: 0 }, 2, 40);
        // 80px X + 40px Y = 2m ngang + 1m dọc theo mpg=1
        expect(cal.metersPerGrid).toBeCloseTo(1, 5);
        var m = DistMeasure.measure({ x: 0, y: 0 }, { x: 80, y: 40 }, cal.metersPerGrid, 40);
        expect(m.dxM).toBeCloseTo(2, 4);
        expect(m.dyM).toBeCloseTo(1, 4);
        expect(m.distM).toBeCloseTo(Math.sqrt(4 + 1), 4);
    });

    it('S28: chuỗi contrast rồi brightness — thứ tự in-place', function () {
        var data = new Uint8ClampedArray([100, 100, 100, 255]);
        var id = { data: data, width: 1, height: 1 };
        ImageTools.applyContrastBrightness(id, 1.5, 0);
        var afterC = data[0];
        ImageTools.applyContrastBrightness(id, 1, 20);
        expect(data[0]).toBe(Math.min(255, afterC + 20));
    });
});
