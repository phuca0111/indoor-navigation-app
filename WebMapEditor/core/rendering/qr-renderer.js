// ============================================================
// QR-RENDERER.JS — Vẽ mốc QR (Phase 0 bước 5)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.QrRenderer = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

  /**
   * @param {object} [options] — { qrSize }
   */
    function renderQr(ctx, viewport, qr, isSelected, options) {
        var zoom = viewport.zoom || 1;
        var baseSize = (options && options.qrSize != null) ? options.qrSize : 14;
        var size = baseSize / zoom;

        ctx.save();
        ctx.shadowBlur = 4 / zoom;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';

        ctx.fillStyle = isSelected ? '#f39c12' : '#e67e22';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(qr.x - size, qr.y - size, size * 2, size * 2, 4 / zoom);
        } else {
            ctx.rect(qr.x - size, qr.y - size, size * 2, size * 2);
        }
        ctx.fill();

        ctx.strokeStyle = isSelected ? '#e74c3c' : '#d35400';
        ctx.lineWidth = isSelected ? 2.5 / zoom : 1.5 / zoom;
        ctx.stroke();

        ctx.fillStyle = 'white';
        var dotSize = size * 0.4;
        ctx.fillRect(qr.x - size + 2 / zoom, qr.y - size + 2 / zoom, dotSize, dotSize);
        ctx.fillRect(qr.x + size - dotSize - 2 / zoom, qr.y - size + 2 / zoom, dotSize, dotSize);
        ctx.fillRect(qr.x - size + 2 / zoom, qr.y + size - dotSize - 2 / zoom, dotSize, dotSize);

        ctx.restore();

        var labelSize = Math.max(7, 9 / zoom);
        ctx.font = 'bold ' + labelSize + 'px Arial';
        ctx.fillStyle = isSelected ? '#e74c3c' : '#555';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(qr.serial, qr.x, qr.y + size + 2 / zoom);
    }

    return {
        renderQr: renderQr
    };
});
