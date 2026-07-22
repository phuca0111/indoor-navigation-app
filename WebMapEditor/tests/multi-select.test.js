// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import '../js/multi-select.js';

function resetWorld() {
    window.rooms = [];
    window.walls = [];
    window.lines = [];
    window.doors = [];
    window.pois = [];
    window.qrs = [];
    window.pathNodes = [];
    window.blockInserts = [];
    window.zoom = 1;
    window.selectedObject = null;
    window.selectedRoom = null;
    window.msClear();
}

describe('MultiSelect — tập chọn nhiều', function () {
    beforeEach(resetWorld);

    it('msSet / msCount / msIsMulti / msHas', function () {
        var a = { id: 1 }, b = { id: 2 };
        window.msSet([{ type: 'room', data: a }, { type: 'room', data: b }]);
        expect(window.msCount()).toBe(2);
        expect(window.msIsMulti()).toBe(true);
        expect(window.msHas(a)).toBe(true);
        expect(window.msHas({ id: 99 })).toBe(false);
    });

    it('msToggle thêm rồi bớt', function () {
        var a = { id: 1 };
        window.msToggle('room', a);
        expect(window.msHas(a)).toBe(true);
        window.msToggle('room', a);
        expect(window.msHas(a)).toBe(false);
    });

    it('msTranslate dịch điểm và toạ độ', function () {
        var poly = { id: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
        window.msTranslate('line', poly, 5, 3);
        expect(poly.points[0]).toEqual({ x: 5, y: 3 });
        expect(poly.points[1]).toEqual({ x: 15, y: 3 });

        var poi = { id: 2, x: 10, y: 10 };
        window.msTranslate('poi', poi, -4, 2);
        expect(poi.x).toBe(6);
        expect(poi.y).toBe(12);
    });

    it('msGroup gán groupId chung, msObjectsInGroup tìm lại, msUngroup xoá', function () {
        var r1 = { id: 1, x: 0, y: 0, width: 10, height: 10 };
        var r2 = { id: 2, x: 20, y: 0, width: 10, height: 10 };
        window.rooms = [r1, r2];
        window.msSet([{ type: 'room', data: r1 }, { type: 'room', data: r2 }]);

        window.msGroup();
        expect(r1.groupId).toBeGreaterThan(0);
        expect(r1.groupId).toBe(r2.groupId);

        var members = window.msObjectsInGroup(r1.groupId);
        expect(members.length).toBe(2);

        window.msUngroup();
        expect(r1.groupId).toBeUndefined();
        expect(r2.groupId).toBeUndefined();
    });

    it('msGroup không nhóm khi < 2 đối tượng', function () {
        var r1 = { id: 1, x: 0, y: 0, width: 10, height: 10 };
        window.rooms = [r1];
        window.msSet([{ type: 'room', data: r1 }]);
        window.msGroup();
        expect(r1.groupId).toBeUndefined();
    });

    it('marquee window (trái→phải) chỉ chọn đối tượng nằm hẳn trong khung', function () {
        var inside = { id: 1, x: 10, y: 10, width: 10, height: 10 };   // 10..20
        var outside = { id: 2, x: 100, y: 100, width: 10, height: 10 };
        window.rooms = [inside, outside];

        window.msStartMarquee({ x: 0, y: 0 });
        window.msUpdateMarquee({ x: 50, y: 50 }); // phải-xuống → window mode
        expect(window.marqueeRect.crossing).toBe(false);
        window.msFinishMarquee();

        expect(window.msCount()).toBe(1);
        expect(window.msHas(inside)).toBe(true);
        expect(window.msHas(outside)).toBe(false);
    });

    it('marquee crossing (phải→trái) chọn cả đối tượng chỉ chạm khung', function () {
        var touching = { id: 1, x: 40, y: 0, width: 40, height: 40 }; // 40..80, chạm biên 50
        window.rooms = [touching];

        window.msStartMarquee({ x: 50, y: 50 });
        window.msUpdateMarquee({ x: 0, y: 0 }); // trái-lên → crossing mode
        expect(window.marqueeRect.crossing).toBe(true);
        window.msFinishMarquee();

        expect(window.msHas(touching)).toBe(true);
    });

    it('msHandlePick Shift+click bật/tắt trong tập', function () {
        var a = { id: 1, x: 0, y: 0 };
        var b = { id: 2, x: 5, y: 5 };
        var handled1 = window.msHandlePick('poi', a, { shiftKey: true });
        var handled2 = window.msHandlePick('poi', b, { shiftKey: true });
        expect(handled1).toBe(true);
        expect(handled2).toBe(true);
        expect(window.msCount()).toBe(2);
    });

    it('msHandlePick click thường lên phần tử thuộc nhóm → chọn cả nhóm', function () {
        var r1 = { id: 1, x: 0, y: 0, width: 10, height: 10, groupId: 7 };
        var r2 = { id: 2, x: 20, y: 0, width: 10, height: 10, groupId: 7 };
        window.rooms = [r1, r2];
        var handled = window.msHandlePick('room', r1, { shiftKey: false });
        expect(handled).toBe(true);
        expect(window.msCount()).toBe(2);
        expect(window.msHas(r2)).toBe(true);
    });
});
