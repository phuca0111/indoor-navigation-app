// Test DXF I/O: exportDXF + parseDXF (round-trip, lật Y đồng nhất).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DX = require('../core/dxf-io.js');

describe('DxfIO.exportDXF', function () {
    it('sinh cấu trúc DXF hợp lệ (SECTION/ENTITIES/EOF)', function () {
        var out = DX.exportDXF({ lines: [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }] });
        expect(out).toContain('SECTION');
        expect(out).toContain('$ACADVER');
        expect(out).toContain('AC1014');
        expect(out).toContain('ENTITIES');
        expect(out).toContain('LWPOLYLINE');
        expect(out.trim().endsWith('EOF')).toBe(true);
    });

    it('lật Y khi ghi (canvas y=5 → DXF y=-5)', function () {
        var out = DX.exportDXF({ lines: [{ points: [{ x: 0, y: 5 }, { x: 10, y: 5 }] }] });
        expect(out).toContain('20\n-5.000');
    });

    it('phòng tròn → CIRCLE; phòng chữ nhật → LWPOLYLINE kín', function () {
        var out = DX.exportDXF({
            rooms: [
                { shape: 'circle', cx: 100, cy: 50, radius: 20 },
                { shape: 'rect', x: 0, y: 0, width: 40, height: 30 }
            ]
        });
        expect(out).toContain('CIRCLE');
        expect(out).toContain('40\n20.000'); // bán kính
        expect(out).toContain('70\n1'); // polyline kín cho rect
    });
});

describe('DxfIO.parseDXF', function () {
    it('đọc entity LINE tự viết tay', function () {
        var dxf = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nWALLS\n10\n0\n20\n0\n11\n10\n21\n-5\n0\nENDSEC\n0\nEOF\n';
        var r = DX.parseDXF(dxf);
        expect(r.polylines.length).toBe(1);
        expect(r.polylines[0].layer).toBe('WALLS');
        expect(r.polylines[0].points[0]).toEqual({ x: 0, y: -0 });
        // 21 = -5 trong DXF → lật về canvas y = 5
        expect(r.polylines[0].points[1]).toEqual({ x: 10, y: 5 });
    });

    it('đọc TEXT và tiếp tục xử lý entity kế tiếp', function () {
        var dxf = '0\nSECTION\n2\nENTITIES\n0\nTEXT\n8\n0\n10\n1\n20\n2\n1\nHello\n0\nCIRCLE\n8\nROOMS\n40\n7\n10\n3\n20\n-4\n0\nEOF\n';
        var r = DX.parseDXF(dxf);
        expect(r.polylines.length).toBe(0);
        expect(r.texts[0]).toMatchObject({ x: 1, y: -2, text: 'Hello' });
        expect(r.circles.length).toBe(1);
        expect(r.circles[0]).toMatchObject({ cx: 3, cy: 4, radius: 7, layer: 'ROOMS' });
    });

    it('rỗng / không phải chuỗi → kết quả rỗng', function () {
        var empty = {
            polylines: [], circles: [], arcs: [], ellipses: [], points: [], texts: [],
            diagnostics: { malformedPairs: 0, invalidEntities: 0, unsupportedEntities: [], warnings: [] }
        };
        expect(DX.parseDXF('')).toEqual(empty);
        expect(DX.parseDXF(null)).toEqual(empty);
    });

    it('giữ cờ closed của wall/line và POINT qua round-trip', function () {
        var r = DX.parseDXF(DX.exportDXF({
            walls: [{
                closed: true,
                points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]
            }],
            cadPoints: [{ x: 7.25, y: 9.5 }]
        }));
        expect(r.polylines[0].closed).toBe(true);
        expect(r.points[0]).toMatchObject({ x: 7.25, y: 9.5, layer: 'POINTS' });
    });

    it('ARC và ELLIPSE giữ hình học chính qua round-trip', function () {
        var arcPoints = [
            { x: 120, y: 80 },
            { x: 100, y: 100 },
            { x: 80, y: 80 }
        ];
        var r = DX.parseDXF(DX.exportDXF({
            lines: [
                {
                    type: 'arc',
                    arc: { cx: 100, cy: 80, radius: 20 },
                    points: arcPoints
                },
                {
                    type: 'ellipse',
                    ellipse: { cx: 50, cy: 60, rx: 30, ry: 12, rotation: Math.PI / 6 },
                    points: [{ x: 1, y: 1 }, { x: 2, y: 2 }]
                }
            ]
        }));
        expect(r.arcs).toHaveLength(1);
        expect(r.arcs[0]).toMatchObject({ cx: 100, cy: 80, radius: 20, layer: 'ARCS' });
        expect(r.ellipses).toHaveLength(1);
        expect(r.ellipses[0].cx).toBeCloseTo(50, 3);
        expect(r.ellipses[0].cy).toBeCloseTo(60, 3);
        expect(r.ellipses[0].rx).toBeCloseTo(30, 2);
        expect(r.ellipses[0].ry).toBeCloseTo(12, 2);
        expect(r.ellipses[0].rotation).toBeCloseTo(Math.PI / 6, 2);
    });

    it('đọc POLYLINE/VERTEX kiểu legacy và tessellate bulge', function () {
        var legacy = [
            '0', 'SECTION', '2', 'ENTITIES',
            '0', 'POLYLINE', '8', 'LEGACY', '70', '0',
            '0', 'VERTEX', '10', '0', '20', '0', '42', '1',
            '0', 'VERTEX', '10', '10', '20', '0',
            '0', 'SEQEND', '0', 'ENDSEC', '0', 'EOF'
        ].join('\n');
        var r = DX.parseDXF(legacy);
        expect(r.polylines).toHaveLength(1);
        expect(r.polylines[0].layer).toBe('LEGACY');
        expect(r.polylines[0].points.length).toBeGreaterThan(2);
        expect(r.polylines[0].points[0]).toEqual({ x: 0, y: -0 });
        var last = r.polylines[0].points.at(-1);
        expect(last.x).toBeCloseTo(10, 6);
        expect(last.y).toBeCloseTo(0, 6);
    });

    it('trả diagnostics cho entity không hỗ trợ và dữ liệu lỗi', function () {
        var dxf = '0\nSECTION\n2\nENTITIES\n0\nHATCH\n8\n0\n0\nLINE\n10\nabc\n20\n0\n11\n1\n21\n1\n0\nENDSEC\n0\nEOF\n';
        var r = DX.parseDXF(dxf);
        expect(r.diagnostics.unsupportedEntities).toEqual(['HATCH']);
        expect(r.diagnostics.invalidEntities).toBe(1);
    });
});

describe('DXF round-trip (export → parse giữ nguyên hình học)', function () {
    it('walls/lines/room giữ toạ độ sau export+parse', function () {
        var data = {
            walls: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }] }],
            lines: [{ points: [{ x: 5, y: 5 }, { x: 50, y: 60 }] }],
            rooms: [{ shape: 'circle', cx: 30, cy: 40, radius: 12 }]
        };
        var r = DX.parseDXF(DX.exportDXF(data));
        // 2 polyline (wall + line) + 0 từ circle
        expect(r.polylines.length).toBe(2);
        expect(r.circles.length).toBe(1);

        var wall = r.polylines.find(function (p) { return p.layer === 'WALLS'; });
        expect(wall.points.length).toBe(3);
        expect(wall.points[2].x).toBeCloseTo(100, 3);
        expect(wall.points[2].y).toBeCloseTo(80, 3);

        var line = r.polylines.find(function (p) { return p.layer === 'LINES'; });
        expect(line.points[1].x).toBeCloseTo(50, 3);
        expect(line.points[1].y).toBeCloseTo(60, 3);

        expect(r.circles[0].cx).toBeCloseTo(30, 3);
        expect(r.circles[0].cy).toBeCloseTo(40, 3);
        expect(r.circles[0].radius).toBeCloseTo(12, 3);
    });
});
