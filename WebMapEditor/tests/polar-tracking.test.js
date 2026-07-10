import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Polar = require('../core/polar-tracking.js');
const PolylineTool = require('../core/tools/polyline-tool.js');
const LineTool = require('../core/tools/line-tool.js');
const Snap = require('../core/snap-engine.js');

describe('PolarTracking — resolvePolarPoint', function () {
    beforeEach(function () {
        Polar.configure({ enabled: true, incrementDeg: 45, toleranceDeg: 6, minDistPx: 8 });
    });

    it('hút góc 0° khi gần ngang', function () {
        var r = Polar.resolvePolarPoint({ x: 0, y: 0 }, { x: 100, y: 4 });
        expect(r.active).toBe(true);
        expect(r.angleDeg).toBe(0);
        expect(r.y).toBeCloseTo(0, 6);
        // Giữ nguyên khoảng cách tới anchor
        expect(r.x).toBeCloseTo(Math.sqrt(100 * 100 + 4 * 4), 6);
    });

    it('hút góc 45° khi lệch trong tolerance', function () {
        // atan2(74,70) ≈ 46.6° → trong ±6° của 45°
        var r = Polar.resolvePolarPoint({ x: 0, y: 0 }, { x: 70, y: 74 });
        expect(r.active).toBe(true);
        expect(r.angleDeg).toBe(45);
        expect(r.x).toBeCloseTo(r.y, 6);
    });

    it('hút góc 90° (dọc)', function () {
        var r = Polar.resolvePolarPoint({ x: 50, y: 50 }, { x: 52, y: 150 });
        expect(r.active).toBe(true);
        expect(r.angleDeg).toBe(90);
        expect(r.x).toBeCloseTo(50, 6);
    });

    it('ngoài tolerance → không hút', function () {
        // atan2(30,100) ≈ 16.7° → cách 0° và 45° đều > 6°
        var r = Polar.resolvePolarPoint({ x: 0, y: 0 }, { x: 100, y: 30 });
        expect(r.active).toBe(false);
        expect(r.x).toBe(100);
        expect(r.y).toBe(30);
    });

    it('quá gần anchor (< minDistPx) → không hút', function () {
        var r = Polar.resolvePolarPoint({ x: 0, y: 0 }, { x: 3, y: 1 });
        expect(r.active).toBe(false);
    });

    it('setEnabled(false) → tắt hoàn toàn', function () {
        Polar.setEnabled(false);
        var r = Polar.resolvePolarPoint({ x: 0, y: 0 }, { x: 100, y: 2 });
        expect(r.active).toBe(false);
        Polar.setEnabled(true);
    });

    it('applyToSnapped không đè endpoint/midpoint/intersection', function () {
        var snapped = { x: 100, y: 3, kind: 'endpoint', source: 'index' };
        var r = Polar.applyToSnapped({ x: 0, y: 0 }, snapped, undefined);
        expect(r).toBe(snapped);

        var mid = { x: 50, y: 2, kind: 'midpoint', source: 'w' };
        expect(Polar.applyToSnapped({ x: 0, y: 0 }, mid, undefined)).toBe(mid);

        var ix = { x: 80, y: 1, kind: 'intersection', source: 'i' };
        expect(Polar.applyToSnapped({ x: 0, y: 0 }, ix, undefined)).toBe(ix);

        var perp = { x: 50, y: 0, kind: 'perpendicular', source: 'p' };
        expect(Polar.applyToSnapped({ x: 0, y: 0 }, perp, undefined)).toBe(perp);
    });

    it('applyToSnapped tôn trọng snapOpts.polar === false (Shift)', function () {
        var snapped = { x: 100, y: 3, kind: 'none', source: 'raw' };
        var r = Polar.applyToSnapped({ x: 0, y: 0 }, snapped, { polar: false });
        expect(r).toBe(snapped);
    });

    it('applyToSnapped trả kind polar + angleDeg khi hút', function () {
        var r = Polar.applyToSnapped({ x: 0, y: 0 }, { x: 100, y: 3, kind: 'none', source: 'raw' }, undefined);
        expect(r.kind).toBe('polar');
        expect(r.angleDeg).toBe(0);
        expect(r.y).toBeCloseTo(0, 6);
    });
});

describe('PolarTracking — tích hợp PolylineTool / LineTool', function () {
    beforeEach(function () {
        PolylineTool.reset();
        PolylineTool.setOrthoLock(false);
        LineTool.reset();
        globalThis.walls = [];
        globalThis.rooms = [];
        globalThis.pathNodes = [];
        globalThis.doors = [];
        globalThis.pois = [];
        globalThis.GRID_SIZE = 40;
        globalThis.EditorCore = { SnapEngine: Snap, PolarTracking: Polar };
        Snap.configure({
            gridEnabled: true,
            objectSnapEnabled: true,
            modes: { grid: true, endpoint: true, midpoint: true }
        });
        Polar.configure({ enabled: true, incrementDeg: 45, toleranceDeg: 6, minDistPx: 8 });
    });

    it('Wall preview hút 0° khi con trỏ gần ngang', function () {
        PolylineTool.onPointerDown({ worldX: 0, worldY: 0 });
        // (100,4): xa giao lộ lưới (>12px) → kind none → polar hút về y=0
        PolylineTool.onPointerMove({ worldX: 100, worldY: 4 });
        var preview = PolylineTool.getPreview();
        expect(preview.kind).toBe('polar');
        expect(preview.angleDeg).toBe(0);
        expect(preview.y).toBeCloseTo(0, 6);
    });

    it('OSNAP endpoint thắng polar', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 100, y: 3 }, { x: 200, y: 3 }] }];
        PolylineTool.onPointerDown({ worldX: 0, worldY: 0 });
        PolylineTool.onPointerMove({ worldX: 99, worldY: 4 });
        var preview = PolylineTool.getPreview();
        expect(preview.kind).toBe('endpoint');
        expect(preview.x).toBe(100);
        expect(preview.y).toBe(3);
    });

    it('Shift (snapOpts polar:false) → không hút polar', function () {
        PolylineTool.onPointerDown({ worldX: 0, worldY: 0 });
        PolylineTool.onPointerMove({
            worldX: 100,
            worldY: 4,
            snapOpts: { objectSnap: false, gridSnap: false, polar: false }
        });
        var preview = PolylineTool.getPreview();
        expect(preview.kind).not.toBe('polar');
        expect(preview.y).toBe(4);
    });

    it('Ortho lock ưu tiên hơn polar', function () {
        PolylineTool.setOrthoLock(true);
        PolylineTool.onPointerDown({ worldX: 0, worldY: 0 });
        // 30° so với anchor — polar không hút, ortho vẫn ép ngang
        PolylineTool.onPointerMove({ worldX: 100, worldY: 58 });
        var preview = PolylineTool.getPreview();
        expect(preview.kind).not.toBe('polar');
        expect(preview.y).toBe(0);
        PolylineTool.setOrthoLock(false);
    });

    it('Click 2 của Wall cũng được hút polar (điểm commit thẳng hàng)', function () {
        PolylineTool.onPointerDown({ worldX: 0, worldY: 0 });
        PolylineTool.onPointerDown({ worldX: 100, worldY: 4 });
        var pts = PolylineTool.getPoints();
        expect(pts[1].kind).toBe('polar');
        expect(pts[1].y).toBeCloseTo(0, 6);
    });

    it('LineTool preview + click 2 hút polar', function () {
        LineTool.onPointerDown({ worldX: 0, worldY: 0 });
        LineTool.onPointerMove({ worldX: 100, worldY: 4 });
        var preview = LineTool.getPreview();
        expect(preview.kind).toBe('polar');
        expect(preview.angleDeg).toBe(0);

        LineTool.onPointerDown({ worldX: 100, worldY: 4 });
        var r = LineTool.getLastResult();
        expect(r.points[1].y).toBeCloseTo(0, 6);
    });

    it('LineTool giữ Shift → không hút polar', function () {
        LineTool.onPointerDown({ worldX: 0, worldY: 0 });
        LineTool.onPointerMove({ worldX: 100, worldY: 4, shiftKey: true });
        var preview = LineTool.getPreview();
        expect(preview.kind).not.toBe('polar');
        expect(preview.y).toBe(4);
    });
});
