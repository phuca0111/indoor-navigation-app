import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BM = require('../core/block-manager.js');

describe('BlockManager', function () {
    it('createDefinition chuẩn hoá relative tới góc bbox', function () {
        var door = { id: 1, name: 'Cửa', x: 100, y: 50, width: 40, rotation: 0 };
        var def = BM.createDefinition('Cua_chinh', [{ type: 'door', data: door }], { id: 'blk_1' });
        expect(def).toBeTruthy();
        expect(def.name).toBe('Cua_chinh');
        expect(def.entities.length).toBe(1);
        expect(def.entities[0].type).toBe('door');
        // base = minX,minY ≈ x-width/2
        expect(def.entities[0].data.x).toBeCloseTo(20, 5); // 100-80 = 20 relative? pad = width/2=20, minX=80, so x-80=20
        expect(def.entities[0].data.y).toBeCloseTo(20, 5); // minY = 50-20 = 30? wait pad=20, minY=30, y-30=20
    });

    it('createInsert + worldEntityFromLocal đặt lại đúng vị trí', function () {
        var line = {
            id: 2,
            points: [{ x: 10, y: 10 }, { x: 30, y: 10 }],
            color: '#00f',
            lineWeight: 2
        };
        var def = BM.createDefinition('LN', [{ type: 'line', data: line }], {
            id: 'blk_ln',
            baseX: 10,
            baseY: 10
        });
        var inst = BM.createInsert(def.id, 200, 100, { id: 1, name: 'LN' });
        var world = BM.worldEntityFromLocal('line', def.entities[0].data, inst);
        expect(world.points[0].x).toBeCloseTo(200, 5);
        expect(world.points[0].y).toBeCloseTo(100, 5);
        expect(world.points[1].x).toBeCloseTo(220, 5);
        expect(world.points[1].y).toBeCloseTo(100, 5);
    });

    it('hitTestInsert nhận điểm trong bbox', function () {
        var door = { id: 1, x: 0, y: 0, width: 40, rotation: 0 };
        var def = BM.createDefinition('D', [{ type: 'door', data: door }], {
            id: 'blk_d',
            baseX: -20,
            baseY: -20
        });
        var inst = BM.createInsert(def.id, 500, 500, { id: 9 });
        expect(BM.hitTestInsert(def, inst, 500, 500, 4)).toBe(true);
        expect(BM.hitTestInsert(def, inst, 900, 900, 4)).toBe(false);
    });

    it('scale insert phóng entity', function () {
        var room = { shape: 'rect', x: 0, y: 0, width: 40, height: 20 };
        var def = BM.createDefinition('R', [{ type: 'room', data: room }], {
            id: 'blk_r',
            baseX: 0,
            baseY: 0
        });
        var inst = BM.createInsert(def.id, 0, 0, { id: 1, scale: 2 });
        var world = BM.worldEntityFromLocal('room', def.entities[0].data, inst);
        expect(world.width).toBeCloseTo(80, 5);
        expect(world.height).toBeCloseTo(40, 5);
    });
});
