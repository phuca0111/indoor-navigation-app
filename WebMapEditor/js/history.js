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
        cadPoints: typeof cadPoints !== 'undefined' ? cadPoints : [],
        pathNodes: pathNodes,
        pathEdges: pathEdges,
        qrs: qrs,
        blocks: typeof blocks !== 'undefined' ? blocks : [],
        blockInserts: typeof blockInserts !== 'undefined' ? blockInserts : [],
        dimensions: typeof dimensions !== 'undefined' ? dimensions : []
    };
}

function cloneSnapshotPayload(src) {
    return {
        rooms: JSON.parse(JSON.stringify(src.rooms)),
        walls: JSON.parse(JSON.stringify(src.walls || [])),
        lines: JSON.parse(JSON.stringify(src.lines || [])),
        doors: JSON.parse(JSON.stringify(src.doors)),
        pois: JSON.parse(JSON.stringify(src.pois)),
        cadPoints: JSON.parse(JSON.stringify(src.cadPoints || [])),
        pathNodes: JSON.parse(JSON.stringify(src.pathNodes)),
        pathEdges: JSON.parse(JSON.stringify(src.pathEdges)),
        qrs: JSON.parse(JSON.stringify(src.qrs || [])),
        blocks: JSON.parse(JSON.stringify(src.blocks || [])),
        blockInserts: JSON.parse(JSON.stringify(src.blockInserts || [])),
        dimensions: JSON.parse(JSON.stringify(src.dimensions || [])),
        nextRoomId: src.nextRoomId,
        nextWallId: src.nextWallId,
        nextLineId: src.nextLineId,
        nextDoorId: src.nextDoorId,
        nextPoiId: src.nextPoiId,
        nextCadPointId: src.nextCadPointId != null ? src.nextCadPointId : 1,
        nextNodeId: src.nextNodeId,
        nextQrId: src.nextQrId != null ? src.nextQrId : 1,
        nextBlockDefId: src.nextBlockDefId != null ? src.nextBlockDefId : 1,
        nextBlockInsertId: src.nextBlockInsertId != null ? src.nextBlockInsertId : 1,
        nextDimId: src.nextDimId != null ? src.nextDimId : 1
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
            cadPoints: lastState.cadPoints || [],
            pathNodes: lastState.pathNodes,
            pathEdges: lastState.pathEdges,
            qrs: lastState.qrs || [],
            blocks: lastState.blocks || [],
            blockInserts: lastState.blockInserts || [],
            dimensions: lastState.dimensions || []
        });
        if (newStateStr === lastStateStr) return; // Không có gì thay đổi, ko lưu
    }

    var state = cloneSnapshotPayload({
        rooms: rooms,
        walls: walls,
        lines: lines,
        doors: doors,
        pois: pois,
        cadPoints: typeof cadPoints !== 'undefined' ? cadPoints : [],
        pathNodes: pathNodes,
        pathEdges: pathEdges,
        qrs: qrs,
        blocks: typeof blocks !== 'undefined' ? blocks : [],
        blockInserts: typeof blockInserts !== 'undefined' ? blockInserts : [],
        dimensions: typeof dimensions !== 'undefined' ? dimensions : [],
        nextRoomId: nextRoomId,
        nextWallId: nextWallId,
        nextLineId: nextLineId,
        nextDoorId: nextDoorId,
        nextPoiId: nextPoiId,
        nextCadPointId: typeof nextCadPointId !== 'undefined' ? nextCadPointId : 1,
        nextNodeId: nextNodeId,
        nextQrId: nextQrId,
        nextBlockDefId: typeof nextBlockDefId !== 'undefined' ? nextBlockDefId : 1,
        nextBlockInsertId: typeof nextBlockInsertId !== 'undefined' ? nextBlockInsertId : 1,
        nextDimId: typeof nextDimId !== 'undefined' ? nextDimId : 1
    });
    undoStack.push(state);
    if (undoStack.length > maxHistory) undoStack.shift();
    redoStack = []; // Xóa redo khi có action mới
    if (typeof markEditorDirty === 'function') markEditorDirty();
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
        cadPoints: typeof cadPoints !== 'undefined' ? cadPoints : [],
        pathNodes: pathNodes,
        pathEdges: pathEdges,
        qrs: qrs,
        blocks: typeof blocks !== 'undefined' ? blocks : [],
        blockInserts: typeof blockInserts !== 'undefined' ? blockInserts : [],
        dimensions: typeof dimensions !== 'undefined' ? dimensions : [],
        nextRoomId: nextRoomId,
        nextWallId: nextWallId,
        nextLineId: nextLineId,
        nextDoorId: nextDoorId,
        nextPoiId: nextPoiId,
        nextCadPointId: typeof nextCadPointId !== 'undefined' ? nextCadPointId : 1,
        nextNodeId: nextNodeId,
        nextQrId: nextQrId,
        nextBlockDefId: typeof nextBlockDefId !== 'undefined' ? nextBlockDefId : 1,
        nextBlockInsertId: typeof nextBlockInsertId !== 'undefined' ? nextBlockInsertId : 1,
        nextDimId: typeof nextDimId !== 'undefined' ? nextDimId : 1
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
        cadPoints: typeof cadPoints !== 'undefined' ? cadPoints : [],
        pathNodes: pathNodes,
        pathEdges: pathEdges,
        qrs: qrs,
        blocks: typeof blocks !== 'undefined' ? blocks : [],
        blockInserts: typeof blockInserts !== 'undefined' ? blockInserts : [],
        dimensions: typeof dimensions !== 'undefined' ? dimensions : [],
        nextRoomId: nextRoomId,
        nextWallId: nextWallId,
        nextLineId: nextLineId,
        nextDoorId: nextDoorId,
        nextPoiId: nextPoiId,
        nextCadPointId: typeof nextCadPointId !== 'undefined' ? nextCadPointId : 1,
        nextNodeId: nextNodeId,
        nextQrId: nextQrId,
        nextBlockDefId: typeof nextBlockDefId !== 'undefined' ? nextBlockDefId : 1,
        nextBlockInsertId: typeof nextBlockInsertId !== 'undefined' ? nextBlockInsertId : 1,
        nextDimId: typeof nextDimId !== 'undefined' ? nextDimId : 1
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
    cadPoints = state.cadPoints || [];
    pathNodes = state.pathNodes;
    pathEdges = state.pathEdges;
    qrs = state.qrs || [];
    blocks = state.blocks || [];
    blockInserts = state.blockInserts || [];
    dimensions = state.dimensions || [];
    nextRoomId = state.nextRoomId;
    nextWallId = state.nextWallId || 1;
    nextLineId = state.nextLineId || 1;
    nextDoorId = state.nextDoorId;
    nextPoiId = state.nextPoiId;
    nextCadPointId = state.nextCadPointId || 1;
    nextNodeId = state.nextNodeId;
    nextQrId = state.nextQrId != null ? state.nextQrId : 1;
    nextBlockDefId = state.nextBlockDefId || 1;
    nextBlockInsertId = state.nextBlockInsertId || 1;
    nextDimId = state.nextDimId || 1;

    clearEditorSelection({ skipUi: true });
    roomCountSpan.textContent = 'Phòng: ' + rooms.length;
    updatePropertiesPanel();
    updateObjectList();
    draw();
}
