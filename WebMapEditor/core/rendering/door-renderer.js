// ============================================================
// DOOR-RENDERER.JS — Vẽ cửa (Phase 0 bước 4)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.DoorRenderer = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} viewport — { zoom }
   * @param {object} door — { x, y, width, rotation, name }
   * @param {boolean} isSelected
   * @param {object} [hooks] — { handleSize }
   */
    function renderDoor(ctx, viewport, door, isSelected, hooks) {
        var zoom = viewport.zoom || 1;
        var handleSize = (hooks && hooks.handleSize != null ? hooks.handleSize : 8) / zoom;
        var halfW = door.width / 2;
        var thickness = 6;

        ctx.save();
        ctx.translate(door.x, door.y);
        ctx.rotate(door.rotation * Math.PI / 180);

        ctx.fillStyle = isSelected ? '#f39c12' : '#e67e22';
        ctx.fillRect(-halfW, -thickness / 2, door.width, thickness);

        ctx.strokeStyle = isSelected ? '#e74c3c' : '#d35400';
        ctx.lineWidth = 1.5 / zoom;
        ctx.strokeRect(-halfW, -thickness / 2, door.width, thickness);

        if (isSelected) {
            ctx.fillStyle = 'white';
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 1 / zoom;

            ctx.fillRect(-halfW - handleSize / 2, -handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(-halfW - handleSize / 2, -handleSize / 2, handleSize, handleSize);

            ctx.fillRect(halfW - handleSize / 2, -handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(halfW - handleSize / 2, -handleSize / 2, handleSize, handleSize);

            var rotDist = 25 / zoom;
            ctx.beginPath();
            ctx.moveTo(0, -thickness / 2);
            ctx.lineTo(0, -rotDist);
            ctx.strokeStyle = '#3498db';
            ctx.stroke();

            ctx.fillStyle = '#3498db';
            ctx.beginPath();
            ctx.arc(0, -rotDist, handleSize / 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();

        if (isSelected) {
            var fontSize = Math.max(8, 10 / zoom);
            ctx.fillStyle = '#e74c3c';
            ctx.font = 'bold ' + fontSize + 'px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(door.name, door.x, door.y - 35 / zoom);
        }
    }

    return {
        renderDoor: renderDoor
    };
});
