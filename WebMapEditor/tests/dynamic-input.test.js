import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DI = require('../core/dynamic-input.js');

describe('DynamicInput — resolvePoint', function () {
    beforeEach(function () {
        globalThis.GRID_SIZE = 40;
        globalThis.metersPerGrid = 0.5;
        globalThis.metersToPixels = function (m) {
            return (m / globalThis.metersPerGrid) * globalThis.GRID_SIZE;
        };
    });

    var anchor = { x: 0, y: 0 };
    var ref = { x: 100, y: 0 }; // hướng +X

    it('chiều dài theo hướng con trỏ — 100', function () {
        var r = DI.resolvePoint('100', anchor, ref);
        expect(r.ok).toBe(true);
        expect(r.mode).toBe('length');
        expect(r.x).toBeCloseTo(100, 6);
        expect(r.y).toBeCloseTo(0, 6);
    });

    it('@100<90 — cực dọc lên', function () {
        var r = DI.resolvePoint('@100<90', anchor, ref);
        expect(r.ok).toBe(true);
        expect(r.mode).toBe('polar');
        expect(r.x).toBeCloseTo(0, 6);
        expect(r.y).toBeCloseTo(100, 6);
    });

    it('@50,30 — tương đối Cartesian', function () {
        var r = DI.resolvePoint('@50,30', anchor, ref);
        expect(r.ok).toBe(true);
        expect(r.mode).toBe('cartesian');
        expect(r.x).toBe(50);
        expect(r.y).toBe(30);
    });

    it('<45 — giữ khoảng cách, đổi góc 45°', function () {
        var r = DI.resolvePoint('<45', anchor, { x: 100, y: 0 });
        expect(r.ok).toBe(true);
        expect(r.mode).toBe('angle');
        expect(r.x).toBeCloseTo(100 / Math.sqrt(2), 4);
        expect(r.y).toBeCloseTo(100 / Math.sqrt(2), 4);
    });

    it('2.5m — quy đổi mét sang px', function () {
        // 2.5m / 0.5m per grid * 40px = 200px
        var r = DI.resolvePoint('2.5m', anchor, ref);
        expect(r.ok).toBe(true);
        expect(r.x).toBeCloseTo(200, 6);
    });

    it('không có anchor → lỗi', function () {
        var r = DI.resolvePoint('100', null, ref);
        expect(r.ok).toBe(false);
    });

    it('không có reference khi cần hướng → lỗi', function () {
        var r = DI.resolvePoint('100', anchor, null);
        expect(r.ok).toBe(false);
        expect(r.error).toBe('no_reference');
    });

    it('parse_failed với chuỗi lạ', function () {
        var r = DI.resolvePoint('abc', anchor, ref);
        expect(r.ok).toBe(false);
        expect(r.error).toBe('parse_failed');
    });

    it('angleDegBetween', function () {
        expect(DI.angleDegBetween({ x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(0, 6);
        expect(DI.angleDegBetween({ x: 0, y: 0 }, { x: 0, y: 50 })).toBeCloseTo(90, 6);
    });
});
