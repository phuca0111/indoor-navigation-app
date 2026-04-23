// ============================================================
// DOORS.JS - Logic cửa (đơn giản)
// ============================================================

// Danh sách loại cửa
const doorTypes = ['Cửa chính', 'Cửa phụ', 'Cửa thoát hiểm'];

// Tạo cửa mới tại vị trí click
function createDoor(x, y) {
    var door = {
        id: nextDoorId++,
        name: 'Cửa ' + doors.length,
        x: snapToGrid(x),
        y: snapToGrid(y),
        width: GRID_SIZE,    // Chiều rộng cửa = 1 ô
        type: doorTypes[0],
        rotation: 0          // 0 = ngang, 90 = dọc
    };
    doors.push(door);
    return door;
}

// Tìm cửa tại vị trí click
function findDoorAt(wx, wy) {
    for (var i = doors.length - 1; i >= 0; i--) {
        var d = doors[i];
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

    ctx.restore();

    // Tên cửa
    if (isSelected) {
        var fontSize = Math.max(8, 10 / zoom);
        ctx.fillStyle = '#e74c3c';
        ctx.font = fontSize + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(door.name, door.x, door.y - 10 / zoom);
    }
}

// Xóa cửa
function deleteDoor(door) {
    doors = doors.filter(function (d) { return d.id !== door.id; });
}
