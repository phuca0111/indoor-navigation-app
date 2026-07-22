import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Snap = require('../core/snap-engine.js');
const FromSnap = require('../core/from-snap.js');
const Bridge = require('../core/snap-bridge.js');

describe('SnapBridge — OSNAP ↔ legacy tools', function () {
    beforeEach(function () {
        globalThis.GRID_SIZE = 40;
        globalThis.rooms = [];
        globalThis.walls = [];
        globalThis.pathNodes = [];
        globalThis.doors = [];
        globalThis.pois = [];
        globalThis.EditorCore = {
            SnapEngine: Snap,
            FromSnap: FromSnap,
            SpatialIndex: {
                getStats: function () { return { active: false, count: 0 }; },
                syncFromLegacyWindow: function () {
                    return { count: globalThis.walls.length, active: true };
                }
            }
        };
        Snap.configure({
            gridEnabled: true,
            objectSnapEnabled: true,
            modes: { grid: true, endpoint: true, midpoint: true, from: true }
        });
        FromSnap.cancel();
    });

    it('snapWorldPoint dùng SnapEngine khi có EditorCore', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] }];
        var r = Bridge.snapWorldPoint(102, 98);
        expect(r.kind).toBe('endpoint');
        expect(r.x).toBe(100);
        expect(r.y).toBe(100);
    });

    it('fallback legacy khi không có SnapEngine', function () {
        globalThis.EditorCore = {};
        var r = Bridge.snapWorldPoint(41, 39);
        expect(r.x).toBe(40);
        expect(r.y).toBe(40);
        expect(r.source).toBe('legacy');
    });

    it('syncSpatialIndexFromLegacy gọi SpatialIndex', function () {
        var stats = Bridge.syncSpatialIndexFromLegacy();
        expect(stats).toEqual({ count: 0, active: true });
    });

    it('FROM được bridge bổ sung và consume đúng một lần', function () {
        expect(FromSnap.arm({ x: 100, y: 50 }, { x: 25, y: -10 })).toBe(true);
        var first = Bridge.snapWorldPoint(125, 40, { gridSnap: false });
        expect(first).toMatchObject({ kind: 'from', x: 125, y: 40 });
        expect(FromSnap.getState()).toBeNull();
        var second = Bridge.snapWorldPoint(125, 40, { gridSnap: false });
        expect(second.kind).not.toBe('from');
    });
});
