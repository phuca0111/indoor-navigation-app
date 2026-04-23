// ============================================================
// UTILS.JS - Hàm tiện ích: Chuyển đổi tọa độ, snap, color
// ============================================================

// Chuyển tọa độ màn hình → tọa độ thế giới
function screenToWorld(sx, sy) {
    return {
        x: (sx - panX) / zoom,
        y: (sy - panY) / zoom
    };
}

// Chuyển tọa độ thế giới → tọa độ màn hình
function worldToScreen(wx, wy) {
    return {
        x: wx * zoom + panX,
        y: wy * zoom + panY
    };
}

// Chuyển pixels → mét
function pixelsToMeters(px) {
    return (px / GRID_SIZE) * metersPerGrid;
}

// Chuyển mét → pixels
function metersToPixels(m) {
    return (m / metersPerGrid) * GRID_SIZE;
}

// Snap giá trị vào lưới (Chỉ hút nếu gần đường lưới trong khoảng 10px)
function snapToGrid(val) {
    var sc = document.getElementById('snapCheck');
    if (sc && !sc.checked) return val;
    
    var snapped = Math.round(val / GRID_SIZE) * GRID_SIZE;
    var dist = Math.abs(val - snapped);
    
    // Nếu khoảng cách đến lưới < 10px thì mới hút, còn không thì giữ nguyên
    if (dist < 10) return snapped;
    return val;
}

// Chuyển màu CSS sang hex cho input[type=color]
function rgbToHex(color) {
    if (color.startsWith('#') && color.length === 7) return color;
    const temp = document.createElement('div');
    temp.style.color = color;
    document.body.appendChild(temp);
    const computed = getComputedStyle(temp).color;
    document.body.removeChild(temp);
    const match = computed.match(/\d+/g);
    if (!match) return '#cccccc';
    return '#' + match.slice(0, 3).map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
}
