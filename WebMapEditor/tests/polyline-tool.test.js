import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PolylineTool = require('../core/tools/polyline-tool.js');
const ToolRegistry = require('../core/tool-registry.js');
const Snap = require('../core/snap-engine.js');

describe('PolylineTool — Phase 1 skeleton', function () {
    beforeEach(function () {
        PolylineTool.reset();
        globalThis.walls = [];
        globalThis.rooms = [];
        globalThis.pathNodes = [];
        globalThis.doors = [];
        globalThis.pois = [];
        globalThis.GRID_SIZE = 40;
        globalThis.EditorCore = {
            SnapEngine: Snap
        };
        Snap.configure({
            gridEnabled: true,
            objectSnapEnabled: true,
            modes: { grid: true, endpoint: true, midpoint: true }
        });
        ToolRegistry.clear();
    });

    it('Idle → Drawing khi pointerDown', function () {
        expect(PolylineTool.getState()).toBe('idle');
        PolylineTool.onPointerDown({ worldX: 40, worldY: 40 });
        expect(PolylineTool.getState()).toBe('drawing');
        expect(PolylineTool.getPoints()).toHaveLength(1);
    });

    it('thêm vertex + preview rubber-band', function () {
        PolylineTool.onPointerDown({ worldX: 0, worldY: 0 });
        PolylineTool.onPointerMove({ worldX: 41, worldY: 2 });
        var preview = PolylineTool.getPreview();
        expect(preview).toBeTruthy();
        expect(preview.kind).toBe('grid');

        PolylineTool.onPointerDown({ worldX: 80, worldY: 0 });
        expect(PolylineTool.getPoints()).toHaveLength(2);
        expect(PolylineTool.getPreview()).toBeNull();
    });

    it('Enter finish ≥2 points', function () {
        PolylineTool.onPointerDown({ worldX: 0, worldY: 0 });
        PolylineTool.onPointerDown({ worldX: 100, worldY: 0 });
        var r = PolylineTool.finish({});
        expect(r.ok).toBe(true);
        expect(r.result.type).toBe('polyline');
        expect(r.result.points).toHaveLength(2);
        expect(PolylineTool.getState()).toBe('idle');
        expect(PolylineTool.getLastResult().points[0].x).toBe(0);
    });

    it('Escape cancel', function () {
        PolylineTool.onPointerDown({ worldX: 10, worldY: 10 });
        PolylineTool.onKeyDown({ key: 'Escape' });
        expect(PolylineTool.getState()).toBe('idle');
        expect(PolylineTool.getPoints()).toHaveLength(0);
    });

    it('đăng ký vào ToolRegistry qua toToolDefinition', function () {
        ToolRegistry.registerTool(PolylineTool.toToolDefinition());
        var t = ToolRegistry.get('polyline');
        expect(t).toBeTruthy();
        expect(t.shortcut).toBe('pl');
        expect(ToolRegistry.getByShortcut('PL').id).toBe('polyline');
    });

    it('OSNAP endpoint khi pointerDown gần tường', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] }];
        PolylineTool.onPointerDown({ worldX: 102, worldY: 98 });
        var pts = PolylineTool.getPoints();
        expect(pts[0].kind).toBe('endpoint');
        expect(pts[0].x).toBe(100);
        expect(pts[0].y).toBe(100);
    });

    it('continueFromLast giữ đỉnh cuối để nối chuỗi', function () {
        PolylineTool.onPointerDown({ worldX: 0, worldY: 0 });
        PolylineTool.onPointerDown({ worldX: 100, worldY: 0 });
        expect(PolylineTool.getPoints()).toHaveLength(2);
        PolylineTool.continueFromLast();
        expect(PolylineTool.getState()).toBe('drawing');
        expect(PolylineTool.getPoints()).toHaveLength(1);
        expect(PolylineTool.getPoints()[0].x).toBe(100);
        PolylineTool.onPointerDown({ worldX: 100, worldY: 80 });
        expect(PolylineTool.getPoints()).toHaveLength(2);
        expect(PolylineTool.getPoints()[1].y).toBe(80);
    });

    it('snapOpts gridSnap:false giữ tọa độ gốc khi pointerDown', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] }];
        PolylineTool.onPointerDown({
            worldX: 102,
            worldY: 100,
            snapOpts: { objectSnap: false, gridSnap: false }
        });
        var pts = PolylineTool.getPoints();
        expect(pts[0].x).toBe(102);
        expect(pts[0].y).toBe(100);
        expect(pts[0].kind).not.toBe('endpoint');
    });

    it('Ortho lock (toggle) : ép ngang/dọc theo điểm neo', function () {
        PolylineTool.setOrthoLock(true);
        PolylineTool.onPointerDown({ worldX: 0, worldY: 0 });
        PolylineTool.onPointerMove({ worldX: 30, worldY: 10 }); // không snap grid (dist==10 nên none)
        var preview = PolylineTool.getPreview();
        // dx lớn hơn dy => ép y theo anchor (0)
        expect(preview.x).toBe(30);
        expect(preview.y).toBe(0);
        PolylineTool.setOrthoLock(false);
    });
});
