// ============================================================
// BACKGROUND-RENDERER.JS — Nền trắng + ảnh nền (Phase 0)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.BackgroundRenderer = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function renderCanvasClear(ctx, width, height) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} viewport — { zoom }
     * @param {object} bg — { image, opacity, x, y, scale, rotation }
     * @param {{ highlightAdjust?: boolean }} options
     */
    function renderBackgroundImage(ctx, viewport, bg, options) {
        options = options || {};
        if (!bg || !bg.image) return;

        var zoom = viewport.zoom || 1;
        ctx.save();
        ctx.globalAlpha = bg.opacity != null ? bg.opacity : 0.5;
        var bw = bg.image.width * (bg.scale || 1);
        var bh = bg.image.height * (bg.scale || 1);
        var bx = bg.x || 0;
        var by = bg.y || 0;

        ctx.translate(bx + bw / 2, by + bh / 2);
        ctx.rotate((bg.rotation || 0) * Math.PI / 180);
        var contrast = bg.contrast != null ? bg.contrast : 1;
        var brightness = bg.brightness != null ? bg.brightness : 0;
        if (Math.abs(contrast - 1) > 1e-3 || Math.abs(brightness) > 1e-3) {
            // CSS filter: contrast(%) brightness(%) — brightness 0→0%, 0 native=100%, +100→200%
            var bPct = Math.max(0, 100 + brightness);
            ctx.filter = 'contrast(' + (contrast * 100) + '%) brightness(' + bPct + '%)';
        }
        ctx.drawImage(bg.image, -bw / 2, -bh / 2, bw, bh);
        ctx.filter = 'none';

        if (options.highlightAdjust) {
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 2 / zoom;
            ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
            ctx.setLineDash([]);
        }
        ctx.restore();
        ctx.globalAlpha = 1.0;
    }

    return {
        renderCanvasClear: renderCanvasClear,
        renderBackgroundImage: renderBackgroundImage
    };
});
