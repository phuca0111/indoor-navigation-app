import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OT = require('../core/object-transform.js');
const GE = require('../core/geometry/geometry-engine.js');
const MS = require('../core/modify-session.js');

describe('ObjectTransform', function () {
    it('translateObject di chuyển room rect', function () {
        var room = { shape: 'rect', x: 10, y: 20, width: 40, height: 30 };
        OT.translateObject('room', room, 5, -5);
        expect(room.x).toBe(15);
        expect(room.y).toBe(15);
    });

    it('rotatePoint 90° quanh gốc', function () {
        var p = OT.rotatePoint({ x: 1, y: 0 }, 0, 0, Math.PI / 2);
        expect(p.x).toBeCloseTo(0, 5);
        expect(p.y).toBeCloseTo(1, 5);
    });

    it('scaleObject phóng circle', function () {
        var room = { shape: 'circle', cx: 100, cy: 100, radius: 10, x: 90, y: 90, width: 20, height: 20 };
        OT.scaleObject('room', room, 100, 100, 2);
        expect(room.radius).toBe(20);
        expect(room.cx).toBe(100);
    });

    it('mirrorPoint lật qua trục Y (x=0)', function () {
        var m = OT.mirrorPoint({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 10 });
        expect(m.x).toBeCloseTo(-3, 5);
        expect(m.y).toBeCloseTo(4, 5);
    });

    it('cloneObject tạo bản sao id mới', function () {
        var wall = { id: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], thickness: 4 };
        var copy = OT.cloneObject('wall', wall, function () { return 99; });
        expect(copy.id).toBe(99);
        expect(copy.points[0].x).toBe(0);
        copy.points[0].x = 5;
        expect(wall.points[0].x).toBe(0);
    });

    it('flipHorizontal lật qua tâm', function () {
        var room = { shape: 'rect', x: 10, y: 10, width: 20, height: 10 };
        OT.flipHorizontal('room', room);
        expect(room.x).toBeCloseTo(10, 3);
    });

    it('ensure + restore original geometry', function () {
        var room = { shape: 'rect', x: 10, y: 20, width: 40, height: 30 };
        OT.ensureOriginalGeometry('room', room);
        OT.scaleAboutCenter('room', room, 2);
        expect(room.width).toBe(80);
        expect(OT.restoreOriginalGeometry('room', room)).toBe(true);
        expect(room.x).toBe(10);
        expect(room.y).toBe(20);
        expect(room.width).toBe(40);
        expect(room.height).toBe(30);
    });

    it('1:1 không ghi đè _originalGeometry', function () {
        var room = { shape: 'rect', x: 0, y: 0, width: 10, height: 10 };
        OT.ensureOriginalGeometry('room', room);
        var snap = room._originalGeometry;
        OT.ensureOriginalGeometry('room', room);
        expect(room._originalGeometry).toBe(snap);
    });

    it('rotateByDegrees 90° quanh tâm', function () {
        var room = { shape: 'circle', cx: 50, cy: 50, radius: 10, x: 40, y: 40, width: 20, height: 20 };
        OT.rotateByDegrees('room', room, 90);
        expect(room.cx).toBeCloseTo(50, 3);
        expect(room.cy).toBeCloseTo(50, 3);
    });
});

describe('GeometryEngine Phase 2', function () {
    it('trimSegment cắt phần gần click', function () {
        var targetA = { x: 0, y: 0 }, targetB = { x: 100, y: 0 };
        var cutA = { x: 50, y: -10 }, cutB = { x: 50, y: 10 };
        var r = GE.trimSegment(targetA, targetB, cutA, cutB, { x: 10, y: 0 });
        expect(r).not.toBeNull();
        expect(r.a.x).toBeCloseTo(0, 3);
        expect(r.b.x).toBeCloseTo(50, 3);
    });

    it('extendSegment kéo dài tới biên cắt', function () {
        var targetA = { x: 0, y: 0 }, targetB = { x: 40, y: 0 };
        var cutA = { x: 80, y: -10 }, cutB = { x: 80, y: 10 };
        var r = GE.extendSegment(targetA, targetB, cutA, cutB);
        expect(r).not.toBeNull();
        expect(r.b.x).toBeCloseTo(80, 3);
    });

    it('offsetSegment tạo 2 biên song song', function () {
        var off = GE.offsetSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
        expect(off).not.toBeNull();
        expect(off.left[0].y).toBeCloseTo(2, 5);
        expect(off.right[0].y).toBeCloseTo(-2, 5);
    });

    it('trimAgainstCutters cắt theo biên gần click', function () {
        var r = GE.trimAgainstCutters(
            { x: 0, y: 0 }, { x: 100, y: 0 },
            [{ a: { x: 40, y: -5 }, b: { x: 40, y: 5 } }],
            { x: 10, y: 0 }
        );
        expect(r).not.toBeNull();
        expect(r.b.x).toBeCloseTo(40, 3);
    });

    it('breakSegmentAt cắt đôi đoạn', function () {
        var br = GE.breakSegmentAt({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 40, y: 2 });
        expect(br).not.toBeNull();
        expect(br.left.b.x).toBeCloseTo(40, 1);
        expect(br.right.a.x).toBeCloseTo(40, 1);
    });
});

describe('ModifySession', function () {
    beforeEach(function () {
        globalThis.EditorCore = globalThis.EditorCore || {};
        globalThis.EditorCore.ObjectTransform = OT;
        globalThis.EditorCore.GeometryEngine = GE;
        MS.deactivate();
    });

    it('isModifyTool nhận diện tool Phase 2', function () {
        expect(MS.isModifyTool('move')).toBe(true);
        expect(MS.isModifyTool('mline')).toBe(true);
        expect(MS.isModifyTool('wall')).toBe(false);
    });

    it('activate move không selection → idle + message', function () {
        globalThis.selectedRoom = null;
        globalThis.selectedObject = null;
        var s = MS.activate('move');
        expect(s.stage).toBe('idle');
        expect(s.message).toMatch(/Chọn/);
    });

    it('activate move có selection → stage base', function () {
        globalThis.selectedRoom = { shape: 'rect', x: 0, y: 0, width: 10, height: 10 };
        globalThis.selectedObject = null;
        var s = MS.activate('move');
        expect(s.mode).toBe('move');
        expect(s.stage).toBe('base');
    });

    it('move 2 click dịch room', function () {
        var room = { shape: 'rect', x: 0, y: 0, width: 10, height: 10 };
        globalThis.selectedRoom = room;
        globalThis.selectedObject = null;
        globalThis.saveState = function () {};
        globalThis.draw = function () {};
        MS.activate('move');
        MS.onPointerDown({ x: 0, y: 0 });
        MS.onPointerDown({ x: 20, y: 10 });
        expect(room.x).toBe(20);
        expect(room.y).toBe(10);
    });

    it('mline activate → stage mline', function () {
        var s = MS.activate('mline');
        expect(s.stage).toBe('mline');
        expect(s.mode).toBe('mline');
    });

    it('matchprop với selection sẵn → stage match', function () {
        globalThis.selectedRoom = { shape: 'rect', x: 0, y: 0, width: 10, height: 10, color: '#ff0000' };
        var s = MS.activate('matchprop');
        expect(s.stage).toBe('match');
        expect(s.matchSource.props.color).toBe('#ff0000');
    });
});
