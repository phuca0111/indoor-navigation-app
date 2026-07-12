// ============================================================
// EVENTS.JS - Xử lý sự kiện chuột: Zoom, Pan, Click, Drag
// ============================================================

// === ZOOM ===
function editorLocked() {
    return (typeof isEditorLocked === 'function') && isEditorLocked();
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
    zoom = Math.max(0.1, Math.min(5, zoom));
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
    if (e.button === 0) handleLeftMouseDown(e);
});

// === MOUSE MOVE ===
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
        room: 1, circle: 1, polygon: 1, door: 1, wall: 1, line: 1, poi: 1, qr: 1, path: 1, mline: 1
    };
    if (drawTools[currentTool] && typeof blockIfActiveLayerLocked === 'function') {
        if (blockIfActiveLayerLocked('vẽ trên lớp này')) return;
    }

    // --- Phase 2: ModifySession (Move/Copy/…/MLine) ---
    if (typeof isModifyTool === 'function' && isModifyTool(currentTool)
        && window.EditorCore && EditorCore.ModifySession) {
        EditorCore.ModifySession.onPointerDown(
            { x: snappedX, y: snappedY },
            { shiftKey: !!e.shiftKey, doubleClick: false }
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
        isDrawingRuler = true;
        rulerStart = { x: world.x, y: world.y };
        rulerEnd = { x: world.x, y: world.y };
        draw();
    }

    // --- TOOL: CHỈNH ẢNH NỀN ---
    else if (currentTool === 'bg-adjust') {
        window.isDraggingBg = true;
        window.bgLastX = world.x;
        window.bgLastY = world.y;
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
                            pickType = 'line';
                            pickData = clickedLine;
                        } else {
                        var clickedWall = findWallAt(world.x, world.y);
                        if (clickedWall) {
                            pickType = 'wall';
                            pickData = clickedWall;
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
        setEditorSelection(pickType, pickData);
    }
}

// ============================================================
// MOUSE MOVE
// ============================================================
function handleMouseMove(e, world) {
    if (editorLocked()) return;
    var snapOpts = typeof getSnapOpts === 'function' ? getSnapOpts(e) : undefined;
    if (typeof enrichSnapOpts === 'function') {
        snapOpts = enrichSnapOpts(snapOpts, currentTool);
    }
    var snapped = snapWorldPoint(world.x, world.y, snapOpts);
    var snappedX = snapped.x;
    var snappedY = snapped.y;

    if (typeof updateSnapHint === 'function') {
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
        
        updatePropertiesPanel();
        draw();
        return;
    }

    // Đang vẽ rect hoặc circle
    if (isDrawing && (currentTool === 'room' || currentTool === 'circle')) {
        drawCurrentX = snappedX;
        drawCurrentY = snappedY;
        draw();
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
        updatePropertiesPanel();
        draw();
        return;
    }

    // Kéo đối tượng (Phòng hoặc Cửa)
    if (isDragging) {
        if (selectedRoom) {
            var dragPt = snapWorldPoint(world.x - dragOffsetX, world.y - dragOffsetY);
            var newX = dragPt.x;
            var newY = dragPt.y;
            var dx = newX - selectedRoom.x;
            var dy = newY - selectedRoom.y;
            selectedRoom.x = newX;
            selectedRoom.y = newY;
            if (selectedRoom.shape === 'circle') {
                selectedRoom.cx += dx;
                selectedRoom.cy += dy;
            } else if (selectedRoom.shape === 'polygon' && selectedRoom.points) {
                for (var i = 0; i < selectedRoom.points.length; i++) {
                    selectedRoom.points[i].x += dx;
                    selectedRoom.points[i].y += dy;
                }
            }
        } else if (selectedObject && selectedObject.type === 'door') {
            var door = selectedObject.data;
            var doorPt = snapWorldPoint(world.x - dragOffsetX, world.y - dragOffsetY);
            door.x = doorPt.x;
            door.y = doorPt.y;
        } else if (selectedObject && selectedObject.type === 'blockRef') {
            var blk = selectedObject.data;
            var blkPt = snapWorldPoint(world.x - dragOffsetX, world.y - dragOffsetY);
            blk.x = blkPt.x;
            blk.y = blkPt.y;
        }
        updatePropertiesPanel();
        draw();
    }

    // Resize Phòng
    if (isResizing && selectedRoom && resizeStartRoom) {
        resizeRoom(snappedX, snappedY);
        updatePropertiesPanel();
        draw();
    }

    // Resize Cửa
    if (isResizingDoor && selectedObject && selectedObject.type === 'door') {
        var door = selectedObject.data;
        var dx = world.x - door.x;
        var dy = world.y - door.y;

        // Tính toán chiều rộng dựa trên khoảng cách từ tâm đến chuột (nhân 2)
        var newWidth;
        if (door.rotation === 0 || door.rotation === 180) {
            newWidth = Math.abs(dx) * 2;
        } else {
            newWidth = Math.abs(dy) * 2;
        }

        door.width = Math.max(10, Math.round(newWidth));
        updatePropertiesPanel();
        draw();
    }

    // Xoay Cửa
    if (isRotatingDoor && selectedObject && selectedObject.type === 'door') {
        var door = selectedObject.data;
        // Tính góc từ tâm cửa đến chuột
        var dx = world.x - door.x;
        var dy = world.y - door.y;
        var angle = Math.atan2(dy, dx) * 180 / Math.PI;

        // Điều chỉnh góc (vì mặc định atan2 0 độ là hướng Đông, còn Handle của ta hướng Bắc)
        door.rotation = (Math.round(angle) + 90 + 360) % 360;

        updatePropertiesPanel();
        draw();
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
        updatePropertiesPanel();
        draw();
        return;
    }

    // Thước đo
    if (isDrawingRuler) {
        rulerEnd = { x: world.x, y: world.y };
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
        if (findRoomAt(world.x, world.y) || findDoorAt(world.x, world.y)) {
            wrapper.style.cursor = 'move';
        } else {
            wrapper.style.cursor = 'default';
        }
    }

    // Repaint OSNAP marker khi rê chuột (tool vẽ + Chọn)
    var snapRepaintTools = ['select', 'wall', 'line', 'room', 'circle', 'door', 'poi', 'path', 'ruler', 'polygon',
        'move', 'copy', 'rotate', 'scale', 'mirror', 'trim', 'extend', 'pedit', 'mline', 'array', 'matchprop'];
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

    if (typeof isModifyTool === 'function' && isModifyTool(currentTool)
        && window.EditorCore && EditorCore.ModifySession) {
        EditorCore.ModifySession.onPointerUp();
        if (typeof updateModifyHint === 'function') updateModifyHint();
        draw();
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

    if (isDraggingVertex) {
        isDraggingVertex = false;
        draggingVertexIndex = -1;
    }

    isDragging = false;
    window.isDraggingBg = false;
    isResizing = false;
    isResizingDoor = false;
    isRotatingDoor = false;
    isRotatingRoom = false;
    window.isRotatingRoom = false;
    window.liveRoomRotateDeg = null;
    roomRotateCenter = null;

    // Kết thúc Thước đo
    if (isDrawingRuler) {
        isDrawingRuler = false;
        var dx = rulerEnd.x - rulerStart.x;
        var dy = rulerEnd.y - rulerStart.y;
        var distPx = Math.sqrt(dx * dx + dy * dy);

        if (distPx > 5) {
            var m = prompt("Đoạn thẳng này dài bao nhiêu mét thực tế?", "10");
            if (m !== null && !isNaN(parseFloat(m))) {
                var realMeters = parseFloat(m);
                if (Number.isFinite(realMeters) && realMeters > 0) {
                    var nextScale = (realMeters / distPx) * GRID_SIZE;
                    if (Number.isFinite(nextScale) && nextScale > 0) {
                        metersPerGrid = nextScale;
                        if (getEl('scaleInput')) getEl('scaleInput').value = metersPerGrid.toFixed(2);
                        alert("Đã cập nhật tỷ lệ: 1 ô lưới = " + metersPerGrid.toFixed(2) + " mét.");
                    }
                }
            }
        }
        rulerStart = null;
        rulerEnd = null;
    }

    updateCursor();
    draw();
}
