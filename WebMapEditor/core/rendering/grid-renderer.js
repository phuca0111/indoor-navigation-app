// ============================================================
// GRID-RENDERER.JS — Lưới + trục tọa độ (Phase 0)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.GridRenderer = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} viewport — { panX, panY, zoom, width, height }
     * @param {number} gridSize
     * @param {{ visible?: boolean }} options
     */
    function renderGrid(ctx, viewport, gridSize, options) {
        options = options || {};
        if (options.visible === false) return;
        if (!gridSize || gridSize <= 0) return;

        var panX = viewport.panX || 0;
        var panY = viewport.panY || 0;
        var zoom = viewport.zoom || 1;
        var width = viewport.width || 0;
        var height = viewport.height || 0;

        var startX = Math.floor(-panX / zoom / gridSize) * gridSize;
        var startY = Math.floor(-panY / zoom / gridSize) * gridSize;
        var endX = startX + width / zoom + gridSize * 2;
        var endY = startY + height / zoom + gridSize * 2;

        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 0.5 / zoom;
        ctx.beginPath();
        for (var x = startX; x <= endX; x += gridSize) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        for (var y = startY; y <= endY; y += gridSize) {
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
        }
        ctx.stroke();

        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.moveTo(0, startY);
        ctx.lineTo(0, endY);
        ctx.moveTo(startX, 0);
        ctx.lineTo(endX, 0);
        ctx.stroke();
    }

    return {
        renderGrid: renderGrid
    };
});
