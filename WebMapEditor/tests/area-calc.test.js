import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AC = require('../core/area-calc.js');

describe('AreaCalc (AA)', function () {
    it('vuông 40×40 px / 0.5m·ô → 0.25 m², chu vi 2 m', function () {
        var m = AC.measure([
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 40 },
            { x: 0, y: 40 }
        ], 0.5, 40);
        expect(m).not.toBeNull();
        expect(m.areaM2).toBeCloseTo(0.25, 5);
        expect(m.perimeterM).toBeCloseTo(2.0, 5);
        expect(m.vertexCount).toBe(4);
    });

    it('thiếu đỉnh → null', function () {
        expect(AC.measure([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0.5, 40)).toBeNull();
    });

    it('measureFromRoom rect', function () {
        var m = AC.measureFromRoom({ shape: 'rect', x: 0, y: 0, width: 80, height: 40 }, 0.5, 40);
        expect(m.areaM2).toBeCloseTo(0.5, 5);
        expect(m.source).toBe('room');
    });

    it('measureFromRoom circle r=40px → π m² đơn vị (0.5m/ô)', function () {
        // r=40px = 1 ô = 0.5 m → diện tích π*(0.5)²
        var m = AC.measureFromRoom({ shape: 'circle', cx: 0, cy: 0, radius: 40 }, 0.5, 40);
        expect(m.areaM2).toBeCloseTo(Math.PI * 0.25, 5);
        expect(m.perimeterM).toBeCloseTo(Math.PI, 5);
    });

    it('formatResult', function () {
        var m = AC.measure([
            { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }
        ], 0.5, 40);
        var s = AC.formatResult(m);
        expect(s).toMatch(/0\.25 m²/);
        expect(s).toMatch(/Chu vi/);
    });
});
