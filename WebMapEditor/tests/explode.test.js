// Test Explode (X): phá block insert → nguyên thủy, polyline → đoạn 2 điểm.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BM = require('../core/block-manager.js');
const GE = require('../core/geometry/geometry-engine.js');

describe('BlockManager.explodeInsert', function () {
    function makeDefWithInsert() {
        var line = { id: 2, points: [{ x: 10, y: 10 }, { x: 30, y: 10 }], color: '#00f', lineWeight: 2 };
        var door = { id: 3, x: 10, y: 10, width: 40, rotation: 0 };
        var def = BM.createDefinition('MIX', [
            { type: 'line', data: line },
            { type: 'door', data: door }
        ], { id: 'blk_mix', baseX: 10, baseY: 10 });
        var inst = BM.createInsert(def.id, 200, 100, { id: 1, name: 'MIX' });
        return { def: def, inst: inst };
    }

    it('trả về đủ số entity với type đúng', function () {
        var d = makeDefWithInsert();
        var parts = BM.explodeInsert(d.def, d.inst);
        expect(parts.length).toBe(2);
        var types = parts.map(function (p) { return p.type; }).sort();
        expect(types).toEqual(['door', 'line']);
    });

    it('toạ độ world khớp worldEntityFromLocal (đặt lại đúng vị trí)', function () {
        var d = makeDefWithInsert();
        var parts = BM.explodeInsert(d.def, d.inst);
        var linePart = parts.find(function (p) { return p.type === 'line'; });
        // line gốc bắt đầu tại base (10,10) → sau explode về đúng vị trí insert (200,100)
        expect(linePart.data.points[0].x).toBeCloseTo(200, 5);
        expect(linePart.data.points[0].y).toBeCloseTo(100, 5);
        expect(linePart.data.points[1].x).toBeCloseTo(220, 5);
    });

    it('không làm hỏng def gốc (trả về bản clone)', function () {
        var d = makeDefWithInsert();
        var parts = BM.explodeInsert(d.def, d.inst);
        parts[0].data.points && (parts[0].data.points[0].x = -9999);
        // entity trong def vẫn giữ toạ độ relative ban đầu
        expect(d.def.entities[0].data.points[0].x).not.toBe(-9999);
    });

    it('def rỗng / insert null → mảng rỗng', function () {
        expect(BM.explodeInsert(null, {})).toEqual([]);
        expect(BM.explodeInsert({ entities: [] }, { x: 0, y: 0 })).toEqual([]);
    });
});

describe('GeometryEngine.explodePolyline', function () {
    it('polyline 4 đỉnh hở → 3 đoạn', function () {
        var pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        var segs = GE.explodePolyline(pts, false);
        expect(segs.length).toBe(3);
        expect(segs[0].a).toEqual({ x: 0, y: 0 });
        expect(segs[0].b).toEqual({ x: 10, y: 0 });
        expect(segs[2].b).toEqual({ x: 0, y: 10 });
    });

    it('closed=true → nối đỉnh cuối về đầu (4 đoạn)', function () {
        var pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        var segs = GE.explodePolyline(pts, true);
        expect(segs.length).toBe(4);
        expect(segs[3].a).toEqual({ x: 0, y: 10 });
        expect(segs[3].b).toEqual({ x: 0, y: 0 });
    });

    it('bỏ qua đoạn trùng điểm (độ dài ~0)', function () {
        var pts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }];
        var segs = GE.explodePolyline(pts, false);
        expect(segs.length).toBe(1);
        expect(segs[0].b).toEqual({ x: 5, y: 0 });
    });

    it('ít hơn 2 đỉnh → rỗng', function () {
        expect(GE.explodePolyline([{ x: 1, y: 1 }], false)).toEqual([]);
        expect(GE.explodePolyline(null, false)).toEqual([]);
    });
});
