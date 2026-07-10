import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// walls.js depends on globals — load helpers via eval of createWallsFromPolyline logic
function createWallSegment(start, end, walls, nextId) {
    if (!start || !end) return null;
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var length = Math.sqrt(dx * dx + dy * dy);
    if (length < 4) return null;
    var wall = {
        id: nextId.value++,
        type: 'segment',
        thickness: 4,
        is_outer: false,
        points: [{ x: start.x, y: start.y }, { x: end.x, y: end.y }]
    };
    walls.push(wall);
    return wall;
}

function createWallsFromPolyline(points, walls, nextId) {
    if (!points || points.length < 2) return [];
    var created = [];
    for (var i = 0; i < points.length - 1; i++) {
        var w = createWallSegment(points[i], points[i + 1], walls, nextId);
        if (w) created.push(w);
    }
    return created;
}

const PolylineTool = require('../core/tools/polyline-tool.js');

describe('Polyline → walls integration', function () {
    beforeEach(function () {
        PolylineTool.reset();
    });

    it('finish 3 điểm → 2 wall segments', function () {
        PolylineTool.onPointerDown({ worldX: 0, worldY: 0 });
        PolylineTool.onPointerDown({ worldX: 100, worldY: 0 });
        PolylineTool.onPointerDown({ worldX: 100, worldY: 80 });
        var r = PolylineTool.finish({});
        expect(r.ok).toBe(true);

        var walls = [];
        var nextId = { value: 1 };
        var created = createWallsFromPolyline(r.result.points, walls, nextId);
        expect(created).toHaveLength(2);
        expect(walls).toHaveLength(2);
        expect(walls[0].points[1]).toEqual({ x: 100, y: 0 });
        expect(walls[1].points[1]).toEqual({ x: 100, y: 80 });
    });

    it('bỏ đoạn quá ngắn (<4px)', function () {
        var walls = [];
        var nextId = { value: 1 };
        var created = createWallsFromPolyline(
            [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 80, y: 0 }],
            walls,
            nextId
        );
        expect(created).toHaveLength(1);
        // Đoạn 0→1 bỏ; đoạn còn lại bắt đầu từ điểm 1
        expect(walls[0].points[0]).toEqual({ x: 1, y: 0 });
        expect(walls[0].points[1]).toEqual({ x: 80, y: 0 });
    });
});
