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

    it('Move/Rotate/Scale đồng bộ metadata ellipse với polyline hiển thị', function () {
        var ellipse = {
            type: 'ellipse',
            points: [{ x: 15, y: 20 }, { x: 10, y: 23 }, { x: 5, y: 20 }],
            ellipse: { cx: 10, cy: 20, rx: 5, ry: 3, rotation: 0 }
        };
        OT.ensureOriginalGeometry('line', ellipse);
        OT.translateObject('line', ellipse, 4, -2);
        expect(ellipse.ellipse).toMatchObject({ cx: 14, cy: 18, rx: 5, ry: 3 });
        expect(ellipse.points[0]).toEqual({ x: 19, y: 18 });

        OT.rotateObject('line', ellipse, 0, 0, Math.PI / 2);
        expect(ellipse.ellipse.cx).toBeCloseTo(-18, 6);
        expect(ellipse.ellipse.cy).toBeCloseTo(14, 6);
        expect(ellipse.ellipse.rotation).toBeCloseTo(Math.PI / 2, 6);

        OT.scaleObject('line', ellipse, 0, 0, 2);
        expect(ellipse.ellipse).toMatchObject({ rx: 10, ry: 6 });
        expect(ellipse.ellipse.cx).toBeCloseTo(-36, 6);
        expect(ellipse.ellipse.cy).toBeCloseTo(28, 6);

        expect(OT.restoreOriginalGeometry('line', ellipse)).toBe(true);
        expect(ellipse.ellipse).toEqual({ cx: 10, cy: 20, rx: 5, ry: 3, rotation: 0 });
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
    it('trimSegment bỏ phần chứa click, giữ phần còn lại (chuẩn AutoCAD)', function () {
        var targetA = { x: 0, y: 0 }, targetB = { x: 100, y: 0 };
        var cutA = { x: 50, y: -10 }, cutB = { x: 50, y: 10 };
        // Click ở nửa A (x=10) → BỎ nửa A, GIỮ đoạn giao→B: [50,100]
        var r = GE.trimSegment(targetA, targetB, cutA, cutB, { x: 10, y: 0 });
        expect(r).not.toBeNull();
        expect(r.a.x).toBeCloseTo(50, 3);
        expect(r.b.x).toBeCloseTo(100, 3);
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

    it('trimAgainstCutters bỏ đuôi chứa click theo biên gần nhất (chuẩn AutoCAD)', function () {
        // Segment [0,100], biên tại x=40, click ở đuôi đầu (x=10) → BỎ [0,40], GIỮ [40,100]
        var r = GE.trimAgainstCutters(
            { x: 0, y: 0 }, { x: 100, y: 0 },
            [{ a: { x: 40, y: -5 }, b: { x: 40, y: 5 } }],
            { x: 10, y: 0 }
        );
        expect(r).not.toBeNull();
        expect(r.a.x).toBeCloseTo(40, 3);
        expect(r.b.x).toBeCloseTo(100, 3);
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

    it('array linear: clone theo vector', function () {
        var room = { id: 1, shape: 'rect', x: 0, y: 0, width: 10, height: 10 };
        globalThis.selectedRoom = room;
        globalThis.selectedObject = null;
        globalThis.rooms = [room];
        globalThis.nextRoomId = 2;
        globalThis.saveState = function () {};
        globalThis.draw = function () {};
        MS.activate('array', { skipPrompt: true, array: { mode: 'linear', count: 3 } });
        expect(MS.getSnapshot().stage).toBe('base');
        MS.onPointerDown({ x: 0, y: 0 });
        MS.onPointerDown({ x: 20, y: 0 });
        expect(globalThis.rooms.length).toBe(3);
        expect(globalThis.rooms[1].x).toBe(20);
        expect(globalThis.rooms[2].x).toBe(40);
    });

    it('array rect: lưới cột×hàng', function () {
        var room = { id: 1, shape: 'rect', x: 0, y: 0, width: 10, height: 10 };
        globalThis.selectedRoom = room;
        globalThis.selectedObject = null;
        globalThis.rooms = [room];
        globalThis.nextRoomId = 2;
        globalThis.saveState = function () {};
        globalThis.draw = function () {};
        MS.activate('array', { skipPrompt: true, array: { mode: 'rect', cols: 3, rows: 2 } });
        MS.onPointerDown({ x: 0, y: 0 });
        MS.onPointerDown({ x: 30, y: 20 });
        // 3×2 − 1 gốc = 5 bản
        expect(globalThis.rooms.length).toBe(6);
        var xs = globalThis.rooms.map(function (r) { return r.x; }).sort(function (a, b) { return a - b; });
        expect(xs).toEqual([0, 0, 30, 30, 60, 60]);
    });

    it('array polar: xoay quanh tâm', function () {
        var room = { id: 1, shape: 'rect', x: 90, y: 40, width: 20, height: 20 };
        globalThis.selectedRoom = room;
        globalThis.selectedObject = null;
        globalThis.rooms = [room];
        globalThis.nextRoomId = 2;
        globalThis.saveState = function () {};
        globalThis.draw = function () {};
        MS.activate('array', {
            skipPrompt: true,
            array: { mode: 'polar', count: 4, polarAngle: 360, rotateItems: true }
        });
        expect(MS.getSnapshot().stage).toBe('center');
        MS.onPointerDown({ x: 100, y: 100 });
        expect(globalThis.rooms.length).toBe(4);
    });

    it('pedit Close (C): đóng polyline tường', function () {
        var wall = {
            id: 1,
            points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }]
        };
        globalThis.selectedRoom = null;
        globalThis.selectedObject = { type: 'wall', data: wall };
        globalThis.walls = [wall];
        var saveCount = 0;
        globalThis.saveState = function () { saveCount++; };
        globalThis.draw = function () {};
        MS.activate('pedit');
        expect(MS.getSnapshot().stage).toBe('pedit');
        MS.onKeyDown('c');
        expect(wall.closed).toBe(true);
        expect(wall.points.length).toBe(4);
        expect(wall.points[3]).toEqual({ x: 0, y: 0 });
        expect(saveCount).toBe(1);
    });

    it('pedit Join (J): nối 2 đoạn', function () {
        var a = { id: 1, type: 'segment', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
        var b = { id: 2, type: 'segment', points: [{ x: 10, y: 0 }, { x: 20, y: 0 }] };
        globalThis.selectedRoom = null;
        globalThis.selectedObject = { type: 'line', data: a };
        globalThis.lines = [a, b];
        globalThis.walls = [];
        globalThis.saveState = function () {};
        globalThis.draw = function () {};
        // findLineAt cho pickObjectAt — fallback dùng findSegmentHit
        globalThis.findLineAt = function (wx, wy) {
            if (Math.abs(wy) > 5) return null;
            if (wx >= 8 && wx <= 22) return b;
            return null;
        };
        MS.activate('pedit');
        MS.onKeyDown('j');
        expect(MS.getSnapshot().stage).toBe('pedit-join');
        MS.onPointerDown({ x: 15, y: 0 });
        expect(a.points.length).toBe(3);
        expect(globalThis.lines.length).toBe(1);
        expect(MS.getSnapshot().stage).toBe('pedit');
    });

    it('pedit Width (W): đặt lineWeight', function () {
        var ln = { id: 1, type: 'segment', lineWeight: 2, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
        globalThis.selectedRoom = null;
        globalThis.selectedObject = { type: 'line', data: ln };
        globalThis.prompt = function () { return '5'; };
        globalThis.saveState = function () {};
        globalThis.draw = function () {};
        MS.activate('pedit');
        MS.onKeyDown('w');
        expect(ln.lineWeight).toBe(5);
    });

    it('pedit Fit (F) rồi Undo (U) khôi phục đúng đỉnh', function () {
        var ln = {
            id: 3,
            type: 'segment',
            points: [{ x: 0, y: 0 }, { x: 40, y: 50 }, { x: 100, y: 0 }]
        };
        var original = JSON.parse(JSON.stringify(ln.points));
        globalThis.selectedRoom = null;
        globalThis.selectedObject = { type: 'line', data: ln };
        globalThis.lines = [ln];
        globalThis.saveState = function () {};
        globalThis.draw = function () {};
        MS.activate('pedit');
        MS.onKeyDown('f');
        expect(ln.peditCurve).toBe('fit');
        expect(ln.points.length).toBeGreaterThan(original.length);
        MS.onKeyDown('u');
        expect(ln.points).toEqual(original);
        expect(ln.peditCurve).toBeUndefined();
    });

    it('pedit Spline (S) nội suy đường và giữ hai đầu', function () {
        var ln = {
            id: 4,
            type: 'segment',
            points: [{ x: 0, y: 0 }, { x: 40, y: 50 }, { x: 100, y: 0 }]
        };
        globalThis.selectedRoom = null;
        globalThis.selectedObject = { type: 'line', data: ln };
        globalThis.lines = [ln];
        globalThis.saveState = function () {};
        globalThis.draw = function () {};
        MS.activate('pedit');
        MS.onKeyDown('s');
        expect(ln.peditCurve).toBe('spline');
        expect(ln.points[0]).toEqual({ x: 0, y: 0 });
        expect(ln.points[ln.points.length - 1]).toEqual({ x: 100, y: 0 });
    });

    it('đổi Fit → Spline vẫn dùng control points gốc, không dùng sampled points', function () {
        var ln = {
            id: 5,
            type: 'segment',
            points: [{ x: 0, y: 0 }, { x: 40, y: 50 }, { x: 100, y: 0 }]
        };
        globalThis.selectedRoom = null;
        globalThis.selectedObject = { type: 'line', data: ln };
        globalThis.lines = [ln];
        globalThis.saveState = function () {};
        globalThis.draw = function () {};
        MS.activate('pedit');
        MS.onKeyDown('f');
        MS.onKeyDown('s');
        expect(ln.peditControlPoints).toHaveLength(3);
        expect(ln.points).toHaveLength(17);
    });

    it('pedit Undo sau Join khôi phục cả đối tượng bị xóa', function () {
        var a = { id: 11, type: 'segment', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
        var b = { id: 12, type: 'segment', points: [{ x: 10, y: 0 }, { x: 20, y: 0 }] };
        globalThis.selectedRoom = null;
        globalThis.selectedObject = { type: 'line', data: a };
        globalThis.lines = [a, b];
        globalThis.walls = [];
        globalThis.saveState = function () {};
        globalThis.draw = function () {};
        globalThis.findLineAt = function () { return b; };
        MS.activate('pedit');
        MS.onKeyDown('j');
        MS.onPointerDown({ x: 15, y: 0 });
        expect(globalThis.lines).toHaveLength(1);
        MS.onKeyDown('u');
        expect(a.points).toHaveLength(2);
        expect(globalThis.lines).toHaveLength(2);
        expect(globalThis.lines.some(function (item) { return item.id === 12; })).toBe(true);
    });
});
