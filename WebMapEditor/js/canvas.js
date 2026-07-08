// ============================================================
// CANVAS.JS - Vẽ canvas: Grid, Room, Preview, Handles, Dimensions
// ============================================================

function getRenderViewport() {
    return {
        panX: panX,
        panY: panY,
        zoom: zoom,
        width: canvas ? canvas.width : 0,
        height: canvas ? canvas.height : 0
    };
}

// Resize canvas theo kích thước wrapper
function resizeCanvas() {
    var wrapper = document.querySelector('.canvas-wrapper');
    var canvas = document.getElementById('mapCanvas');
    if (!wrapper || !canvas) return;

    canvas.width = wrapper.offsetWidth;
    canvas.height = wrapper.offsetHeight;

    if (canvas.width === 0 || canvas.height === 0) {
        // Nếu flexbox chưa kịp tính, thử lấy từ bounding rect
        var rect = wrapper.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    draw();
}

// === MAIN DRAW ===
function draw() {
    // [SAFETY CLEANUP] Tự động lọc bỏ các dữ liệu rác/lỗi định dạng lọt vào State
    try {
        if (Array.isArray(window.rooms)) window.rooms = window.rooms.filter(i => i && typeof i === 'object');
        if (Array.isArray(window.pois)) window.pois = window.pois.filter(i => i && typeof i === 'object');
        if (Array.isArray(window.pathNodes)) window.pathNodes = window.pathNodes.filter(i => i && typeof i === 'object');
        if (Array.isArray(window.qrs)) window.qrs = window.qrs.filter(i => i && typeof i === 'object');
        if (Array.isArray(window.doors)) window.doors = window.doors.filter(i => i && typeof i === 'object');
        if (Array.isArray(window.walls)) window.walls = window.walls.filter(i => i && typeof i === 'object');
    } catch (e) { console.error("Cleanup error:", e); }

    if (!ctx) return;

    try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        var viewport = getRenderViewport();
        if (window.EditorCore && EditorCore.RenderingEngine) {
            EditorCore.RenderingEngine.renderCanvasClear(ctx, viewport);
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.save();
        ctx.translate(panX, panY);
        ctx.scale(zoom, zoom);

        // 1. Ảnh nền (nếu có)
        if (window.bgImage) {
            if (window.EditorCore && EditorCore.RenderingEngine) {
                EditorCore.RenderingEngine.renderBackground(ctx, viewport, {
                    highlightAdjust: currentTool === 'bg-adjust'
                });
            } else {
                ctx.save();
                ctx.globalAlpha = window.bgOpacity;
                var bw = window.bgImage.width * window.bgScale;
                var bh = window.bgImage.height * window.bgScale;
                ctx.translate(window.bgX + bw / 2, window.bgY + bh / 2);
                ctx.rotate((window.bgRotation || 0) * Math.PI / 180);
                ctx.drawImage(window.bgImage, -bw / 2, -bh / 2, bw, bh);
                if (currentTool === 'bg-adjust') {
                    ctx.setLineDash([5, 5]);
                    ctx.strokeStyle = '#3498db';
                    ctx.lineWidth = 2 / zoom;
                    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
                    ctx.setLineDash([]);
                }
                ctx.restore();
                ctx.globalAlpha = 1.0;
            }
        }

        // 2. Lưới
        drawGrid();

        // 3. Phòng
        rooms.forEach(function (room) {
            var sel = (selectedObject && selectedObject.type === 'room' && selectedObject.data === room);
            drawRoom(room, sel || room === selectedRoom);
        });

        // 3.1 Tường (nếu có)
        if (Array.isArray(walls)) {
            walls.forEach(function (wall) {
                var sel = (selectedObject && selectedObject.type === 'wall' && selectedObject.data === wall);
                drawWall(wall, sel);
            });
        }

        // 4. Cửa
        doors.forEach(function (door) {
            var sel = (selectedObject && selectedObject.type === 'door' && selectedObject.data === door);
            drawDoor(door, sel);
        });

        // 5. POI
        pois.forEach(function (poi) {
            var sel = (selectedObject && selectedObject.type === 'poi' && selectedObject.data === poi);
            drawPoi(poi, sel);
        });

        // 6. QR Code
        qrs.forEach(function (qr) {
            var sel = (selectedObject && selectedObject.type === 'qr' && selectedObject.data === qr);
            drawQr(qr, sel);
        });

        // 7. Đường đi (edges trước, nodes sau)
        drawPathEdges();
        pathNodes.forEach(function (node) {
            var sel = (selectedObject && selectedObject.type === 'node' && selectedObject.data === node);
            drawPathNode(node, sel);
        });

        // 7. Preview phòng đang vẽ
        if (isDrawing) {
            drawRoomPreview();
        }

        // 8. Preview polygon đang vẽ
        if (isDrawingPolygon && polygonPoints.length > 0) {
            drawPolygonPreview();
        }

        // 8.05 Preview path nối tiếp
        if (currentTool === 'path' && firstNodeForEdge && pathPreviewEnd) {
            drawPathChainPreview();
        }

        // 8.1 Preview tường đang vẽ
        if (currentTool === 'wall' && wallStartPoint && wallPreviewEnd) {
            drawWallPreview();
        }

        // 9. Thước đo (preview hoặc kết quả giữ đến Esc)
        if (currentTool === 'ruler' && rulerStart && rulerEnd) {
            drawRulerPreview();
        }

        ctx.restore();
    } catch (err) {
        console.error("Lỗi trong hàm draw():", err);
    }
}

// === VẼ LƯỚI ===
function drawGrid() {
    if (window.EditorCore && EditorCore.RenderingEngine) {
        EditorCore.RenderingEngine.renderGrid(ctx, getRenderViewport(), GRID_SIZE);
        return;
    }

    var gc = document.getElementById('gridCheck');
    if (gc && !gc.checked) return;
    if (!gc) return; // Mặc định không vẽ nếu thiếu

    const startX = Math.floor(-panX / zoom / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(-panY / zoom / GRID_SIZE) * GRID_SIZE;
    const endX = startX + canvas.width / zoom + GRID_SIZE * 2;
    const endY = startY + canvas.height / zoom + GRID_SIZE * 2;

    // Lưới nhỏ
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5 / zoom;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += GRID_SIZE) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += GRID_SIZE) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Trục gốc tọa độ
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.moveTo(0, startY); ctx.lineTo(0, endY);
    ctx.moveTo(startX, 0); ctx.lineTo(endX, 0);
    ctx.stroke();
}

function getRoomRenderHooks() {
    return {
        applyDefaultRoomLabelStyle: typeof applyDefaultRoomLabelStyle === 'function' ? applyDefaultRoomLabelStyle : function () {},
        drawDimensions: drawDimensions,
        drawResizeHandles: drawResizeHandles,
        pixelsToMeters: pixelsToMeters,
        isDimVisible: function () {
            var dc = document.getElementById('dimCheck');
            return dc && dc.checked;
        }
    };
}

// === VẼ PHÒNG — delegate RoomRenderer (core/rendering) ===
function drawRoom(room, isSelected) {
    if (window.EditorCore && EditorCore.RoomRenderer) {
        EditorCore.RoomRenderer.renderRoom(ctx, getRenderViewport(), room, isSelected, getRoomRenderHooks());
        return;
    }
    if (window.EditorCore && EditorCore.RenderingEngine) {
        EditorCore.RenderingEngine.renderRoom(ctx, getRenderViewport(), room, isSelected, getRoomRenderHooks());
    }
}

// --- Vẽ tường — delegate WallRenderer ---
function drawWall(wall, isSelected) {
    if (window.EditorCore && EditorCore.WallRenderer) {
        EditorCore.WallRenderer.renderWall(ctx, getRenderViewport(), wall, isSelected);
        return;
    }
    if (window.EditorCore && EditorCore.RenderingEngine) {
        EditorCore.RenderingEngine.renderWall(ctx, getRenderViewport(), wall, isSelected);
    }
}

function drawWallPreview() {
    if (!wallStartPoint || !wallPreviewEnd) return;
    if (window.EditorCore && EditorCore.WallRenderer) {
        EditorCore.WallRenderer.renderWallPreview(ctx, getRenderViewport(), wallStartPoint, wallPreviewEnd);
        return;
    }
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.beginPath();
    ctx.moveTo(wallStartPoint.x, wallStartPoint.y);
    ctx.lineTo(wallPreviewEnd.x, wallPreviewEnd.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// === PREVIEW KHI ĐANG VẼ ===
function drawRoomPreview() {
    if (currentTool === 'circle') {
        // Preview hình tròn
        var dx = drawCurrentX - drawStartX;
        var dy = drawCurrentY - drawStartY;
        var radius = Math.sqrt(dx * dx + dy * dy);
        if (radius < 5) return;

        ctx.beginPath();
        ctx.arc(drawStartX, drawStartY, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(52, 152, 219, 0.15)';
        ctx.fill();
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([5 / zoom, 5 / zoom]);
        ctx.stroke();
        ctx.setLineDash([]);

        var rm = pixelsToMeters(radius).toFixed(1);
        var fontSize = Math.max(10, 13 / zoom);
        ctx.fillStyle = '#2980b9';
        ctx.font = 'bold ' + fontSize + 'px Consolas';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('r=' + rm + 'm', drawStartX, drawStartY - radius - 4 / zoom);
        return;
    }

    // Preview hình chữ nhật (mặc định)
    var x = Math.min(drawStartX, drawCurrentX);
    var y = Math.min(drawStartY, drawCurrentY);
    var w = Math.abs(drawCurrentX - drawStartX);
    var h = Math.abs(drawCurrentY - drawStartY);
    if (w < 2 && h < 2) return;

    ctx.fillStyle = 'rgba(52, 152, 219, 0.15)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([5 / zoom, 5 / zoom]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    var wm = pixelsToMeters(w).toFixed(1);
    var hm = pixelsToMeters(h).toFixed(1);
    var fontSize = Math.max(10, 13 / zoom);
    ctx.fillStyle = '#2980b9';
    ctx.font = 'bold ' + fontSize + 'px Consolas';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(wm + 'm × ' + hm + 'm', x + w / 2, y - 4 / zoom);
}

// === PREVIEW POLYGON ĐANG VẼ ===
function drawPolygonPreview() {
    if (polygonPoints.length < 1) return;

    ctx.beginPath();
    ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    for (var i = 1; i < polygonPoints.length; i++) {
        ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
    }
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5 / zoom, 5 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vẽ các đỉnh
    var size = 6 / zoom;
    for (var i = 0; i < polygonPoints.length; i++) {
        ctx.fillStyle = i === 0 ? '#e74c3c' : '#3498db';
        ctx.fillRect(polygonPoints[i].x - size / 2, polygonPoints[i].y - size / 2, size, size);
    }

    // Chữ hướng dẫn
    var fontSize = Math.max(8, 11 / zoom);
    ctx.fillStyle = '#e74c3c';
    ctx.font = fontSize + 'px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(polygonPoints.length + ' đỉnh (double-click kết thúc)', polygonPoints[0].x + 8 / zoom, polygonPoints[0].y - 4 / zoom);

    if (polygonHoverPoint) {
        var lastPt = polygonPoints[polygonPoints.length - 1];
        ctx.beginPath();
        ctx.moveTo(lastPt.x, lastPt.y);
        ctx.lineTo(polygonHoverPoint.x, polygonHoverPoint.y);
        ctx.strokeStyle = '#95a5a6';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function drawPathChainPreview() {
    if (!firstNodeForEdge || !pathPreviewEnd) return;
    ctx.beginPath();
    ctx.moveTo(firstNodeForEdge.x, firstNodeForEdge.y);
    ctx.lineTo(pathPreviewEnd.x, pathPreviewEnd.y);
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
}

// === ĐƯỜNG KÍCH THƯỚC (cho rect) ===
function drawDimensions(room) {
    var wMeters = pixelsToMeters(room.width).toFixed(1);
    var hMeters = pixelsToMeters(room.height).toFixed(1);
    var dimFontSize = Math.max(8, 10 / zoom);

    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold ' + dimFontSize + 'px Consolas';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(wMeters + 'm', room.x + room.width / 2, room.y + room.height + 3 / zoom);

    ctx.save();
    ctx.translate(room.x + room.width + 3 / zoom, room.y + room.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(hMeters + 'm', 0, 0);
    ctx.restore();
}

// === PREVIEW THƯỚC ĐO ===
function drawRulerPreview() {
    var distPx = getRulerSegmentLengthPx(rulerStart, rulerEnd);
    var isCalibrate = getRulerMode() === 'calibrate';
    var lineColor = isCalibrate ? '#f39c12' : '#3498db';
    var labelColor = isCalibrate ? '#d35400' : '#2980b9';

    ctx.beginPath();
    ctx.moveTo(rulerStart.x, rulerStart.y);
    ctx.lineTo(rulerEnd.x, rulerEnd.y);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3 / zoom;
    ctx.stroke();

    var size = 6 / zoom;
    ctx.fillStyle = lineColor;
    ctx.fillRect(rulerStart.x - size / 2, rulerStart.y - size / 2, size, size);
    ctx.fillRect(rulerEnd.x - size / 2, rulerEnd.y - size / 2, size, size);

    var fontSize = Math.max(12, 16 / zoom);
    ctx.font = 'bold ' + fontSize + 'px Arial';
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
        formatRulerLabel(distPx, metersPerGrid, GRID_SIZE),
        (rulerStart.x + rulerEnd.x) / 2,
        (rulerStart.y + rulerEnd.y) / 2 - 10 / zoom
    );
}

// === RESIZE HANDLES ===
function drawResizeHandles(room) {
    if (room.shape === 'polygon') return; // Polygon dùng đỉnh riêng
    var handles = getHandlePositions(room);
    var size = HANDLE_SIZE / zoom;
    for (var name in handles) {
        var pos = handles[name];
        ctx.fillStyle = 'white';
        ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 1.5 / zoom;
        ctx.strokeRect(pos.x - size / 2, pos.y - size / 2, size, size);
    }
}
