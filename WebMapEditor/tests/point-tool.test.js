// Test Point (PO): điểm mốc CAD — style + hit + OSNAP NODE
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PT = require('../js/point-tool.js');
const SE = require('../core/snap-engine.js');

describe('Point tool helpers', function () {
    it('normalizePointStyle: mặc định cross, chấp nhận 4 kiểu', function () {
        expect(PT.normalizePointStyle(null)).toBe('cross');
        expect(PT.normalizePointStyle('DOT')).toBe('dot');
        expect(PT.normalizePointStyle('plus')).toBe('plus');
        expect(PT.normalizePointStyle('circle-cross')).toBe('circle-cross');
        expect(PT.normalizePointStyle('bogus')).toBe('cross');
    });

    it('hitCadPoint: trúng trong bán kính, miss ngoài', function () {
        var pt = { x: 100, y: 50 };
        expect(PT.hitCadPoint(pt, 100, 50, 8)).toBe(true);
        expect(PT.hitCadPoint(pt, 105, 50, 8)).toBe(true);
        expect(PT.hitCadPoint(pt, 120, 50, 8)).toBe(false);
        expect(PT.hitCadPoint(null, 0, 0, 8)).toBe(false);
    });

    it('getCadPointHitRadius: tỷ lệ nghịch zoom', function () {
        expect(PT.getCadPointHitRadius(1)).toBeCloseTo(10, 5);
        expect(PT.getCadPointHitRadius(2)).toBeCloseTo(5, 5);
    });

    it('CAD_POINT_STYLES có đủ 4 kiểu', function () {
        expect(PT.CAD_POINT_STYLES).toEqual(['dot', 'cross', 'plus', 'circle-cross']);
    });
});

describe('SnapEngine NODE mode cho cadPoints', function () {
    beforeEach(function () {
        globalThis.walls = [];
        globalThis.lines = [];
        globalThis.pathNodes = [];
        globalThis.rooms = [];
        globalThis.doors = [];
        globalThis.pois = [];
        globalThis.cadPoints = [];
        globalThis.GRID_SIZE = 40;
        SE.configure({
            objectSnapEnabled: true,
            modes: {
                grid: false, endpoint: true, midpoint: true, intersection: true,
                perpendicular: true, center: true, nearest: false, node: true
            }
        });
    });

    it('cadPoints xuất hiện dưới kind=node', function () {
        globalThis.cadPoints = [{ id: 1, x: 50, y: 60 }];
        var pts = SE.collectSnapPointsFromLegacy();
        var nodePts = pts.filter(function (p) { return p.kind === SE.SNAP.NODE; });
        expect(nodePts.length).toBe(1);
        expect(nodePts[0].x).toBe(50);
        expect(nodePts[0].y).toBe(60);
        expect(nodePts[0].source).toBe('cadPoint:1');
    });

    it('tắt mode node → không thu thập cadPoints', function () {
        globalThis.cadPoints = [{ id: 2, x: 10, y: 20 }];
        SE.setMode('node', false);
        var pts = SE.collectSnapPointsFromLegacy();
        expect(pts.filter(function (p) { return p.kind === 'node'; }).length).toBe(0);
    });

    it('snapPoint ưu tiên NODE khi gần điểm mốc', function () {
        globalThis.cadPoints = [{ id: 3, x: 100, y: 100 }];
        var hit = SE.snapPoint({ x: 103, y: 101 });
        expect(hit).toBeTruthy();
        expect(hit.kind).toBe('node');
        expect(hit.x).toBe(100);
        expect(hit.y).toBe(100);
    });
});
