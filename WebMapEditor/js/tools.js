// ============================================================
// TOOLS.JS - Chọn công cụ & Phím tắt
// ============================================================

var toolNames = {
    'select': 'Chọn', 'room': 'Phòng', 'circle': 'Tròn',
    'polygon': 'Đa giác', 'door': 'Cửa', 'wall': 'Tường', 'poi': 'POI', 'qr': 'QR Code', 'path': 'Đường đi'
};

// Cập nhật cursor
function updateCursor() {
    wrapper.style.cursor = (currentTool === 'select') ? 'default' : 'crosshair';
}

// Chọn tool
function selectTool(tool) {
    // Kết thúc polygon đang vẽ dở nếu chuyển tool
    if (isDrawingPolygon && tool !== 'polygon') {
        if (polygonPoints.length >= 3) {
            var newRoom = createPolygonRoom(polygonPoints);
            if (newRoom) {
                saveState();
                rooms.push(newRoom);
                selectedRoom = newRoom;
                selectedObject = { type: 'room', data: newRoom };
                roomCountSpan.textContent = rooms.length + ' Phòng';
                updateObjectList();
            }
        }
        polygonPoints = [];
        isDrawingPolygon = false;
    }

    // Kết thúc vẽ tường nối tiếp khi đổi tool
    if (wallStartPoint && tool !== 'wall') {
        wallStartPoint = null;
        wallPreviewEnd = null;
    }

    currentTool = tool;
    
    // Cập nhật class active cho nút bấm
    document.querySelectorAll('.tool-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    var activeBtn = document.getElementById('btn-' + tool);
    if (activeBtn) activeBtn.classList.add('active');

    if (currentToolStatus) {
        currentToolStatus.textContent = toolNames[tool] || tool;
    }
    updateCursor();
    draw();
}

// Click nút tool
document.querySelectorAll('.tool-btn[data-tool]').forEach(function (btn) {
    btn.addEventListener('click', function () {
        selectTool(btn.dataset.tool);
    });
});

// Phím tắt
document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    // Undo (Ctrl + Z)
    if (e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();

        // Nếu đang vẽ dở đa giác -> Xóa điểm cuối thay vì Undo toàn bộ
        if (isDrawingPolygon && polygonPoints.length > 0) {
            polygonPoints.pop();
            if (polygonPoints.length === 0) {
                isDrawingPolygon = false;
            }
            draw();
            return;
        }

        undo();
        return;
    }

    // Redo (Ctrl + Shift + Z hoặc Ctrl + Y)
    if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') || (e.ctrlKey && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
        return;
    }

    switch (e.key.toLowerCase()) {
        case 'v': selectTool('select'); break;
        case 'r': selectTool('room'); break;
        case 'c': selectTool('circle'); break;
        case 'g': selectTool('polygon'); break;
        case 'd': selectTool('door'); break;
        case 'w': selectTool('wall'); break;
        case 'p': selectTool('poi'); break;
        case 'q': selectTool('qr'); break;
        case 'n': selectTool('path'); break;
        case 's': selectTool('ruler'); break;
        case 'delete':
        case 'backspace':
            saveState(); // Lưu trạng thái TRƯỚC khi xóa
            deleteSelected();
            break;
        case 'escape':
            // Hủy polygon đang vẽ
            if (isDrawingPolygon) {
                polygonPoints = [];
                isDrawingPolygon = false;
                draw();
                break;
            }
            if (wallStartPoint) {
                wallStartPoint = null;
                wallPreviewEnd = null;
                draw();
                break;
            }
            selectedRoom = null;
            selectedObject = null;
            isDrawing = false;
            updatePropertiesPanel();
            updateObjectList();
            draw();
            break;
    }
});
