import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SVG = require('../core/svg-io.js');

describe('SvgIO', function () {
    it('xuất SVG có viewBox và metadata loại đối tượng', function () {
        var text = SVG.exportSVG({
            walls: [{ points: [{ x: 10, y: 20 }, { x: 50, y: 20 }] }],
            rooms: [{ shape: 'rect', x: 0, y: 0, width: 80, height: 60 }]
        });
        expect(text).toContain('<svg');
        expect(text).toContain('viewBox="0 0 80 60"');
        expect(text).toContain('data-editor-kind="wall"');
        expect(text).toContain('data-editor-kind="room"');
    });

    it('round-trip giữ wall kín, phòng tròn và CAD point', function () {
        var parsed = SVG.parseSVG(SVG.exportSVG({
            walls: [{
                closed: true,
                layerId: 'wall-layer',
                points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }]
            }],
            rooms: [{ shape: 'circle', cx: 80, cy: 40, radius: 15 }],
            cadPoints: [{ x: 7.5, y: 9.25 }]
        }));
        expect(parsed.polylines[0]).toMatchObject({
            kind: 'wall', layer: 'wall-layer', closed: true
        });
        expect(parsed.circles[0]).toMatchObject({ cx: 80, cy: 40, radius: 15, kind: 'room' });
        expect(parsed.points[0]).toMatchObject({ x: 7.5, y: 9.25 });
    });

    it('nhập các primitive SVG phổ biến', function () {
        var parsed = SVG.parseSVG(
            '<svg>' +
            '<line x1="1" y1="2" x2="3" y2="4"/>' +
            '<polyline points="0,0 10,0 10,10"/>' +
            '<polygon points="20 20, 30 20, 30 30"/>' +
            '<rect x="40" y="10" width="20" height="15"/>' +
            '<ellipse cx="80" cy="40" rx="12" ry="6"/>' +
            '</svg>'
        );
        expect(parsed.polylines).toHaveLength(4);
        expect(parsed.polylines[2].closed).toBe(true);
        expect(parsed.polylines[3].kind).toBe('room');
        expect(parsed.ellipses).toHaveLength(1);
    });

    it('bỏ hình suy biến và xử lý input rỗng', function () {
        expect(SVG.parseSVG('')).toEqual({
            polylines: [], circles: [], ellipses: [], points: [],
            diagnostics: { invalidElements: 0, unsupportedCommands: [], warnings: [] }
        });
        expect(SVG.parseSVG('<svg><rect width="0" height="3"/></svg>').polylines).toHaveLength(0);
    });

    it('áp dụng transform lồng nhau và đổi circle scale lệch thành ellipse', function () {
        var parsed = SVG.parseSVG(
            '<svg><g transform="translate(10,20)"><g transform="scale(2,3)">' +
            '<line x1="0" y1="0" x2="5" y2="4"/>' +
            '<circle cx="5" cy="5" r="2"/>' +
            '</g></g></svg>'
        );
        expect(parsed.polylines[0].points).toEqual([
            { x: 10, y: 20 }, { x: 20, y: 32 }
        ]);
        expect(parsed.circles).toHaveLength(0);
        expect(parsed.ellipses[0]).toMatchObject({ cx: 20, cy: 35, rx: 4, ry: 6 });
    });

    it('tessellate path cubic/quadratic và giữ trạng thái đóng', function () {
        var parsed = SVG.parseSVG(
            '<svg><path data-layer="curve" d="M0 0 C10 0 10 10 20 10 Q25 10 30 0 Z"/></svg>'
        );
        expect(parsed.polylines).toHaveLength(1);
        expect(parsed.polylines[0].closed).toBe(true);
        expect(parsed.polylines[0].layer).toBe('curve');
        expect(parsed.polylines[0].points.length).toBeGreaterThan(20);
        expect(parsed.polylines[0].points.at(-1)).toMatchObject({ x: 30, y: 0 });
    });

    it('ghi diagnostics khi path arc chỉ có thể flatten', function () {
        var parsed = SVG.parseSVG('<svg><path d="M0 0 A10 10 0 0 1 20 20"/></svg>');
        expect(parsed.polylines[0].points.at(-1)).toEqual({ x: 20, y: 20 });
        expect(parsed.diagnostics.unsupportedCommands).toEqual(['A']);
    });
});
