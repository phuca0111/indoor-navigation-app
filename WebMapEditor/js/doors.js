// ============================================================
// DOORS.JS - Logic cửa (đơn giản)
// ============================================================

// Danh sách loại cửa
const doorTypes = ['Cửa chính', 'Cửa phụ', 'Cửa thoát hiểm'];

// Tạo cửa mới tại vị trí click
function createDoor(x, y) {
    var placed = resolveDoorPosition(x, y);
    var door = {
        id: nextDoorId++,
        name: 'Cửa ' + doors.length,
        x: placed.x,
        y: placed.y,
        width: GRID_SIZE,    // Chiều rộng cửa = 1 ô
        type: doorTypes[0],
        rotation: placed.rotation != null ? placed.rotation : 0
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

// Vẽ 1 cửa lên canvas — delegate DoorRenderer
function drawDoor(door, isSelected) {
    var hooks = {
        handleSize: typeof HANDLE_SIZE !== 'undefined' ? HANDLE_SIZE : 8
    };
    if (window.EditorCore && EditorCore.DoorRenderer) {
        EditorCore.DoorRenderer.renderDoor(ctx, { zoom: zoom }, door, isSelected, hooks);
        return;
    }
    if (window.EditorCore && EditorCore.RenderingEngine) {
        EditorCore.RenderingEngine.renderDoor(ctx, { zoom: zoom }, door, isSelected, hooks);
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
