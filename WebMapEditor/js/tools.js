// ============================================================
// TOOLS.JS - Chọn công cụ & Phím tắt
// ============================================================

var toolNames = {
    'select': 'Chọn', 'room': 'Phòng', 'circle': 'Tròn',
    'polygon': 'Đa giác', 'door': 'Cửa', 'wall': 'Tường',
    'line': 'Đoạn thẳng', 'mline': 'Tường dày',
    'poi': 'Điểm POI', 'qr': 'Mốc QR', 'path': 'Đường đi', 'ruler': 'Dist',
    'move': 'Move chính xác', 'copy': 'Sao chép', 'rotate': 'Xoay CAD', 'scale': 'Tỷ lệ CAD',
    'mirror': 'Lật trục', 'trim': 'Cắt xén', 'extend': 'Kéo dài',
    'pedit': 'Sửa đỉnh', 'array': 'Hàng loạt', 'matchprop': 'Matchprop',
    'block': 'Block', 'insert': 'Insert',
    'dimlinear': 'Dimlinear', 'dimaligned': 'Dimaligned', 'dimedit': 'DIMEdit',
    'area': 'Area', 'hatch': 'Hatch',
    'calibrate': 'Calibrate', 'bg-crop': 'Crop nền', 'bg-adjust': 'Chỉnh nền'
};

function isModifyTool(tool) {
    if (window.EditorCore && EditorCore.ModifySession && EditorCore.ModifySession.isModifyTool) {
        return EditorCore.ModifySession.isModifyTool(tool);
    }
    return ['move', 'copy', 'rotate', 'scale', 'mirror', 'trim', 'extend',
        'pedit', 'mline', 'array', 'matchprop'].indexOf(tool) >= 0;
}

function updateModifyHint() {
    var hint = document.getElementById('commandHint');
    if (!hint || !window.EditorCore || !EditorCore.ModifySession) return;
    var snap = EditorCore.ModifySession.getSnapshot();
    if (snap && snap.message) {
        hint.textContent = snap.message;
    }
}

function isWallPolyToolActive() {
    return currentTool === 'wall'
        && window.EditorCore
        && EditorCore.PolylineTool
        && EditorCore.PolylineTool.getState() === 'drawing';
}

function updateCursor() {
    wrapper.style.cursor = (currentTool === 'select') ? 'default' : 'crosshair';
}

/** Hủy thao tác đang vẽ (Escape / CommandManager.cancel). */
function cancelActiveCommand() {
    if (typeof cancelAllDimensionSessions === 'function' && cancelAllDimensionSessions()) {
        draw();
        return;
    }
    if (isDrawingRuler || lastDistMeasure) {
        isDrawingRuler = false;
        lastDistMeasure = null;
        rulerStart = null;
        rulerEnd = null;
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        draw();
        return;
    }
    if (isDrawingArea || lastAreaMeasure || (areaPoints && areaPoints.length)) {
        isDrawingArea = false;
        lastAreaMeasure = null;
        areaPoints = [];
        areaPreview = null;
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        draw();
        return;
    }
    if (typeof clearCalibrateSession === 'function' && (currentTool === 'calibrate' || typeof isCalibrating === 'function' && isCalibrating())) {
        clearCalibrateSession();
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        draw();
        return;
    }
    if (typeof clearCropSession === 'function' && (currentTool === 'bg-crop' || typeof isCroppingBg === 'function' && isCroppingBg())) {
        clearCropSession();
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        draw();
        return;
    }
    if (typeof cancelPendingInsert === 'function' && cancelPendingInsert()) {
        if (typeof selectTool === 'function') selectTool('select');
        draw();
        return;
    }
    if (window.EditorCore && EditorCore.ModifySession && EditorCore.ModifySession.getMode()) {
        EditorCore.ModifySession.cancel();
        updateModifyHint();
        draw();
        return;
    }
    if (isDrawingPolygon) {
        polygonPoints = [];
        isDrawingPolygon = false;
        draw();
        return;
    }
    if (currentTool === 'wall' && typeof stopWallChain === 'function') {
        stopWallChain();
        return;
    }
    if (currentTool === 'line' && window.EditorCore && EditorCore.LineTool
        && EditorCore.LineTool.getState() === 'drawing') {
        EditorCore.LineTool.cancel({});
        draw();
        return;
    }
    clearEditorSelection();
    isDrawing = false;
}
window.cancelActiveCommand = cancelActiveCommand;

function runToolShortcut(alias) {
    if (window.EditorCore && EditorCore.toolCommand) {
        EditorCore.toolCommand.execute(alias, { source: 'shortcut' });
    } else {
        var toolId = alias;
        if (window.EditorCore && EditorCore.ToolCommandManager && EditorCore.ToolCommandManager.create) {
            var resolved = null;
            var tmp = EditorCore.ToolCommandManager.create({});
            if (tmp.resolve) resolved = tmp.resolve(alias);
            if (resolved) toolId = resolved;
        }
        selectTool(toolId);
    }
}

function selectTool(tool) {
    if ((typeof isEditorLocked === 'function') && isEditorLocked()) return;
    if (window.editorFloorLockReadOnly && tool !== 'select') return;

    // Alias: polyline → wall (đã hợp nhất)
    if (tool === 'polyline') tool = 'wall';

    // Block: tạo ngay từ selection rồi về Select
    if (tool === 'block') {
        if (typeof createBlockFromSelection === 'function') createBlockFromSelection();
        tool = 'select';
    }

    // Insert: chọn block rồi chờ click
    if (tool === 'insert') {
        currentTool = 'insert';
        document.querySelectorAll('.tool-btn').forEach(function (b) {
            b.classList.remove('active');
        });
        var insBtn = document.getElementById('btn-insert');
        if (insBtn) insBtn.classList.add('active');
        if (currentToolStatus) currentToolStatus.textContent = toolNames.insert || 'Insert';
        updateCursor();
        if (typeof beginInsertTool === 'function') beginInsertTool();
        draw();
        return;
    }

    // Dimlinear / Dimaligned / DIMEdit
    if (typeof cancelAllDimensionSessions === 'function') cancelAllDimensionSessions();
    if (tool === 'dimlinear' && typeof beginDimlinearTool === 'function') {
        beginDimlinearTool();
    } else if (tool === 'dimaligned' && typeof beginDimalignedTool === 'function') {
        beginDimalignedTool();
    } else if (tool === 'dimedit' && typeof beginDimeditTool === 'function') {
        beginDimeditTool();
    }

    if (typeof cancelPendingInsert === 'function') cancelPendingInsert();

    if (isDrawingPolygon && tool !== 'polygon') {
        if (polygonPoints.length >= 3) {
            var newRoom = createPolygonRoom(polygonPoints);
            if (newRoom) {
                saveState();
                rooms.push(newRoom);
                setEditorSelection('room', newRoom, { skipUi: true });
                roomCountSpan.textContent = rooms.length + ' Phòng';
                updateObjectList();
            }
        }
        polygonPoints = [];
        isDrawingPolygon = false;
    }

    wallStartPoint = null;
    wallPreviewEnd = null;

    if (window.EditorCore && EditorCore.PolylineTool) {
        if (currentTool === 'wall' && tool !== 'wall') {
            EditorCore.PolylineTool.deactivate({});
        }
        // W lần 2 khi đang wall = reset chuỗi tường (giống Esc rồi W lại)
        if (tool === 'wall' && currentTool === 'wall') {
            EditorCore.PolylineTool.cancel({});
            EditorCore.PolylineTool.activate({});
            if (typeof showToast === 'function') {
                showToast('Đã reset chuỗi tường (W×2)', 'success');
            }
        } else if (tool === 'wall' && currentTool !== 'wall') {
            EditorCore.PolylineTool.activate({});
        }
    }

    if (window.EditorCore && EditorCore.LineTool) {
        if (currentTool === 'line' && tool !== 'line') {
            EditorCore.LineTool.deactivate({});
        }
        if (tool === 'line' && currentTool !== 'line') {
            EditorCore.LineTool.activate({});
        }
    }

    // Phase 2 ModifySession
    if (window.EditorCore && EditorCore.ModifySession) {
        var MS = EditorCore.ModifySession;
        if (isModifyTool(currentTool) && !isModifyTool(tool)) {
            MS.deactivate();
        }
        if (isModifyTool(tool)) {
            MS.activate(tool);
            updateModifyHint();
            if (typeof showToast === 'function') {
                var snap0 = MS.getSnapshot();
                if (snap0 && snap0.message) showToast(snap0.message, 'success');
            }
        }
    }

    // Rời Dist → xóa kết quả ephemeral
    if (currentTool === 'ruler' && tool !== 'ruler') {
        isDrawingRuler = false;
        lastDistMeasure = null;
        rulerStart = null;
        rulerEnd = null;
    }

    // Rời Area → xóa kết quả ephemeral
    if (currentTool === 'area' && tool !== 'area') {
        isDrawingArea = false;
        lastAreaMeasure = null;
        areaPoints = [];
        areaPreview = null;
    }

    // Rời Calibrate / Crop
    if (currentTool === 'calibrate' && tool !== 'calibrate' && typeof clearCalibrateSession === 'function') {
        clearCalibrateSession();
    }
    if (currentTool === 'bg-crop' && tool !== 'bg-crop' && typeof clearCropSession === 'function') {
        clearCropSession();
    }

    currentTool = tool;

    if (typeof clearSnapHint === 'function') {
        clearSnapHint();
    }

    document.querySelectorAll('.tool-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    var activeBtn = document.getElementById('btn-' + tool);
    if (activeBtn) activeBtn.classList.add('active');

    if (currentToolStatus) {
        currentToolStatus.textContent = toolNames[tool] || tool;
    }
    updateCursor();
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    draw();
    if (window.DynamicInputUI && typeof window.DynamicInputUI.updateVisibility === 'function') {
        window.DynamicInputUI.updateVisibility();
    }
}
window.selectTool = selectTool;

document.querySelectorAll('.tool-btn[data-tool]').forEach(function (btn) {
    btn.addEventListener('click', function () {
        selectTool(btn.dataset.tool);
    });
});

document.addEventListener('keydown', function (e) {
    if ((typeof isEditorLocked === 'function') && isEditorLocked()) return;
    if (window.editorFloorLockReadOnly) return;
    var t = e.target;
    var tn = t && t.tagName ? t.tagName.toUpperCase() : '';
    if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA' || (t && t.isContentEditable)) return;

    // Đang vẽ L/W: gõ số → ô Chiều dài (vd 3.5m Enter)
    if (window.DynamicInputUI && typeof window.DynamicInputUI.captureTypingKey === 'function'
        && window.DynamicInputUI.captureTypingKey(e)) {
        return;
    }

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
        if (isDrawingArea && areaPoints && areaPoints.length > 0) {
            areaPoints.pop();
            if (areaPoints.length === 0) {
                isDrawingArea = false;
                areaPreview = null;
            }
            if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
            draw();
            return;
        }
        undo();
        return;
    }

    if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') || (e.ctrlKey && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
        return;
    }

    switch (e.key.toLowerCase()) {
        case 'v': runToolShortcut('v'); break;
        case 'r': runToolShortcut('r'); break;
        case 'c': runToolShortcut('c'); break;
        case 'g': runToolShortcut('g'); break;
        case 'd': runToolShortcut('d'); break;
        case 'w':
            runToolShortcut('w');
            break;
        case 'l':
            runToolShortcut('l');
            break;
        case 'p': runToolShortcut('p'); break;
        case 'q': runToolShortcut('q'); break;
        case 'n': runToolShortcut('n'); break;
        case 's': runToolShortcut('s'); break;
        case 'h': runToolShortcut('h'); break;
        case 'm':
            // M = Move (Phase 2); không đụng path (N)
            runToolShortcut('m');
            break;
        case 'b':
            // Shift+B (khi đang vẽ wall): ép ngang/dọc theo điểm neo trước.
            // B (không Shift): Block
            if (e.shiftKey && isWallPolyToolActive() &&
                EditorCore &&
                EditorCore.PolylineTool &&
                typeof EditorCore.PolylineTool.toggleOrthoLock === 'function') {
                e.preventDefault();
                EditorCore.PolylineTool.toggleOrthoLock();
                updatePropertiesPanel();
                draw();
            } else if (!e.shiftKey) {
                runToolShortcut('b');
            }
            break;
        case 'i':
            runToolShortcut('i');
            break;
        case 'delete':
        case 'backspace':
            if (window.EditorCore && EditorCore.ModifySession
                && EditorCore.ModifySession.getMode() === 'pedit') {
                e.preventDefault();
                EditorCore.ModifySession.onKeyDown(e.key === 'Backspace' ? 'Backspace' : 'Delete');
                updateModifyHint();
                draw();
                break;
            }
            if (isWallPolyToolActive()) {
                e.preventDefault();
                EditorCore.PolylineTool.onKeyDown({ key: e.key });
                updatePropertiesPanel();
                draw();
                break;
            }
            saveState();
            deleteSelected();
            break;
        case 'enter':
            if (window.DynamicInputUI && window.DynamicInputUI.hasPendingText()
                && window.DynamicInputUI.isActive()) {
                e.preventDefault();
                window.DynamicInputUI.submit();
                break;
            }
            if (window.EditorCore && EditorCore.ModifySession
                && EditorCore.ModifySession.getMode() === 'mline') {
                e.preventDefault();
                EditorCore.ModifySession.onKeyDown('Enter');
                updateModifyHint();
                draw();
                break;
            }
            if (currentTool === 'wall' && typeof stopWallChain === 'function') {
                e.preventDefault();
                stopWallChain();
            }
            if (currentTool === 'area' && typeof finishAreaFromPoints === 'function') {
                e.preventDefault();
                finishAreaFromPoints();
            }
            if (currentTool === 'bg-crop' && typeof applyCropBackground === 'function') {
                e.preventDefault();
                applyCropBackground();
            }
            break;
        case 'escape':
            if (window.EditorCore && EditorCore.toolCommand) {
                EditorCore.toolCommand.cancel();
            } else {
                cancelActiveCommand();
            }
            break;
    }
});

/**
 * Click tường: PolylineTool + tạo đoạn ngay (giữ UX W cũ).
 * @param {{x:number,y:number}} world — tọa độ chuột (world), snap 1 lần trong PolylineTool
 * @param {object} [snapOpts]
 */
function handleWallVertex(world, snapOpts) {
    if (!world || world.x == null || world.y == null) return;

    if (!window.EditorCore || !EditorCore.PolylineTool) {
        var fallbackPt = snapWorldPoint(world.x, world.y, snapOpts);
        var p = { x: fallbackPt.x, y: fallbackPt.y };
        if (!wallStartPoint) {
            wallStartPoint = p;
            wallPreviewEnd = p;
        } else {
            saveState();
            var wall = createWallSegment(wallStartPoint, p, { thickness: window.defaultWallThickness || 4, is_outer: false });
            wallStartPoint = p;
            wallPreviewEnd = p;
            if (wall) {
                setEditorSelection('wall', wall, { skipUi: true });
                updatePropertiesPanel();
                updateObjectList();
            }
        }
        return;
    }

    var PL = EditorCore.PolylineTool;
    if (PL.getState() === 'idle') {
        PL.activate({});
    }

    var before = PL.getPoints().length;
    PL.onPointerDown({
        worldX: world.x,
        worldY: world.y,
        snapOpts: snapOpts
    });
    var pts = PL.getPoints();

    if (pts.length >= 2 && pts.length > before) {
        var a = pts[pts.length - 2];
        var b = pts[pts.length - 1];
        saveState();
        var created = createWallSegment(a, b, { thickness: window.defaultWallThickness || 4, is_outer: false });
        if (created) {
            setEditorSelection('wall', created, { skipUi: true });
            updatePropertiesPanel();
            updateObjectList();
        }
        PL.continueFromLast();
    }
    if (window.DynamicInputUI && typeof window.DynamicInputUI.updateVisibility === 'function') {
        window.DynamicInputUI.updateVisibility();
    }
}
window.handleWallVertex = handleWallVertex;

/**
 * Click Đoạn thẳng (LineTool): 2 click → 1 line segment rồi chờ cặp click mới.
 * Không nối chuỗi như Wall.
 * @param {{x:number,y:number}} world — tọa độ chuột (world)
 * @param {object} [snapOpts]
 */
function handleLineVertex(world, snapOpts) {
    if (!world || world.x == null || world.y == null) return;
    if (!window.EditorCore || !EditorCore.LineTool) return;

    var LT = EditorCore.LineTool;
    var wasDrawing = LT.getState() === 'drawing';
    LT.onPointerDown({
        worldX: world.x,
        worldY: world.y,
        snapOpts: snapOpts
    });

    // Click 2 hoàn tất: LineTool tự về idle và có lastResult
    if (wasDrawing && LT.getState() === 'idle') {
        var r = LT.getLastResult();
        if (r && r.points && r.points.length === 2) {
            saveState();
            var created = createLineSegment(r.points[0], r.points[1]);
            if (created) {
                setEditorSelection('line', created, { skipUi: true });
                updatePropertiesPanel();
                updateObjectList();
            }
        }
    }
    if (window.DynamicInputUI && typeof window.DynamicInputUI.updateVisibility === 'function') {
        window.DynamicInputUI.updateVisibility();
    }
}
window.handleLineVertex = handleLineVertex;

/** Esc / Enter: ngắt chuỗi tường (đoạn đã tạo giữ nguyên). */
function stopWallChain() {
    wallStartPoint = null;
    wallPreviewEnd = null;
    if (window.EditorCore && EditorCore.PolylineTool) {
        EditorCore.PolylineTool.cancel({});
        if (currentTool === 'wall') {
            EditorCore.PolylineTool.activate({});
        }
    }
    updatePropertiesPanel();
    draw();
    if (window.DynamicInputUI && typeof window.DynamicInputUI.updateVisibility === 'function') {
        window.DynamicInputUI.updateVisibility();
    }
}
window.stopWallChain = stopWallChain;

/** @deprecated dùng stopWallChain — giữ alias smoke cũ */
function finishPolylineTool() {
    return stopWallChain();
}
window.finishPolylineTool = finishPolylineTool;

if (window.EditorCore && EditorCore.ToolCommandManager && EditorCore.ToolCommandManager.create) {
    EditorCore.toolCommand = EditorCore.ToolCommandManager.create({
        eventBus: EditorCore.eventBus,
        onActivate: function (toolId) {
            selectTool(toolId);
        },
        onCancel: cancelActiveCommand
    });
}
