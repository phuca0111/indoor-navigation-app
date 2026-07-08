import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SI = require('../core/spatial-index.js');

describe('SpatialIndex — Phase 1 skeleton', function () {
    beforeEach(function () {
        SI.clear();
    });

    it('insert + query trả object trong vùng', function () {
        SI.insert('room:1', { x: 0, y: 0, width: 100, height: 50 }, { kind: 'room' });
        SI.insert('room:2', { x: 200, y: 200, width: 40, height: 40 }, { kind: 'room' });
        var hits = SI.query({ x: 10, y: 10, width: 20, height: 20 });
        expect(hits.length).toBe(1);
        expect(hits[0].id).toBe('room:1');
        expect(hits[0].meta.kind).toBe('room');
    });

    it('nearest sắp xếp theo khoảng cách', function () {
        SI.insert('a', { x: 0, y: 0, width: 10, height: 10 });
        SI.insert('b', { x: 50, y: 0, width: 10, height: 10 });
        var near = SI.nearest({ x: 8, y: 5 }, 100);
        expect(near[0].id).toBe('a');
    });

    it('hitTest trả object đầu tiên trong tolerance', function () {
        SI.insert('door:3', { x: 100, y: 100, radius: 8 }, { kind: 'door' });
        var hit = SI.hitTest({ x: 102, y: 101 }, 6);
        expect(hit).toBeTruthy();
        expect(hit.id).toBe('door:3');
    });

    it('remove xóa khỏi index', function () {
        SI.insert('wall:1', { x: 0, y: 0, width: 50, height: 4 });
        expect(SI.remove('wall:1')).toBe(true);
        expect(SI.query({ x: 0, y: 0, width: 100, height: 100 }).length).toBe(0);
    });

    it('rebuildFromLegacyState index rooms và walls', function () {
        var stats = SI.rebuildFromLegacyState({
            rooms: [{ id: 1, x: 0, y: 0, width: 80, height: 60 }],
            walls: [{ id: 2, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }],
            doors: [],
            pois: [],
            pathNodes: [],
            qrs: []
        });
        expect(stats.count).toBe(2);
        expect(SI.query({ x: 40, y: 30, width: 1, height: 1 }).length).toBe(1);
    });

    it('shouldUseIndex theo threshold mặc định 200', function () {
        expect(SI.shouldUseIndex(199)).toBe(false);
        expect(SI.shouldUseIndex(200)).toBe(true);
    });

    it('getStats báo engine và count', function () {
        SI.insert('x', { x: 0, y: 0, width: 1, height: 1 });
        var stats = SI.getStats();
        expect(stats.count).toBe(1);
        expect(stats.engine).toBeTruthy();
    });
});
