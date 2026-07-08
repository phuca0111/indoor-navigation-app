import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { formatRulerLabel, getRulerSegmentLengthPx, constrainRulerEnd, constrainOrthoPoint } = require('../js/utils.js');

describe('Ruler helpers', function () {
    it('formatRulerLabel hiển thị mét và px', function () {
        expect(formatRulerLabel(80, 0.5, 40)).toBe('1.00 m · 80 px');
    });

    it('getRulerSegmentLengthPx tính đúng cạnh huyền', function () {
        expect(getRulerSegmentLengthPx({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });

    it('constrainRulerEnd giữ ngang khi Shift và dx lớn hơn', function () {
        var start = { x: 0, y: 0 };
        expect(constrainRulerEnd(start, { x: 100, y: 30 }, true)).toEqual({ x: 100, y: 0 });
    });

    it('constrainOrthoPoint alias constrainRulerEnd', function () {
        var start = { x: 0, y: 0 };
        expect(constrainOrthoPoint(start, { x: 10, y: 3 }, true)).toEqual({ x: 10, y: 0 });
        expect(constrainRulerEnd(start, { x: 10, y: 3 }, true)).toEqual({ x: 10, y: 0 });
    });
});
