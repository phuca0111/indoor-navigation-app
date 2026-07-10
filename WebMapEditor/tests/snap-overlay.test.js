import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Overlay = require('../core/snap-overlay.js');

describe('SnapOverlay — OSNAP markers', function () {
    beforeEach(function () {
        Overlay.clearSnapHint();
    });

    it('getMarkerSpec endpoint/midpoint/grid/intersection', function () {
        expect(Overlay.getMarkerSpec('endpoint').shape).toBe('square');
        expect(Overlay.getMarkerSpec('endpoint').sizePx).toBeGreaterThanOrEqual(24);
        expect(Overlay.getMarkerSpec('midpoint').shape).toBe('triangle');
        expect(Overlay.getMarkerSpec('intersection').shape).toBe('diamond');
        expect(Overlay.getMarkerSpec('intersection').color).toBe('#fbbf24');
        expect(Overlay.getMarkerSpec('perpendicular').shape).toBe('perp');
        expect(Overlay.getMarkerSpec('grid').shape).toBe('cross');
    });

    it('updateSnapHint khi tool vẽ và Chọn', function () {
        var snapFn = function () { return { x: 40, y: 40, kind: 'grid' }; };
        var r = Overlay.updateSnapHint(41, 39, 'wall', snapFn);
        expect(r.kind).toBe('grid');

        Overlay.updateSnapHint(41, 39, 'select', snapFn);
        expect(Overlay.getHint().kind).toBe('grid');

        Overlay.updateSnapHint(41, 39, 'line', snapFn);
        expect(Overlay.getHint().kind).toBe('grid');

        Overlay.updateSnapHint(41, 39, 'bg-adjust', snapFn);
        expect(Overlay.getHint()).toBeNull();
    });

    it('clearSnapHint', function () {
        Overlay.updateSnapHint(0, 0, 'wall', function () {
            return { x: 0, y: 0, kind: 'endpoint' };
        });
        Overlay.clearSnapHint();
        expect(Overlay.getHint()).toBeNull();
    });
});
