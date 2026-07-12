// ============================================================
// DOORS.JS - Logic cửa (đơn giản)
// ============================================================

// Danh sách loại cửa
const doorTypes = ['Cửa chính', 'Cửa phụ', 'Cửa thoát hiểm'];

// Tạo cửa mới tại vị trí click
function createDoor(x, y) {
    var sp = snapWorldPoint(x, y);
    var door = {
        id: nextDoorId++,
        name: 'Cửa ' + doors.length,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default',
        x: sp.x,
        y: sp.y,
        width: GRID_SIZE,    // Chiều rộng cửa = 1 ô
        type: doorTypes[0],
        rotation: 0          // 0 = ngang, 90 = dọc
    };
    doors.push(door);
    if (typeof EditorCore !== 'undefined' && EditorCore.ObjectTransform) {
        EditorCore.ObjectTransform.ensureOriginalGeometry('door', door);
    }
    if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
    return door;
}

// Tìm cửa tại vị trí click
function findDoorAt(wx, wy) {
    for (var i = doors.length - 1; i >= 0; i--) {
        var d = doors[i];
        if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(d)) continue;
        var halfW = d.width / 2;
        var halfH = 6; // Chiều dày cửa
        if (wx >= d.x - halfW && wx <= d.x + halfW &&
            wy >= d.y - halfH && wy <= d.y + halfH) {
            return d;
        }
    }
    return null;
}

// Vẽ 1 cửa lên canvas
function drawDoor(door, isSelected) {
    var halfW = door.width / 2;
    var thickness = 6;

    ctx.save();
    ctx.translate(door.x, door.y);
    ctx.rotate(door.rotation * Math.PI / 180);

    // Vẽ hình chữ nhật (cửa)
    ctx.fillStyle = isSelected ? '#f39c12' : '#e67e22';
    ctx.fillRect(-halfW, -thickness / 2, door.width, thickness);

    // Viền
    ctx.strokeStyle = isSelected ? '#e74c3c' : '#d35400';
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(-halfW, -thickness / 2, door.width, thickness);

    // Vẽ Handles khi được chọn
    if (isSelected) {
        var handleSize = (typeof HANDLE_SIZE !== 'undefined' ? HANDLE_SIZE : 8) / zoom;
        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 1 / zoom;

        // Điểm nắm trái
        ctx.fillRect(-halfW - handleSize/2, -handleSize/2, handleSize, handleSize);
        ctx.strokeRect(-halfW - handleSize/2, -handleSize/2, handleSize, handleSize);

        // Điểm nắm phải
        ctx.fillRect(halfW - handleSize/2, -handleSize/2, handleSize, handleSize);
        ctx.strokeRect(halfW - handleSize/2, -handleSize/2, handleSize, handleSize);

        // Điểm xoay (Rotation Handle)
        var rotDist = 25 / zoom;
        ctx.beginPath();
        ctx.moveTo(0, -thickness/2);
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

    // Tên cửa
    if (isSelected) {
        var fontSize = Math.max(8, 10 / zoom);
        ctx.fillStyle = '#e74c3c';
        ctx.font = 'bold ' + fontSize + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(door.name, door.x, door.y - 35 / zoom);
    }
}

// Lấy tọa độ các điểm nắm của cửa (để xử lý click)
function getDoorHandles(door) {
    var halfW = door.width / 2;
    var rad = (door.rotation || 0) * Math.PI / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    var rotDist = 25; // Khoảng cách điểm xoay từ tâm

    return {
        'left': {
            x: door.x + (-halfW) * cos,
            y: door.y + (-halfW) * sin
        },
        'right': {
            x: door.x + (halfW) * cos,
            y: door.y + (halfW) * sin
        },
        'rotate': {
            x: door.x + (rotDist) * sin, // sin vì nó nằm trên trục Y cục bộ
            y: door.y - (rotDist) * cos  // cos vì nó nằm trên trục Y cục bộ
        }
    };
}

// Xóa cửa
function deleteDoor(door) {
    doors = doors.filter(function (d) { return d.id !== door.id; });
}
