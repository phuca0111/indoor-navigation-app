// ============================================================
// POLYLINE-TOOL.JS — PolylineTool V4 (Phase 1)
// State: Idle → Drawing → Finish / Cancel  (spec §15.3)
// Wall (W) dùng engine này: commit từng đoạn + continueFromLast().
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PolylineTool = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STATE = {
        IDLE: 'idle',
        DRAWING: 'drawing',
        FINISHED: 'finished',
        CANCELLED: 'cancelled'
    };

    var MIN_POINTS_FINISH = 2;

    var state = STATE.IDLE;
    var points = [];
    var previewPoint = null;
    var lastResult = null;
    var orthoLock = false; // Shift+B (wall) : ép ngang/dọc theo điểm neo trước

    function snapAt(worldX, worldY, opts) {
        if (typeof globalThis.snapWorldPoint === 'function') {
            return globalThis.snapWorldPoint(worldX, worldY, opts);
        }
        if (globalThis.EditorCore && globalThis.EditorCore.SnapBridge) {
            return globalThis.EditorCore.SnapBridge.snapWorldPoint(worldX, worldY, opts);
        }
        if (globalThis.EditorCore && globalThis.EditorCore.SnapEngine) {
            return globalThis.EditorCore.SnapEngine.snapPoint({ x: worldX, y: worldY }, opts);
        }
        return { x: worldX, y: worldY, kind: 'none', source: 'raw' };
    }

    function getState() {
        return state;
    }

    function getPoints() {
        return points.map(function (p) {
            return { x: p.x, y: p.y, kind: p.kind, source: p.source };
        });
    }

    function getPreview() {
        if (!previewPoint) return null;
        return { x: previewPoint.x, y: previewPoint.y, kind: previewPoint.kind, angleDeg: previewPoint.angleDeg };
    }

    function setOrthoLock(enabled) {
        orthoLock = !!enabled;
        return orthoLock;
    }

    function toggleOrthoLock() {
        orthoLock = !orthoLock;
        return orthoLock;
    }

    function getOrthoLock() {
        return orthoLock;
    }

    function getLastResult() {
        return lastResult;
    }

    function reset() {
        state = STATE.IDLE;
        points = [];
        previewPoint = null;
    }

    /** Giữ đỉnh cuối, tiếp tục chuỗi (Wall commit từng đoạn). */
    function continueFromLast() {
        if (!points.length) {
            reset();
            return getSnapshot();
        }
        var last = points[points.length - 1];
        points = [{ x: last.x, y: last.y, kind: last.kind, source: last.source }];
        previewPoint = null;
        state = STATE.DRAWING;
        return getSnapshot();
    }

    function applyOrthoLock(anchor, pt) {
        if (!anchor || !pt) return pt;
        var dx = pt.x - anchor.x;
        var dy = pt.y - anchor.y;
        // Nếu lệch nhiều theo trục X -> ép y theo anchor (segment ngang).
        // Ngược lại -> ép x theo anchor (segment dọc).
        if (Math.abs(dx) >= Math.abs(dy)) {
            return { x: pt.x, y: anchor.y, kind: pt.kind, source: pt.source };
        }
        return { x: anchor.x, y: pt.y, kind: pt.kind, source: pt.source };
    }

    /** Ortho lock ưu tiên nhất; sau đó polar tracking (không đè endpoint/midpoint). */
    function constrainPoint(anchor, snapped, snapOpts) {
        if (!anchor) return snapped;
        if (orthoLock) return applyOrthoLock(anchor, snapped);
        if (globalThis.EditorCore && globalThis.EditorCore.PolarTracking) {
            return globalThis.EditorCore.PolarTracking.applyToSnapped(anchor, snapped, snapOpts);
        }
        return snapped;
    }

    function activate(ctx) {
        reset();
        lastResult = null;
        if (ctx && ctx.eventBus) {
            ctx.eventBus.emit('TOOL_ACTIVATED', { toolId: 'polyline' });
        }
        return getSnapshot();
    }

    function deactivate(ctx) {
        if (state === STATE.DRAWING) {
            cancel(ctx);
        } else {
            reset();
        }
        if (ctx && ctx.eventBus) {
            ctx.eventBus.emit('TOOL_DEACTIVATED', { toolId: 'polyline' });
        }
        return getSnapshot();
    }

    function mergeSnapOpts(e) {
        var base = (e && e.snapOpts) || (e && e.shiftKey ? { objectSnap: false, gridSnap: false, polar: false } : undefined);
        var opts = base ? Object.assign({}, base) : {};
        if (points.length) {
            var last = points[points.length - 1];
            opts.anchor = { x: last.x, y: last.y };
        }
        return opts;
    }

    function onPointerDown(e, ctx) {
        ctx = ctx || {};
        var wx = e && e.worldX != null ? e.worldX : (e && e.x);
        var wy = e && e.worldY != null ? e.worldY : (e && e.y);
        if (wx == null || wy == null) return getSnapshot();

        var snapOpts = mergeSnapOpts(e);
        var snapped = snapAt(wx, wy, snapOpts);
        if (points.length) {
            snapped = constrainPoint(points[points.length - 1], snapped, snapOpts);
        }
        var pt = { x: snapped.x, y: snapped.y, kind: snapped.kind, source: snapped.source };

        if (state === STATE.IDLE) {
            state = STATE.DRAWING;
            points = [pt];
            previewPoint = null;
        } else if (state === STATE.DRAWING) {
            points.push(pt);
            previewPoint = null;
        }

        if (ctx.eventBus) {
            ctx.eventBus.emit('POLYLINE_VERTEX_ADDED', {
                count: points.length,
                point: pt
            });
        }

        return getSnapshot();
    }

    function onPointerMove(e, ctx) {
        if (state !== STATE.DRAWING) return getSnapshot();
        var wx = e && e.worldX != null ? e.worldX : (e && e.x);
        var wy = e && e.worldY != null ? e.worldY : (e && e.y);
        if (wx == null || wy == null) return getSnapshot();

        var snapOpts = mergeSnapOpts(e);
        var snapped = snapAt(wx, wy, snapOpts);
        if (points.length) {
            snapped = constrainPoint(points[points.length - 1], snapped, snapOpts);
        }
        previewPoint = {
            x: snapped.x,
            y: snapped.y,
            kind: snapped.kind,
            source: snapped.source,
            angleDeg: snapped.angleDeg
        };
        return getSnapshot();
    }

    function onPointerUp() {
        return getSnapshot();
    }

    function finish(ctx) {
        ctx = ctx || {};
        if (state !== STATE.DRAWING || points.length < MIN_POINTS_FINISH) {
            return { ok: false, reason: 'need_points', snapshot: getSnapshot() };
        }

        var geometry = getPoints();
        lastResult = {
            type: 'polyline',
            points: geometry,
            closed: false
        };
        state = STATE.FINISHED;

        if (ctx.eventBus) {
            ctx.eventBus.emit('POLYLINE_FINISHED', lastResult);
        }

        // Hook Document / legacy — skeleton: chỉ trả kết quả; chưa ghi walls[]
        if (ctx.onComplete && typeof ctx.onComplete === 'function') {
            ctx.onComplete(lastResult);
        }

        reset();
        return { ok: true, result: lastResult, snapshot: getSnapshot() };
    }

    function cancel(ctx) {
        ctx = ctx || {};
        var wasDrawing = state === STATE.DRAWING;
        points = [];
        previewPoint = null;
        state = wasDrawing ? STATE.CANCELLED : STATE.IDLE;

        if (ctx.eventBus && wasDrawing) {
            ctx.eventBus.emit('POLYLINE_CANCELLED', {});
        }

        reset();
        return getSnapshot();
    }

    function onKeyDown(e, ctx) {
        if (!e) return getSnapshot();
        var key = String(e.key || '').toLowerCase();

        if (key === 'escape') {
            return cancel(ctx);
        }
        if (key === 'enter' && state === STATE.DRAWING) {
            var r = finish(ctx);
            return r.snapshot || getSnapshot();
        }
        if ((key === 'backspace' || key === 'delete') && state === STATE.DRAWING && points.length) {
            points.pop();
            if (!points.length) {
                state = STATE.IDLE;
                previewPoint = null;
            }
            return getSnapshot();
        }
        return getSnapshot();
    }

    function getSnapshot() {
        return {
            state: state,
            points: getPoints(),
            preview: getPreview(),
            pointCount: points.length
        };
    }

    function toToolDefinition() {
        return {
            id: 'polyline',
            name: 'Polyline',
            shortcut: 'pl',
            category: 'draw',
            icon: 'polyline',
            cursor: 'crosshair',
            onActivate: activate,
            onDeactivate: deactivate,
            onPointerDown: onPointerDown,
            onPointerMove: onPointerMove,
            onPointerUp: onPointerUp,
            onKeyDown: onKeyDown
        };
    }

    return {
        STATE: STATE,
        MIN_POINTS_FINISH: MIN_POINTS_FINISH,
        activate: activate,
        deactivate: deactivate,
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onKeyDown: onKeyDown,
        finish: finish,
        cancel: cancel,
        continueFromLast: continueFromLast,
        setOrthoLock: setOrthoLock,
        toggleOrthoLock: toggleOrthoLock,
        getOrthoLock: getOrthoLock,
        getState: getState,
        getPoints: getPoints,
        getPreview: getPreview,
        getLastResult: getLastResult,
        getSnapshot: getSnapshot,
        reset: reset,
        toToolDefinition: toToolDefinition
    };
});
