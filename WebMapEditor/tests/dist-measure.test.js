import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DM = require('../core/dist-measure.js');

describe('DistMeasure (DI)', function () {
    it('measure ngang 80px / 40px·ô / 0.5m·ô → 1.00 m', function () {
        var m = DM.measure({ x: 0, y: 0 }, { x: 80, y: 0 }, 0.5, 40);
        expect(m).not.toBeNull();
        expect(m.distM).toBeCloseTo(1.0, 5);
        expect(m.dxM).toBeCloseTo(1.0, 5);
        expect(m.dyM).toBeCloseTo(0, 5);
        expect(m.angleDeg).toBeCloseTo(0, 5);
    });

    it('measure dọc', function () {
        var m = DM.measure({ x: 10, y: 10 }, { x: 10, y: 50 }, 0.5, 40);
        expect(m.distM).toBeCloseTo(0.5, 5);
        expect(m.angleDeg).toBeCloseTo(90, 5);
    });

    it('quá ngắn → null', function () {
        expect(DM.measure({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.5, 40)).toBeNull();
    });

    it('formatResult có mét và góc', function () {
        var m = DM.measure({ x: 0, y: 0 }, { x: 40, y: 0 }, 0.5, 40);
        var s = DM.formatResult(m);
        expect(s).toMatch(/0\.50 m/);
        expect(s).toMatch(/ΔX/);
        expect(s).toMatch(/góc/);
    });
});
