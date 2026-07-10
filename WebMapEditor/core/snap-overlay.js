// ============================================================
// SNAP-OVERLAY.JS — OSNAP marker specs + hint state (Phase 1)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.SnapOverlay = api;
        root.updateSnapHint = api.updateSnapHint;
        root.clearSnapHint = api.clearSnapHint;
        root.drawSnapMarker = api.drawSnapMarkerOnCanvas;
        root.getSnapHint = api.getHint;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var DRAW_TOOLS = ['wall', 'line', 'room', 'circle', 'door', 'poi', 'path', 'ruler', 'polygon'];
    var HINT_TOOLS = ['select'].concat(DRAW_TOOLS);

    var hint = null;

    function getMarkerSpec(kind) {
        switch (kind) {
            case 'endpoint':
                return { shape: 'square', color: '#4ade80', sizePx: 28, label: 'ĐỈNH' };
            case 'midpoint':
                return { shape: 'triangle', color: '#60a5fa', sizePx: 26, label: 'GIỮA' };
            case 'intersection':
                // AutoCAD-style: hình thoi (X) vàng cam — giao điểm 2 tường
                return { shape: 'diamond', color: '#fbbf24', sizePx: 28, label: 'GIAO' };
            case 'perpendicular':
                // Vuông góc: góc chữ L cam — chân vuông góc từ điểm neo xuống tường
                return { shape: 'perp', color: '#fb923c', sizePx: 28, label: 'VUÔNG' };
            case 'grid':
                return { shape: 'cross', color: '#c084fc', sizePx: 24, label: 'LƯỚI' };
            default:
                return null;
        }
    }

    function shouldShowForTool(tool) {
        return HINT_TOOLS.indexOf(tool) >= 0;
    }

    function resolveSnapHint(wx, wy, snapFn) {
        // Ưu tiên snapFn (được truyền từ events.js) để tôn trọng opts như objectSnap:false khi Shift.
        if (typeof snapFn === 'function') {
            return snapFn(wx, wy);
        }

        // Fallback: nếu không có snapFn thì dùng SnapEngine mặc định.
        if (globalThis.EditorCore && globalThis.EditorCore.SnapEngine) {
            return globalThis.EditorCore.SnapEngine.snapPoint({ x: wx, y: wy });
        }

        return null;
    }

    function updateSnapHint(wx, wy, tool, snapFn) {
        if (!shouldShowForTool(tool)) {
            hint = null;
            return null;
        }
        if (typeof snapFn !== 'function') {
            hint = null;
            return null;
        }
        var r = resolveSnapHint(wx, wy, snapFn);
        if (r && r.kind && r.kind !== 'none') {
            hint = { x: r.x, y: r.y, kind: r.kind, source: r.source || '' };
            return hint;
        }
        hint = null;
        return null;
    }

    function clearSnapHint() {
        hint = null;
    }

    function getHint() {
        return hint;
    }

    /** Vẽ marker kiểu AutoCAD: viền đậm 3 lớp (đen → trắng → màu), ô rỗng dễ thấy trên mọi nền. */
    function paintMarkerAtScreen(ctx, sx, sy, spec) {
        if (!ctx || !spec) return;

        var size = spec.sizePx || 24;
        var half = size / 2;

        function traceSquare() {
            ctx.rect(sx - half, sy - half, size, size);
        }

        function traceTriangle() {
            ctx.beginPath();
            ctx.moveTo(sx, sy - half);
            ctx.lineTo(sx - half, sy + half);
            ctx.lineTo(sx + half, sy + half);
            ctx.closePath();
        }

        function traceCross() {
            ctx.beginPath();
            ctx.moveTo(sx - half, sy);
            ctx.lineTo(sx + half, sy);
            ctx.moveTo(sx, sy - half);
            ctx.lineTo(sx, sy + half);
        }

        function traceDiamond() {
            ctx.beginPath();
            ctx.moveTo(sx, sy - half);
            ctx.lineTo(sx + half, sy);
            ctx.lineTo(sx, sy + half);
            ctx.lineTo(sx - half, sy);
            ctx.closePath();
        }

        function tracePerp() {
            ctx.beginPath();
            ctx.moveTo(sx - half * 0.55, sy + half * 0.45);
            ctx.lineTo(sx - half * 0.55, sy - half * 0.35);
            ctx.lineTo(sx + half * 0.55, sy - half * 0.35);
        }

        function traceShape() {
            if (spec.shape === 'square') traceSquare();
            else if (spec.shape === 'triangle') traceTriangle();
            else if (spec.shape === 'diamond') traceDiamond();
            else if (spec.shape === 'perp') tracePerp();
            else traceCross();
        }

        function strokeLayers() {
            ctx.lineJoin = 'miter';
            ctx.lineCap = 'square';

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.lineWidth = 5;
            traceShape();
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3.5;
            traceShape();
            ctx.stroke();

            ctx.strokeStyle = spec.color;
            ctx.lineWidth = 2.5;
            traceShape();
            ctx.stroke();
        }

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        if (spec.shape === 'square') {
            ctx.fillStyle = 'rgba(74, 222, 128, 0.18)';
            traceSquare();
            ctx.fill();
        } else if (spec.shape === 'diamond') {
            ctx.fillStyle = 'rgba(251, 191, 36, 0.22)';
            traceDiamond();
            ctx.fill();
        } else if (spec.shape === 'perp') {
            ctx.fillStyle = 'rgba(251, 146, 60, 0.15)';
            tracePerp();
            ctx.fill();
        }

        strokeLayers();

        if (spec.shape === 'square') {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawMarker(ctx, zoom, point, kind) {
        if (!ctx || !point) return;
        var spec = getMarkerSpec(kind);
        if (!spec) return;

        if (typeof worldToScreen === 'function') {
            var sp = worldToScreen(point.x, point.y);
            paintMarkerAtScreen(ctx, sp.x, sp.y, spec);
            return;
        }

        var z = zoom > 0 ? zoom : 1;
        var size = (spec.sizePx || 24) / z;
        var half = size / 2;

        ctx.save();
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'square';

        function traceSquare() {
            ctx.rect(point.x - half, point.y - half, size, size);
        }

        function traceTriangle() {
            ctx.beginPath();
            ctx.moveTo(point.x, point.y - half);
            ctx.lineTo(point.x - half, point.y + half);
            ctx.lineTo(point.x + half, point.y + half);
            ctx.closePath();
        }

        function traceCross() {
            ctx.beginPath();
            ctx.moveTo(point.x - half, point.y);
            ctx.lineTo(point.x + half, point.y);
            ctx.moveTo(point.x, point.y - half);
            ctx.lineTo(point.x, point.y + half);
        }

        function traceDiamond() {
            ctx.beginPath();
            ctx.moveTo(point.x, point.y - half);
            ctx.lineTo(point.x + half, point.y);
            ctx.lineTo(point.x, point.y + half);
            ctx.lineTo(point.x - half, point.y);
            ctx.closePath();
        }

        function tracePerp() {
            ctx.beginPath();
            ctx.moveTo(point.x - half * 0.55, point.y + half * 0.45);
            ctx.lineTo(point.x - half * 0.55, point.y - half * 0.35);
            ctx.lineTo(point.x + half * 0.55, point.y - half * 0.35);
        }

        function traceShape() {
            if (spec.shape === 'square') traceSquare();
            else if (spec.shape === 'triangle') traceTriangle();
            else if (spec.shape === 'diamond') traceDiamond();
            else if (spec.shape === 'perp') tracePerp();
            else traceCross();
        }

        if (spec.shape === 'square') {
            ctx.fillStyle = 'rgba(74, 222, 128, 0.18)';
            traceSquare();
            ctx.fill();
        } else if (spec.shape === 'diamond') {
            ctx.fillStyle = 'rgba(251, 191, 36, 0.22)';
            traceDiamond();
            ctx.fill();
        } else if (spec.shape === 'perp') {
            ctx.fillStyle = 'rgba(251, 146, 60, 0.15)';
            tracePerp();
            ctx.fill();
        }

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.lineWidth = 5 / z;
        traceShape();
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5 / z;
        traceShape();
        ctx.stroke();

        ctx.strokeStyle = spec.color;
        ctx.lineWidth = 2.5 / z;
        traceShape();
        ctx.stroke();

        ctx.restore();
    }

    function drawSnapMarker(ctx, zoom, activeHint) {
        if (!activeHint) return;
        drawMarker(ctx, zoom, activeHint, activeHint.kind);
    }

    function drawSnapMarkerOnCanvas() {
        if (typeof ctx === 'undefined' || !ctx || !hint) return;
        var z = typeof zoom !== 'undefined' ? zoom : 1;
        drawSnapMarker(ctx, z, hint);
    }

    function drawSnapMarkerScreen(ctx, activeHint) {
        if (!ctx || !activeHint) return;
        var spec = getMarkerSpec(activeHint.kind);
        if (!spec) return;
        var sp = typeof worldToScreen === 'function'
            ? worldToScreen(activeHint.x, activeHint.y)
            : { x: activeHint.x, y: activeHint.y };
        paintMarkerAtScreen(ctx, sp.x, sp.y, spec);
    }

    return {
        DRAW_TOOLS: DRAW_TOOLS,
        HINT_TOOLS: HINT_TOOLS,
        getMarkerSpec: getMarkerSpec,
        shouldShowForTool: shouldShowForTool,
        updateSnapHint: updateSnapHint,
        clearSnapHint: clearSnapHint,
        getHint: getHint,
        drawMarker: drawMarker,
        drawSnapMarker: drawSnapMarker,
        drawSnapMarkerScreen: drawSnapMarkerScreen,
        drawSnapMarkerOnCanvas: drawSnapMarkerOnCanvas,
        resolveSnapHint: resolveSnapHint,
        paintMarkerAtScreen: paintMarkerAtScreen
    };
});
