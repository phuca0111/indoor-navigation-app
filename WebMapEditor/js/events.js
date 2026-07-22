// ============================================================
// EVENTS.JS - Xử lý sự kiện chuột: Zoom, Pan, Click, Drag
// ============================================================

// === ZOOM ===
function editorLocked() {
    return (typeof isEditorLocked === 'function') && isEditorLocked();
}

function isWriteBlocked() {
    if (editorLocked()) return true;
    if (window.editorFloorLockReadOnly) return true;
    return false;
}

canvas.addEventListener('wheel', function (e) {
    if (editorLocked()) {
        e.preventDefault();
        return;
    }
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mouseX = e.clientX - rect.left;
    var mouseY = e.clientY - rect.top;
    var beforeZoom = screenToWorld(mouseX, mouseY);
    var zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    zoom *= zoomFactor;
    zoom = Math.max(0.01, Math.min(10, zoom));
    var afterZoom = screenToWorld(mouseX, mouseY);
    panX += (afterZoom.x - beforeZoom.x) * zoom;
    panY += (afterZoom.y - beforeZoom.y) * zoom;
    zoomLevelSpan.textContent = 'Thu phóng: ' + Math.round(zoom * 100) + '%';
    draw();
});

// === MOUSE DOWN ===
canvas.addEventListener('mousedown', function (e) {
    if (editorLocked()) {
        e.preventDefault();
        return;
    }
    if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        isPanning = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        wrapper.style.cursor = 'grabbing';
        return;
    }
    if (isWriteBlocked() && e.button === 0) {
        e.preventDefault();
        return;
    }
    if (e.button === 0) handleLeftMouseDown(e);
});

// === MOUSE MOVE ===
/** Gộp nhiều mousemove → 1 frame draw (kéo cửa/phòng mượt hơn) */
var _dragDrawRaf = 0;
function scheduleDragDraw() {
    if (_dragDrawRaf) return;
    _dragDrawRaf = requestAnimationFrame(function () {
        _dragDrawRaf = 0;
        if (typeof draw === 'function') draw();
    });
}

/** Snap khi kéo đối tượng: tắt OSNAP/polar (tránh giật hút điểm), giữ lưới nếu đang bật */
function getDragSnapOpts(e) {
    var base = typeof getSnapOpts === 'function' ? getSnapOpts(e) : undefined;
    var opts = base ? Object.assign({}, base) : {};
    opts.objectSnap = false;
    opts.polar = false;
    return opts;
}

canvas.addEventListener('mousemove', function (e) {
    if (editorLocked()) {
        return;
    }
    var rect = canvas.getBoundingClientRect();
    var mouseX = e.clientX - rect.left;
    var mouseY = e.clientY - rect.top;
    var world = screenToWorld(mouseX, mouseY);
    if (window.lastMouseWorld) {
        window.lastMouseWorld.x = world.x;
        window.lastMouseWorld.y = world.y;
    }
    if (mousePosSpan) mousePosSpan.textContent = 'X: ' + Math.round(world.x) + ', Y: ' + Math.round(world.y);
    if (worldPosSpan) worldPosSpan.textContent = pixelsToMeters(world.x).toFixed(1) + 'm, ' + pixelsToMeters(world.y).toFixed(1) + 'm';

    if (isPanning) {
        panX = e.clientX - panStartX;
        panY = e.clientY - panStartY;
        draw();
        return;
    }
    handleMouseMove(e, world);
});

// === MOUSE UP ===
canvas.addEventListener('mouseup', function (e) {
    if (editorLocked()) return;
    if (isPanning) { isPanning = false; updateCursor(); return; }
    handleLeftMouseUp(e);
});

// === DOUBLE CLICK (kết thúc polygon / ngắt chuỗi tường) ===
canvas.addEventListener('dblclick', function (e) {
    if (editorLocked()) return;
    if (currentTool === 'area' && typeof finishAreaFromPoints === 'function') {
        if (finishAreaFromPoints()) return;
    }
    if (currentTool === 'polygon' && isDrawingPolygon && polygonPoints.length >= 3) {
        var newRoom = createPolygonRoom(polygonPoints);
        if (newRoom) {
            saveState();
            rooms.push(newRoom);
            setEditorSelection('room', newRoom, { skipUi: true });
            roomCountSpan.textContent = 'Phòng: ' + rooms.length;
            updatePropertiesPanel();
            updateObjectList();
            polygonPoints = [];
            isDrawingPolygon = false;
        }
        // Không hợp lệ — giữ điểm đang vẽ để sửa
        draw();
        return;
    }
    if (currentTool === 'wall' && typeof stopWallChain === 'function') {
        stopWallChain();
        return;
    }
    if (currentTool === 'mline' && window.EditorCore && EditorCore.ModifySession) {
        var rect = canvas.getBoundingClientRect();
        var world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        var snapOpts = typeof getSnapOpts === 'function' ? getSnapOpts(e) : undefined;
        var snapped = snapWorldPoint(world.x, world.y, snapOpts);
        EditorCore.ModifySession.onPointerDown(
            { x: snapped.x, y: snapped.y },
            { doubleClick: true }
        );
        if (typeof updateModifyHint === 'function') updateModifyHint();
        draw();
    }
});

canvas.addEventListener('contextmenu', function (e) {
    if (editorLocked()) {
        e.preventDefault();
        return;
    }
    e.preventDefault();
    if (currentTool === 'path') {
        firstNodeForEdge = null;
        clearEditorSelection({ skipUi: true });
        if (typeof showToast === 'function') showToast('Đã ngắt chuỗi đường đi', 'success');
        draw();
    }
});

// ============================================================
// XỬ LÝ LEFT CLICK
// ============================================================
function handleLeftMouseDown(e) {
    if (editorLocked()) return;
    var rect = canvas.getBoundingClientRect();
    var mouseX = e.clientX - rect.left;
    var mouseY = e.clientY - rect.top;
    var world = screenToWorld(mouseX, mouseY);
    var snapOpts = typeof getSnapOpts === 'function' ? getSnapOpts(e) : undefined;
    if (typeof enrichSnapOpts === 'function') {
        snapOpts = enrichSnapOpts(snapOpts, currentTool);
    }
    var snapped = snapWorldPoint(world.x, world.y, snapOpts);
    var snappedX = snapped.x;
    var snappedY = snapped.y;

    // Chặn vẽ khi lớp active đang khóa (select / ruler / bg-adjust vẫn được)
    var drawTools = {
        room: 1, circle: 1, polygon: 1, door: 1, wall: 1, line: 1, poi: 1, point: 1, qr: 1, path: 1, mline: 1,
        dimlinear: 1,
        dimaligned: 1,
        dimedit: 1
    };
    if (drawTools[currentTool] && typeof blockIfActiveLayerLocked === 'function') {
        if (blockIfActiveLayerLocked('vẽ trên lớp này')) return;
    }

    // --- Phase 2: ModifySession (Move/Copy/…/MLine) ---
    if (typeof isModifyTool === 'function' && isModifyTool(currentTool)
        && window.EditorCore && EditorCore.ModifySession) {
        EditorCore.ModifySession.onPointerDown(
            { x: snappedX, y: snappedY },
            {
                shiftKey: !!e.shiftKey,
                ctrlKey: !!e.ctrlKey,
                metaKey: !!e.metaKey,
                doubleClick: false
            }
        );
        if (typeof updateModifyHint === 'function') updateModifyHint();
        draw();
        return;
    }

    // --- TOOL: INSERT block ---
    if (currentTool === 'insert' && window.pendingInsertBlockId) {
        placeBlockInsertAt(snappedX, snappedY);
        return;
    }

    // --- TOOL: DIMLINEAR (DLI) ---
    if (currentTool === 'dimlinear') {
        if (typeof handleDimlinearClick === 'function') {
            handleDimlinearClick(snappedX, snappedY);
        }
        draw();
        return;
    }

    // --- TOOL: DIMALIGNED (DAL) ---
    if (currentTool === 'dimaligned') {
        if (typeof handleDimalignedClick === 'function') {
            handleDimalignedClick(snappedX, snappedY);
        }
        draw();
        return;
    }

    // --- TOOL: DIMEDIT (DED) ---
    if (currentTool === 'dimedit') {
        if (typeof handleDimeditClick === 'function') {
            handleDimeditClick(snappedX, snappedY);
        }
        draw();
        return;
    }

    // --- TOOL: DIMCONTINUE (DCO) ---
    if (currentTool === 'dimcontinue') {
        if (typeof handleDimcontinueClick === 'function') handleDimcontinueClick(snappedX, snappedY);
        draw();
        return;
    }

    // --- TOOL: DIMBASELINE (DBA) ---
    if (currentTool === 'dimbaseline') {
        if (typeof handleDimbaselineClick === 'function') handleDimbaselineClick(snappedX, snappedY);
        draw();
        return;
    }

    // --- TOOL: DIMANGULAR (DAN) ---
    if (currentTool === 'dimangular') {
        if (typeof handleDimangularClick === 'function') handleDimangularClick(snappedX, snappedY);
        draw();
        return;
    }

    // --- TOOL: DIMRADIUS / DIAMETER ---
    if (currentTool === 'dimradius' || currentTool === 'dimdiameter') {
        if (typeof handleDimCircularClick === 'function') handleDimCircularClick(currentTool, snappedX, snappedY);
        draw();
        return;
    }

    // --- TOOL: VẼ PHÒNG CHỮ NHẬT ---
    if (currentTool === 'room') {
        isDrawing = true;
        drawStartX = snappedX;
        drawStartY = snappedY;
        drawCurrentX = snappedX;
        drawCurrentY = snappedY;
    }

    // --- TOOL: VẼ HÌNH TRÒN ---
    else if (currentTool === 'circle') {
        isDrawing = true;
        drawStartX = snappedX;
        drawStartY = snappedY;
        drawCurrentX = snappedX;
        drawCurrentY = snappedY;
    }

    // --- TOOL: VẼ ĐA GIÁC ---
    else if (currentTool === 'polygon') {
        var newPt = { x: world.x, y: world.y };
        if (polygonPoints.length > 0 && typeof getMinPolygonEdgePx === 'function') {
            var lastPt = polygonPoints[polygonPoints.length - 1];
            var segPx = typeof polygonSegmentPx === 'function'
                ? polygonSegmentPx(lastPt, newPt)
                : Math.hypot(newPt.x - lastPt.x, newPt.y - lastPt.y);
            if (segPx < getMinPolygonEdgePx()) {
                var minLabel = typeof formatMinPolygonEdgeLabel === 'function'
                    ? formatMinPolygonEdgeLabel()
                    : '1.1mm';
                if (typeof showToast === 'function') {
                    showToast('Cạnh tối thiểu ' + minLabel + ' — đặt đỉnh xa hơn', 'error');
                }
                return;
            }
        }
        isDrawingPolygon = true;
        polygonPoints.push(newPt);
        draw();
    }

    // --- TOOL: VẼ CỬA ---
    else if (currentTool === 'door') {
        saveState();
        var door = createDoor(world.x, world.y);
        setEditorSelection('door', door);
    }

    // --- TOOL: VẼ TƯỜNG (PolylineTool V4 + commit từng đoạn) ---
    else if (currentTool === 'wall') {
        if (typeof handleWallVertex === 'function') {
            handleWallVertex(world, snapOpts);
        }
        draw();
    }

    // --- TOOL: VẼ ĐOẠN THẲNG (LineTool V4: 2 click → 1 đoạn) ---
    else if (currentTool === 'line') {
        if (typeof handleLineVertex === 'function') {
            handleLineVertex(world, snapOpts);
        }
        draw();
    }

    // --- TOOL: VẼ CUNG TRÒN (Arc — 3 điểm) ---
    else if (currentTool === 'arc') {
        if (typeof handleArcClick === 'function') {
            handleArcClick(snappedX, snappedY);
        }
        draw();
    }
    // --- TOOL: VẼ ELIP (Ellipse — tâm + 2 trục) ---
    else if (currentTool === 'ellipse') {
        if (typeof handleEllipseClick === 'function') {
            handleEllipseClick(snappedX, snappedY);
        }
        draw();
    }
    // --- TOOL: ĐA GIÁC ĐỀU (Polygon / POL) ---
    else if (currentTool === 'regpoly') {
        if (typeof handleRegpolyClick === 'function') {
            handleRegpolyClick(snappedX, snappedY);
        }
        draw();
    }
    // --- TOOL: ĐIỂM MỐC (Point / PO) ---
    else if (currentTool === 'point') {
        if (typeof handlePointClick === 'function') {
            handlePointClick(snappedX, snappedY);
        }
        draw();
    }

    // --- TOOL: ALIGN (AL — 2 cặp điểm) ---
    else if (currentTool === 'align') {
        if (typeof handleAlignClick === 'function') {
            handleAlignClick(snappedX, snappedY);
        }
        draw();
    }

    // --- TOOL: EXPLODE (X — phá block/polyline) ---
    else if (currentTool === 'explode') {
        if (typeof handleExplodeClick === 'function') {
            handleExplodeClick(snappedX, snappedY);
        }
    }

    // --- TOOL: OFFSET (O — bản song song) ---
    else if (currentTool === 'offset') {
        if (typeof handleOffsetClick === 'function') {
            handleOffsetClick(snappedX, snappedY);
        }
    }

    // --- TOOL: JOIN (J — nối 2 đối tượng) ---
    else if (currentTool === 'join') {
        if (typeof handleJoinClick === 'function') {
            handleJoinClick(snappedX, snappedY);
        }
    }

    // --- TOOL: VẼ POI ---
    else if (currentTool === 'poi') {
        saveState();
        var poi = createPoi(world.x, world.y);
        setEditorSelection('poi', poi);
    }

    // --- TOOL: VẼ QR CODE ---
    else if (currentTool === 'qr') {
        saveState();
        var qr = createQr(world.x, world.y);
        setEditorSelection('qr', qr);
    }

    // --- TOOL: PATH ---
    else if (currentTool === 'path') {
        var clickedNode = findNodeAt(world.x, world.y);
        if (clickedNode) {
            // Click vào node đã có: Nối nếu đã chọn 1 node trước đó, hoặc chọn node này làm điểm bắt đầu
            if (firstNodeForEdge && firstNodeForEdge.id !== clickedNode.id) {
                saveState();
                connectNodes(firstNodeForEdge, clickedNode);
                firstNodeForEdge = clickedNode; // Giữ lại để nối tiếp
            } else {
                firstNodeForEdge = clickedNode;
            }
            setEditorSelection('node', clickedNode, { skipUi: true });
        } else {
            // Click vào chỗ trống: Tạo node mới và tự động nối với node trước đó (nếu có)
            saveState();
            var newNode = createPathNode(world.x, world.y);
            if (firstNodeForEdge) {
                connectNodes(firstNodeForEdge, newNode);
            }
            firstNodeForEdge = newNode; // Đặt node mới làm điểm chờ để nối tiếp
            setEditorSelection('node', newNode, { skipUi: true });
        }
        updatePropertiesPanel();
        updateObjectList();
        draw();
    }

    // --- TOOL: THƯỚC ĐO (RULER) ---
    else if (currentTool === 'ruler') {
        lastDistMeasure = null;
        isDrawingRuler = true;
        rulerStart = { x: snappedX, y: snappedY };
        rulerEnd = { x: snappedX, y: snappedY };
        draw();
    }

    // --- TOOL: AREA (AA) ---
    else if (currentTool === 'area') {
        handleAreaPointerDown(snappedX, snappedY, world.x, world.y);
    }

    // --- TOOL: HATCH (H) ---
    else if (currentTool === 'hatch') {
        handleHatchPointerDown(snappedX, snappedY, world.x, world.y);
    }
    else if (currentTool === 'hatchedit') {
        handleHatcheditPointerDown(snappedX, snappedY, world.x, world.y);
    }

    // --- TOOL: CALIBRATE (CAL) ---
    else if (currentTool === 'calibrate') {
        if (typeof handleCalibratePointerDown === 'function') {
            handleCalibratePointerDown(snappedX, snappedY);
        }
    }

    // --- TOOL: CROP NỀN ---
    else if (currentTool === 'bg-crop') {
        if (typeof handleCropPointerDown === 'function') {
            handleCropPointerDown(snappedX, snappedY);
        }
    }

    // --- TOOL: NẮN PHỐI CẢNH NỀN ---
    else if (currentTool === 'bg-warp') {
        if (typeof handleWarpPointerDown === 'function') {
            handleWarpPointerDown(snappedX, snappedY);
        }
    }

    // --- TOOL: CHỈNH ẢNH NỀN ---
    else if (currentTool === 'bg-adjust') {
        window.isDraggingBg = true;
        window.bgLastX = world.x;
        window.bgLastY = world.y;
    }

    // --- TOOL: BOUNDARY (BO) — tạo vùng kín từ tường/đoạn bao quanh ---
    else if (currentTool === 'boundary') {
        if (typeof runBoundaryAt === 'function') runBoundaryAt(world.x, world.y);
    }

    // --- TOOL: CHỌN ---
    else if (currentTool === 'select') {
        // Handle xoay phòng (icon trên đầu)
        if (selectedRoom && typeof hitRoomRotateHandle === 'function'
            && hitRoomRotateHandle(world.x, world.y, selectedRoom)) {
            saveState();
            isRotatingRoom = true;
            window.isRotatingRoom = true;
            roomRotateCenter = getRoomCenter(selectedRoom);
            roomRotateLastAngle = Math.atan2(
                world.y - roomRotateCenter.y,
                world.x - roomRotateCenter.x
            );
            window.liveRoomRotateDeg = selectedRoom.rotationDeg || 0;
            return;
        }

        // Handle xoay đoạn thẳng / tường (giống phòng)
        if (selectedObject && (selectedObject.type === 'line' || selectedObject.type === 'wall')
            && typeof hitSegmentRotateHandle === 'function'
            && hitSegmentRotateHandle(world.x, world.y, selectedObject.data)) {
            if (typeof blockIfObjectLayerLocked === 'function'
                && blockIfObjectLayerLocked(selectedObject.data, 'xoay')) {
                return;
            }
            saveState();
            isRotatingSegment = true;
            window.isRotatingSegment = true;
            segmentRotateType = selectedObject.type;
            segmentRotateCenter = typeof getPolylineCentroid === 'function'
                ? getPolylineCentroid(selectedObject.data)
                : { x: world.x, y: world.y };
            segmentRotateLastAngle = Math.atan2(
                world.y - segmentRotateCenter.y,
                world.x - segmentRotateCenter.x
            );
            window.liveSegmentRotateDeg = typeof getPolylineHeadingDeg === 'function'
                ? getPolylineHeadingDeg(selectedObject.data) : 0;
            if (selectedObject.data.rotationDeg == null) {
                selectedObject.data.rotationDeg = window.liveSegmentRotateDeg;
            }
            return;
        }

        // Kéo đỉnh đoạn/tường khi đang chọn (không cần lệnh PE)
        if (selectedObject && (selectedObject.type === 'line' || selectedObject.type === 'wall')
            && selectedObject.data.type !== 'arc' && selectedObject.data.type !== 'ellipse'
            && typeof hitPolylineVertex === 'function') {
            var sv = hitPolylineVertex(world.x, world.y, selectedObject.data);
            if (sv >= 0) {
                if (typeof blockIfObjectLayerLocked === 'function'
                    && blockIfObjectLayerLocked(selectedObject.data, 'sửa đỉnh')) {
                    return;
                }
                saveState();
                isDraggingSegVertex = true;
                draggingSegVertexIndex = sv;
                return;
            }
        }

        // Kiểm tra kéo đỉnh polygon
        if (selectedRoom && selectedRoom.shape === 'polygon' && selectedRoom.points) {
            var vtxThreshold = 8 / zoom;
            for (var vi = 0; vi < selectedRoom.points.length; vi++) {
                if (Math.abs(world.x - selectedRoom.points[vi].x) < vtxThreshold &&
                    Math.abs(world.y - selectedRoom.points[vi].y) < vtxThreshold) {
                    saveState();
                    isDraggingVertex = true;
                    draggingVertexIndex = vi;
                    return;
                }
            }
        }

        // Kiểm tra resize handle (rect/circle)
        if (selectedRoom) {
            var handle = getResizeHandle(world.x, world.y, selectedRoom);
            if (handle) {
                saveState();
                isResizing = true;
                resizeHandle = handle;
                resizeStartRoom = {};
                for (var k in selectedRoom) resizeStartRoom[k] = selectedRoom[k];
                return;
            }
        }

        // Tìm đối tượng: node > qr > poi > door > wall > room
        var pickType = null;
        var pickData = null;
        var clickedNode2 = findNodeAt(world.x, world.y);
        if (clickedNode2) {
            pickType = 'node';
            pickData = clickedNode2;
        } else {
            var clickedQr = findQrAt(world.x, world.y);
            if (clickedQr) {
                pickType = 'qr';
                pickData = clickedQr;
            } else {
                var clickedPoi = findPoiAt(world.x, world.y);
                if (clickedPoi) {
                    pickType = 'poi';
                    pickData = clickedPoi;
                } else {
                    var clickedCadPt = typeof findCadPointAt === 'function'
                        ? findCadPointAt(world.x, world.y) : null;
                    if (clickedCadPt) {
                        pickType = 'point';
                        pickData = clickedCadPt;
                    } else {
                    var clickedBlock = typeof findBlockInsertAt === 'function'
                        ? findBlockInsertAt(world.x, world.y) : null;
                    if (clickedBlock) {
                        saveState();
                        pickType = 'blockRef';
                        pickData = clickedBlock;
                        if (!(typeof legacyIsObjectLayerLocked === 'function' && legacyIsObjectLayerLocked(clickedBlock))) {
                            isDragging = true;
                            dragOffsetX = world.x - clickedBlock.x;
                            dragOffsetY = world.y - clickedBlock.y;
                        } else if (typeof showToast === 'function') {
                            showToast('Block thuộc lớp khóa — chỉ xem, không kéo', 'error');
                        }
                    } else {
                    var clickedDoor = findDoorAt(world.x, world.y);
                    if (clickedDoor) {
                        // Kiểm tra nhấp vào Handle của cửa
                        if (typeof getDoorHandles === 'function') {
                            var handles = getDoorHandles(clickedDoor);
                            var threshold = 10 / zoom;
                            for (var side in handles) {
                                if (Math.abs(world.x - handles[side].x) < threshold &&
                                    Math.abs(world.y - handles[side].y) < threshold) {
                                    saveState();
                                    if (side === 'rotate') {
                                        isRotatingDoor = true;
                                    } else {
                                        isResizingDoor = true;
                                        resizeDoorSide = side;
                                    }
                                    setEditorSelection('door', clickedDoor);
                                    return;
                                }
                            }
                        }

                        saveState();
                        pickType = 'door';
                        pickData = clickedDoor;
                        if (!(typeof legacyIsObjectLayerLocked === 'function' && legacyIsObjectLayerLocked(clickedDoor))) {
                            isDragging = true;
                            dragOffsetX = world.x - clickedDoor.x;
                            dragOffsetY = world.y - clickedDoor.y;
                        } else if (typeof showToast === 'function') {
                            showToast('Cửa thuộc lớp khóa — chỉ xem, không kéo', 'error');
                        }
                    } else {
                        var clickedLine = typeof findLineAt === 'function' ? findLineAt(world.x, world.y) : null;
                        if (clickedLine) {
                            saveState();
                            pickType = 'line';
                            pickData = clickedLine;
                            if (!(typeof legacyIsObjectLayerLocked === 'function' && legacyIsObjectLayerLocked(clickedLine))) {
                                isDragging = true;
                                var lineAnchor = (typeof getPolylineCentroid === 'function')
                                    ? getPolylineCentroid(clickedLine)
                                    : (clickedLine.points && clickedLine.points[0]) || { x: world.x, y: world.y };
                                dragOffsetX = world.x - lineAnchor.x;
                                dragOffsetY = world.y - lineAnchor.y;
                            } else if (typeof showToast === 'function') {
                                showToast('Đoạn thuộc lớp khóa — chỉ xem, không kéo', 'error');
                            }
                        } else {
                        var clickedDim = typeof findDimensionAt === 'function'
                            ? findDimensionAt(world.x, world.y) : null;
                        if (clickedDim) {
                            saveState();
                            pickType = 'dimension';
                            pickData = clickedDim;
                            isDraggingDim = true;
                        } else {
                        var clickedWall = findWallAt(world.x, world.y);
                        if (clickedWall) {
                            saveState();
                            pickType = 'wall';
                            pickData = clickedWall;
                            if (!(typeof legacyIsObjectLayerLocked === 'function' && legacyIsObjectLayerLocked(clickedWall))) {
                                isDragging = true;
                                var wallAnchor = (typeof getPolylineCentroid === 'function')
                                    ? getPolylineCentroid(clickedWall)
                                    : (clickedWall.points && clickedWall.points[0]) || { x: world.x, y: world.y };
                                dragOffsetX = world.x - wallAnchor.x;
                                dragOffsetY = world.y - wallAnchor.y;
                            } else if (typeof showToast === 'function') {
                                showToast('Tường thuộc lớp khóa — chỉ xem, không kéo', 'error');
                            }
                        } else {
                            var clickedRoom = findRoomAt(world.x, world.y);
                            if (clickedRoom) {
                                saveState();
                                pickType = 'room';
                                pickData = clickedRoom;
                                if (!(typeof legacyIsObjectLayerLocked === 'function' && legacyIsObjectLayerLocked(clickedRoom))) {
                                    isDragging = true;
                                    dragOffsetX = world.x - clickedRoom.x;
                                    dragOffsetY = world.y - clickedRoom.y;
                                } else if (typeof showToast === 'function') {
                                    showToast('Phòng thuộc lớp khóa — chỉ xem, không kéo', 'error');
                                }
                            } else {
                                isDragging = false;
                            }
                        }
                        }
                        }
                    }
                    }
                    }
                }
            }
        }
        // Đợt 3 — chọn nhiều / nhóm / quét chọn
        if (typeof msHandlePick === 'function') {
            var msHandled = msHandlePick(pickType, pickData, e);
            if (msHandled) {
                if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
                if (typeof updateObjectList === 'function') updateObjectList();
                draw();
                return;
            }
            if (!pickData) {
                // Click vào vùng trống → bắt đầu quét chọn (marquee), dựng tập khi thả chuột
                msStartMarquee(world);
                setEditorSelection(null, null);
                return;
            }
        }
        setEditorSelection(pickType, pickData);
    }
}

// ============================================================
// MOUSE MOVE
// ============================================================
function handleMouseMove(e, world) {
    if (editorLocked()) return;

    // Đợt 3 — quét chọn (marquee) đang hoạt động
    if (window.isMarquee && typeof msUpdateMarquee === 'function') {
        msUpdateMarquee(world);
        if (typeof scheduleDragDraw === 'function') scheduleDragDraw(); else draw();
        return;
    }

    var busyDrag = isDragging || isDraggingDim || isResizing || isResizingDoor || isRotatingDoor
        || isRotatingRoom || isRotatingSegment || isDraggingVertex || isDraggingSegVertex
        || window.isDraggingBg;

    var snapOpts = typeof getSnapOpts === 'function' ? getSnapOpts(e) : undefined;
    if (typeof enrichSnapOpts === 'function') {
        snapOpts = enrichSnapOpts(snapOpts, currentTool);
    }
    var snapped = snapWorldPoint(world.x, world.y, snapOpts);
    var snappedX = snapped.x;
    var snappedY = snapped.y;

    if (!busyDrag && typeof updateSnapHint === 'function') {
        updateSnapHint(world.x, world.y, currentTool, function (x, y) {
            return snapWorldPoint(x, y, snapOpts);
        });
    }

    // Kéo ảnh nền
    if (window.isDraggingBg && currentTool === 'bg-adjust') {
        var dx = world.x - window.bgLastX;
        var dy = world.y - window.bgLastY;
        window.bgX += dx;
        window.bgY += dy;
        window.bgLastX = world.x;
        window.bgLastY = world.y;
        scheduleDragDraw();
        return;
    }

    // Đang vẽ rect hoặc circle
    if (isDrawing && (currentTool === 'room' || currentTool === 'circle')) {
        drawCurrentX = snappedX;
        drawCurrentY = snappedY;
        draw();
        return;
    }

    // Kéo đỉnh polygon
    if (isDraggingVertex && selectedRoom && selectedRoom.shape === 'polygon') {
        var clamped = (typeof clampPolygonVertexPosition === 'function')
            ? clampPolygonVertexPosition(selectedRoom, draggingVertexIndex, world.x, world.y)
            : { x: world.x, y: world.y };
        selectedRoom.points[draggingVertexIndex].x = clamped.x;
        selectedRoom.points[draggingVertexIndex].y = clamped.y;
        if (typeof updatePolygonBoundingBox === 'function') {
            updatePolygonBoundingBox(selectedRoom);
        } else {
            var minX = selectedRoom.points[0].x, maxX = minX;
            var minY = selectedRoom.points[0].y, maxY = minY;
            for (var i = 1; i < selectedRoom.points.length; i++) {
                if (selectedRoom.points[i].x < minX) minX = selectedRoom.points[i].x;
                if (selectedRoom.points[i].x > maxX) maxX = selectedRoom.points[i].x;
                if (selectedRoom.points[i].y < minY) minY = selectedRoom.points[i].y;
                if (selectedRoom.points[i].y > maxY) maxY = selectedRoom.points[i].y;
            }
            selectedRoom.x = minX; selectedRoom.y = minY;
            selectedRoom.width = maxX - minX; selectedRoom.height = maxY - minY;
        }
        scheduleDragDraw();
        return;
    }

    // Kéo offset dim (DIMEdit / chọn dim bằng V)
    if (isDraggingDim && selectedObject && selectedObject.type === 'dimension') {
        applyDimensionOffsetAt(selectedObject.data, world.x, world.y);
        scheduleDragDraw();
        return;
    }

    // Kéo đối tượng (Phòng / Cửa / Block) — tắt OSNAP + không rebuild panel mỗi frame
    if (isDragging) {
        var dragOpts = getDragSnapOpts(e);
        // Đợt 3 — nếu đang chọn nhiều, ghi lại vị trí primary trước khi dịch để đồng bộ cả tập
        var msOthers = (typeof msDragOthers === 'function') ? msDragOthers() : null;
        var msPrim = (msOthers && msOthers.length && typeof msPrimaryRef === 'function') ? msPrimaryRef() : null;
        var msBefore = (msPrim && typeof msAnchor === 'function') ? msAnchor(msPrim.type, msPrim.data) : null;
        if (selectedRoom) {
            var dragPt = snapWorldPoint(world.x - dragOffsetX, world.y - dragOffsetY, dragOpts);
            var newX = dragPt.x;
            var newY = dragPt.y;
            var dxR = newX - selectedRoom.x;
            var dyR = newY - selectedRoom.y;
            selectedRoom.x = newX;
            selectedRoom.y = newY;
            if (selectedRoom.shape === 'circle') {
                selectedRoom.cx += dxR;
                selectedRoom.cy += dyR;
            } else if (selectedRoom.shape === 'polygon' && selectedRoom.points) {
                for (var pi = 0; pi < selectedRoom.points.length; pi++) {
                    selectedRoom.points[pi].x += dxR;
                    selectedRoom.points[pi].y += dyR;
                }
            }
        } else if (selectedObject && selectedObject.type === 'door') {
            var door = selectedObject.data;
            var doorPt = snapWorldPoint(world.x - dragOffsetX, world.y - dragOffsetY, dragOpts);
            door.x = doorPt.x;
            door.y = doorPt.y;
        } else if (selectedObject && selectedObject.type === 'blockRef') {
            var blk = selectedObject.data;
            var blkPt = snapWorldPoint(world.x - dragOffsetX, world.y - dragOffsetY, dragOpts);
            blk.x = blkPt.x;
            blk.y = blkPt.y;
        } else if (selectedObject && (selectedObject.type === 'poi' || selectedObject.type === 'qr' || selectedObject.type === 'node' || selectedObject.type === 'point')) {
            var ptObj = selectedObject.data;
            var moved = snapWorldPoint(world.x - dragOffsetX, world.y - dragOffsetY, dragOpts);
            ptObj.x = moved.x;
            ptObj.y = moved.y;
        } else if (selectedObject && (selectedObject.type === 'line' || selectedObject.type === 'wall')
            && selectedObject.data && selectedObject.data.points) {
            var poly = selectedObject.data;
            var curC = (typeof getPolylineCentroid === 'function')
                ? getPolylineCentroid(poly)
                : poly.points[0];
            var target = snapWorldPoint(world.x - dragOffsetX, world.y - dragOffsetY, dragOpts);
            var dxP = target.x - curC.x;
            var dyP = target.y - curC.y;
            if (Math.abs(dxP) > 1e-9 || Math.abs(dyP) > 1e-9) {
                if (window.EditorCore && EditorCore.ObjectTransform) {
                    EditorCore.ObjectTransform.translateObject(selectedObject.type, poly, dxP, dyP);
                } else {
                    for (var pj = 0; pj < poly.points.length; pj++) {
                        poly.points[pj].x += dxP;
                        poly.points[pj].y += dyP;
                    }
                }
            }
        }
        // Đợt 3 — dịch các thành viên còn lại của tập theo delta của primary
        if (msOthers && msOthers.length && msBefore) {
            var msAfter = msAnchor(msPrim.type, msPrim.data);
            if (msAfter) {
                var mdx = msAfter.x - msBefore.x, mdy = msAfter.y - msBefore.y;
                if (mdx || mdy) {
                    for (var mi = 0; mi < msOthers.length; mi++) {
                        msTranslate(msOthers[mi].type, msOthers[mi].data, mdx, mdy);
                    }
                }
            }
        }
        scheduleDragDraw();
        return;
    }

    // Resize Phòng
    if (isResizing && selectedRoom && resizeStartRoom) {
        resizeRoom(snappedX, snappedY);
        scheduleDragDraw();
        return;
    }

    // Resize Cửa
    if (isResizingDoor && selectedObject && selectedObject.type === 'door') {
        var doorSz = selectedObject.data;
        var dxSz = world.x - doorSz.x;
        var dySz = world.y - doorSz.y;
        var newWidth;
        if (doorSz.rotation === 0 || doorSz.rotation === 180) {
            newWidth = Math.abs(dxSz) * 2;
        } else {
            newWidth = Math.abs(dySz) * 2;
        }
        doorSz.width = Math.max(10, Math.round(newWidth));
        scheduleDragDraw();
        return;
    }

    // Xoay Cửa
    if (isRotatingDoor && selectedObject && selectedObject.type === 'door') {
        var doorRot = selectedObject.data;
        var dxRot = world.x - doorRot.x;
        var dyRot = world.y - doorRot.y;
        var angle = Math.atan2(dyRot, dxRot) * 180 / Math.PI;
        doorRot.rotation = (Math.round(angle) + 90 + 360) % 360;
        scheduleDragDraw();
        return;
    }

    // Xoay Phòng (handle)
    if (isRotatingRoom && selectedRoom && roomRotateCenter
        && window.EditorCore && EditorCore.ObjectTransform) {
        var ang = Math.atan2(world.y - roomRotateCenter.y, world.x - roomRotateCenter.x);
        var delta = ang - roomRotateLastAngle;
        if (Math.abs(delta) > 1e-6) {
            EditorCore.ObjectTransform.rotateObject(
                'room', selectedRoom,
                roomRotateCenter.x, roomRotateCenter.y, delta
            );
            selectedRoom.rotationDeg = (((selectedRoom.rotationDeg || 0) + delta * 180 / Math.PI) % 360 + 360) % 360;
            window.liveRoomRotateDeg = selectedRoom.rotationDeg;
            roomRotateLastAngle = ang;
            roomRotateCenter = getRoomCenter(selectedRoom);
        }
        scheduleDragDraw();
        return;
    }

    // Xoay đoạn thẳng / tường (handle)
    if (isRotatingSegment && selectedObject
        && (selectedObject.type === 'line' || selectedObject.type === 'wall')
        && segmentRotateCenter && window.EditorCore && EditorCore.ObjectTransform) {
        var angS = Math.atan2(world.y - segmentRotateCenter.y, world.x - segmentRotateCenter.x);
        var deltaS = angS - segmentRotateLastAngle;
        if (Math.abs(deltaS) > 1e-6) {
            EditorCore.ObjectTransform.rotateObject(
                selectedObject.type, selectedObject.data,
                segmentRotateCenter.x, segmentRotateCenter.y, deltaS
            );
            segmentRotateLastAngle = angS;
            segmentRotateCenter = typeof getPolylineCentroid === 'function'
                ? getPolylineCentroid(selectedObject.data) : segmentRotateCenter;
            if (typeof getPolylineHeadingDeg === 'function') {
                delete selectedObject.data.rotationDeg;
                selectedObject.data.rotationDeg = getPolylineHeadingDeg(selectedObject.data);
            }
            window.liveSegmentRotateDeg = selectedObject.data.rotationDeg;
        }
        scheduleDragDraw();
        return;
    }

    // Kéo đỉnh line/wall (tool Chọn)
    if (isDraggingSegVertex && selectedObject
        && (selectedObject.type === 'line' || selectedObject.type === 'wall')
        && selectedObject.data.points
        && draggingSegVertexIndex >= 0
        && selectedObject.data.points[draggingSegVertexIndex]) {
        selectedObject.data.points[draggingSegVertexIndex].x = snappedX;
        selectedObject.data.points[draggingSegVertexIndex].y = snappedY;
        if (selectedObject.data.rotationDeg != null) {
            delete selectedObject.data.rotationDeg; // góc đổi theo hình
        }
        scheduleDragDraw();
        return;
    }

    // Thước đo
    // Preview Dist (kéo điểm 2)
    if (isDrawingRuler) {
        rulerEnd = { x: snappedX, y: snappedY };
        draw();
        return;
    }

    // Preview Area (rubber-band)
    if (currentTool === 'area' && isDrawingArea) {
        areaPreview = { x: snappedX, y: snappedY };
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        draw();
        return;
    }

    // Preview Calibrate
    if (currentTool === 'calibrate' && typeof handleCalibratePointerMove === 'function'
        && typeof isCalibrating === 'function' && isCalibrating()) {
        handleCalibratePointerMove(snappedX, snappedY);
        draw();
        return;
    }

    // Preview Crop
    if (currentTool === 'bg-crop' && typeof handleCropPointerMove === 'function'
        && typeof isCropDragging === 'function' && isCropDragging()) {
        handleCropPointerMove(snappedX, snappedY);
        draw();
        return;
    }

    // Preview Dimlinear / Dimaligned
    if (currentTool === 'dimlinear' && typeof updateDimlinearPreview === 'function') {
        updateDimlinearPreview(snappedX, snappedY);
        draw();
        return;
    }
    if (currentTool === 'dimaligned' && typeof updateDimalignedPreview === 'function') {
        updateDimalignedPreview(snappedX, snappedY);
        draw();
        return;
    }
    if ((currentTool === 'dimcontinue' || currentTool === 'dimbaseline' || currentTool === 'dimangular'
        || currentTool === 'dimradius' || currentTool === 'dimdiameter')
        && typeof updateDimGenericPreview === 'function') {
        updateDimGenericPreview(currentTool, snappedX, snappedY);
        draw();
        return;
    }

    // Preview tường (PolylineTool)
    if (currentTool === 'wall' && window.EditorCore && EditorCore.PolylineTool) {
        if (EditorCore.PolylineTool.getState() === 'drawing') {
            EditorCore.PolylineTool.onPointerMove({
                worldX: world.x,
                worldY: world.y,
                snapOpts: snapOpts
            });
            draw();
            return;
        }
    }

    // Preview elip (Ellipse)
    if (currentTool === 'ellipse' && typeof updateEllipsePreview === 'function') {
        updateEllipsePreview(snappedX, snappedY);
        draw();
    }
    if (currentTool === 'regpoly' && typeof updateRegpolyPreview === 'function') {
        updateRegpolyPreview(snappedX, snappedY);
        draw();
    }
    // Preview cung tròn (Arc)
    if (currentTool === 'arc' && typeof updateArcPreview === 'function') {
        updateArcPreview(snappedX, snappedY);
        draw();
    }

    // Preview Offset
    if (currentTool === 'offset' && typeof updateOffsetPreview === 'function') {
        updateOffsetPreview(snappedX, snappedY);
        draw();
    }

    // Preview Align
    if (currentTool === 'align' && typeof updateAlignPreview === 'function') {
        updateAlignPreview(snappedX, snappedY);
        draw();
    }

    // Preview đoạn thẳng (LineTool)
    if (currentTool === 'line' && window.EditorCore && EditorCore.LineTool) {
        if (EditorCore.LineTool.getState() === 'drawing') {
            EditorCore.LineTool.onPointerMove({
                worldX: world.x,
                worldY: world.y,
                snapOpts: snapOpts
            });
            draw();
            return;
        }
    }

    // Phase 2 ModifySession preview
    if (typeof isModifyTool === 'function' && isModifyTool(currentTool)
        && window.EditorCore && EditorCore.ModifySession) {
        EditorCore.ModifySession.onPointerMove({ x: snappedX, y: snappedY });
        if (typeof updateModifyHint === 'function') updateModifyHint();
        draw();
        return;
    }

    // Cursor hover
    if (currentTool === 'select' && !isDragging && !isResizing && !isResizingDoor) {
        // Ưu tiên Room Handles
        if (selectedRoom) {
            var handle = getResizeHandle(world.x, world.y, selectedRoom);
            if (handle) {
                var cursors = {
                    'nw': 'nw-resize', 'n': 'n-resize', 'ne': 'ne-resize',
                    'e': 'e-resize', 'se': 'se-resize', 's': 's-resize',
                    'sw': 'sw-resize', 'w': 'w-resize'
                };
                wrapper.style.cursor = cursors[handle] || 'default';
                return;
            }
        }

        // Kiểm tra Door Handles
        if (selectedObject && selectedObject.type === 'door') {
            var handles = getDoorHandles(selectedObject.data);
            var threshold = 10 / zoom;
            for (var side in handles) {
                if (Math.abs(world.x - handles[side].x) < threshold &&
                    Math.abs(world.y - handles[side].y) < threshold) {
                    if (side === 'rotate') {
                        wrapper.style.cursor = 'crosshair'; // Icon xoay
                    } else {
                        var isVert = selectedObject.data.rotation === 90 || selectedObject.data.rotation === 270;
                        wrapper.style.cursor = isVert ? 'n-resize' : 'e-resize';
                    }
                    return;
                }
            }
        }

        // Kiểm tra Move cursor
        if (selectedRoom && typeof hitRoomRotateHandle === 'function'
            && hitRoomRotateHandle(world.x, world.y, selectedRoom)) {
            wrapper.style.cursor = 'grab';
            return;
        }
        if (findRoomAt(world.x, world.y) || findDoorAt(world.x, world.y)
            || (typeof findLineAt === 'function' && findLineAt(world.x, world.y))
            || (typeof findWallAt === 'function' && findWallAt(world.x, world.y))) {
            wrapper.style.cursor = 'move';
        } else if (selectedObject && (selectedObject.type === 'line' || selectedObject.type === 'wall')
            && typeof hitSegmentRotateHandle === 'function'
            && hitSegmentRotateHandle(world.x, world.y, selectedObject.data)) {
            wrapper.style.cursor = 'grab';
        } else if (selectedObject && (selectedObject.type === 'line' || selectedObject.type === 'wall')
            && typeof hitPolylineVertex === 'function'
            && hitPolylineVertex(world.x, world.y, selectedObject.data) >= 0) {
            wrapper.style.cursor = 'crosshair';
        } else {
            wrapper.style.cursor = 'default';
        }
    }

    // Repaint OSNAP marker khi rê chuột (tool vẽ + Chọn)
    var snapRepaintTools = ['select', 'wall', 'line', 'arc', 'ellipse', 'regpoly', 'point', 'align', 'room', 'circle', 'door', 'poi', 'path', 'ruler', 'area', 'polygon', 'dimlinear', 'dimaligned', 'dimedit',
        'dimcontinue', 'dimbaseline', 'dimangular', 'dimradius', 'dimdiameter',
        'move', 'copy', 'rotate', 'scale', 'mirror', 'trim', 'extend', 'fillet', 'chamfer', 'break', 'pedit', 'mline', 'array', 'matchprop', 'explode', 'offset', 'join',
        'divide', 'calibrate', 'bg-crop', 'bg-adjust', 'bg-warp'];
    if (snapRepaintTools.indexOf(currentTool) >= 0) {
        if (currentTool === 'polygon' && isDrawingPolygon && typeof updatePropertiesPanel === 'function') {
            updatePropertiesPanel();
        }
        draw();
    }

    if (window.DynamicInputUI && typeof window.DynamicInputUI.updateVisibility === 'function') {
        window.DynamicInputUI.updateVisibility();
    }
}

// ============================================================
// MOUSE UP
// ============================================================
function handleLeftMouseUp(e) {
    if (editorLocked()) return;

    // Đợt 3 — hoàn tất quét chọn (marquee)
    if (window.isMarquee && typeof msFinishMarquee === 'function') {
        msFinishMarquee();
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof updateObjectList === 'function') updateObjectList();
        return;
    }

    if (typeof isModifyTool === 'function' && isModifyTool(currentTool)
        && window.EditorCore && EditorCore.ModifySession) {
        EditorCore.ModifySession.onPointerUp();
        if (typeof updateModifyHint === 'function') updateModifyHint();
        draw();
    }

    if (currentTool === 'bg-crop' && typeof handleCropPointerUp === 'function'
        && typeof isCropDragging === 'function' && isCropDragging()) {
        var wx = (window.lastMouseWorld && window.lastMouseWorld.x != null) ? window.lastMouseWorld.x : null;
        var wy = (window.lastMouseWorld && window.lastMouseWorld.y != null) ? window.lastMouseWorld.y : null;
        if (wx == null || wy == null) {
            var worldUp = screenToWorld(
                e.offsetX != null ? e.offsetX : 0,
                e.offsetY != null ? e.offsetY : 0
            );
            wx = worldUp.x;
            wy = worldUp.y;
        }
        var snapOptsUp = typeof getSnapOpts === 'function' ? getSnapOpts(e) : undefined;
        var snappedUp = snapWorldPoint(wx, wy, snapOptsUp);
        handleCropPointerUp(snappedUp.x, snappedUp.y);
    }

    // Kết thúc vẽ rect
    if (isDrawing && currentTool === 'room') {
        saveState();
        isDrawing = false;
        var newRoom = createRoom(drawStartX, drawStartY, drawCurrentX, drawCurrentY);
        if (newRoom) {
            rooms.push(newRoom);
            setEditorSelection('room', newRoom, { skipUi: true });
            updatePropertiesPanel();
            updateObjectList();
            roomCountSpan.textContent = 'Phòng: ' + rooms.length;
        }
        draw();
    }

    // Kết thúc vẽ circle
    if (isDrawing && currentTool === 'circle') {
        saveState();
        isDrawing = false;
        var dx = drawCurrentX - drawStartX;
        var dy = drawCurrentY - drawStartY;
        var radius = Math.sqrt(dx * dx + dy * dy);
        var newCircle = createCircleRoom(drawStartX, drawStartY, radius);
        if (newCircle) {
            rooms.push(newCircle);
            setEditorSelection('room', newCircle, { skipUi: true });
            updatePropertiesPanel();
            updateObjectList();
            roomCountSpan.textContent = 'Phòng: ' + rooms.length;
        }
        draw();
    }

    var finishedTransform = isDragging || isDraggingDim || isResizing || isResizingDoor || isRotatingDoor
        || isRotatingRoom || isRotatingSegment || isDraggingVertex || isDraggingSegVertex
        || window.isDraggingBg;

    if (isDraggingVertex) {
        isDraggingVertex = false;
        draggingVertexIndex = -1;
    }

    if (isDraggingSegVertex) {
        isDraggingSegVertex = false;
        draggingSegVertexIndex = -1;
        if (selectedObject && selectedObject.data && typeof getPolylineHeadingDeg === 'function') {
            selectedObject.data.rotationDeg = getPolylineHeadingDeg(selectedObject.data);
        }
    }

    isDragging = false;
    isDraggingDim = false;
    window.isDraggingBg = false;
    isResizing = false;
    isResizingDoor = false;
    isRotatingDoor = false;
    isRotatingRoom = false;
    window.isRotatingRoom = false;
    window.liveRoomRotateDeg = null;
    roomRotateCenter = null;
    isRotatingSegment = false;
    window.isRotatingSegment = false;
    window.liveSegmentRotateDeg = null;
    segmentRotateCenter = null;
    segmentRotateType = null;

    // Cập nhật panel + spatial index 1 lần sau khi thả (không làm mỗi frame khi kéo)
    if (finishedTransform) {
        if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof draw === 'function') draw();
    }

    // Kết thúc Dist (DI) — đo 2 điểm, KHÔNG đổi metersPerGrid
    if (isDrawingRuler) {
        isDrawingRuler = false;
        var distApi = (typeof EditorCore !== 'undefined' && EditorCore.DistMeasure)
            ? EditorCore.DistMeasure : null;
        var mpg = typeof metersPerGrid !== 'undefined' ? metersPerGrid : 0.5;
        var gs = typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40;
        var result = distApi
            ? distApi.measure(rulerStart, rulerEnd, mpg, gs)
            : null;
        if (!result) {
            var dx0 = rulerEnd.x - rulerStart.x;
            var dy0 = rulerEnd.y - rulerStart.y;
            var dPx = Math.sqrt(dx0 * dx0 + dy0 * dy0);
            if (dPx > 5 && typeof pixelsToMeters === 'function') {
                result = {
                    p1: { x: rulerStart.x, y: rulerStart.y },
                    p2: { x: rulerEnd.x, y: rulerEnd.y },
                    distPx: dPx,
                    distM: pixelsToMeters(dPx),
                    dxPx: dx0,
                    dyPx: dy0,
                    dxM: pixelsToMeters(dx0),
                    dyM: pixelsToMeters(dy0),
                    angleDeg: (Math.atan2(dy0, dx0) * 180 / Math.PI + 360) % 360
                };
            }
        }
        if (result) {
            lastDistMeasure = result;
            if (typeof showToast === 'function') {
                var msg = distApi && distApi.formatResult
                    ? distApi.formatResult(result)
                    : ('Khoảng cách: ' + result.distM.toFixed(2) + ' m');
                showToast(msg, 'success');
            }
            if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        } else {
            lastDistMeasure = null;
            if (typeof showToast === 'function') showToast('Hai điểm quá gần — đo lại', 'error');
        }
        // Giữ đoạn đo trên map tới lần Dist tiếp theo / đổi tool
        if (!lastDistMeasure) {
            rulerStart = null;
            rulerEnd = null;
        }
    }

    updateCursor();
    draw();
}

// === AREA (AA) helpers — ephemeral, không lưu document ===
function getAreaCalcApi() {
    return (typeof EditorCore !== 'undefined' && EditorCore.AreaCalc) ? EditorCore.AreaCalc : null;
}

function applyAreaMeasureResult(result) {
    if (!result) return false;
    lastAreaMeasure = result;
    isDrawingArea = false;
    areaPoints = [];
    areaPreview = null;
    var api = getAreaCalcApi();
    if (typeof showToast === 'function') {
        var msg = api && api.formatResult
            ? api.formatResult(result)
            : ('Diện tích: ' + result.areaM2.toFixed(2) + ' m²');
        showToast(msg, 'success');
    }
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof draw === 'function') draw();
    return true;
}

/** Kết thúc đo bằng đa giác đỉnh — đã bỏ (Area ≠ Đa giác G). */
function finishAreaFromPoints() {
    return false;
}
window.finishAreaFromPoints = finishAreaFromPoints;

/** Area (AA): chỉ click phòng có sẵn — khác tool Đa giác (G) tạo phòng. */
function handleAreaPointerDown(snappedX, snappedY, rawX, rawY) {
    var api = getAreaCalcApi();
    var mpg = typeof metersPerGrid !== 'undefined' ? metersPerGrid : 0.5;
    var gs = typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40;

    isDrawingArea = false;
    areaPoints = [];
    areaPreview = null;

    if (typeof findRoomAt !== 'function' || !api) {
        if (typeof showToast === 'function') showToast('Area chưa sẵn sàng', 'error');
        return;
    }

    var room = findRoomAt(rawX, rawY) || findRoomAt(snappedX, snappedY);
    if (!room) {
        lastAreaMeasure = null;
        if (typeof showToast === 'function') {
            showToast('Area: click vào phòng để đo m² (không vẽ đỉnh như Đa giác G)', 'info');
        }
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof draw === 'function') draw();
        return;
    }

    var roomResult = api.measureFromRoom(room, mpg, gs);
    if (!roomResult) {
        if (typeof showToast === 'function') showToast('Không đo được phòng này', 'error');
        return;
    }
    applyAreaMeasureResult(roomResult);
}
window.handleAreaPointerDown = handleAreaPointerDown;

// === HATCH (H) — tô pattern lên phòng ===
function getHatchApi() {
    return (typeof EditorCore !== 'undefined' && EditorCore.Hatch) ? EditorCore.Hatch : null;
}

function getHatchToolStyle() {
    if (!window.hatchToolStyle) {
        window.hatchToolStyle = {
            pattern: 'lines',
            color: '#64748b',
            spacing: 12,
            angle: 45,
            useRoomTypeDefault: true
        };
    }
    return window.hatchToolStyle;
}

function setHatchToolStyleProp(key, value) {
    var st = getHatchToolStyle();
    if (key === 'useRoomTypeDefault') {
        st.useRoomTypeDefault = !!value;
    } else if (key === 'spacing' || key === 'angle') {
        st[key] = Number(value);
    } else {
        st[key] = value;
    }
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
}
window.setHatchToolStyleProp = setHatchToolStyleProp;

function handleHatchPointerDown(snappedX, snappedY, rawX, rawY) {
    var api = getHatchApi();
    if (!api || typeof findRoomAt !== 'function') {
        if (typeof showToast === 'function') showToast('Hatch chưa sẵn sàng', 'error');
        return;
    }
    var room = findRoomAt(rawX, rawY) || findRoomAt(snappedX, snappedY);
    if (!room) {
        if (typeof showToast === 'function') showToast('Hatch: click vào phòng để tô pattern', 'info');
        return;
    }
    if (typeof blockIfObjectLayerLocked === 'function' && blockIfObjectLayerLocked(room, 'tô hatch')) {
        return;
    }

    var st = getHatchToolStyle();
    var style;
    if (st.useRoomTypeDefault) {
        style = api.defaultForRoomType(room.type || 'Khác');
    } else {
        style = api.normalize(st);
    }

    if (typeof saveState === 'function') saveState();
    if (style.pattern === 'none') {
        api.clearFromRoom(room);
        if (typeof showToast === 'function') showToast('Đã xóa hatch: ' + (room.name || 'phòng'), 'success');
    } else {
        api.applyToRoom(room, style);
        if (typeof showToast === 'function') {
            showToast('Hatch «' + style.pattern + '» → ' + (room.name || room.type || 'phòng'), 'success');
        }
    }
    setEditorSelection('room', room, { skipUi: true });
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof draw === 'function') draw();
}
window.handleHatchPointerDown = handleHatchPointerDown;

function handleHatcheditPointerDown(snappedX, snappedY, rawX, rawY) {
    var api = getHatchApi();
    if (!api || typeof findRoomAt !== 'function') {
        if (typeof showToast === 'function') showToast('Hatchedit chưa sẵn sàng', 'error');
        return;
    }
    var room = findRoomAt(rawX, rawY) || findRoomAt(snappedX, snappedY);
    if (!room) {
        if (typeof showToast === 'function') showToast('HE: click phòng có hatch (hoặc chưa có) để sửa', 'info');
        return;
    }
    if (typeof blockIfObjectLayerLocked === 'function' && blockIfObjectLayerLocked(room, 'sửa hatch')) {
        return;
    }
    // Nếu chưa có hatch → tạo mặc định theo loại phòng để có gì mà sửa
    if (!api.hasHatch(room)) {
        if (typeof saveState === 'function') saveState();
        api.applyToRoom(room, api.defaultForRoomType(room.type || 'Khác'));
    }
    setEditorSelection('room', room);
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof draw === 'function') draw();
    if (typeof showToast === 'function') {
        showToast('Hatchedit: sửa pattern/màu/góc trong panel thuộc tính', 'info');
    }
}
window.handleHatcheditPointerDown = handleHatcheditPointerDown;

function clearHatchFromSelectedRoom() {
    var api = getHatchApi();
    var room = (selectedObject && selectedObject.type === 'room') ? selectedObject.data
        : (typeof selectedRoom !== 'undefined' ? selectedRoom : null);
    if (!api || !room) {
        if (typeof showToast === 'function') showToast('Chọn phòng cần xóa hatch', 'error');
        return;
    }
    if (typeof saveState === 'function') saveState();
    api.clearFromRoom(room);
    if (typeof showToast === 'function') showToast('Đã xóa hatch', 'success');
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof draw === 'function') draw();
}
window.clearHatchFromSelectedRoom = clearHatchFromSelectedRoom;
