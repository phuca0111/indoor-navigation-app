import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Snap = require('../core/snap-engine.js');

describe('SnapEngine — Phase 1 OSNAP skeleton', function () {
    beforeEach(function () {
        Snap.configure({
            gridEnabled: true,
            objectSnapEnabled: true,
            modes: { grid: true, endpoint: true, midpoint: true, intersection: true, perpendicular: true }
        });
        globalThis.walls = [];
        globalThis.pathNodes = [];
        globalThis.rooms = [];
        globalThis.doors = [];
        globalThis.pois = [];
        globalThis.GRID_SIZE = 40;
    });

    it('snap grid khi gần ô lưới', function () {
        var r = Snap.snapPoint({ x: 41, y: 39 });
        expect(r.kind).toBe('grid');
        expect(r.x).toBe(40);
        expect(r.y).toBe(40);
    });

    it('snap endpoint tường ưu tiên hơn grid xa', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] }];
        var r = Snap.snapPoint({ x: 102, y: 98 });
        expect(r.kind).toBe('endpoint');
        expect(r.x).toBe(100);
        expect(r.y).toBe(100);
    });

    it('snap midpoint đoạn tường', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
        var r = Snap.snapPoint({ x: 52, y: 2 });
        expect(r.kind).toBe('midpoint');
        expect(r.x).toBe(50);
        expect(r.y).toBe(0);
    });

    it('getModes trả grid/endpoint/midpoint/intersection/perpendicular', function () {
        var modes = Snap.getModes();
        expect(modes.grid).toBe(true);
        expect(modes.endpoint).toBe(true);
        expect(modes.midpoint).toBe(true);
        expect(modes.intersection).toBe(true);
        expect(modes.perpendicular).toBe(true);
    });

    it('tắt grid → kind none khi xa object', function () {
        Snap.setMode('grid', false);
        var r = Snap.snapPoint({ x: 15, y: 15 });
        expect(r.kind).toBe('none');
    });

    it('objectSnap:false — không hút endpoint khi Shift', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] }];
        var r = Snap.snapPoint({ x: 102, y: 100 }, { objectSnap: false });
        expect(r.kind).not.toBe('endpoint');
        expect(r.x).toBe(102);
        expect(r.y).toBe(100);
    });

    it('gridSnap:false — giữ tọa độ gốc khi gần ô lưới', function () {
        var r = Snap.snapPoint({ x: 41, y: 39 }, { objectSnap: false, gridSnap: false });
        expect(r.kind).toBe('none');
        expect(r.x).toBe(41);
        expect(r.y).toBe(39);
    });

    it('segmentIntersection — giao điểm 2 đoạn chữ thập', function () {
        var hit = Snap.segmentIntersection(
            { x: 0, y: 50 }, { x: 100, y: 50 },
            { x: 50, y: 0 }, { x: 50, y: 100 }
        );
        expect(hit).toBeTruthy();
        expect(hit.x).toBeCloseTo(50, 6);
        expect(hit.y).toBeCloseTo(50, 6);
    });

    it('segmentIntersection — song song → null', function () {
        var hit = Snap.segmentIntersection(
            { x: 0, y: 0 }, { x: 100, y: 0 },
            { x: 0, y: 10 }, { x: 100, y: 10 }
        );
        expect(hit).toBeNull();
    });

    it('segmentIntersection — kéo dài ngoài đoạn → null', function () {
        var hit = Snap.segmentIntersection(
            { x: 0, y: 0 }, { x: 40, y: 0 },
            { x: 50, y: -10 }, { x: 50, y: 10 }
        );
        expect(hit).toBeNull();
    });

    it('snap intersection — 2 tường bắt chéo (không trùng midpoint)', function () {
        // Giao (30,40); mid wall1=(50,40), mid wall2=(30,50) — cách cursor khác nhau
        globalThis.walls = [
            { id: 1, points: [{ x: 0, y: 40 }, { x: 100, y: 40 }] },
            { id: 2, points: [{ x: 30, y: 0 }, { x: 30, y: 100 }] }
        ];
        var r = Snap.snapPoint({ x: 32, y: 38 });
        expect(r.kind).toBe('intersection');
        expect(r.x).toBeCloseTo(30, 6);
        expect(r.y).toBeCloseTo(40, 6);
    });

    it('endpoint thắng intersection khi cùng điểm (góc chia sẻ đỉnh)', function () {
        globalThis.walls = [
            { id: 1, points: [{ x: 0, y: 100 }, { x: 100, y: 100 }] },
            { id: 2, points: [{ x: 100, y: 100 }, { x: 100, y: 200 }] }
        ];
        var r = Snap.snapPoint({ x: 102, y: 98 });
        expect(r.kind).toBe('endpoint');
        expect(r.x).toBe(100);
        expect(r.y).toBe(100);
    });

    it('setMode intersection false → không hút giao điểm', function () {
        globalThis.walls = [
            { id: 1, points: [{ x: 0, y: 40 }, { x: 100, y: 40 }] },
            { id: 2, points: [{ x: 30, y: 0 }, { x: 30, y: 100 }] }
        ];
        Snap.setMode('intersection', false);
        var r = Snap.snapPoint({ x: 32, y: 38 });
        expect(r.kind).not.toBe('intersection');
    });

    it('footPerpendicularToSegment — chân vuông góc từ anchor xuống đoạn ngang', function () {
        var foot = Snap.footPerpendicularToSegment(
            { x: 50, y: 50 },
            { x: 0, y: 0 },
            { x: 100, y: 0 }
        );
        expect(foot).toBeTruthy();
        expect(foot.x).toBeCloseTo(50, 6);
        expect(foot.y).toBeCloseTo(0, 6);
    });

    it('snap perpendicular — cần opts.anchor', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
        // Anchor (30,40) → chân vuông góc (30,0); khác midpoint (50,0)
        var r = Snap.snapPoint(
            { x: 32, y: 2 },
            { anchor: { x: 30, y: 40 } }
        );
        expect(r.kind).toBe('perpendicular');
        expect(r.x).toBeCloseTo(30, 6);
        expect(r.y).toBeCloseTo(0, 6);
    });

    it('không có anchor → không perpendicular', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
        var r = Snap.snapPoint({ x: 50, y: 2 });
        expect(r.kind).not.toBe('perpendicular');
    });

    it('endpoint thắng perpendicular khi gần đỉnh tường', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
        var r = Snap.snapPoint(
            { x: 2, y: 2 },
            { anchor: { x: 50, y: 50 } }
        );
        expect(r.kind).toBe('endpoint');
        expect(r.x).toBe(0);
        expect(r.y).toBe(0);
    });

    it('setMode perpendicular false → không hút vuông góc', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
        Snap.setMode('perpendicular', false);
        var r = Snap.snapPoint(
            { x: 52, y: 3 },
            { anchor: { x: 50, y: 50 } }
        );
        expect(r.kind).not.toBe('perpendicular');
    });
});
