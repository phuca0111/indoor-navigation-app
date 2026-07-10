import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SI = require('../core/spatial-index.js');

describe('SpatialIndex — Phase 1 skeleton', function () {
    beforeEach(function () {
        globalThis.rooms = [];
        globalThis.pathNodes = [];
        globalThis.walls = [];
        SI.clear();
    });

    it('rebuild + hitTest phòng', function () {
        globalThis.rooms = [{ id: 1, x: 0, y: 0, width: 100, height: 50 }];
        SI.rebuildFromLegacy();
        var hit = SI.hitTest(50, 25);
        expect(hit).toBeTruthy();
        expect(hit.kind).toBe('room');
    });

    it('nearest ưu tiên gần hơn', function () {
        globalThis.rooms = [
            { id: 1, x: 0, y: 0, width: 10, height: 10 },
            { id: 2, x: 50, y: 0, width: 10, height: 10 }
        ];
        SI.rebuildFromLegacy();
        var near = SI.nearest(8, 5, 100);
        expect(near.kind).toBe('room');
        expect(near.ref.id).toBe(1);
    });

    it('syncFromLegacyWindow trả stats', function () {
        globalThis.walls = [{ id: 2, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
        var stats = SI.syncFromLegacyWindow();
        expect(stats.count).toBe(1);
        expect(stats.active).toBe(true);
    });
});
