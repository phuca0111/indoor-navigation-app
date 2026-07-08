// ============================================================
// WALL-RENDERER.JS — Vẽ tường segment (Phase 0 bước 3)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.WallRenderer = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} viewport — { zoom }
   * @param {object} wall — { points[], thickness, is_outer }
   * @param {boolean} isSelected
   */
    function renderWall(ctx, viewport, wall, isSelected) {
        if (!wall || !Array.isArray(wall.points) || wall.points.length < 2) return;

        var zoom = viewport.zoom || 1;
        var thickness = Math.max(1, (wall.thickness || 4) / zoom);
        var isOuter = !!wall.is_outer;

        ctx.strokeStyle = isOuter ? 'rgba(239, 68, 68, 0.25)' : 'rgba(17, 24, 39, 0.2)';
        ctx.lineWidth = thickness + (isOuter ? 3 / zoom : 2 / zoom);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(wall.points[0].x, wall.points[0].y);
        for (var i = 1; i < wall.points.length; i++) {
            ctx.lineTo(wall.points[i].x, wall.points[i].y);
        }
        ctx.stroke();

        ctx.strokeStyle = isSelected ? '#f59e0b' : (isOuter ? '#ef4444' : '#111827');
        ctx.lineWidth = isSelected ? thickness + 1 / zoom : thickness;
        ctx.beginPath();
        ctx.moveTo(wall.points[0].x, wall.points[0].y);
        for (var j = 1; j < wall.points.length; j++) {
            ctx.lineTo(wall.points[j].x, wall.points[j].y);
        }
        ctx.stroke();
    }

  /**
   * Preview rubber-band khi đang vẽ tường
   */
    function renderWallPreview(ctx, viewport, start, end) {
        if (!start || !end) return;
        var zoom = viewport.zoom || 1;
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    return {
        renderWall: renderWall,
        renderWallPreview: renderWallPreview
    };
});
