// ============================================================
// EVENTS.JS - Xử lý sự kiện chuột: Zoom, Pan, Click, Drag
// ============================================================

// === ZOOM ===
canvas.addEventListener('wheel', function (e) {
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
    var rect = canvas.getBoundingClientRect();
    var mouseX = e.clientX - rect.left;
    var mouseY = e.clientY - rect.top;
    var world = screenToWorld(mouseX, mouseY);
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
    if (isPanning) { isPanning = false; updateCursor(); return; }
    handleLeftMouseUp(e);
});

// === DOUBLE CLICK (kết thúc polygon) ===
canvas.addEventListener('dblclick', function (e) {
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
        draw();
    }
});

canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (currentTool === 'path') {
        firstNodeForEdge = null;
        selectedObject = null;
        if (typeof showToast === 'function') showToast('Đã ngắt chuỗi đường đi', 'success');
        draw();
    } else if (currentTool === 'wall') {
        wallStartPoint = null;
        wallPreviewEnd = null;
        if (typeof showToast === 'function') showToast('Đã ngắt vẽ tường', 'success');
        draw();
    }
});

// ============================================================
// XỬ LÝ LEFT CLICK
// ============================================================
function handleLeftMouseDown(e) {
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
        polygonPoints.push({ x: world.x, y: world.y }); // Không dùng snapped để tự do vẽ
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
        var p = { x: snappedX, y: snappedY };
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
            var newNode = createPathNode(world.x, world.y);
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

    // --- TOOL: THƯỚC ĐO (RULER) ---
    else if (currentTool === 'ruler') {
        isDrawingRuler = true;
        rulerStart = { x: world.x, y: world.y };
        rulerEnd = { x: world.x, y: world.y };
        draw();
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
                        selectedObject = { type: 'door', data: clickedDoor };
                        selectedRoom = null;
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
    var snappedX = snapToGrid(world.x);
    var snappedY = snapToGrid(world.y);

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

    // Kéo phòng
    if (isDragging && selectedRoom) {
        var newX = snapToGrid(world.x - dragOffsetX);
        var newY = snapToGrid(world.y - dragOffsetY);
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
        updatePropertiesPanel();
        draw();
    }

    // Resize
    if (isResizing && selectedRoom && resizeStartRoom) {
        resizeRoom(snappedX, snappedY);
        updatePropertiesPanel();
        draw();
    }

    // Thước đo
    if (isDrawingRuler) {
        rulerEnd = { x: world.x, y: world.y };
        draw();
        return;
    }

    // Preview tường đang vẽ
    if (currentTool === 'wall' && wallStartPoint) {
        wallPreviewEnd = { x: snappedX, y: snappedY };
        draw();
        return;
    }

    // Cursor hover
    if (currentTool === 'select' && selectedRoom && !isDragging && !isResizing) {
        var handle = getResizeHandle(world.x, world.y, selectedRoom);
        if (handle) {
            var cursors = {
                'nw': 'nw-resize', 'n': 'n-resize', 'ne': 'ne-resize',
                'e': 'e-resize', 'se': 'se-resize', 's': 's-resize',
                'sw': 'sw-resize', 'w': 'w-resize'
            };
            wrapper.style.cursor = cursors[handle] || 'default';
        } else {
            wrapper.style.cursor = findRoomAt(world.x, world.y) ? 'move' : 'default';
        }
    }
}

// ============================================================
// MOUSE UP
// ============================================================
function handleLeftMouseUp(e) {
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
    if (isDragging) isDragging = false;
    if (isResizing) {
        isResizing = false;
        resizeHandle = null;
        resizeStartRoom = null;
    }

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
                if (!Number.isFinite(realMeters) || realMeters <= 0) {
                    alert("Giá trị mét không hợp lệ. Vui lòng nhập số lớn hơn 0.");
                    rulerStart = null;
                    rulerEnd = null;
                    draw();
                    return;
                }
                // Cập nhật tỷ lệ: metersPerGrid = (realMeters / distPx) * GRID_SIZE
                var nextScale = (realMeters / distPx) * GRID_SIZE;
                if (!Number.isFinite(nextScale) || nextScale <= 0) {
                    alert("Không thể cập nhật tỷ lệ từ dữ liệu hiện tại. Vui lòng đo lại.");
                    rulerStart = null;
                    rulerEnd = null;
                    draw();
                    return;
                }
                metersPerGrid = nextScale;
                document.getElementById('scaleInput').value = metersPerGrid.toFixed(2);
                alert("Đã cập nhật tỷ lệ: 1 ô lưới = " + metersPerGrid.toFixed(2) + " mét.\nĐộ phân giải: " + (distPx / realMeters).toFixed(1) + " pixel/mét.");
            }
        }
        rulerStart = null;
        rulerEnd = null;
        draw();
    }
}
