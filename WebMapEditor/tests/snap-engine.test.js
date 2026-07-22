import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Snap = require('../core/snap-engine.js');

describe('SnapEngine — Phase 1 OSNAP skeleton', function () {
    beforeEach(function () {
        Snap.configure({
            gridEnabled: true,
            objectSnapEnabled: true,
            modes: {
                grid: true, endpoint: true, midpoint: true, intersection: true,
                perpendicular: true, center: true, quadrant: true,
                extension: false, from: false, nearest: false, node: true
            }
        });
        globalThis.walls = [];
        globalThis.lines = [];
        globalThis.cadPoints = [];
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

    it('snap quadrant tại bốn điểm phần tư của phòng tròn', function () {
        globalThis.rooms = [{ id: 9, shape: 'circle', cx: 100, cy: 80, radius: 30 }];
        var right = Snap.snapPoint({ x: 128, y: 81 }, { gridSnap: false });
        expect(right.kind).toBe('quadrant');
        expect(right.x).toBe(130);
        expect(right.y).toBe(80);
        var top = Snap.snapPoint({ x: 101, y: 51 }, { gridSnap: false });
        expect(top.kind).toBe('quadrant');
        expect(top.x).toBe(100);
        expect(top.y).toBe(50);
    });

    it('quadrant hỗ trợ ellipse xoay và chỉ lấy quadrant nằm trên cung', function () {
        globalThis.lines = [
            {
                id: 20, type: 'ellipse',
                ellipse: { cx: 100, cy: 100, rx: 40, ry: 20, rotation: Math.PI / 2 },
                points: [{ x: 100, y: 140 }, { x: 80, y: 100 }, { x: 100, y: 60 }]
            },
            {
                id: 21, type: 'arc',
                arc: { cx: 200, cy: 100, radius: 30 },
                points: [{ x: 230, y: 100 }, { x: 200, y: 130 }, { x: 170, y: 100 }]
            }
        ];
        var candidates = Snap.collectSnapPointsFromLegacy();
        var ellipseQuadrants = candidates.filter(function (point) {
            return point.kind === 'quadrant' && point.source === 'line:20';
        });
        expect(ellipseQuadrants).toHaveLength(4);
        expect(ellipseQuadrants.some(function (point) {
            return Math.abs(point.x - 100) < 1e-6 && Math.abs(point.y - 140) < 1e-6;
        })).toBe(true);
        var arcQuadrants = candidates.filter(function (point) {
            return point.kind === 'quadrant' && point.source === 'line:21';
        });
        expect(arcQuadrants).toHaveLength(3);
        expect(arcQuadrants.some(function (point) { return point.y === 70; })).toBe(false);
    });

    it('extension chỉ bắt trên phần kéo dài ngoài đoạn', function () {
        globalThis.lines = [{ id: 1, points: [{ x: 20, y: 40 }, { x: 80, y: 40 }] }];
        Snap.setMode('extension', true);
        var extended = Snap.snapPoint({ x: 102, y: 43 }, { gridSnap: false });
        expect(extended.kind).toBe('extension');
        expect(extended.x).toBeCloseTo(102, 6);
        expect(extended.y).toBeCloseTo(40, 6);
        var onSegment = Snap.collectExtensionPoints({ x: 50, y: 42 });
        expect(onSegment).toHaveLength(0);
    });

    it('extension chỉ dùng đoạn đầu/cuối và bỏ arc, ellipse, polyline kín', function () {
        globalThis.lines = [
            {
                id: 1, type: 'segment',
                points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 40, y: 20 }]
            },
            { id: 2, type: 'arc', points: [{ x: 0, y: 10 }, { x: 20, y: 10 }] },
            { id: 3, type: 'ellipse', points: [{ x: 0, y: 30 }, { x: 20, y: 30 }] },
            { id: 4, type: 'segment', closed: true, points: [{ x: 0, y: 40 }, { x: 20, y: 40 }] }
        ];
        var segments = Snap.collectExtensionSegments();
        expect(segments).toHaveLength(2);
        expect(segments.map(function (segment) { return segment.source; })).toEqual([
            'line:1:start', 'line:1:end'
        ]);
    });

    it('from tạo điểm tương đối từ điểm tham chiếu và offset', function () {
        Snap.setMode('from', true);
        var r = Snap.snapPoint(
            { x: 125, y: 85 },
            {
                from: { x: 100, y: 100 },
                fromOffset: { x: 25, y: -15 },
                gridSnap: false
            }
        );
        expect(r.kind).toBe('from');
        expect(r.x).toBe(125);
        expect(r.y).toBe(85);
    });

    it('from dữ liệu không hợp lệ không tạo snap', function () {
        Snap.setMode('from', true);
        expect(Snap.collectFromPoint({ x: 1, y: 2 }, { x: 'bad', y: 4 })).toBeNull();
    });
});
