import { describe, it, expect } from 'vitest';
import DM from '../core/dimension-manager.js';

describe('DimensionManager — engine kích thước', function () {
    it('createDimlinear ngang → layout đo đúng dx', function () {
        var dim = DM.createDimlinear({ x: 0, y: 0 }, { x: 80, y: 10 }, { x: 40, y: 40 }, { id: 1 });
        expect(dim).not.toBeNull();
        expect(dim.type).toBe('dimlinear');
        expect(dim.orientation).toBe('horizontal');
        var layout = DM.getLayout(dim);
        expect(layout.lengthPx).toBeCloseTo(80, 3);
    });

    it('createDimaligned → đo theo cạnh (cạnh huyền)', function () {
        var dim = DM.createDimaligned({ x: 0, y: 0 }, { x: 30, y: 40 }, { x: -10, y: 10 }, { id: 2 });
        var layout = DM.getLayout(dim);
        expect(layout.lengthPx).toBeCloseTo(50, 3);
    });

    it('formatLabel px → mét theo grid', function () {
        // 80px, grid 40px = 2 ô, 0.5 m/ô = 1.00 m
        expect(DM.formatLabel(80, 0.5, 40, 2)).toBe('1.00 m');
    });

    it('createDimradius → nhãn có tiền tố R', function () {
        var dim = DM.createDimradius({ x: 0, y: 0 }, { x: 40, y: 0 }, { id: 3 });
        expect(dim.type).toBe('dimradius');
        var label = DM.getDisplayLabel(dim, 0.5, 40, 2);
        expect(label.startsWith('R ')).toBe(true);
        expect(label).toContain('0.50 m');
    });

    it('createDimdiameter → nhãn có tiền tố ⌀', function () {
        var dim = DM.createDimdiameter({ x: -40, y: 0 }, { x: 40, y: 0 }, { id: 4 });
        var label = DM.getDisplayLabel(dim, 0.5, 40, 2);
        expect(label).toContain('\u2300');
        expect(label).toContain('1.00 m');
    });

    it('createDimangular → góc 90°', function () {
        var dim = DM.createDimangular({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 8, y: 8 }, { id: 5 });
        expect(dim.type).toBe('dimangular');
        expect(dim.p3).toBeTruthy();
        var label = DM.getDisplayLabel(dim, 0.5, 40, 2);
        expect(label).toBe('90.0°');
    });

    it('textOverride ghi đè nhãn', function () {
        var dim = DM.createDimlinear({ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 40 }, { id: 6 });
        DM.setTextOverride(dim, 'CỬA CHÍNH');
        expect(DM.getDisplayLabel(dim, 0.5, 40, 2)).toBe('CỬA CHÍNH');
    });

    it('updateOffsetFromPlace linear ngang đổi offset theo Y', function () {
        var dim = DM.createDimlinear({ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 0 }, { id: 7 });
        DM.updateOffsetFromPlace(dim, { x: 40, y: 30 });
        expect(dim.offset).toBeCloseTo(30, 3);
    });

    it('hitTest gần đường dim → true', function () {
        var dim = DM.createDimlinear({ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 20 }, { id: 8 });
        var layout = DM.getLayout(dim);
        var mx = layout.dimLine[0].x + 10, my = layout.dimLine[0].y;
        expect(DM.hitTest(dim, mx, my, 6)).toBe(true);
        expect(DM.hitTest(dim, mx, my + 500, 6)).toBe(false);
    });

    it('setStyle đổi decimals ảnh hưởng formatLabel mặc định', function () {
        DM.setStyle({ decimals: 1 });
        expect(DM.formatLabel(80, 0.5, 40)).toBe('1.0 m');
        DM.setStyle({ decimals: 2 });
    });
});
