// ============================================================
// HISTORY.JS - Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
// ============================================================

var undoStack = [];
var redoStack = [];
var maxHistory = 30; // Giữ tối đa 30 bước

// === LƯU TRẠNG THÁI HIỆN TẠI ===
function saveState() {
    var newStateStr = JSON.stringify({
        rooms: rooms, walls: walls, doors: doors, pois: pois, pathNodes: pathNodes, pathEdges: pathEdges
    });

    // So sánh với state cuối cùng trong undoStack
    if (undoStack.length > 0) {
        var lastState = undoStack[undoStack.length - 1];
        var lastStateStr = JSON.stringify({
            rooms: lastState.rooms, walls: lastState.walls, doors: lastState.doors, pois: lastState.pois,
            pathNodes: lastState.pathNodes, pathEdges: lastState.pathEdges
        });
        if (newStateStr === lastStateStr) return; // Không có gì thay đổi, ko lưu
    }

    var state = {
        rooms: JSON.parse(JSON.stringify(rooms)),
        walls: JSON.parse(JSON.stringify(walls)),
        doors: JSON.parse(JSON.stringify(doors)),
        pois: JSON.parse(JSON.stringify(pois)),
        pathNodes: JSON.parse(JSON.stringify(pathNodes)),
        pathEdges: JSON.parse(JSON.stringify(pathEdges)),
        nextRoomId: nextRoomId,
        nextWallId: nextWallId,
        nextDoorId: nextDoorId,
        nextPoiId: nextPoiId,
        nextNodeId: nextNodeId
    };
    undoStack.push(state);
    if (undoStack.length > maxHistory) undoStack.shift();
    redoStack = []; // Xóa redo khi có action mới
}

// === UNDO (Ctrl+Z) ===
function undo() {
    if (undoStack.length === 0) {
        console.log('⚠️ Không có gì để undo');
        return;
    }

    // Lưu state hiện tại vào redo
    redoStack.push({
        rooms: JSON.parse(JSON.stringify(rooms)),
        walls: JSON.parse(JSON.stringify(walls)),
        doors: JSON.parse(JSON.stringify(doors)),
        pois: JSON.parse(JSON.stringify(pois)),
        pathNodes: JSON.parse(JSON.stringify(pathNodes)),
        pathEdges: JSON.parse(JSON.stringify(pathEdges)),
        nextRoomId: nextRoomId,
        nextWallId: nextWallId,
        nextDoorId: nextDoorId,
        nextPoiId: nextPoiId,
        nextNodeId: nextNodeId
    });

    // Khôi phục state trước đó
    var state = undoStack.pop();
    restoreState(state);
    console.log('↩️ Undo (' + undoStack.length + ' bước còn lại)');
}

// === REDO (Ctrl+Shift+Z) ===
function redo() {
    if (redoStack.length === 0) {
        console.log('⚠️ Không có gì để redo');
        return;
    }

    // Lưu state hiện tại vào undo
    undoStack.push({
        rooms: JSON.parse(JSON.stringify(rooms)),
        walls: JSON.parse(JSON.stringify(walls)),
        doors: JSON.parse(JSON.stringify(doors)),
        pois: JSON.parse(JSON.stringify(pois)),
        pathNodes: JSON.parse(JSON.stringify(pathNodes)),
        pathEdges: JSON.parse(JSON.stringify(pathEdges)),
        nextRoomId: nextRoomId,
        nextWallId: nextWallId,
        nextDoorId: nextDoorId,
        nextPoiId: nextPoiId,
        nextNodeId: nextNodeId
    });

    var state = redoStack.pop();
    restoreState(state);
    console.log('↪️ Redo (' + redoStack.length + ' bước còn lại)');
}

// === KHÔI PHỤC STATE ===
function restoreState(state) {
    rooms = state.rooms;
    walls = state.walls || [];
    doors = state.doors;
    pois = state.pois;
    pathNodes = state.pathNodes;
    pathEdges = state.pathEdges;
    nextRoomId = state.nextRoomId;
    nextWallId = state.nextWallId || 1;
    nextDoorId = state.nextDoorId;
    nextPoiId = state.nextPoiId;
    nextNodeId = state.nextNodeId;

    selectedRoom = null;
    selectedObject = null;
    roomCountSpan.textContent = 'Phòng: ' + rooms.length;
    updatePropertiesPanel();
    updateObjectList();
    draw();
}
