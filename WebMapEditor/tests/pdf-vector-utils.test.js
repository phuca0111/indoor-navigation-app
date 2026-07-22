import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PDF = require('../core/pdf-vector-utils.js');

const OPS = {
    save: 1, restore: 2, transform: 3, constructPath: 4,
    moveTo: 10, lineTo: 11, curveTo: 12, curveTo2: 13,
    curveTo3: 14, rectangle: 15, closePath: 16,
    paintImageXObject: 20, paintInlineImageXObject: 21, showText: 22
};
const Util = {
    applyTransform: function (p, m) {
        return [p[0] * m[0] + p[1] * m[2] + m[4], p[0] * m[1] + p[1] * m[3] + m[5]];
    },
    transform: function (a, b) {
        return [
            a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
            a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
            a[0] * b[4] + a[2] * b[5] + a[4],
            a[1] * b[4] + a[3] * b[5] + a[5]
        ];
    }
};

describe('PdfVectorUtils', function () {
    it('trích line, rectangle và closePath', function () {
        var result = PDF.extractPolylines({
            fnArray: [OPS.constructPath],
            argsArray: [[
                [OPS.moveTo, OPS.lineTo, OPS.closePath, OPS.rectangle],
                [0, 0, 20, 0, 30, 10, 5, 4]
            ]]
        }, { transform: [1, 0, 0, 1, 0, 0] }, OPS, Util);
        expect(result).toHaveLength(2);
        var closedLine = result.find(function (line) { return line.length === 3; });
        var rectangle = result.find(function (line) { return line.length === 5; });
        expect(closedLine[closedLine.length - 1]).toEqual(closedLine[0]);
        expect(rectangle).toHaveLength(5);
    });

    it('lấy mẫu đủ ba biến thể cubic Bezier của PDF', function () {
        var result = PDF.extractPolylines({
            fnArray: [OPS.constructPath],
            argsArray: [[
                [OPS.moveTo, OPS.curveTo, OPS.curveTo2, OPS.curveTo3],
                [
                    0, 0,
                    10, 20, 20, 20, 30, 0,
                    40, -20, 50, 0,
                    60, 20, 70, 0
                ]
            ]]
        }, { transform: [1, 0, 0, 1, 0, 0] }, OPS, Util);
        expect(result).toHaveLength(1);
        expect(result[0]).toHaveLength(25);
        expect(result[0][result[0].length - 1]).toEqual({ x: 70, y: 0 });
        expect(result[0].some(function (p) { return p.y !== 0; })).toBe(true);
    });

    it('áp dụng transform và tính bbox an toàn', function () {
        var result = PDF.extractPolylines({
            fnArray: [OPS.transform, OPS.constructPath],
            argsArray: [
                [2, 0, 0, 2, 5, 7],
                [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 5]]
            ]
        }, { transform: [1, 0, 0, 1, 0, 0] }, OPS, Util);
        expect(result[0]).toEqual([{ x: 5, y: 7 }, { x: 25, y: 17 }]);
        expect(PDF.polyBBox(result)).toEqual({
            minX: 5, minY: 7, maxX: 25, maxY: 17, w: 20, h: 10
        });
        expect(PDF.polyBBox([])).toBeNull();
    });

    it('phân loại trang vector, raster và mixed để tránh mất ảnh', function () {
        expect(PDF.classifyPage({ fnArray: [OPS.constructPath] }, OPS).mode).toBe('vector');
        expect(PDF.classifyPage({ fnArray: [OPS.paintImageXObject] }, OPS).mode).toBe('raster');
        expect(PDF.classifyPage({
            fnArray: [OPS.paintInlineImageXObject, OPS.constructPath]
        }, OPS).mode).toBe('mixed');
    });

    it('trả diagnostics khi stack/operator lỗi và cho phép chỉnh độ mịn curve', function () {
        var detailed = PDF.extractPolylinesDetailed({
            fnArray: [OPS.restore, OPS.save, OPS.constructPath],
            argsArray: [
                [], [],
                [[OPS.moveTo, OPS.curveTo, 999], [0, 0, 5, 10, 10, 10, 15, 0]]
            ]
        }, { transform: [1, 0, 0, 1, 0, 0] }, OPS, Util, { curveSteps: 4 });
        expect(detailed.polylines[0]).toHaveLength(5);
        expect(detailed.diagnostics).toMatchObject({
            restoreUnderflow: 1,
            unbalancedSave: 1,
            invalidOperators: 1,
            truncated: false
        });
        expect(detailed.bbox).toMatchObject({ minX: 0, maxX: 15 });
    });

    it('thống kê operator để hiển thị diagnostics nhập PDF', function () {
        expect(PDF.analyzeOperatorList({
            fnArray: [
                OPS.constructPath, OPS.constructPath,
                OPS.paintImageXObject, OPS.showText, OPS.transform
            ]
        }, OPS)).toEqual({
            paths: 2, images: 1, text: 1, save: 0, restore: 0, transforms: 1
        });
    });
});
