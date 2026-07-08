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
    zoomLevelSpan.textContent = 'Zoom: ' + Math.round(zoom * 100) + '%';
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
    if (mousePosSpan) mousePosSpan.textContent = 'X: ' + Math.round(world.x) + ', Y: ' + Math.round(world.y);
    if (worldPosSpan) {
        var worldLabel = pixelsToMeters(world.x).toFixed(1) + 'm, ' + pixelsToMeters(world.y).toFixed(1) + 'm';
        if (currentTool === 'ruler' && rulerAwaitingEnd && rulerStart) {
            var previewEnd = constrainOrthoPoint(rulerStart, world, e.shiftKey);
            var previewPx = getRulerSegmentLengthPx(rulerStart, previewEnd);
            worldLabel += ' · Đo: ' + formatRulerLabel(previewPx, metersPerGrid, GRID_SIZE);
        }
        worldPosSpan.textContent = worldLabel;
    }

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

// === DOUBLE CLICK (kết thúc polygon) ===
canvas.addEventListener('dblclick', function (e) {
    if (editorLocked()) return;
    if (currentTool === 'polygon' && isDrawingPolygon && polygonPoints.length >= 3) {
        saveState(); // LƯU TRẠNG THÁI HIỆN TẠI
        var newRoom = createPolygonRoom(polygonPoints);
        if (newRoom) {
            rooms.push(newRoom);
            selectedRoom = newRoom;
            selectedObject = { type: 'room', data: newRoom };
            roomCountSpan.textContent = 'Phòng: ' + rooms.length;
            updatePropertiesPanel();
            updateObjectList();
        }
        polygonPoints = [];
        isDrawingPolygon = false;
        polygonHoverPoint = null;
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
        pathPreviewEnd = null;
        selectedObject = null;
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
    var snappedX = snapToGrid(world.x);
    var snappedY = snapToGrid(world.y);

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
        isDrawingPolygon = true;
        var polyPt = polygonPoints.length > 0
            ? resolveLinePoint(polygonPoints[polygonPoints.length - 1], world, e.shiftKey)
            : { x: world.x, y: world.y };
        polygonPoints.push(polyPt);
        polygonHoverPoint = null;
        draw();
    }

    // --- TOOL: VẼ CỬA ---
    else if (currentTool === 'door') {
        saveState();
        var door = createDoor(world.x, world.y);
        selectedObject = { type: 'door', data: door };
        selectedRoom = null;
        updatePropertiesPanel();
        updateObjectList();
        draw();
    }

    // --- TOOL: VẼ TƯỜNG ---
    else if (currentTool === 'wall') {
        var p = wallStartPoint
            ? resolveLinePoint(wallStartPoint, world, e.shiftKey)
            : { x: snappedX, y: snappedY };
        if (!wallStartPoint) {
            wallStartPoint = p;
            wallPreviewEnd = p;
        } else {
            saveState();
            var wall = createWallSegment(wallStartPoint, p, { thickness: 4, is_outer: false });
            wallStartPoint = p; // cho phép vẽ nối tiếp
            wallPreviewEnd = p;
            if (wall) {
                selectedObject = { type: 'wall', data: wall };
                selectedRoom = null;
                updatePropertiesPanel();
                updateObjectList();
            }
        }
        draw();
    }

    // --- TOOL: VẼ POI ---
    else if (currentTool === 'poi') {
        saveState();
        var poi = createPoi(world.x, world.y);
        selectedObject = { type: 'poi', data: poi };
        selectedRoom = null;
        updatePropertiesPanel();
        updateObjectList();
        draw();
    }

    // --- TOOL: VẼ QR CODE ---
    else if (currentTool === 'qr') {
        saveState();
        var qr = createQr(world.x, world.y);
        selectedObject = { type: 'qr', data: qr };
        selectedRoom = null;
        updatePropertiesPanel();
        updateObjectList();
        draw();
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
            selectedObject = { type: 'node', data: clickedNode };
        } else {
            // Click vào chỗ trống: Tạo node mới và tự động nối với node trước đó (nếu có)
            saveState();
            var place = resolveLinePoint(firstNodeForEdge, world, e.shiftKey);
            var newNode = createPathNode(place.x, place.y);
            if (firstNodeForEdge) {
                connectNodes(firstNodeForEdge, newNode);
            }
            firstNodeForEdge = newNode; // Đặt node mới làm điểm chờ để nối tiếp
            selectedObject = { type: 'node', data: newNode };
        }
        selectedRoom = null;
        updatePropertiesPanel();
        updateObjectList();
        draw();
    }

    // --- TOOL: THƯỚC ĐO (RULER) — click điểm A, click điểm B (không cần giữ chuột kéo) ---
    else if (currentTool === 'ruler') {
        var rulerPt = { x: world.x, y: world.y };
        if (rulerAwaitingEnd && rulerStart) {
            rulerEnd = constrainOrthoPoint(rulerStart, rulerPt, e.shiftKey);
            showRulerMeasurementResult(getRulerSegmentLengthPx(rulerStart, rulerEnd));
            rulerAwaitingEnd = false;
            isDrawingRuler = false;
        } else {
            rulerStart = rulerPt;
            rulerEnd = rulerPt;
            rulerAwaitingEnd = true;
            isDrawingRuler = true;
        }
        draw();
        return;
    }

    // --- TOOL: CHỈNH ẢNH NỀN ---
    else if (currentTool === 'bg-adjust') {
        window.isDraggingBg = true;
        window.bgLastX = world.x;
        window.bgLastY = world.y;
    }

    // --- TOOL: CHỌN ---
    else if (currentTool === 'select') {
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
        var clickedNode2 = findNodeAt(world.x, world.y);
        if (clickedNode2) {
            selectedObject = { type: 'node', data: clickedNode2 };
            selectedRoom = null;
        } else {
            var clickedQr = findQrAt(world.x, world.y);
            if (clickedQr) {
                selectedObject = { type: 'qr', data: clickedQr };
                selectedRoom = null;
            } else {
                var clickedPoi = findPoiAt(world.x, world.y);
                if (clickedPoi) {
                    selectedObject = { type: 'poi', data: clickedPoi };
                    selectedRoom = null;
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
                                    selectedObject = { type: 'door', data: clickedDoor };
                                    return;
                                }
                            }
                        }

                        saveState();
                        selectedObject = { type: 'door', data: clickedDoor };
                        selectedRoom = null;
                        isDragging = true;
                        dragOffsetX = world.x - clickedDoor.x;
                        dragOffsetY = world.y - clickedDoor.y;
                    } else {
                        var clickedWall = findWallAt(world.x, world.y);
                        if (clickedWall) {
                            selectedObject = { type: 'wall', data: clickedWall };
                            selectedRoom = null;
                        } else {
                            var clickedRoom = findRoomAt(world.x, world.y);
                            if (clickedRoom) {
                                saveState();
                                selectedRoom = clickedRoom;
                                selectedObject = { type: 'room', data: clickedRoom };
                                isDragging = true;
                                dragOffsetX = world.x - clickedRoom.x;
                                dragOffsetY = world.y - clickedRoom.y;
                            } else {
                                selectedRoom = null;
                                selectedObject = null;
                                isDragging = false;
                            }
                        }
                    }
                }
            }
        }
        updatePropertiesPanel();
        updateObjectList();
        draw();
    }
}

// ============================================================
// MOUSE MOVE
// ============================================================
function handleMouseMove(e, world) {
    if (editorLocked()) return;
    var snappedX = snapToGrid(world.x);
    var snappedY = snapToGrid(world.y);

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
        selectedRoom.points[draggingVertexIndex].x = world.x; // Kéo tự do không bị giật
        selectedRoom.points[draggingVertexIndex].y = world.y;
        // Cập nhật bounding box
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
        updatePropertiesPanel();
        draw();
        return;
    }

    // Kéo đối tượng (Phòng hoặc Cửa)
    if (isDragging) {
        if (selectedRoom) {
            var rawX = world.x - dragOffsetX;
            var rawY = world.y - dragOffsetY;
            var newX = isGridSnapEnabled() ? snapToGrid(rawX) : rawX;
            var newY = isGridSnapEnabled() ? snapToGrid(rawY) : rawY;
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
            var rawX = world.x - dragOffsetX;
            var rawY = world.y - dragOffsetY;
            var placed = resolveDoorPosition(rawX, rawY);
            door.x = placed.x;
            door.y = placed.y;
            if (placed.rotation != null) door.rotation = placed.rotation;
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

    // Thước đo — preview khi đã chọn điểm A, chờ điểm B
    if (currentTool === 'ruler' && rulerAwaitingEnd && rulerStart) {
        rulerEnd = constrainOrthoPoint(rulerStart, { x: world.x, y: world.y }, e.shiftKey);
        draw();
        return;
    }

    // Preview polygon — rubber-band tới con trỏ (Shift = ngang/dọc)
    if (currentTool === 'polygon' && isDrawingPolygon && polygonPoints.length > 0) {
        var polyLast = polygonPoints[polygonPoints.length - 1];
        polygonHoverPoint = e.shiftKey
            ? constrainOrthoPoint(polyLast, world, true)
            : { x: world.x, y: world.y };
        draw();
        return;
    }

    // Preview path — đoạn từ node chờ tới con trỏ
    if (currentTool === 'path' && firstNodeForEdge) {
        pathPreviewEnd = resolveLinePoint(firstNodeForEdge, world, e.shiftKey);
        draw();
        return;
    }

    // Preview tường đang vẽ
    if (currentTool === 'wall' && wallStartPoint) {
        wallPreviewEnd = resolveLinePoint(wallStartPoint, world, e.shiftKey);
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
        if (findRoomAt(world.x, world.y) || findDoorAt(world.x, world.y)) {
            wrapper.style.cursor = 'move';
        } else {
            wrapper.style.cursor = 'default';
        }
    }
}

// ============================================================
// MOUSE UP
// ============================================================
function handleLeftMouseUp(e) {
    if (editorLocked()) return;
    // Kết thúc vẽ rect
    if (isDrawing && currentTool === 'room') {
        saveState();
        isDrawing = false;
        var newRoom = createRoom(drawStartX, drawStartY, drawCurrentX, drawCurrentY);
        if (newRoom) {
            rooms.push(newRoom);
            selectedRoom = newRoom;
            selectedObject = { type: 'room', data: newRoom };
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
            selectedRoom = newCircle;
            selectedObject = { type: 'room', data: newCircle };
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

    updateCursor();
    draw();
}
