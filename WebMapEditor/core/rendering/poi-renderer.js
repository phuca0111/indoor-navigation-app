// ============================================================
// POI-RENDERER.JS — Vẽ POI (Phase 0 bước 5)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PoiRenderer = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

  /**
   * @param {object} hooks — { poiRadius, typeInfo: { icon, color } }
   */
    function renderPoi(ctx, viewport, poi, isSelected, hooks) {
        var zoom = viewport.zoom || 1;
        var radius = (hooks && hooks.poiRadius != null) ? hooks.poiRadius : 12;
        var typeInfo = (hooks && hooks.typeInfo) || { icon: '📍', color: '#95a5a6' };

        ctx.beginPath();
        ctx.arc(poi.x, poi.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#f1c40f' : typeInfo.color;
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#e74c3c' : '#333';
        ctx.lineWidth = isSelected ? 2 / zoom : 1 / zoom;
        ctx.stroke();

        var fontSize = Math.max(8, 12 / zoom);
        ctx.font = fontSize + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(typeInfo.icon, poi.x, poi.y);

        var labelSize = Math.max(7, 9 / zoom);
        ctx.font = labelSize + 'px Arial';
        ctx.fillStyle = '#333';
        ctx.textBaseline = 'top';
        ctx.fillText(poi.name, poi.x, poi.y + radius + 2 / zoom);
    }

    return {
        renderPoi: renderPoi
    };
});
