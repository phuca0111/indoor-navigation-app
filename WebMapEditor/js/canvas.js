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
    // Cleanup nhẹ — chỉ splice tại chỗ, KHÔNG gán lại mảng (tránh đứt reference SpatialIndex/bridge)
    try {
        function scrub(arr) {
            if (!Array.isArray(arr)) return;
            for (var i = arr.length - 1; i >= 0; i--) {
                if (!arr[i] || typeof arr[i] !== 'object') arr.splice(i, 1);
            }
        }
        scrub(rooms);
        scrub(pois);
        scrub(pathNodes);
        scrub(qrs);
        scrub(doors);
        scrub(walls);
        scrub(lines);
        if (typeof dimensions !== 'undefined') scrub(dimensions);
    } catch (e) { console.error("Cleanup error:", e); }

    if (!ctx || !canvas) return;

    // Identity + xóa full bitmap (không phụ thuộc save-stack)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var viewport = getRenderViewport();
    try {
        if (window.EditorCore && EditorCore.RenderingEngine) {
            EditorCore.RenderingEngine.renderCanvasClear(ctx, viewport);
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    } catch (eClear) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (window.bgImage && canvas && window.bgImage === canvas) {
        window.bgImage = null;
    }

    // World transform trực tiếp — tránh lệch save/restore khiến preview "biến mất"
    var z = (typeof zoom === 'number' && zoom > 0) ? zoom : 1;
    var px = typeof panX === 'number' ? panX : 0;
    var py = typeof panY === 'number' ? panY : 0;
    ctx.setTransform(z, 0, 0, z, px, py);

    try {
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
        if (window.EditorCore && EditorCore.RenderingEngine) {
            EditorCore.RenderingEngine.renderGrid(ctx, viewport, typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40);
        } else {
            drawGrid();
        }

        // 3. Đối tượng đã commit
        rooms.forEach(function (room) {
            if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(room)) return;
            var sel = (selectedObject && selectedObject.type === 'room' && selectedObject.data === room);
            drawRoom(room, sel || room === selectedRoom);
        });

        if (Array.isArray(walls)) {
            walls.forEach(function (wall) {
                if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(wall)) return;
                var sel = (selectedObject && selectedObject.type === 'wall' && selectedObject.data === wall);
                drawWall(wall, sel);
            });
        }

        if (Array.isArray(lines)) {
            lines.forEach(function (line) {
                if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(line)) return;
                var sel = (selectedObject && selectedObject.type === 'line' && selectedObject.data === line);
                drawLineSegment(line, sel);
            });
        }

        if (typeof drawBlockInserts === 'function') {
            drawBlockInserts();
        }

        try {
            if (typeof drawCadDimensions === 'function') drawCadDimensions();
        } catch (eDim) {
            console.error('drawCadDimensions:', eDim);
        }

        doors.forEach(function (door) {
            if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(door)) return;
            var sel = (selectedObject && selectedObject.type === 'door' && selectedObject.data === door);
            drawDoor(door, sel);
        });

        pois.forEach(function (poi) {
            if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(poi)) return;
            var sel = (selectedObject && selectedObject.type === 'poi' && selectedObject.data === poi);
            drawPoi(poi, sel);
        });

        qrs.forEach(function (qr) {
            if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(qr)) return;
            var sel = (selectedObject && selectedObject.type === 'qr' && selectedObject.data === qr);
            drawQr(qr, sel);
        });

        drawPathEdges();
        pathNodes.forEach(function (node) {
            if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(node)) return;
            var sel = (selectedObject && selectedObject.type === 'node' && selectedObject.data === node);
            drawPathNode(node, sel);
        });
    } catch (errObj) {
        console.error('Lỗi vẽ object trong draw():', errObj);
    }

    // Preview đang vẽ — tách try để luôn cố vẽ dù object phía trên lỗi
    try {
        if (isDrawing) drawRoomPreview();
        if (isDrawingPolygon && polygonPoints.length > 0) drawPolygonPreview();
        if (currentTool === 'wall' && window.EditorCore && EditorCore.PolylineTool) {
            drawWallToolPreview();
        }
        if (currentTool === 'line' && window.EditorCore && EditorCore.LineTool) {
            drawLineToolPreview();
        }
        if (typeof isModifyTool === 'function' && isModifyTool(currentTool)
            && window.EditorCore && EditorCore.ModifySession) {
            drawModifyPreview();
        }
        // 9. Preview Dist / kết quả Dist gần nhất
        if ((isDrawingRuler && rulerStart && rulerEnd) || lastDistMeasure) {
            drawRulerPreview();
        }

        // 9b. Preview / kết quả Area (AA)
        if ((isDrawingArea && areaPoints && areaPoints.length) || lastAreaMeasure) {
            drawAreaPreview();
        }
        if (currentTool === 'dimlinear' && typeof drawDimlinearPreview === 'function') {
            drawDimlinearPreview();
        }
        if (currentTool === 'dimaligned' && typeof drawDimalignedPreview === 'function') {
            drawDimalignedPreview();
        }
        if ((currentTool === 'calibrate' || (typeof isCalibrating === 'function' && isCalibrating()))
            && typeof drawCalibratePreview === 'function') {
            drawCalibratePreview();
        }
        if ((currentTool === 'bg-crop' || (typeof isCroppingBg === 'function' && isCroppingBg()))
            && typeof drawCropPreview === 'function') {
            drawCropPreview();
        }
    } catch (errPrev) {
        console.error('Lỗi preview trong draw():', errPrev);
    }

    // Screen-space overlay
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    try {
        if (typeof drawSnapMarker === 'function') drawSnapMarker();
    } catch (errSnap) {
        console.error('Lỗi snap marker:', errSnap);
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

    // thickness = px world (ctx đã scale zoom) — tường dày ML giữ đúng độ dày khi zoom
    var thickness = Math.max(1, wall.thickness || 4);
    var isOuter = !!wall.is_outer;

    // Viền phát sáng nhẹ
    ctx.strokeStyle = isOuter ? 'rgba(239, 68, 68, 0.25)' : 'rgba(17, 24, 39, 0.2)';
    ctx.lineWidth = thickness + (isOuter ? 3 : 2);
    ctx.lineCap = wall.isMline ? 'butt' : 'round';
    ctx.lineJoin = wall.isMline ? 'miter' : 'round';
    ctx.beginPath();
    ctx.moveTo(wall.points[0].x, wall.points[0].y);
    for (var i = 1; i < wall.points.length; i++) {
        ctx.lineTo(wall.points[i].x, wall.points[i].y);
    }
    ctx.stroke();

    // Nét chính
    ctx.strokeStyle = isSelected ? '#f59e0b' : (isOuter ? '#ef4444' : '#111827');
    ctx.lineWidth = isSelected ? thickness + 1 : thickness;
    ctx.beginPath();
    ctx.moveTo(wall.points[0].x, wall.points[0].y);
    for (var j = 1; j < wall.points.length; j++) {
        ctx.lineTo(wall.points[j].x, wall.points[j].y);
    }
    ctx.stroke();
    if (isSelected) {
        if (typeof drawSegmentVertexHandles === 'function') drawSegmentVertexHandles(wall, '#f59e0b');
        if (typeof drawSegmentRotateHandle === 'function') drawSegmentRotateHandle(wall, { color: '#f59e0b' });
    }
    // Nhãn chiều dài từng cạnh tường (checkbox «Hiện kích thước»)
    for (var k = 0; k < wall.points.length - 1; k++) {
        drawSegmentLengthLabel(wall.points[k], wall.points[k + 1], {
            color: isSelected ? '#f59e0b' : (isOuter ? '#ef4444' : '#334155'),
            requireDimCheck: true
        });
    }
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
        var tipW = (typeof window !== 'undefined' && window.lastMouseWorld)
            ? window.lastMouseWorld
            : preview;
        drawCursorLengthBadge(tipW, pts[pts.length - 1], preview, { color: '#06b6d4' });
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
    if (isSelected) {
        if (typeof drawSegmentVertexHandles === 'function') drawSegmentVertexHandles(line, '#3b82f6');
        if (typeof drawSegmentRotateHandle === 'function') drawSegmentRotateHandle(line, { color: '#3b82f6' });
    }
    drawSegmentLengthLabel(a, b, {
        color: isSelected ? '#f59e0b' : color,
        requireDimCheck: true
    });
}

/**
 * Nhãn chiều dài đoạn (mét) giữa 2 điểm — dùng khi vẽ / đã tạo.
 * @param {{requireDimCheck?:boolean, color?:string, offset?:number, nearEnd?:boolean, along?:number}} opts
 *   nearEnd: đặt nhãn gần điểm B (đầu đang kéo) — dễ đọc khi đoạn dài
 *   along: 0=đầu A … 1=đầu B (mặc định 0.5)
 */
function drawSegmentLengthLabel(a, b, opts) {
    if (!a || !b || typeof ctx === 'undefined') return;
    opts = opts || {};
    if (opts.requireDimCheck !== false) {
        var dc = typeof document !== 'undefined' ? document.getElementById('dimCheck') : null;
        if (dc && !dc.checked) return;
    }
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4) return;
    var meters = typeof pixelsToMeters === 'function' ? pixelsToMeters(dist) : dist;
    var label = (Number.isFinite(meters) ? meters.toFixed(2) : '?') + ' m';
    var along = opts.along != null ? opts.along : 0.5;
    if (opts.nearEnd) along = 0.88;
    along = Math.max(0, Math.min(1, along));
    var baseX = a.x + dx * along;
    var baseY = a.y + dy * along;
    var nx = -dy / dist;
    var ny = dx / dist;
    var off = (opts.offset != null ? opts.offset : 14) / (typeof zoom !== 'undefined' && zoom > 0 ? zoom : 1);
    var lx = baseX + nx * off;
    var ly = baseY + ny * off;
    var z = typeof zoom !== 'undefined' && zoom > 0 ? zoom : 1;
    var fontPx = 12 / z;
    var color = opts.color || '#2563eb';

    ctx.save();
    ctx.font = 'bold ' + fontPx + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tw = ctx.measureText(label).width;
    var pad = 3 / z;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(lx - tw / 2 - pad, ly - fontPx / 2 - pad, tw + pad * 2, fontPx + pad * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 / z;
    ctx.strokeRect(lx - tw / 2 - pad, ly - fontPx / 2 - pad, tw + pad * 2, fontPx + pad * 2);
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly);
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
    var ext = 64 / zoom;
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
    ctx.font = 'bold ' + fontPx + 'px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Luôn lệch TRÁI hướng vẽ (vuông góc) — nhãn mét lệch PHẢI → không chồng.
    var gapAlong = 20 / zoom;
    var gapSide = 40 / zoom;
    var lx = -uy;
    var ly = ux;
    var tx = preview.x + ux * gapAlong + lx * gapSide;
    var ty = preview.y + uy * gapAlong + ly * gapSide;

    var w = ctx.measureText(label).width;
    var pad = 3 / zoom;
    var bw = w + pad * 2;
    var bh = fontPx + pad * 2;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.strokeStyle = guideColor;
    ctx.lineWidth = 1.25 / zoom;
    ctx.fillRect(tx - bw / 2, ty - bh / 2, bw, bh);
    ctx.strokeRect(tx - bw / 2, ty - bh / 2, bw, bh);
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
        // Độ dài = đoạn thật (start→preview); vị trí nhãn = con trỏ hiện tại (không dính snap xa)
        var tip = (typeof window !== 'undefined' && window.lastMouseWorld)
            ? window.lastMouseWorld
            : preview;
        drawCursorLengthBadge(tip, start, preview, { color: '#8b5cf6' });
        drawPolarGuide(start, preview, { color: '#8b5cf6', badge: 'ĐOẠN' });
    }
}

/**
 * Nhãn chiều dài sát vị trí đang nhìn (cursor).
 * @param {{x,y}} at — chỗ gắn nhãn (thường = lastMouseWorld)
 * @param {{x,y}} from — điểm đầu đoạn
 * @param {{x,y}} [to] — điểm cuối đo (preview snap); mặc định = at
 */
function drawCursorLengthBadge(at, from, to, opts) {
    if (!at || !from || typeof ctx === 'undefined') return;
    opts = opts || {};
    var end = to || at;
    var dx = end.x - from.x;
    var dy = end.y - from.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4) return;
    var meters = typeof pixelsToMeters === 'function' ? pixelsToMeters(dist) : dist;
    var label = (Number.isFinite(meters) ? meters.toFixed(2) : '?') + ' m';
    var z = typeof zoom !== 'undefined' && zoom > 0 ? zoom : 1;
    var fontPx = 13 / z;
    // Lệch PHẢI hướng vẽ (ngược nhãn góc) — tránh ô kép tại tip
    var ux = dx / dist;
    var uy = dy / dist;
    var rx = uy;
    var ry = -ux;
    var side = 36 / z;
    var along = 12 / z;
    var lx = at.x + rx * side + ux * along;
    var ly = at.y + ry * side + uy * along;

    ctx.save();
    ctx.font = 'bold ' + fontPx + 'px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tw = ctx.measureText(label).width;
    var pad = 3 / z;
    var bw = tw + pad * 2;
    var bh = fontPx + pad * 2;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.strokeStyle = opts.color || '#8b5cf6';
    ctx.lineWidth = 1.25 / z;
    ctx.fillRect(lx - bw / 2, ly - bh / 2, bw, bh);
    ctx.strokeRect(lx - bw / 2, ly - bh / 2, bw, bh);
    ctx.fillStyle = opts.color || '#8b5cf6';
    ctx.fillText(label, lx, ly);
    ctx.restore();
}

/** Preview Phase 2: Move/Copy/Mirror/MLine rubber-band */
function drawModifyPreview() {
    if (!EditorCore.ModifySession) return;
    var snap = EditorCore.ModifySession.getSnapshot();
    if (!snap) return;
    var prev = snap.preview;
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    if (prev && prev.from && prev.to) {
        ctx.beginPath();
        ctx.moveTo(prev.from.x, prev.from.y);
        ctx.lineTo(prev.to.x, prev.to.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(prev.from.x, prev.from.y, 3 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(prev.to.x, prev.to.y, 2.5 / zoom, 0, Math.PI * 2);
        ctx.fill();
    } else if (prev && prev.mline && prev.mline.length >= 1) {
        var pts = prev.mline;
        var thick = Math.max(2, prev.thickness || 12);
        // Preview đúng độ dày tường (ctx đã scale zoom → dùng đơn vị world)
        ctx.strokeStyle = 'rgba(17, 24, 39, 0.75)';
        ctx.lineWidth = thick;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        // Tim đường tâm nét đứt
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.lineWidth = Math.max(1 / zoom, 1.5);
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f59e0b';
        for (var k = 0; k < pts.length; k++) {
            ctx.beginPath();
            ctx.arc(pts[k].x, pts[k].y, 3 / zoom, 0, Math.PI * 2);
            ctx.fill();
        }
    }
        // highlight cutting edge
    if (snap.cutting && snap.cutting.data && snap.cutting.data.points) {
        var cpts = snap.cutting.data.points;
        var si = snap.cutting.segIndex;
        if (cpts[si] && cpts[si + 1]) {
            ctx.setLineDash([]);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3 / zoom;
            ctx.beginPath();
            ctx.moveTo(cpts[si].x, cpts[si].y);
            ctx.lineTo(cpts[si + 1].x, cpts[si + 1].y);
            ctx.stroke();
        }
    }
    // Preview kết quả Trim/Extend
    if (prev && prev.trimResult) {
        ctx.setLineDash([4 / zoom, 3 / zoom]);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.5 / zoom;
        ctx.beginPath();
        ctx.moveTo(prev.trimResult.a.x, prev.trimResult.a.y);
        ctx.lineTo(prev.trimResult.b.x, prev.trimResult.b.y);
        ctx.stroke();
    }
    // PEdit: tô đậm đỉnh đang chọn
    if (snap.mode === 'pedit' && snap.stage === 'pedit') {
        var selObj = (typeof selectedObject !== 'undefined' && selectedObject) ? selectedObject
            : (typeof selectedRoom !== 'undefined' && selectedRoom ? { type: 'room', data: selectedRoom } : null);
        var ptsPe = selObj && selObj.data && selObj.data.points ? selObj.data.points : null;
        if (ptsPe && ptsPe.length) {
            ctx.setLineDash([]);
            for (var pi = 0; pi < ptsPe.length; pi++) {
                var active = snap.peditVertex === pi;
                ctx.fillStyle = active ? '#ef4444' : '#fbbf24';
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1 / zoom;
                var r = (active ? 6 : 4.5) / zoom;
                ctx.beginPath();
                ctx.arc(ptsPe[pi].x, ptsPe[pi].y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }
    }
    ctx.restore();
}

// --- Vẽ phòng chữ nhật ---
function drawRectRoom(room, isSelected) {
    ctx.globalAlpha = 0.5; // Thêm độ trong suốt
    ctx.fillStyle = room.color;
    ctx.fillRect(room.x, room.y, room.width, room.height);
    ctx.globalAlpha = 1.0;

    if (typeof EditorCore !== 'undefined' && EditorCore.Hatch) {
        EditorCore.Hatch.draw(ctx, room, zoom);
    }

    ctx.strokeStyle = isSelected ? '#3498db' : '#555';
    ctx.lineWidth = isSelected ? 2.5 / zoom : 1.5 / zoom;
    ctx.strokeRect(room.x, room.y, room.width, room.height);

    drawRoomLabel(room, room.x + room.width / 2, room.y + room.height / 2, room.width, room.height);

    var dc = document.getElementById('dimCheck');
    if (dc && dc.checked) drawRoomSizeLabels(room);
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

    if (typeof EditorCore !== 'undefined' && EditorCore.Hatch) {
        EditorCore.Hatch.draw(ctx, room, zoom);
    }

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

    if (typeof EditorCore !== 'undefined' && EditorCore.Hatch) {
        EditorCore.Hatch.draw(ctx, room, zoom);
    }

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
        drawRoomRotateHandle(room);
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

// === NHÃN W×H GẮN PHÒNG (checkbox dimCheck) — KHÔNG đụng tên drawCadDimensions ===
function drawRoomSizeLabels(room) {
    if (!room || !Number.isFinite(room.width) || !Number.isFinite(room.height)) return;
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

// === PREVIEW / KẾT QUẢ DIST (DI) ===
function drawRulerPreview() {
    var a = null;
    var b = null;
    var live = false;
    if (isDrawingRuler && rulerStart && rulerEnd) {
        a = rulerStart;
        b = rulerEnd;
        live = true;
    } else if (lastDistMeasure && lastDistMeasure.p1 && lastDistMeasure.p2) {
        a = lastDistMeasure.p1;
        b = lastDistMeasure.p2;
    }
    if (!a || !b) return;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 2.5 / zoom;
    ctx.setLineDash(live ? [6 / zoom, 4 / zoom] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    var size = 6 / zoom;
    ctx.fillStyle = '#f39c12';
    ctx.fillRect(a.x - size / 2, a.y - size / 2, size, size);
    ctx.fillRect(b.x - size / 2, b.y - size / 2, size, size);

    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var distPx = Math.sqrt(dx * dx + dy * dy);
    var meters = typeof pixelsToMeters === 'function' ? pixelsToMeters(distPx) : distPx;
    var label = (Number.isFinite(meters) ? meters.toFixed(2) : '?') + ' m';

    var fontSize = Math.max(11, 14 / zoom);
    ctx.font = 'bold ' + fontSize + 'px Consolas, monospace';
    ctx.fillStyle = '#d35400';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 8 / zoom);
}

// === PREVIEW / KẾT QUẢ AREA (AA) ===
function drawAreaPreview() {
    var pts = null;
    var live = false;
    var result = null;
    if (isDrawingArea && areaPoints && areaPoints.length) {
        pts = areaPoints.slice();
        if (areaPreview) pts.push(areaPreview);
        live = true;
    } else if (lastAreaMeasure) {
        result = lastAreaMeasure;
        pts = lastAreaMeasure.points;
    }
    if ((!pts || pts.length < 1) && !(result && result.roomShape === 'circle')) return;

    ctx.save();
    // Vòng tròn phòng
    if (result && result.roomShape === 'circle' && result.centroid && result.radiusPx) {
        ctx.beginPath();
        ctx.arc(result.centroid.x, result.centroid.y, result.radiusPx, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
        ctx.fill();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash(live ? [6 / zoom, 4 / zoom] : []);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (pts && pts.length) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (!live && pts.length >= 3) ctx.closePath();
        else if (live && areaPoints.length >= 1 && areaPreview) {
            // nét đóng mờ về đỉnh đầu
            ctx.lineTo(areaPoints[0].x, areaPoints[0].y);
        } else if (!live) {
            ctx.closePath();
        }
        if ((!live && pts.length >= 3) || (live && areaPoints.length >= 2)) {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
            ctx.fill();
        }
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash(live ? [6 / zoom, 4 / zoom] : []);
        ctx.stroke();
        ctx.setLineDash([]);

        var size = 5 / zoom;
        ctx.fillStyle = '#10b981';
        var verts = live ? areaPoints : pts;
        for (var v = 0; v < verts.length; v++) {
            ctx.fillRect(verts[v].x - size / 2, verts[v].y - size / 2, size, size);
        }
    }

    // Nhãn diện tích
    var labelResult = result;
    if (!labelResult && live && areaPoints.length >= 2) {
        var api = (typeof EditorCore !== 'undefined' && EditorCore.AreaCalc) ? EditorCore.AreaCalc : null;
        var work = areaPoints.slice();
        if (areaPreview) work.push(areaPreview);
        if (api && work.length >= 3) {
            var mpg = typeof metersPerGrid !== 'undefined' ? metersPerGrid : 0.5;
            var gs = typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40;
            labelResult = api.measure(work, mpg, gs);
        }
    }
    if (labelResult && labelResult.centroid) {
        var fontSize = Math.max(11, 13 / zoom);
        ctx.font = 'bold ' + fontSize + 'px Consolas, monospace';
        ctx.fillStyle = '#047857';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var text = labelResult.areaM2.toFixed(2) + ' m²';
        var tw = ctx.measureText(text).width;
        var pad = 4 / zoom;
        var cx = labelResult.centroid.x;
        var cy = labelResult.centroid.y;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.25 / zoom;
        ctx.fillRect(cx - tw / 2 - pad, cy - fontSize / 2 - pad, tw + pad * 2, fontSize + pad * 2);
        ctx.strokeRect(cx - tw / 2 - pad, cy - fontSize / 2 - pad, tw + pad * 2, fontSize + pad * 2);
        ctx.fillStyle = '#047857';
        ctx.fillText(text, cx, cy);
    }
    ctx.restore();
}

// === RESIZE HANDLES ===
function drawResizeHandles(room) {
    if (room.shape !== 'polygon') {
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
    drawRoomRotateHandle(room);
}

/** Icon xoay phía trên tâm phòng (giống cửa) */
function drawRoomRotateHandle(room) {
    if (typeof getRoomRotateHandle !== 'function') return;
    var h = getRoomRotateHandle(room);
    var c = h.center;
    ctx.save();
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(h.x, h.y);
    ctx.stroke();
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(h.x, h.y, 5 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1 / zoom;
    ctx.stroke();

    // Hiện góc: khi đang kéo xoay HOẶC user bật «Hiện góc trên map»
    var showDeg = window.isRotatingRoom || window.showRoomAngleLabels;
    var deg = null;
    if (window.isRotatingRoom && window.liveRoomRotateDeg != null) {
        deg = window.liveRoomRotateDeg;
    } else if (showDeg) {
        if (typeof room.rotationDeg === 'number') deg = room.rotationDeg;
        else if (room.shape === 'polygon' && room.points && room.points.length >= 2) {
            deg = Math.atan2(room.points[1].y - room.points[0].y,
                room.points[1].x - room.points[0].x) * 180 / Math.PI;
        } else deg = 0;
    }
    if (showDeg && deg != null) {
        deg = ((deg % 360) + 360) % 360;
        var label = Math.round(deg * 10) / 10 + '\u00B0';
        var fontPx = 12 / zoom;
        ctx.font = 'bold ' + fontPx + 'px sans-serif';
        var tw = ctx.measureText(label).width;
        var lx = h.x - tw / 2;
        var ly = h.y - 10 / zoom;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(lx - 3 / zoom, ly - fontPx, tw + 6 / zoom, fontPx + 5 / zoom);
        ctx.fillStyle = '#fbbf24';
        ctx.textBaseline = 'top';
        ctx.fillText(label, lx, ly - fontPx + 2 / zoom);
    }
    ctx.restore();
}
