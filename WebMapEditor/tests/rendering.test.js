import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderGrid } = require('../core/rendering/grid-renderer.js');
const {
    renderCanvasClear,
    renderBackgroundImage
} = require('../core/rendering/background-renderer.js');

function mockCtx() {
    var calls = [];
    return {
        calls: calls,
        fillStyle: '',
        lineWidth: 0,
        strokeStyle: '',
        globalAlpha: 1,
        save: function () { calls.push('save'); },
        restore: function () { calls.push('restore'); },
        fillRect: function () { calls.push('fillRect'); },
        stroke: function () { calls.push('stroke'); },
        beginPath: function () { calls.push('beginPath'); },
        moveTo: function () { calls.push('moveTo'); },
        lineTo: function () { calls.push('lineTo'); },
        setLineDash: function () { calls.push('setLineDash'); }
    };
}

describe('Rendering Engine — grid + background', function () {
    it('renderCanvasClear gọi fillRect', function () {
        var ctx = mockCtx();
        renderCanvasClear(ctx, 800, 600);
        expect(ctx.calls).toContain('fillRect');
    });

    it('renderBackgroundImage áp dụng scale ngang/dọc độc lập', function () {
        var drawArgs = null;
        var ctx = {
            globalAlpha: 1,
            filter: 'none',
            save: function () {},
            restore: function () {},
            translate: function () {},
            rotate: function () {},
            drawImage: function () { drawArgs = Array.from(arguments); }
        };
        var image = { width: 100, height: 80 };
        renderBackgroundImage(ctx, { zoom: 1 }, {
            image: image,
            x: 10,
            y: 20,
            scale: 1,
            scaleX: 2,
            scaleY: 0.5
        });
        expect(drawArgs).toEqual([image, -100, -20, 200, 40]);
    });

    it('renderGrid visible=false không vẽ', function () {
        var ctx = mockCtx();
        renderGrid(ctx, { panX: 0, panY: 0, zoom: 1, width: 800, height: 600 }, 40, { visible: false });
        expect(ctx.calls).toHaveLength(0);
    });

    it('renderGrid visible=true có stroke', function () {
        var ctx = mockCtx();
        renderGrid(ctx, { panX: 0, panY: 0, zoom: 1, width: 800, height: 600 }, 40, { visible: true });
        expect(ctx.calls).toContain('stroke');
        expect(ctx.calls.filter(function (c) { return c === 'stroke'; }).length).toBe(2);
    });
});

describe('Rendering Engine — room renderer', function () {
    it('renderRoom rect gọi fillRect + strokeRect', function () {
        var { renderRoom } = require('../core/rendering/room-renderer.js');
        var calls = [];
        var ctx = {
            fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1, font: '',
            fillRect: function () { calls.push('fillRect'); },
            strokeRect: function () { calls.push('strokeRect'); },
            save: function () {}, restore: function () {},
            translate: function () {}, rotate: function () {},
            measureText: function () { return { width: 10 }; },
            fillText: function () {}
        };
        renderRoom(ctx, { zoom: 1 }, {
            shape: 'rect', name: 'A', color: '#ccc',
            x: 0, y: 0, width: 100, height: 80,
            labelFontSize: 14, labelAutoScale: false
        }, false, {});
        expect(calls).toContain('fillRect');
        expect(calls).toContain('strokeRect');
    });
});

describe('Rendering Engine — wall renderer', function () {
    it('renderWall gọi stroke 2 lần (glow + main)', function () {
        var { renderWall } = require('../core/rendering/wall-renderer.js');
        var strokes = 0;
        var ctx = {
            strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
            beginPath: function () {},
            moveTo: function () {},
            lineTo: function () {},
            stroke: function () { strokes++; }
        };
        renderWall(ctx, { zoom: 1 }, {
            points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
            thickness: 4,
            is_outer: false
        }, false);
        expect(strokes).toBe(2);
    });

    it('renderWallPreview gọi setLineDash + stroke', function () {
        var { renderWallPreview } = require('../core/rendering/wall-renderer.js');
        var calls = [];
        var ctx = {
            save: function () { calls.push('save'); },
            restore: function () { calls.push('restore'); },
            strokeStyle: '', lineWidth: 0,
            setLineDash: function () { calls.push('setLineDash'); },
            beginPath: function () {},
            moveTo: function () {},
            lineTo: function () {},
            stroke: function () { calls.push('stroke'); }
        };
        renderWallPreview(ctx, { zoom: 1 }, { x: 0, y: 0 }, { x: 50, y: 50 });
        expect(calls).toContain('setLineDash');
        expect(calls).toContain('stroke');
        expect(calls).toContain('save');
    });
});

describe('Rendering Engine — door renderer', function () {
    it('renderDoor gọi fillRect + strokeRect', function () {
        var { renderDoor } = require('../core/rendering/door-renderer.js');
        var calls = [];
        var ctx = {
            save: function () { calls.push('save'); },
            restore: function () { calls.push('restore'); },
            translate: function () {},
            rotate: function () {},
            fillStyle: '', strokeStyle: '', lineWidth: 0,
            fillRect: function () { calls.push('fillRect'); },
            strokeRect: function () { calls.push('strokeRect'); },
            font: '', textAlign: '', textBaseline: '',
            fillText: function () {}
        };
        renderDoor(ctx, { zoom: 1 }, { x: 50, y: 50, width: 40, rotation: 0, name: 'Cửa 1' }, false, {});
        expect(calls).toContain('fillRect');
        expect(calls).toContain('strokeRect');
    });
});

describe('Rendering Engine — path renderer', function () {
    it('renderPathEdges gọi stroke 2 lần mỗi edge (glow + core)', function () {
        var { renderPathEdges } = require('../core/rendering/path-renderer.js');
        var strokes = 0;
        var ctx = {
            strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
            setLineDash: function () {},
            beginPath: function () {},
            moveTo: function () {},
            lineTo: function () {},
            stroke: function () { strokes++; }
        };
        var nodes = { 1: { id: 1, x: 0, y: 0 }, 2: { id: 2, x: 100, y: 0 } };
        renderPathEdges(ctx, { zoom: 1 }, [{ from: 1, to: 2 }], function (id) { return nodes[id]; });
        expect(strokes).toBe(2);
    });

    it('renderPathNode gọi arc + fillText', function () {
        var { renderPathNode } = require('../core/rendering/path-renderer.js');
        var calls = [];
        var ctx = {
            beginPath: function () { calls.push('beginPath'); },
            arc: function () { calls.push('arc'); },
            fill: function () { calls.push('fill'); },
            stroke: function () { calls.push('stroke'); },
            fillStyle: '', strokeStyle: '', lineWidth: 0,
            font: '', textAlign: '', textBaseline: '',
            strokeText: function () { calls.push('strokeText'); },
            fillText: function () { calls.push('fillText'); }
        };
        renderPathNode(ctx, { zoom: 1 }, { id: 3, x: 10, y: 20, nodeType: 'normal' }, false, { nodeRadius: 8 });
        expect(calls).toContain('arc');
        expect(calls).toContain('fillText');
    });
});

describe('Rendering Engine — poi renderer', function () {
    it('renderPoi gọi arc + fillText tên', function () {
        var { renderPoi } = require('../core/rendering/poi-renderer.js');
        var calls = [];
        var renderedRadius = 0;
        var ctx = {
            beginPath: function () { calls.push('beginPath'); },
            arc: function (_x, _y, radius) { calls.push('arc'); renderedRadius = radius; },
            fill: function () { calls.push('fill'); },
            stroke: function () { calls.push('stroke'); },
            fillStyle: '', strokeStyle: '', lineWidth: 0,
            font: '', textAlign: '', textBaseline: '',
            fillText: function (t) { calls.push('fillText:' + t); }
        };
        renderPoi(ctx, { zoom: 1 }, { name: 'WC 1', x: 20, y: 30 }, false, {
            poiRadius: 12,
            typeInfo: { icon: '🚻', color: '#3498db' }
        });
        expect(calls).toContain('arc');
        expect(renderedRadius).toBe(12);
        expect(calls.some(function (c) { return c.indexOf('fillText:WC 1') === 0; })).toBe(true);
    });
});

describe('Rendering Engine — qr renderer', function () {
    it('renderQr gọi fill + fillText serial', function () {
        var { renderQr } = require('../core/rendering/qr-renderer.js');
        var fills = 0;
        var labels = [];
        var ctx = {
            save: function () {},
            restore: function () {},
            shadowBlur: 0, shadowColor: '',
            fillStyle: '', strokeStyle: '', lineWidth: 0,
            beginPath: function () {},
            rect: function () {},
            fill: function () { fills++; },
            stroke: function () {},
            fillRect: function () {},
            font: '', textAlign: '', textBaseline: '',
            fillText: function (t) { labels.push(t); }
        };
        renderQr(ctx, { zoom: 1 }, { x: 40, y: 50, serial: 'QR-001' }, false, { qrSize: 14 });
        expect(fills).toBeGreaterThan(0);
        expect(labels).toContain('QR-001');
    });
});
