// ============================================================
// POIS.JS - Logic POI (điểm đánh dấu, đơn giản)
// ============================================================

// Danh sách loại POI và icon
const poiTypes = [
    { name: 'WC', icon: '🚻', color: '#3498db' },
    { name: 'Thang máy', icon: '🛗', color: '#9b59b6' },
    { name: 'Thang cuốn', icon: '↗️', color: '#9b59b6' },
    { name: 'Cầu thang', icon: '🪜', color: '#9b59b6' },
    { name: 'ATM', icon: '🏧', color: '#27ae60' },
    { name: 'Quầy lễ tân', icon: '💁', color: '#e67e22' },
    { name: 'Lối ra', icon: '🚪', color: '#e74c3c' },
    { name: 'Khác', icon: '📍', color: '#95a5a6' }
];

// Tạo POI mới
function createPoi(x, y) {
    var poi = {
        id: nextPoiId++,
        name: 'POI ' + pois.length,
        x: snapToGrid(x),
        y: snapToGrid(y),
        typeIndex: 0,       // Index trong mảng poiTypes
        type: poiTypes[0].name
    };
    pois.push(poi);
    return poi;
}

// Tìm POI tại vị trí click
function findPoiAt(wx, wy) {
    for (var i = pois.length - 1; i >= 0; i--) {
        var p = pois[i];
        var dx = wx - p.x;
        var dy = wy - p.y;
        // Kiểm tra trong vòng tròn
        if (dx * dx + dy * dy <= POI_RADIUS * POI_RADIUS) {
            return p;
        }
    }
    return null;
}

// Vẽ 1 POI lên canvas
function drawPoi(poi, isSelected) {
    var typeInfo = poiTypes[poi.typeIndex] || poiTypes[poiTypes.length - 1];

    // Vẽ vòng tròn nền
    ctx.beginPath();
    ctx.arc(poi.x, poi.y, POI_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#f1c40f' : typeInfo.color;
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#e74c3c' : '#333';
    ctx.lineWidth = isSelected ? 2 / zoom : 1 / zoom;
    ctx.stroke();

    // Vẽ icon ở giữa
    var fontSize = Math.max(8, 12 / zoom);
    ctx.font = fontSize + 'px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typeInfo.icon, poi.x, poi.y);

    // Tên POI (hiện bên dưới)
    var labelSize = Math.max(7, 9 / zoom);
    ctx.font = labelSize + 'px Arial';
    ctx.fillStyle = '#333';
    ctx.textBaseline = 'top';
    ctx.fillText(poi.name, poi.x, poi.y + POI_RADIUS + 2 / zoom);
}

// Xóa POI
function deletePoi(poi) {
    pois = pois.filter(function (p) { return p.id !== poi.id; });
}
