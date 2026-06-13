// ============================================================
// ROOMS.JS - Logic phòng: Rect, Circle, Polygon
// ============================================================

function applyDefaultRoomLabelStyle(room) {
    if (!room || typeof room !== 'object') return room;
    if (!Number.isFinite(room.labelRotation)) room.labelRotation = 0;
    if (!Number.isFinite(room.labelFontSize) || room.labelFontSize <= 0) room.labelFontSize = 14;
    if (typeof room.labelAutoScale !== 'boolean') room.labelAutoScale = true;
    if (!Number.isFinite(room.labelLineHeight) || room.labelLineHeight <= 0) room.labelLineHeight = 1.2;
    return room;
}

// --- HIT TEST: Tìm phòng tại vị trí click ---
function findRoomAt(wx, wy) {
    for (var i = rooms.length - 1; i >= 0; i--) {
        var r = rooms[i];
        if (r.shape === 'circle') {
            // Kiểm tra trong vòng tròn
            var dx = wx - r.cx;
            var dy = wy - r.cy;
            if (dx * dx + dy * dy <= r.radius * r.radius) return r;
        } else if (r.shape === 'polygon') {
            // Kiểm tra trong đa giác (ray casting)
            if (pointInPolygon(wx, wy, r.points)) return r;
        } else {
            // Rect (mặc định)
            if (wx >= r.x && wx <= r.x + r.width &&
                wy >= r.y && wy <= r.y + r.height) return r;
        }
    }
    return null;
}

// Kiểm tra điểm trong polygon (Ray Casting Algorithm)
function pointInPolygon(px, py, points) {
    var inside = false;
    for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
        var xi = points[i].x, yi = points[i].y;
        var xj = points[j].x, yj = points[j].y;
        if ((yi > py) !== (yj > py) &&
            px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

// --- TẠO PHÒNG CHỮ NHẬT ---
function createRoom(startX, startY, endX, endY) {
    var x = Math.min(startX, endX);
    var y = Math.min(startY, endY);
    var w = Math.abs(endX - startX);
    var h = Math.abs(endY - startY);
    if (w < GRID_SIZE / 2 || h < GRID_SIZE / 2) return null;

    var colors = ['#e8f4f8', '#fef3e2', '#e8f8e8', '#f8e8f4', '#f0f0e0', '#e0f0f0'];
    return {
        id: nextRoomId++,
        shape: 'rect',
        name: 'Phòng ' + (rooms.length + 1),
        type: 'Văn phòng', // Default type
        x: x, y: y, width: w, height: h,
        color: colors[rooms.length % colors.length],
        labelRotation: 0,
        labelFontSize: 14,
        labelAutoScale: true,
        labelLineHeight: 1.2
    };
}

// --- TẠO PHÒNG TRÒN ---
function createCircleRoom(cx, cy, radius) {
    if (radius < 10) return null;
    var colors = ['#e8f4f8', '#fef3e2', '#e8f8e8', '#f8e8f4', '#f0f0e0', '#e0f0f0'];
    return {
        id: nextRoomId++,
        shape: 'circle',
        name: 'Phòng ' + (rooms.length + 1),
        type: 'Văn phòng', // Default type
        cx: cx, cy: cy, radius: radius,
        // Bounding box (để tương thích)
        x: cx - radius, y: cy - radius,
        width: radius * 2, height: radius * 2,
        color: colors[rooms.length % colors.length],
        labelRotation: 0,
        labelFontSize: 14,
        labelAutoScale: true,
        labelLineHeight: 1.2
    };
}

// --- TẠO PHÒNG ĐA GIÁC ---
function createPolygonRoom(points) {
    if (points.length < 3) return null;

    // Tính bounding box
    var minX = points[0].x, maxX = points[0].x;
    var minY = points[0].y, maxY = points[0].y;
    for (var i = 1; i < points.length; i++) {
        if (points[i].x < minX) minX = points[i].x;
        if (points[i].x > maxX) maxX = points[i].x;
        if (points[i].y < minY) minY = points[i].y;
        if (points[i].y > maxY) maxY = points[i].y;
    }

    var colors = ['#e8f4f8', '#fef3e2', '#e8f8e8', '#f8e8f4', '#f0f0e0', '#e0f0f0'];
    return {
        id: nextRoomId++,
        shape: 'polygon',
        name: 'Phòng ' + (rooms.length + 1),
        type: 'Văn phòng', // Default type
        points: points.slice(), // Copy mảng
        // Bounding box
        x: minX, y: minY,
        width: maxX - minX, height: maxY - minY,
        color: colors[rooms.length % colors.length],
        labelRotation: 0,
        labelFontSize: 14,
        labelAutoScale: true,
        labelLineHeight: 1.2
    };
}

// --- RESIZE HANDLES (chỉ cho rect) ---
function getHandlePositions(room) {
    var x = room.x, y = room.y, w = room.width, h = room.height;
    return {
        'nw': { x: x, y: y },
        'n': { x: x + w / 2, y: y },
        'ne': { x: x + w, y: y },
        'e': { x: x + w, y: y + h / 2 },
        'se': { x: x + w, y: y + h },
        's': { x: x + w / 2, y: y + h },
        'sw': { x: x, y: y + h },
        'w': { x: x, y: y + h / 2 }
    };
}

function getResizeHandle(wx, wy, room) {
    if (room.shape === 'polygon') return null; // Polygon chưa hỗ trợ resize handle
    var handles = getHandlePositions(room);
    var threshold = HANDLE_SIZE / zoom;
    for (var name in handles) {
        var pos = handles[name];
        if (Math.abs(wx - pos.x) < threshold && Math.abs(wy - pos.y) < threshold) {
            return name;
        }
    }
    return null;
}

function resizeRoom(snappedX, snappedY) {
    var r = selectedRoom;
    var s = resizeStartRoom;
    if (r.shape === 'circle') {
        // Resize circle = thay đổi bán kính
        var dx = snappedX - r.cx;
        var dy = snappedY - r.cy;
        r.radius = Math.max(10, Math.sqrt(dx * dx + dy * dy));
        r.x = r.cx - r.radius;
        r.y = r.cy - r.radius;
        r.width = r.radius * 2;
        r.height = r.radius * 2;
        return;
    }
    // Rect resize (giữ nguyên logic cũ)
    switch (resizeHandle) {
        case 'se': r.width = Math.max(GRID_SIZE, snappedX - r.x); r.height = Math.max(GRID_SIZE, snappedY - r.y); break;
        case 'e': r.width = Math.max(GRID_SIZE, snappedX - r.x); break;
        case 's': r.height = Math.max(GRID_SIZE, snappedY - r.y); break;
        case 'nw': { var nw = s.x + s.width - snappedX; var nh = s.y + s.height - snappedY; if (nw >= GRID_SIZE) { r.x = snappedX; r.width = nw; } if (nh >= GRID_SIZE) { r.y = snappedY; r.height = nh; } break; }
        case 'n': { var nh = s.y + s.height - snappedY; if (nh >= GRID_SIZE) { r.y = snappedY; r.height = nh; } break; }
        case 'ne': { r.width = Math.max(GRID_SIZE, snappedX - r.x); var nh = s.y + s.height - snappedY; if (nh >= GRID_SIZE) { r.y = snappedY; r.height = nh; } break; }
        case 'sw': { var nw = s.x + s.width - snappedX; if (nw >= GRID_SIZE) { r.x = snappedX; r.width = nw; } r.height = Math.max(GRID_SIZE, snappedY - r.y); break; }
        case 'w': { var nw = s.x + s.width - snappedX; if (nw >= GRID_SIZE) { r.x = snappedX; r.width = nw; } break; }
    }
}
