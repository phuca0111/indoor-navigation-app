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
        // Viền dày theo bán kính để khi phóng to size vẫn cân đối.
        ctx.lineWidth = isSelected
            ? Math.max(2 / zoom, radius * 0.12)
            : Math.max(1 / zoom, radius * 0.06);
        ctx.stroke();

        // Icon scale theo radius (slider size) — trước đây cố định 12/zoom
        // nên chỉ thấy viền phình, glyph vẫn bé.
        var fontSize = Math.max(10, radius * 1.35);
        ctx.font = fontSize + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(typeInfo.icon, poi.x, poi.y);

        // Nhãn: giữ đọc được trên màn hình, hơi theo size POI khi phóng to.
        var labelSize = Math.max(7, Math.min(radius * 0.7, Math.max(9 / zoom, radius * 0.45)));
        ctx.font = labelSize + 'px Arial';
        ctx.fillStyle = '#333';
        ctx.textBaseline = 'top';
        ctx.fillText(poi.name, poi.x, poi.y + radius + 2 / zoom);
    }

    return {
        renderPoi: renderPoi
    };
});
