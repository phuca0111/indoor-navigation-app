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

    it('filterInsertableItems giữ loại hỗ trợ, bỏ loại khác/null', function () {
        var items = [
            { type: 'room', data: { x: 0, y: 0, width: 1, height: 1 } },
            { type: 'blockRef', data: { x: 0, y: 0 } },
            { type: 'poi', data: { x: 5, y: 5 } },
            { type: 'wall', data: null },
            null
        ];
        var out = BM.filterInsertableItems(items);
        expect(out.map(function (i) { return i.type; })).toEqual(['room', 'poi']);
    });

    it('summarizeForPalette trả id/name/count', function () {
        var blocks = [
            { id: 'a', name: 'WC', entities: [{}, {}] },
            { id: 'b', name: '', entities: [] }
        ];
        var s = BM.summarizeForPalette(blocks);
        expect(s[0]).toMatchObject({ id: 'a', name: 'WC', count: 2 });
        expect(s[1].name).toBe('Block');
        expect(s[1].count).toBe(0);
    });

    it('createDefinition nhiều đối tượng → base chung, insert đặt lại đúng', function () {
        var room = { id: 1, shape: 'rect', x: 100, y: 100, width: 40, height: 20 };
        var door = { id: 2, x: 100, y: 100, width: 20, rotation: 0 };
        var items = BM.filterInsertableItems([
            { type: 'room', data: room },
            { type: 'door', data: door }
        ]);
        expect(items.length).toBe(2);
        var box = BM.selectionBBox(items);
        var def = BM.createDefinition('Combo', items, { id: 'blk_combo', baseX: box.minX, baseY: box.minY });
        expect(def.entities.length).toBe(2);
        // Chèn lại tại (0,0): room góc trên-trái = (room.x - box.minX)
        var inst = BM.createInsert(def.id, 0, 0, { id: 1 });
        var worldRoom = BM.worldEntityFromLocal('room', def.entities[0].data, inst);
        expect(worldRoom.x).toBeCloseTo(room.x - box.minX, 5);
        expect(worldRoom.y).toBeCloseTo(room.y - box.minY, 5);
    });
});

describe('BlockManager — ATTDef / ATTEdit', function () {
    it('normalizeAttrTag viết hoa và thay khoảng trắng', function () {
        expect(BM.normalizeAttrTag('  room name ')).toBe('ROOM_NAME');
        expect(BM.normalizeAttrTag('')).toBe('');
    });

    it('addAttributeDef thêm / ghi đè theo tag', function () {
        var def = BM.createDefinition('WC', [{ type: 'poi', data: { x: 0, y: 0 } }], { id: 'blk_att', baseX: 0, baseY: 0 });
        expect(def.attributes).toEqual([]);
        var a1 = BM.addAttributeDef(def, { tag: 'name', prompt: 'Tên', defaultValue: 'WC' });
        expect(a1.tag).toBe('NAME');
        expect(def.attributes.length).toBe(1);
        BM.addAttributeDef(def, { tag: 'NAME', prompt: 'Tên phòng', defaultValue: 'Toilet' });
        expect(def.attributes.length).toBe(1);
        expect(def.attributes[0].prompt).toBe('Tên phòng');
        expect(def.attributes[0].defaultValue).toBe('Toilet');
    });

    it('createInsert + def khởi tạo attrValues từ default', function () {
        var def = BM.createDefinition('QR', [{ type: 'poi', data: { x: 5, y: 5 } }], { id: 'blk_qr', baseX: 0, baseY: 0 });
        BM.addAttributeDef(def, { tag: 'CODE', prompt: 'Mã', defaultValue: 'QR-01' });
        BM.addAttributeDef(def, { tag: 'FLOOR', defaultValue: '2' });
        var inst = BM.createInsert(def.id, 10, 20, { id: 1, def: def });
        expect(inst.attrValues.CODE).toBe('QR-01');
        expect(inst.attrValues.FLOOR).toBe('2');
    });

    it('setInsertAttrValue + resolveInsertAttributes', function () {
        var def = BM.createDefinition('D', [{ type: 'door', data: { x: 0, y: 0, width: 40 } }], { id: 'blk_d2', baseX: -20, baseY: -20 });
        BM.addAttributeDef(def, { tag: 'TYPE', defaultValue: 'single' });
        var inst = BM.createInsert(def.id, 0, 0, { id: 2, def: def });
        BM.setInsertAttrValue(inst, 'TYPE', 'double');
        var list = BM.resolveInsertAttributes(def, inst);
        expect(list.length).toBe(1);
        expect(list[0].tag).toBe('TYPE');
        expect(list[0].value).toBe('double');
        expect(BM.getInsertAttrValue(def, inst, 'TYPE')).toBe('double');
    });

    it('removeAttributeDef xoá theo tag', function () {
        var def = BM.createDefinition('P', [{ type: 'poi', data: { x: 1, y: 1 } }], { id: 'blk_p', baseX: 0, baseY: 0 });
        BM.addAttributeDef(def, { tag: 'A', defaultValue: '1' });
        BM.addAttributeDef(def, { tag: 'B', defaultValue: '2' });
        expect(BM.removeAttributeDef(def, 'a')).toBe(true);
        expect(def.attributes.map(function (x) { return x.tag; })).toEqual(['B']);
        expect(BM.removeAttributeDef(def, 'MISSING')).toBe(false);
    });

    it('addAttributeDef từ chối tag rỗng', function () {
        var def = BM.createDefinition('X', [{ type: 'poi', data: { x: 0, y: 0 } }], { id: 'blk_x', baseX: 0, baseY: 0 });
        expect(BM.addAttributeDef(def, { tag: '   ' })).toBeNull();
        expect(BM.addAttributeDef(null, { tag: 'OK' })).toBeNull();
    });
});
