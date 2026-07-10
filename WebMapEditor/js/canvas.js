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
        if (Array.isArray(window.lines)) window.lines = window.lines.filter(i => i && typeof i === 'object');
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
                
                // Di chuyển đến tâm ảnh, xoay, rồi vẽ ngược lại từ tâm
                ctx.translate(window.bgX + bw / 2, window.bgY + bh / 2);
                ctx.rotate((window.bgRotation || 0) * Math.PI / 180);
                ctx.drawImage(window.bgImage, -bw / 2, -bh / 2, bw, bh);
                
                // Nếu đang trong chế độ chỉnh ảnh nền -> Vẽ khung bao để dễ nhận biết
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
        if (window.EditorCore && EditorCore.RenderingEngine) {
            EditorCore.RenderingEngine.renderGrid(ctx, viewport, typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40);
        } else {
            drawGrid();
        }

        // 3. Phòng
        rooms.forEach(function (room) {
            if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(room)) return;
            var sel = (selectedObject && selectedObject.type === 'room' && selectedObject.data === room);
            drawRoom(room, sel || room === selectedRoom);
        });

        // 3.1 Tường (nếu có)
        if (Array.isArray(walls)) {
            walls.forEach(function (wall) {
                if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(wall)) return;
                var sel = (selectedObject && selectedObject.type === 'wall' && selectedObject.data === wall);
                drawWall(wall, sel);
            });
        }

        // 3.2 Đoạn thẳng hỗ trợ (không phải tường)
        if (Array.isArray(lines)) {
            lines.forEach(function (line) {
                if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(line)) return;
                var sel = (selectedObject && selectedObject.type === 'line' && selectedObject.data === line);
                drawLineSegment(line, sel);
            });
        }

        // 4. Cửa
        doors.forEach(function (door) {
            if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(door)) return;
            var sel = (selectedObject && selectedObject.type === 'door' && selectedObject.data === door);
            drawDoor(door, sel);
        });

        // 5. POI
        pois.forEach(function (poi) {
            if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(poi)) return;
            var sel = (selectedObject && selectedObject.type === 'poi' && selectedObject.data === poi);
            drawPoi(poi, sel);
        });

        // 6. QR Code
        qrs.forEach(function (qr) {
            if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(qr)) return;
            var sel = (selectedObject && selectedObject.type === 'qr' && selectedObject.data === qr);
            drawQr(qr, sel);
        });

        // 7. Đường đi (edges trước, nodes sau)
        drawPathEdges();
        pathNodes.forEach(function (node) {
            if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(node)) return;
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

        // 8.1 Preview tường (PolylineTool V4)
        if (currentTool === 'wall' && window.EditorCore && EditorCore.PolylineTool) {
            drawWallToolPreview();
        }

        // 8.2 Preview đoạn thẳng (LineTool V4)
        if (currentTool === 'line' && window.EditorCore && EditorCore.LineTool) {
            drawLineToolPreview();
        }

        // 9. Preview thước đo
        if (isDrawingRuler && rulerStart && rulerEnd) {
            drawRulerPreview();
        }

        // 10. OSNAP marker (endpoint / midpoint / grid)
        ctx.restore();

        if (typeof drawSnapMarker === 'function') {
            drawSnapMarker();
        }
    } catch (err) {
        console.error("Lỗi trong hàm draw():", err);
    }
}

// === VẼ LƯỚI ===
function drawGrid() {
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

// === VẼ PHÒNG (hỗ trợ rect, circle, polygon) ===
function drawRoom(room, isSelected) {
    applyDefaultRoomLabelStyle(room);
    if (room.shape === 'circle') {
        drawCircleRoom(room, isSelected);
    } else if (room.shape === 'polygon') {
        drawPolygonRoom(room, isSelected);
    } else {
        drawRectRoom(room, isSelected);
    }
}

function splitLabelLines(text) {
    return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

function wrapSingleLine(line, maxWidth) {
    if (!line) return [''];
    var words = line.trim().split(/\s+/);
    if (!words.length) return [''];

    var wrapped = [];
    var current = '';
    for (var i = 0; i < words.length; i++) {
        var test = current ? (current + ' ' + words[i]) : words[i];
        if (ctx.measureText(test).width <= maxWidth) {
            current = test;
            continue;
        }

        if (current) {
            wrapped.push(current);
            current = '';
        }

        if (ctx.measureText(words[i]).width <= maxWidth) {
            current = words[i];
            continue;
        }

        // Cắt từ quá dài theo từng ký tự để không tràn phòng
        var chunk = '';
        for (var c = 0; c < words[i].length; c++) {
            var charTest = chunk + words[i][c];
            if (ctx.measureText(charTest).width <= maxWidth) {
                chunk = charTest;
            } else {
                if (chunk) wrapped.push(chunk);
                chunk = words[i][c];
            }
        }
        current = chunk;
    }

    if (current) wrapped.push(current);
    return wrapped.length ? wrapped : [''];
}

function wrapRoomLabelText(text, maxWidth) {
    var explicitLines = splitLabelLines(text);
    var finalLines = [];
    explicitLines.forEach(function (line) {
        var wrapped = wrapSingleLine(line, maxWidth);
        wrapped.forEach(function (w) { finalLines.push(w); });
    });
    return finalLines.length ? finalLines : [''];
}

function calcLabelAutoScale(lines, fontSize, lineHeight, maxWidth, maxHeight) {
    var widest = 0;
    lines.forEach(function (line) {
        widest = Math.max(widest, ctx.measureText(line).width);
    });
    var totalHeight = lines.length * fontSize * lineHeight;
    var widthScale = widest > 0 ? (maxWidth / widest) : 1;
    var heightScale = totalHeight > 0 ? (maxHeight / totalHeight) : 1;
    return Math.max(0.35, Math.min(3, Math.min(widthScale, heightScale)));
}

function drawRoomLabel(room, centerX, centerY, maxWidth, maxHeight) {
    var text = String(room.name || '');
    if (!text.trim()) return;

    var padding = 12 / zoom;
    var safeWidth = Math.max(20 / zoom, maxWidth - padding * 2);
    var safeHeight = Math.max(20 / zoom, maxHeight - padding * 2);

    var baseFont = Math.max(8 / zoom, (room.labelFontSize || 14) / zoom);
    var lineHeight = Math.max(1, room.labelLineHeight || 1.2);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((room.labelRotation || 0) * Math.PI / 180);
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var fontSize = baseFont;
    ctx.font = fontSize + 'px Segoe UI';
    var lines = wrapRoomLabelText(text, safeWidth);

    if (room.labelAutoScale) {
        var autoScale = calcLabelAutoScale(lines, fontSize, lineHeight, safeWidth, safeHeight);
        fontSize = fontSize * autoScale;
        ctx.font = fontSize + 'px Segoe UI';
        lines = wrapRoomLabelText(text, safeWidth);
        var secondPass = calcLabelAutoScale(lines, fontSize, lineHeight, safeWidth, safeHeight);
        if (secondPass < 1) {
            fontSize = fontSize * secondPass;
            ctx.font = fontSize + 'px Segoe UI';
            lines = wrapRoomLabelText(text, safeWidth);
        }
    }

    var totalHeight = lines.length * fontSize * lineHeight;
    for (var i = 0; i < lines.length; i++) {
        var y = -totalHeight / 2 + (i + 0.5) * fontSize * lineHeight;
        ctx.fillText(lines[i], 0, y);
    }

    ctx.restore();
}

// --- Vẽ tường ---
function drawWall(wall, isSelected) {
    if (!wall || !Array.isArray(wall.points) || wall.points.length < 2) return;

    var thickness = Math.max(1, (wall.thickness || 4) / zoom);
    var isOuter = !!wall.is_outer;

    // Viền phát sáng nhẹ
    ctx.strokeStyle = isOuter ? 'rgba(239, 68, 68, 0.25)' : 'rgba(17, 24, 39, 0.2)';
    ctx.lineWidth = thickness + (isOuter ? 3 / zoom : 2 / zoom);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(wall.points[0].x, wall.points[0].y);
    for (var i = 1; i < wall.points.length; i++) {
        ctx.lineTo(wall.points[i].x, wall.points[i].y);
    }
    ctx.stroke();

    // Nét chính
    ctx.strokeStyle = isSelected ? '#f59e0b' : (isOuter ? '#ef4444' : '#111827');
    ctx.lineWidth = isSelected ? thickness + 1 / zoom : thickness;
    ctx.beginPath();
    ctx.moveTo(wall.points[0].x, wall.points[0].y);
    for (var j = 1; j < wall.points.length; j++) {
        ctx.lineTo(wall.points[j].x, wall.points[j].y);
    }
    ctx.stroke();
}

function drawWallPreview() {
    if (!wallStartPoint || !wallPreviewEnd) return;
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

/** Preview tool Tường qua PolylineTool (nét đứt + chấm đỉnh chờ). */
function drawWallToolPreview() {
    if (!EditorCore.PolylineTool || EditorCore.PolylineTool.getState() !== 'drawing') {
        // Fallback legacy vars nếu còn
        if (wallStartPoint && wallPreviewEnd) drawWallPreview();
        return;
    }
    var pts = EditorCore.PolylineTool.getPoints();
    var preview = EditorCore.PolylineTool.getPreview();
    if (!pts.length) return;

    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
    }
    if (preview) {
        ctx.lineTo(preview.x, preview.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f59e0b';
    for (var j = 0; j < pts.length; j++) {
        ctx.beginPath();
        ctx.arc(pts[j].x, pts[j].y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    if (preview) {
        drawPolarGuide(pts[pts.length - 1], preview, { color: '#06b6d4', badge: 'TƯỜNG' });
    }
}

/** Vẽ đoạn thẳng hỗ trợ (mảnh, xanh — khác tường). */
function drawLineSegment(line, isSelected) {
    if (!line || !line.points || line.points.length < 2) return;
    var a = line.points[0];
    var b = line.points[1];
    var color = line.color || '#3b82f6';
    var weight = (line.lineWeight || 2) / zoom;

    ctx.save();
    ctx.strokeStyle = isSelected ? '#f59e0b' : color;
    ctx.lineWidth = isSelected ? weight + 1 / zoom : weight;
    ctx.setLineDash(isSelected ? [6 / zoom, 3 / zoom] : []);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

/** Đường gióng + nhãn góc khi vẽ. */
function drawPolarGuide(anchor, preview, style) {
    if (!anchor || !preview) return;
    if (typeof document !== 'undefined') {
        var pc = document.getElementById('polarAngleLabelCheck');
        if (pc && !pc.checked) return;
    }
    style = style || {};
    var guideColor = style.color || '#06b6d4';
    var badge = style.badge || '';
    var dx = preview.x - anchor.x;
    var dy = preview.y - anchor.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-6) return;
    var ext = 120 / zoom; // kéo dài đường gióng qua khỏi con trỏ
    var ux = dx / dist;
    var uy = dy / dist;

    ctx.save();
    ctx.strokeStyle = guideColor;
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(preview.x + ux * ext, preview.y + uy * ext);
    ctx.stroke();
    ctx.setLineDash([]);

    // Góc liên tục theo hướng anchor -> preview (0..360, y dương hướng xuống canvas).
    var angDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angDeg < 0) angDeg += 360;
    var label = Math.round(angDeg) + '\u00B0';
    if (badge) label = badge + ' ' + label;
    var fontPx = 12 / zoom;
    ctx.font = 'bold ' + fontPx + 'px sans-serif';
    var tx = preview.x + 14 / zoom;
    var ty = preview.y - 14 / zoom;
    var w = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(tx - 3 / zoom, ty - fontPx, w + 6 / zoom, fontPx + 6 / zoom);
    ctx.fillStyle = guideColor;
    ctx.fillText(label, tx, ty);
    ctx.restore();
}

/** Preview tool Đoạn thẳng (LineTool): nét đứt từ điểm đầu tới con trỏ. */
function drawLineToolPreview() {
    if (!EditorCore.LineTool || EditorCore.LineTool.getState() !== 'drawing') return;
    var start = EditorCore.LineTool.getStartPoint();
    if (!start) return;
    var preview = EditorCore.LineTool.getPreview();

    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([5 / zoom, 4 / zoom]);
    if (preview) {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(preview.x, preview.y);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(start.x, start.y, 3 / zoom, 0, Math.PI * 2);
    ctx.fill();
    if (preview) {
        ctx.beginPath();
        ctx.arc(preview.x, preview.y, 2.5 / zoom, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    if (preview) {
        drawPolarGuide(start, preview, { color: '#8b5cf6', badge: 'ĐOẠN' });
    }
}

// --- Vẽ phòng chữ nhật ---
function drawRectRoom(room, isSelected) {
    ctx.globalAlpha = 0.5; // Thêm độ trong suốt
    ctx.fillStyle = room.color;
    ctx.fillRect(room.x, room.y, room.width, room.height);
    ctx.globalAlpha = 1.0;

    ctx.strokeStyle = isSelected ? '#3498db' : '#555';
    ctx.lineWidth = isSelected ? 2.5 / zoom : 1.5 / zoom;
    ctx.strokeRect(room.x, room.y, room.width, room.height);

    drawRoomLabel(room, room.x + room.width / 2, room.y + room.height / 2, room.width, room.height);

    var dc = document.getElementById('dimCheck');
    if (dc && dc.checked) drawDimensions(room);
    if (isSelected) drawResizeHandles(room);
}

// --- Vẽ phòng tròn ---
function drawCircleRoom(room, isSelected) {
    ctx.beginPath();
    ctx.arc(room.cx, room.cy, room.radius, 0, Math.PI * 2);
    ctx.globalAlpha = 0.5; // Thêm độ trong suốt
    ctx.fillStyle = room.color;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = isSelected ? '#3498db' : '#555';
    ctx.lineWidth = isSelected ? 2.5 / zoom : 1.5 / zoom;
    ctx.stroke();

    var diameterInSquare = room.radius * Math.sqrt(2);
    drawRoomLabel(room, room.cx, room.cy, diameterInSquare, diameterInSquare);

    // Kích thước (bán kính)
    var dc = document.getElementById('dimCheck');
    if (dc && dc.checked) {
        var dimFontSize = Math.max(8, 10 / zoom);
        ctx.fillStyle = '#e74c3c';
        ctx.font = 'bold ' + dimFontSize + 'px Consolas';
        ctx.textBaseline = 'top';
        ctx.fillText('r=' + pixelsToMeters(room.radius).toFixed(1) + 'm', room.cx, room.cy + room.radius + 3 / zoom);
    }

    if (isSelected) drawResizeHandles(room);
}

// --- Vẽ phòng đa giác ---
function drawPolygonRoom(room, isSelected) {
    var pts = room.points || room.vertices; // Chấp nhận cả 2 cách gọi
    if (!pts || pts.length < 3) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();

    ctx.globalAlpha = 0.5; // Thêm độ trong suốt
    ctx.fillStyle = room.color;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = isSelected ? '#3498db' : '#555';
    ctx.lineWidth = isSelected ? 2.5 / zoom : 1.5 / zoom;
    ctx.stroke();

    // Tên (ở tâm bounding box)
    var cx = room.x + room.width / 2;
    var cy = room.y + room.height / 2;
    drawRoomLabel(room, cx, cy, room.width, room.height);

    drawPolygonMeasures(room.points, { showArea: true });

    // Vẽ các đỉnh nếu đang chọn
    if (isSelected) {
        var size = 5 / zoom;
        for (var i = 0; i < room.points.length; i++) {
            ctx.fillStyle = '#3498db';
            ctx.fillRect(room.points[i].x - size / 2, room.points[i].y - size / 2, size, size);
        }
    }
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
function drawPolygonMeasures(points, opts) {
    if (!points || points.length < 2) return;
    if (typeof getPolygonMetrics !== 'function') return;

    opts = opts || {};
    var metrics = getPolygonMetrics(points, {
        previewPoint: opts.previewPoint,
        includeClosingEdge: opts.includeClosingEdge !== false
    });

    var dimFontSize = Math.max(8, 10 / zoom);
    ctx.save();
    ctx.font = 'bold ' + dimFontSize + 'px Consolas';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 1) Chiều dài từng cạnh — nền tối + chữ sáng (canvas nền trắng, không dùng pill trắng)
    var minLabelM = typeof getMinPolygonEdgeMeters === 'function' ? getMinPolygonEdgeMeters() : 0.0011;
    metrics.edges.forEach(function (edge) {
        if (!(edge.lengthM >= minLabelM * 0.5)) return;
        var label = edge.lengthM.toFixed(1) + 'm';
        var len = Math.sqrt((edge.dx || 0) * (edge.dx || 0) + (edge.dy || 0) * (edge.dy || 0)) || 1;
        var nx = -(edge.dy || 0) / len;
        var ny = (edge.dx || 0) / len;
        var offset = Math.max(10, 14 / zoom);
        var lx = edge.midX + nx * offset;
        var ly = edge.midY + ny * offset;
        var tw = ctx.measureText(label).width;
        var padX = 5 / zoom;
        var padY = 3 / zoom;
        var boxW = tw + padX * 2;
        var boxH = dimFontSize + padY * 2;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(lx - boxW / 2, ly - boxH / 2, boxW, boxH);
        ctx.strokeStyle = edge.isClosing ? 'rgba(56, 189, 248, 0.7)' : 'rgba(248, 113, 113, 0.7)';
        ctx.lineWidth = 1.25 / zoom;
        ctx.strokeRect(lx - boxW / 2, ly - boxH / 2, boxW, boxH);
        ctx.fillStyle = edge.isClosing ? '#7dd3fc' : '#fecaca';
        ctx.fillText(label, lx, ly);
    });

    // 2) Chu vi + diện tích ở tâm
    if (metrics.areaM2 > 0 || metrics.perimeterM > 0) {
        var c = metrics.centroid;
        var lines = [];
        if (metrics.perimeterM > 0) lines.push('CV: ' + metrics.perimeterM.toFixed(1) + 'm');
        if (metrics.areaM2 > 0) lines.push('DT: ' + metrics.areaM2.toFixed(1) + 'm\u00B2');
        var label = lines.join(' · ');
        var pad = 4 / zoom;
        var lineH = dimFontSize + 2 / zoom;
        var boxW = ctx.measureText(label).width + pad * 2;
        var boxH = lineH + pad * 2;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.fillRect(c.x - boxW / 2, c.y - boxH / 2, boxW, boxH);
        ctx.fillStyle = '#bbf7d0';
        ctx.fillText(label, c.x, c.y);
    }
    ctx.restore();
}

function drawPolygonPreview() {
    if (polygonPoints.length < 1) return;

    var previewPt = null;
    if (currentTool === 'polygon' && window.lastMouseWorld) {
        previewPt = { x: window.lastMouseWorld.x, y: window.lastMouseWorld.y };
    }

    ctx.beginPath();
    ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    for (var i = 1; i < polygonPoints.length; i++) {
        ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
    }
    if (previewPt) {
        ctx.lineTo(previewPt.x, previewPt.y);
    }
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5 / zoom, 5 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vùng fill nhẹ (đóng tạm qua chuột)
    if (polygonPoints.length >= 2 && previewPt) {
        ctx.beginPath();
        ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
        for (var j = 1; j < polygonPoints.length; j++) {
            ctx.lineTo(polygonPoints[j].x, polygonPoints[j].y);
        }
        ctx.lineTo(previewPt.x, previewPt.y);
        if (polygonPoints.length >= 2) {
            ctx.closePath();
            ctx.fillStyle = 'rgba(34, 197, 94, 0.12)';
            ctx.fill();
        }
    } else if (polygonPoints.length >= 3) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(34, 197, 94, 0.12)';
        ctx.fill();
    }

    // Thông số: cạnh → chu vi → diện tích
    if (polygonPoints.length >= 2) {
        drawPolygonMeasures(polygonPoints, {
            previewPoint: previewPt,
            includeClosingEdge: polygonPoints.length >= 2 && !!previewPt
        });
    }

    // Vẽ các đỉnh
    var size = 6 / zoom;
    for (var k = 0; k < polygonPoints.length; k++) {
        ctx.fillStyle = k === 0 ? '#16a34a' : '#22c55e';
        ctx.fillRect(polygonPoints[k].x - size / 2, polygonPoints[k].y - size / 2, size, size);
    }

    // Chữ hướng dẫn
    var fontSize = Math.max(8, 11 / zoom);
    ctx.fillStyle = '#16a34a';
    ctx.font = 'bold ' + fontSize + 'px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Đa giác · ' + polygonPoints.length + ' đỉnh (nháy đúp để kết thúc)', polygonPoints[0].x + 8 / zoom, polygonPoints[0].y - 4 / zoom);
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
    ctx.beginPath();
    ctx.moveTo(rulerStart.x, rulerStart.y);
    ctx.lineTo(rulerEnd.x, rulerEnd.y);
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 3 / zoom;
    ctx.stroke();

    // Vẽ 2 đầu mút
    var size = 6 / zoom;
    ctx.fillStyle = '#f39c12';
    ctx.fillRect(rulerStart.x - size / 2, rulerStart.y - size / 2, size, size);
    ctx.fillRect(rulerEnd.x - size / 2, rulerEnd.y - size / 2, size, size);

    // Chữ số pixel
    var dx = rulerEnd.x - rulerStart.x;
    var dy = rulerEnd.y - rulerStart.y;
    var distPx = Math.sqrt(dx * dx + dy * dy);

    var fontSize = Math.max(12, 16 / zoom);
    ctx.font = 'bold ' + fontSize + 'px Arial';
    ctx.fillStyle = '#d35400';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(distPx) + ' px', (rulerStart.x + rulerEnd.x) / 2, (rulerStart.y + rulerEnd.y) / 2 - 10 / zoom);
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
