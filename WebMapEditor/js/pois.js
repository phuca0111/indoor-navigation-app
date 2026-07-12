// ============================================================
// POIS.JS - Logic POI (điểm đánh dấu, đơn giản)
// ============================================================

// Danh sách loại POI và icon
const poiTypes = [
    { name: 'Nhà vệ sinh', icon: '🚻', color: '#3498db' },
    { name: 'Thang máy', icon: '🛗', color: '#9b59b6' },
    { name: 'Thang cuốn', icon: '↗️', color: '#9b59b6' },
    { name: 'Cầu thang', icon: '🪜', color: '#9b59b6' },
    { name: 'Máy ATM', icon: '🏧', color: '#27ae60' },
    { name: 'Quầy lễ tân', icon: '💁', color: '#e67e22' },
    { name: 'Lối ra', icon: '🚪', color: '#e74c3c' },
    { name: 'Khác', icon: '📍', color: '#95a5a6' }
];

// Tạo POI mới
function createPoi(x, y) {
    var sp = snapWorldPoint(x, y);
    var poi = {
        id: nextPoiId++,
        name: 'Điểm POI ' + pois.length,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default',
        x: sp.x,
        y: sp.y,
        typeIndex: 0,       // Index trong mảng poiTypes
        type: poiTypes[0].name
    };
    pois.push(poi);
    if (typeof EditorCore !== 'undefined' && EditorCore.ObjectTransform) {
        EditorCore.ObjectTransform.ensureOriginalGeometry('poi', poi);
    }
    if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
    return poi;
}

// Tìm POI tại vị trí click
function findPoiAt(wx, wy) {
    for (var i = pois.length - 1; i >= 0; i--) {
        var p = pois[i];
        if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(p)) continue;
        var dx = wx - p.x;
        var dy = wy - p.y;
        // Kiểm tra trong vòng tròn
        if (dx * dx + dy * dy <= POI_RADIUS * POI_RADIUS) {
            return p;
        }
    }
    return null;
}

// Vẽ 1 POI lên canvas — delegate PoiRenderer
function drawPoi(poi, isSelected) {
    var typeInfo = poiTypes[poi.typeIndex] || poiTypes[poiTypes.length - 1];
    var hooks = {
        poiRadius: typeof POI_RADIUS !== 'undefined' ? POI_RADIUS : 12,
        typeInfo: typeInfo
    };
    if (window.EditorCore && EditorCore.PoiRenderer) {
        EditorCore.PoiRenderer.renderPoi(ctx, { zoom: zoom }, poi, isSelected, hooks);
        return;
    }
    if (window.EditorCore && EditorCore.RenderingEngine) {
        EditorCore.RenderingEngine.renderPoi(ctx, { zoom: zoom }, poi, isSelected, hooks);
    }
}

// Xóa POI
function deletePoi(poi) {
    pois = pois.filter(function (p) { return p.id !== poi.id; });
}
