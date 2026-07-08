// ============================================================
// TOOLS.JS - Chọn công cụ & Phím tắt (delegate Tool Registry)
// ============================================================

function getToolDef(toolId) {
    if (window.EditorCore && EditorCore.ToolRegistry) {
        return EditorCore.ToolRegistry.get(toolId);
    }
    return null;
}

function getToolDisplayName(toolId) {
    var def = getToolDef(toolId);
    return def ? def.name : toolId;
}

// Cập nhật cursor
function updateCursor() {
    var def = getToolDef(currentTool);
    var cursor = def ? def.cursor : (currentTool === 'select' ? 'default' : 'crosshair');
    if (wrapper) wrapper.style.cursor = cursor;
}

// Chọn tool
function selectTool(tool) {
    if ((typeof isEditorLocked === 'function') && isEditorLocked()) return;
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

    pathPreviewEnd = null;
    polygonHoverPoint = null;

    if (tool !== 'ruler' && typeof clearRulerMeasurement === 'function') {
        clearRulerMeasurement();
    }

    var prevTool = currentTool;
    currentTool = tool;

    if (window.EditorCore && EditorCore.ToolRegistry) {
        EditorCore.ToolRegistry.activate(tool, { previousToolId: prevTool });
    }

    // Cập nhật class active cho nút bấm
    document.querySelectorAll('.tool-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    var def = getToolDef(tool);
    var btnId = def && def.buttonId ? def.buttonId : ('btn-' + tool);
    var activeBtn = document.getElementById(btnId);
    if (activeBtn) activeBtn.classList.add('active');

    if (currentToolSpan) {
        currentToolSpan.textContent = getToolDisplayName(tool);
    }
    updateCursor();
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    draw();
}
window.selectTool = selectTool;

// Click nút tool
document.querySelectorAll('.tool-btn[data-tool]').forEach(function (btn) {
    btn.addEventListener('click', function () {
        selectTool(btn.dataset.tool);
    });
});

// Phím tắt
document.addEventListener('keydown', function (e) {
    if ((typeof isEditorLocked === 'function') && isEditorLocked()) return;
    var t  = e.target;
    var tn = t && t.tagName ? t.tagName.toUpperCase() : '';
    if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA' || (t && t.isContentEditable)) return;

    // Undo (Ctrl + Z)
    if (e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();

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

    if (window.EditorCore && EditorCore.ToolRegistry) {
        var byShortcut = EditorCore.ToolRegistry.getByShortcut(e.key);
        if (byShortcut && !e.ctrlKey && !e.altKey) {
            selectTool(byShortcut.id);
            return;
        }
    }

    switch (e.key.toLowerCase()) {
        case 'delete':
        case 'backspace':
            saveState();
            deleteSelected();
            break;
        case 'escape':
            if ((rulerAwaitingEnd || rulerStart) && typeof clearRulerMeasurement === 'function') {
                clearRulerMeasurement();
                draw();
                break;
            }
            if (isDrawingPolygon) {
                polygonPoints = [];
                isDrawingPolygon = false;
                polygonHoverPoint = null;
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
