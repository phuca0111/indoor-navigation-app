// ============================================================
// HISTORY.JS - Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
// ============================================================

var undoStack = [];
var redoStack = [];
var maxHistory = 30; // Giữ tối đa 30 bước

function snapshotPayload() {
    return {
        rooms: rooms,
        walls: walls,
        lines: lines,
        doors: doors,
        pois: pois,
        pathNodes: pathNodes,
        pathEdges: pathEdges,
        qrs: qrs
    };
}

function cloneSnapshotPayload(src) {
    return {
        rooms: JSON.parse(JSON.stringify(src.rooms)),
        walls: JSON.parse(JSON.stringify(src.walls || [])),
        lines: JSON.parse(JSON.stringify(src.lines || [])),
        doors: JSON.parse(JSON.stringify(src.doors)),
        pois: JSON.parse(JSON.stringify(src.pois)),
        pathNodes: JSON.parse(JSON.stringify(src.pathNodes)),
        pathEdges: JSON.parse(JSON.stringify(src.pathEdges)),
        qrs: JSON.parse(JSON.stringify(src.qrs || [])),
        nextRoomId: src.nextRoomId,
        nextWallId: src.nextWallId,
        nextLineId: src.nextLineId,
        nextDoorId: src.nextDoorId,
        nextPoiId: src.nextPoiId,
        nextNodeId: src.nextNodeId,
        nextQrId: src.nextQrId != null ? src.nextQrId : 1
    };
}

// === LƯU TRẠNG THÁI HIỆN TẠI ===
function saveState() {
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();

    var newStateStr = JSON.stringify(snapshotPayload());

    // So sánh với state cuối cùng trong undoStack
    if (undoStack.length > 0) {
        var lastState = undoStack[undoStack.length - 1];
        var lastStateStr = JSON.stringify({
            rooms: lastState.rooms,
            walls: lastState.walls,
            lines: lastState.lines || [],
            doors: lastState.doors,
            pois: lastState.pois,
            pathNodes: lastState.pathNodes,
            pathEdges: lastState.pathEdges,
            qrs: lastState.qrs || []
        });
        if (newStateStr === lastStateStr) return; // Không có gì thay đổi, ko lưu
    }

    var state = cloneSnapshotPayload({
        rooms: rooms,
        walls: walls,
        lines: lines,
        doors: doors,
        pois: pois,
        pathNodes: pathNodes,
        pathEdges: pathEdges,
        qrs: qrs,
        nextRoomId: nextRoomId,
        nextWallId: nextWallId,
        nextLineId: nextLineId,
        nextDoorId: nextDoorId,
        nextPoiId: nextPoiId,
        nextNodeId: nextNodeId,
        nextQrId: nextQrId
    });
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

    redoStack.push(cloneSnapshotPayload({
        rooms: rooms,
        walls: walls,
        lines: lines,
        doors: doors,
        pois: pois,
        pathNodes: pathNodes,
        pathEdges: pathEdges,
        qrs: qrs,
        nextRoomId: nextRoomId,
        nextWallId: nextWallId,
        nextLineId: nextLineId,
        nextDoorId: nextDoorId,
        nextPoiId: nextPoiId,
        nextNodeId: nextNodeId,
        nextQrId: nextQrId
    }));

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

    undoStack.push(cloneSnapshotPayload({
        rooms: rooms,
        walls: walls,
        lines: lines,
        doors: doors,
        pois: pois,
        pathNodes: pathNodes,
        pathEdges: pathEdges,
        qrs: qrs,
        nextRoomId: nextRoomId,
        nextWallId: nextWallId,
        nextLineId: nextLineId,
        nextDoorId: nextDoorId,
        nextPoiId: nextPoiId,
        nextNodeId: nextNodeId,
        nextQrId: nextQrId
    }));

    var state = redoStack.pop();
    restoreState(state);
    console.log('↪️ Redo (' + redoStack.length + ' bước còn lại)');
}

// === KHÔI PHỤC STATE ===
function restoreState(state) {
    rooms = state.rooms;
    walls = state.walls || [];
    lines = state.lines || [];
    doors = state.doors;
    pois = state.pois;
    pathNodes = state.pathNodes;
    pathEdges = state.pathEdges;
    qrs = state.qrs || [];
    nextRoomId = state.nextRoomId;
    nextWallId = state.nextWallId || 1;
    nextLineId = state.nextLineId || 1;
    nextDoorId = state.nextDoorId;
    nextPoiId = state.nextPoiId;
    nextNodeId = state.nextNodeId;
    nextQrId = state.nextQrId != null ? state.nextQrId : 1;

    clearEditorSelection({ skipUi: true });
    roomCountSpan.textContent = 'Phòng: ' + rooms.length;
    updatePropertiesPanel();
    updateObjectList();
    draw();
}
