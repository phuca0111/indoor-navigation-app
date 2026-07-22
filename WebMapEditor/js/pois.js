// ============================================================
// POIS.JS - Logic POI (điểm đánh dấu, đơn giản)
// ============================================================

// Danh sách loại POI và icon
const poiTypes = [
    { key: 'TOILET', name: 'Nhà vệ sinh', icon: '🚻', color: '#3498db' },
    { key: 'ELEVATOR', name: 'Thang máy', icon: '🛗', color: '#9b59b6' },
    { key: 'ESCALATOR', name: 'Thang cuốn', icon: '↗️', color: '#9b59b6' },
    { key: 'STAIRS', name: 'Cầu thang', icon: '🪜', color: '#9b59b6' },
    { key: 'ATM', name: 'Máy ATM', icon: '🏧', color: '#27ae60' },
    { key: 'RECEPTION', name: 'Quầy lễ tân', icon: '💁', color: '#e67e22' },
    { key: 'EXIT', name: 'Lối ra', icon: '🚪', color: '#e74c3c' },
    { key: 'OTHER', name: 'Khác', icon: '📍', color: '#95a5a6' },
    { key: 'FOOD', name: 'Nhà hàng', icon: '🍽️', color: '#f97316' },
    { key: 'CAFE', name: 'Quán cà phê', icon: '☕', color: '#92400e' },
    { key: 'PARKING', name: 'Bãi đỗ xe', icon: '🅿️', color: '#2563eb' },
    { key: 'MEDICAL', name: 'Phòng y tế', icon: '➕', color: '#dc2626' },
    { key: 'SECURITY', name: 'Phòng bảo vệ', icon: '🛡️', color: '#475569' },
    { key: 'INFO', name: 'Quầy thông tin', icon: 'ℹ️', color: '#0ea5e9' },
    { key: 'WAITING', name: 'Khu vực chờ', icon: '🪑', color: '#14b8a6' },
    { key: 'VENDING', name: 'Máy bán hàng', icon: '🥤', color: '#8b5cf6' },
    { key: 'FIRE_EXTINGUISHER', name: 'Bình chữa cháy', icon: '🧯', color: '#ef4444' }
];

function normalizePoiSize(value) {
    value = Number(value);
    return Number.isFinite(value) ? Math.max(12, Math.min(96, value)) : 24;
}

function getPoiTypeInfo(poi) {
    if (poi && poi.poiType) {
        var byKey = poiTypes.find(function (item) { return item.key === String(poi.poiType).toUpperCase(); });
        if (byKey) return byKey;
    }
    var index = poi && Number.isFinite(Number(poi.typeIndex)) ? Number(poi.typeIndex) : -1;
    if (poiTypes[index]) return poiTypes[index];
    if (poi && poi.type) {
        var byName = poiTypes.find(function (item) { return item.name === poi.type; });
        if (byName) return byName;
    }
    return poiTypes[7];
}

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
        type: poiTypes[0].name,
        poiType: poiTypes[0].key,
        size: 24
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
        var radius = normalizePoiSize(p.size) / 2 / (typeof zoom === 'number' && zoom > 0 ? zoom : 1);
        if (dx * dx + dy * dy <= radius * radius) {
            return p;
        }
    }
    return null;
}

// Vẽ 1 POI lên canvas — delegate PoiRenderer
function drawPoi(poi, isSelected) {
    var typeInfo = getPoiTypeInfo(poi);
    var hooks = {
        poiRadius: normalizePoiSize(poi.size) / 2 /
            (typeof zoom === 'number' && zoom > 0 ? zoom : 1),
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

if (typeof module === 'object' && module.exports) {
    module.exports = {
        poiTypes: poiTypes,
        normalizePoiSize: normalizePoiSize,
        getPoiTypeInfo: getPoiTypeInfo
    };
}
