import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const LineTool = require('../core/tools/line-tool.js');
const ToolRegistry = require('../core/tool-registry.js');
const Snap = require('../core/snap-engine.js');

describe('LineTool — Phase 1 skeleton', function () {
    beforeEach(function () {
        LineTool.reset();
        globalThis.walls = [];
        globalThis.rooms = [];
        globalThis.pathNodes = [];
        globalThis.doors = [];
        globalThis.pois = [];
        globalThis.GRID_SIZE = 40;
        globalThis.EditorCore = { SnapEngine: Snap };
        Snap.configure({
            gridEnabled: true,
            objectSnapEnabled: true,
            modes: { grid: true, endpoint: true, midpoint: true }
        });
        ToolRegistry.clear();
    });

    it('Idle → Drawing khi click 1', function () {
        expect(LineTool.getState()).toBe('idle');
        LineTool.onPointerDown({ worldX: 40, worldY: 40 });
        expect(LineTool.getState()).toBe('drawing');
        expect(LineTool.getStartPoint().x).toBe(40);
    });

    it('click 2 → lastResult 1 đoạn rồi về idle', function () {
        LineTool.onPointerDown({ worldX: 0, worldY: 0 });
        LineTool.onPointerDown({ worldX: 120, worldY: 0 });
        expect(LineTool.getState()).toBe('idle');
        var r = LineTool.getLastResult();
        expect(r.type).toBe('line');
        expect(r.points).toHaveLength(2);
        expect(r.points[1].x).toBe(120);
        expect(LineTool.getStartPoint()).toBeNull();
    });

    it('preview rubber-band khi drawing', function () {
        LineTool.onPointerDown({ worldX: 0, worldY: 0 });
        LineTool.onPointerMove({ worldX: 81, worldY: 2 });
        var p = LineTool.getPreview();
        expect(p).toBeTruthy();
        expect(p.kind).toBe('grid');
        expect(p.x).toBe(80);
    });

    it('OSNAP endpoint khi click gần đầu tường', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] }];
        LineTool.onPointerDown({ worldX: 102, worldY: 98 });
        var s = LineTool.getStartPoint();
        expect(s.x).toBe(100);
        expect(s.kind).toBe('endpoint');
    });

    it('snapOpts (Shift) tắt snap — giữ tọa độ gốc', function () {
        globalThis.walls = [{ id: 1, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] }];
        LineTool.onPointerDown({
            worldX: 102, worldY: 100,
            snapOpts: { objectSnap: false, gridSnap: false }
        });
        var s = LineTool.getStartPoint();
        expect(s.x).toBe(102);
        expect(s.y).toBe(100);
    });

    it('Escape hủy điểm đầu → idle', function () {
        LineTool.onPointerDown({ worldX: 10, worldY: 10 });
        LineTool.onKeyDown({ key: 'Escape' });
        expect(LineTool.getState()).toBe('idle');
        expect(LineTool.getStartPoint()).toBeNull();
    });

    it('onComplete callback nhận kết quả', function () {
        var got = null;
        LineTool.onPointerDown({ worldX: 0, worldY: 0 });
        LineTool.onPointerDown({ worldX: 40, worldY: 80 }, {
            onComplete: function (r) { got = r; }
        });
        expect(got).toBeTruthy();
        expect(got.points[1].y).toBe(80);
    });

    it('đăng ký ToolRegistry qua toToolDefinition', function () {
        ToolRegistry.registerTool(LineTool.toToolDefinition());
        var t = ToolRegistry.get('line');
        expect(t).toBeTruthy();
        expect(ToolRegistry.getByShortcut('LN').id).toBe('line');
    });
});
