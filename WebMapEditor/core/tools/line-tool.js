// ============================================================
// LINE-TOOL.JS — LineTool V4 skeleton (Phase 1)
// Đoạn thẳng đơn: click 1 → click 2 → trả kết quả rồi về Idle.
// Khác PolylineTool: không nối chuỗi, không continueFromLast.
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.LineTool = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STATE = {
        IDLE: 'idle',
        DRAWING: 'drawing'
    };

    var state = STATE.IDLE;
    var startPoint = null;
    var previewPoint = null;
    var lastResult = null;

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

    function resolveSnapOpts(e) {
        var base = (e && e.snapOpts) || (e && e.shiftKey ? { objectSnap: false, gridSnap: false, polar: false } : undefined);
        var opts = base ? Object.assign({}, base) : {};
        if (state === STATE.DRAWING && startPoint) {
            opts.anchor = { x: startPoint.x, y: startPoint.y };
        }
        return opts;
    }

    /** Polar tracking quanh điểm đầu (không đè endpoint/midpoint; Shift tắt). */
    function applyPolar(snapped, snapOpts) {
        if (!startPoint) return snapped;
        if (globalThis.EditorCore && globalThis.EditorCore.PolarTracking) {
            return globalThis.EditorCore.PolarTracking.applyToSnapped(startPoint, snapped, snapOpts);
        }
        return snapped;
    }

    function getState() {
        return state;
    }

    function getStartPoint() {
        if (!startPoint) return null;
        return { x: startPoint.x, y: startPoint.y, kind: startPoint.kind };
    }

    function getPreview() {
        if (!previewPoint) return null;
        return { x: previewPoint.x, y: previewPoint.y, kind: previewPoint.kind, angleDeg: previewPoint.angleDeg };
    }

    function getLastResult() {
        return lastResult;
    }

    function reset() {
        state = STATE.IDLE;
        startPoint = null;
        previewPoint = null;
    }

    function activate(ctx) {
        reset();
        lastResult = null;
        if (ctx && ctx.eventBus) {
            ctx.eventBus.emit('TOOL_ACTIVATED', { toolId: 'line' });
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
            ctx.eventBus.emit('TOOL_DEACTIVATED', { toolId: 'line' });
        }
        return getSnapshot();
    }

    /**
     * Click 1: đặt điểm đầu → Drawing.
     * Click 2: hoàn tất → lastResult { type:'line', points:[a,b] } → Idle.
     */
    function onPointerDown(e, ctx) {
        ctx = ctx || {};
        var wx = e && e.worldX != null ? e.worldX : (e && e.x);
        var wy = e && e.worldY != null ? e.worldY : (e && e.y);
        if (wx == null || wy == null) return getSnapshot();

        var snapOpts = resolveSnapOpts(e);
        var snapped = snapAt(wx, wy, snapOpts);
        if (state === STATE.DRAWING) {
            snapped = applyPolar(snapped, snapOpts);
        }
        var pt = { x: snapped.x, y: snapped.y, kind: snapped.kind, source: snapped.source };

        if (state === STATE.IDLE) {
            state = STATE.DRAWING;
            startPoint = pt;
            previewPoint = null;
            if (ctx.eventBus) {
                ctx.eventBus.emit('LINE_STARTED', { point: pt });
            }
            return getSnapshot();
        }

        // state === DRAWING → điểm 2 hoàn tất đoạn
        lastResult = {
            type: 'line',
            points: [
                { x: startPoint.x, y: startPoint.y, kind: startPoint.kind, source: startPoint.source },
                pt
            ]
        };

        if (ctx.eventBus) {
            ctx.eventBus.emit('LINE_FINISHED', lastResult);
        }
        if (ctx.onComplete && typeof ctx.onComplete === 'function') {
            ctx.onComplete(lastResult);
        }

        reset();
        return getSnapshot();
    }

    function onPointerMove(e) {
        if (state !== STATE.DRAWING) return getSnapshot();
        var wx = e && e.worldX != null ? e.worldX : (e && e.x);
        var wy = e && e.worldY != null ? e.worldY : (e && e.y);
        if (wx == null || wy == null) return getSnapshot();

        var snapOpts = resolveSnapOpts(e);
        var snapped = applyPolar(snapAt(wx, wy, snapOpts), snapOpts);
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

    function cancel(ctx) {
        ctx = ctx || {};
        var wasDrawing = state === STATE.DRAWING;
        reset();
        if (ctx.eventBus && wasDrawing) {
            ctx.eventBus.emit('LINE_CANCELLED', {});
        }
        return getSnapshot();
    }

    function onKeyDown(e, ctx) {
        if (!e) return getSnapshot();
        var key = String(e.key || '').toLowerCase();
        if (key === 'escape') {
            return cancel(ctx);
        }
        return getSnapshot();
    }

    function getSnapshot() {
        return {
            state: state,
            start: getStartPoint(),
            preview: getPreview()
        };
    }

    function toToolDefinition() {
        return {
            id: 'line',
            name: 'Đoạn thẳng',
            shortcut: 'ln',
            category: 'draw',
            icon: 'line',
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
        activate: activate,
        deactivate: deactivate,
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onKeyDown: onKeyDown,
        cancel: cancel,
        getState: getState,
        getStartPoint: getStartPoint,
        getPreview: getPreview,
        getLastResult: getLastResult,
        getSnapshot: getSnapshot,
        reset: reset,
        toToolDefinition: toToolDefinition
    };
});
