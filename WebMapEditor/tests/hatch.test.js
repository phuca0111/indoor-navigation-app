import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Hatch = require('../core/hatch.js');

describe('Hatch (H)', function () {
    it('normalize mặc định lines', function () {
        var h = Hatch.normalize({});
        expect(h.pattern).toBe('lines');
        expect(h.spacing).toBeGreaterThanOrEqual(4);
    });

    it('defaultForRoomType Nhà vệ sinh → cross', function () {
        var h = Hatch.defaultForRoomType('Nhà vệ sinh');
        expect(h.pattern).toBe('cross');
        expect(h.color).toBeTruthy();
    });

    it('applyToRoom / clearFromRoom', function () {
        var room = { id: 1, type: 'Văn phòng', x: 0, y: 0, width: 40, height: 40 };
        Hatch.applyToRoom(room, { pattern: 'dots', color: '#abc', spacing: 8 });
        expect(Hatch.hasHatch(room)).toBe(true);
        expect(room.hatch.pattern).toBe('dots');
        Hatch.applyToRoom(room, { pattern: 'none' });
        expect(Hatch.hasHatch(room)).toBe(false);
        Hatch.applyToRoom(room, Hatch.defaultForRoomType(room.type));
        Hatch.clearFromRoom(room);
        expect(room.hatch).toBeUndefined();
    });

    it('roomBounds circle / rect', function () {
        var c = Hatch.roomBounds({ shape: 'circle', cx: 10, cy: 10, radius: 5 });
        expect(c.minX).toBe(5);
        expect(c.maxX).toBe(15);
        var r = Hatch.roomBounds({ shape: 'rect', x: 0, y: 0, width: 20, height: 10 });
        expect(r.maxX).toBe(20);
        expect(r.maxY).toBe(10);
    });

    it('cloneForPersist bỏ none', function () {
        expect(Hatch.cloneForPersist({ pattern: 'none' })).toBeUndefined();
        expect(Hatch.cloneForPersist({ pattern: 'lines', color: '#000' }).pattern).toBe('lines');
    });

    it('updateHatchProp sửa từng field (Hatchedit)', function () {
        var room = { id: 1, type: 'Văn phòng', x: 0, y: 0, width: 40, height: 40 };
        Hatch.applyToRoom(room, { pattern: 'lines', color: '#111', spacing: 10, angle: 30 });
        Hatch.updateHatchProp(room, 'color', '#ff0000');
        expect(room.hatch.color).toBe('#ff0000');
        expect(room.hatch.pattern).toBe('lines');
        Hatch.updateHatchProp(room, 'spacing', 20);
        expect(room.hatch.spacing).toBe(20);
        Hatch.updateHatchProp(room, 'angle', 90);
        expect(room.hatch.angle).toBe(90);
        Hatch.updateHatchProp(room, 'pattern', 'cross');
        expect(room.hatch.pattern).toBe('cross');
    });

    it('updateHatchProp pattern=none → xóa hatch', function () {
        var room = { id: 2, hatch: { pattern: 'dots', color: '#0f0', spacing: 8, angle: 0 } };
        expect(Hatch.updateHatchProp(room, 'pattern', 'none')).toBeNull();
        expect(Hatch.hasHatch(room)).toBe(false);
    });

    it('updateHatchProp trên phòng chưa có hatch → tạo rồi patch', function () {
        var room = { id: 3, type: 'Khác' };
        var h = Hatch.updateHatchProp(room, 'pattern', 'solid');
        expect(h).toBeTruthy();
        expect(room.hatch.pattern).toBe('solid');
    });

    it('copyHatch sao chép style giữa 2 phòng', function () {
        var a = { id: 1 };
        var b = { id: 2 };
        Hatch.applyToRoom(a, { pattern: 'cross', color: '#abc', spacing: 9, angle: 15 });
        Hatch.copyHatch(a, b);
        expect(b.hatch.pattern).toBe('cross');
        expect(b.hatch.color).toBe('#abc');
        expect(b.hatch.spacing).toBe(9);
        Hatch.copyHatch({ pattern: 'none' }, b);
        expect(Hatch.hasHatch(b)).toBe(false);
    });
});
