// ============================================================
// ROOMS.JS - Logic phòng: Rect, Circle, Polygon
// ============================================================

function applyDefaultRoomLabelStyle(room) {
    if (!room || typeof room !== 'object') return room;
    if (!Number.isFinite(room.labelRotation)) room.labelRotation = 0;
    if (!Number.isFinite(room.labelFontSize) || room.labelFontSize <= 0) room.labelFontSize = 14;
    if (typeof room.labelAutoScale !== 'boolean') room.labelAutoScale = true;
    if (!Number.isFinite(room.labelLineHeight) || room.labelLineHeight <= 0) room.labelLineHeight = 1.2;
    return room;
}

// --- HIT TEST: Tìm phòng tại vị trí click ---
function findRoomAt(wx, wy) {
    for (var i = rooms.length - 1; i >= 0; i--) {
        var r = rooms[i];
        if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(r)) continue;
        if (r.shape === 'circle') {
            // Kiểm tra trong vòng tròn
            var dx = wx - r.cx;
            var dy = wy - r.cy;
            if (dx * dx + dy * dy <= r.radius * r.radius) return r;
        } else if (r.shape === 'polygon') {
            // Kiểm tra trong đa giác (ray casting)
            if (pointInPolygon(wx, wy, r.points)) return r;
        } else {
            // Rect (mặc định)
            if (wx >= r.x && wx <= r.x + r.width &&
                wy >= r.y && wy <= r.y + r.height) return r;
        }
    }
    return null;
}

// Kiểm tra điểm trong polygon (Ray Casting Algorithm)
function pointInPolygon(px, py, points) {
    var inside = false;
    for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
        var xi = points[i].x, yi = points[i].y;
        var xj = points[j].x, yj = points[j].y;
        if ((yi > py) !== (yj > py) &&
            px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/** Độ dài 1 cạnh (px). */
function polygonSegmentPx(p1, p2) {
    if (!p1 || !p2) return 0;
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/** Diện tích đa giác kín (px²) — công thức shoelace. */
function polygonAreaPx(points) {
    if (!points || points.length < 3) return 0;
    var sum = 0;
    for (var i = 0; i < points.length; i++) {
        var j = (i + 1) % points.length;
        sum += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return Math.abs(sum) * 0.5;
}

/** Chu vi (px). close=true thêm cạnh đóng cuối→đầu. */
function polygonPerimeterPx(points, close) {
    if (!points || points.length < 2) return 0;
    var total = 0;
    var limit = close && points.length >= 3 ? points.length : points.length - 1;
    for (var i = 0; i < limit; i++) {
        var j = (i + 1) % points.length;
        total += polygonSegmentPx(points[i], points[j]);
    }
    return total;
}

/** Tâm khối đa giác kín — dùng đặt nhãn diện tích. */
function polygonCentroid(points) {
    if (!points || points.length < 3) {
        if (!points || !points.length) return { x: 0, y: 0 };
        var sx = 0, sy = 0;
        points.forEach(function (p) { sx += p.x; sy += p.y; });
        return { x: sx / points.length, y: sy / points.length };
    }
    var cx = 0, cy = 0, a = 0;
    for (var i = 0; i < points.length; i++) {
        var j = (i + 1) % points.length;
        var cross = points[i].x * points[j].y - points[j].x * points[i].y;
        a += cross;
        cx += (points[i].x + points[j].x) * cross;
        cy += (points[i].y + points[j].y) * cross;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-6) {
        return { x: points[0].x, y: points[0].y };
    }
    return { x: cx / (6 * a), y: cy / (6 * a) };
}

function squarePixelsToSquareMeters(areaPx) {
    var mPerPx = metersPerGrid / GRID_SIZE;
    return areaPx * mPerPx * mPerPx;
}

/** Cạnh đa giác tối thiểu (mét) — phải > 1mm để chặn đỉnh trùng / cạnh = 0. */
var MIN_POLYGON_EDGE_M = 0.0011; // 1.1 mm

function getMinPolygonEdgeMeters() {
    return MIN_POLYGON_EDGE_M;
}

function getMinPolygonEdgePx() {
    return metersToPixels(getMinPolygonEdgeMeters());
}

/** Nhãn ngưỡng cho UI (vd. "1.1mm"). */
function formatMinPolygonEdgeLabel() {
    var m = getMinPolygonEdgeMeters();
    if (m < 0.01) return (Math.round(m * 10000) / 10) + 'mm';
    return m + 'm';
}

/**
 * Kiểm tra mọi cạnh (kể cả cạnh đóng) ≥ ngưỡng tối thiểu.
 * @returns {{ok:boolean, reason?:string, edgeIndex?:number}}
 */
function validatePolygonGeometry(points) {
    if (!points || points.length < 3) {
        return { ok: false, reason: 'Cần ít nhất 3 đỉnh' };
    }
    var minPx = getMinPolygonEdgePx();
    for (var i = 0; i < points.length; i++) {
        var j = (i + 1) % points.length;
        var len = polygonSegmentPx(points[i], points[j]);
        if (!(len >= minPx)) {
            return {
                ok: false,
                reason: 'Cạnh ' + (i + 1) + ' phải ≥ ' + formatMinPolygonEdgeLabel() +
                    ' (hiện ' + (pixelsToMeters(len) * 1000).toFixed(1) + 'mm)',
                edgeIndex: i
            };
        }
    }
    return { ok: true };
}

/**
 * Đẩy điểm ra xa neo nếu khoảng cách < minPx.
 * @returns {{x:number,y:number}}
 */
function pushPointAwayFrom(anchor, point, minPx) {
    var dx = point.x - anchor.x;
    var dy = point.y - anchor.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len >= minPx) return { x: point.x, y: point.y };
    if (len < 1e-6) {
        return { x: anchor.x + minPx, y: anchor.y };
    }
    var s = minPx / len;
    return { x: anchor.x + dx * s, y: anchor.y + dy * s };
}

/** Giữ đỉnh polygon cách đỉnh trước/sau ≥ ngưỡng tối thiểu. */
function clampPolygonVertexPosition(room, index, x, y) {
    var pts = room && room.points;
    if (!pts || pts.length < 3) return { x: x, y: y };
    var n = pts.length;
    var i = ((index % n) + n) % n;
    var minPx = getMinPolygonEdgePx();
    var prev = pts[(i - 1 + n) % n];
    var next = pts[(i + 1) % n];
    var p = pushPointAwayFrom(prev, { x: x, y: y }, minPx);
    p = pushPointAwayFrom(next, p, minPx);
    // Sau khi đẩy khỏi next có thể lại sát prev
    p = pushPointAwayFrom(prev, p, minPx);
    return p;
}

function notifyPolygonGeometryError(reason) {
    if (typeof showToast === 'function') {
        showToast(reason || 'Đa giác không hợp lệ', 'error');
    } else {
        console.warn('[Polygon]', reason);
    }
}

/**
 * Thông số đa giác: cạnh → chu vi → diện tích.
 * @param {Array<{x:number,y:number}>} points
 * @param {{previewPoint?:{x:number,y:number}, includeClosingEdge?:boolean}} [opts]
 */
function getPolygonMetrics(points, opts) {
    opts = opts || {};
    var work = (points || []).slice();
    if (opts.previewPoint) work.push(opts.previewPoint);

    var edges = [];
    for (var i = 0; i < work.length - 1; i++) {
        var lenPx = polygonSegmentPx(work[i], work[i + 1]);
        edges.push({
            lengthPx: lenPx,
            lengthM: pixelsToMeters(lenPx),
            midX: (work[i].x + work[i + 1].x) / 2,
            midY: (work[i].y + work[i + 1].y) / 2,
            dx: work[i + 1].x - work[i].x,
            dy: work[i + 1].y - work[i].y
        });
    }

    var close = !!opts.includeClosingEdge && work.length >= 3;
    if (close) {
        var closeLenPx = polygonSegmentPx(work[work.length - 1], work[0]);
        edges.push({
            lengthPx: closeLenPx,
            lengthM: pixelsToMeters(closeLenPx),
            midX: (work[work.length - 1].x + work[0].x) / 2,
            midY: (work[work.length - 1].y + work[0].y) / 2,
            dx: work[0].x - work[work.length - 1].x,
            dy: work[0].y - work[work.length - 1].y,
            isClosing: true
        });
    }

    var perimeterPx = polygonPerimeterPx(work, false);
    if (close) perimeterPx += polygonSegmentPx(work[work.length - 1], work[0]);

    var areaPx = work.length >= 3 ? polygonAreaPx(work) : 0;

    return {
        vertexCount: (points || []).length,
        edges: edges,
        perimeterM: pixelsToMeters(perimeterPx),
        areaM2: squarePixelsToSquareMeters(areaPx),
        centroid: polygonCentroid(work.length >= 3 ? work : points)
    };
}

// --- TẠO PHÒNG CHỮ NHẬT ---
function createRoom(startX, startY, endX, endY) {
    var x = Math.min(startX, endX);
    var y = Math.min(startY, endY);
    var w = Math.abs(endX - startX);
    var h = Math.abs(endY - startY);
    if (w < GRID_SIZE / 2 || h < GRID_SIZE / 2) return null;

    var colors = ['#e8f4f8', '#fef3e2', '#e8f8e8', '#f8e8f4', '#f0f0e0', '#e0f0f0'];
    var room = {
        id: nextRoomId++,
        shape: 'rect',
        name: 'Phòng ' + (rooms.length + 1),
        type: 'Văn phòng', // Default type
        layerId: legacyGetActiveLayerId ? legacyGetActiveLayerId() : 'default',
        x: x, y: y, width: w, height: h,
        color: colors[rooms.length % colors.length],
        labelRotation: 0,
        labelFontSize: 14,
        labelAutoScale: true,
        labelLineHeight: 1.2
    };
    if (typeof EditorCore !== 'undefined' && EditorCore.ObjectTransform) {
        EditorCore.ObjectTransform.ensureOriginalGeometry('room', room);
    }
    return room;
}

// --- TẠO PHÒNG TRÒN ---
function createCircleRoom(cx, cy, radius) {
    if (radius < 10) return null;
    var colors = ['#e8f4f8', '#fef3e2', '#e8f8e8', '#f8e8f4', '#f0f0e0', '#e0f0f0'];
    var room = {
        id: nextRoomId++,
        shape: 'circle',
        name: 'Phòng ' + (rooms.length + 1),
        type: 'Văn phòng', // Default type
        layerId: legacyGetActiveLayerId ? legacyGetActiveLayerId() : 'default',
        cx: cx, cy: cy, radius: radius,
        // Bounding box (để tương thích)
        x: cx - radius, y: cy - radius,
        width: radius * 2, height: radius * 2,
        color: colors[rooms.length % colors.length],
        labelRotation: 0,
        labelFontSize: 14,
        labelAutoScale: true,
        labelLineHeight: 1.2
    };
    if (typeof EditorCore !== 'undefined' && EditorCore.ObjectTransform) {
        EditorCore.ObjectTransform.ensureOriginalGeometry('room', room);
    }
    return room;
}

/** Cập nhật bbox (x/y/width/height) từ points đa giác. */
function updatePolygonBoundingBox(room) {
    var pts = room && (room.points || room.vertices);
    if (!pts || pts.length < 1) return;
    var minX = pts[0].x, maxX = pts[0].x;
    var minY = pts[0].y, maxY = pts[0].y;
    for (var i = 1; i < pts.length; i++) {
        if (pts[i].x < minX) minX = pts[i].x;
        if (pts[i].x > maxX) maxX = pts[i].x;
        if (pts[i].y < minY) minY = pts[i].y;
        if (pts[i].y > maxY) maxY = pts[i].y;
    }
    room.x = minX;
    room.y = minY;
    room.width = maxX - minX;
    room.height = maxY - minY;
}

/**
 * Đặt chiều dài cạnh (mét): giữ đỉnh đầu cố định, kéo đỉnh cuối theo hướng cạnh.
 * Từ chối nếu < ngưỡng tối thiểu.
 * @returns {boolean}
 */
function setPolygonEdgeLengthMeters(room, edgeIndex, lengthMeters) {
    var pts = room && room.points;
    if (!pts || pts.length < 3) return false;
    var minM = getMinPolygonEdgeMeters();
    if (!Number.isFinite(lengthMeters) || lengthMeters < minM) return false;

    var n = pts.length;
    var i = ((edgeIndex % n) + n) % n;
    var j = (i + 1) % n;
    var targetPx = metersToPixels(lengthMeters);
    if (!(targetPx > 0) || !Number.isFinite(targetPx)) return false;

    var ax = pts[i].x, ay = pts[i].y;
    var bx = pts[j].x, by = pts[j].y;
    var dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) {
        // Cạnh đang = 0: lấy hướng từ cạnh trước, hoặc trục X
        var k = (i - 1 + n) % n;
        dx = ax - pts[k].x;
        dy = ay - pts[k].y;
        len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-6) {
            dx = 1;
            dy = 0;
            len = 1;
        }
    }

    var scale = targetPx / len;
    pts[j].x = ax + dx * scale;
    pts[j].y = ay + dy * scale;
    updatePolygonBoundingBox(room);
    return true;
}

// --- TẠO PHÒNG ĐA GIÁC ---
function createPolygonRoom(points) {
    if (points.length < 3) return null;

    var check = validatePolygonGeometry(points);
    if (!check.ok) {
        notifyPolygonGeometryError(check.reason);
        return null;
    }

    var colors = ['#e8f4f8', '#fef3e2', '#e8f8e8', '#f8e8f4', '#f0f0e0', '#e0f0f0'];
    var room = {
        id: nextRoomId++,
        shape: 'polygon',
        name: 'Phòng ' + (rooms.length + 1),
        type: 'Văn phòng', // Default type
        layerId: legacyGetActiveLayerId ? legacyGetActiveLayerId() : 'default',
        points: points.slice(), // Copy mảng
        x: 0, y: 0, width: 0, height: 0,
        color: colors[rooms.length % colors.length],
        labelRotation: 0,
        labelFontSize: 14,
        labelAutoScale: true,
        labelLineHeight: 1.2
    };
    updatePolygonBoundingBox(room);
    if (typeof EditorCore !== 'undefined' && EditorCore.ObjectTransform) {
        EditorCore.ObjectTransform.ensureOriginalGeometry('room', room);
    }
    return room;
}

// --- RESIZE HANDLES (chỉ cho rect) ---
function getHandlePositions(room) {
    var x = room.x, y = room.y, w = room.width, h = room.height;
    return {
        'nw': { x: x, y: y },
        'n': { x: x + w / 2, y: y },
        'ne': { x: x + w, y: y },
        'e': { x: x + w, y: y + h / 2 },
        'se': { x: x + w, y: y + h },
        's': { x: x + w / 2, y: y + h },
        'sw': { x: x, y: y + h },
        'w': { x: x, y: y + h / 2 }
    };
}

function getResizeHandle(wx, wy, room) {
    if (room.shape === 'polygon') return null; // Polygon chưa hỗ trợ resize handle
    var handles = getHandlePositions(room);
    var threshold = HANDLE_SIZE / zoom;
    for (var name in handles) {
        var pos = handles[name];
        if (Math.abs(wx - pos.x) < threshold && Math.abs(wy - pos.y) < threshold) {
            return name;
        }
    }
    return null;
}

/** Tâm phòng (rect / circle / polygon) */
function getRoomCenter(room) {
    if (!room) return { x: 0, y: 0 };
    if (window.EditorCore && EditorCore.ObjectTransform) {
        return EditorCore.ObjectTransform.getObjectCentroid('room', room);
    }
    if (room.shape === 'circle') return { x: room.cx, y: room.cy };
    if (room.shape === 'polygon' && room.points && room.points.length) {
        var sx = 0, sy = 0;
        room.points.forEach(function (p) { sx += p.x; sy += p.y; });
        return { x: sx / room.points.length, y: sy / room.points.length };
    }
    return { x: room.x + room.width / 2, y: room.y + room.height / 2 };
}

/** Handle xoay phía trên tâm phòng */
function getRoomRotateHandle(room) {
    var c = getRoomCenter(room);
    var dist = 28;
    return { x: c.x, y: c.y - dist, center: c };
}

function hitRoomRotateHandle(wx, wy, room) {
    if (!room) return false;
    var h = getRoomRotateHandle(room);
    var threshold = (HANDLE_SIZE + 4) / zoom;
    return Math.abs(wx - h.x) < threshold && Math.abs(wy - h.y) < threshold;
}

function resizeRoom(snappedX, snappedY) {
    var r = selectedRoom;
    var s = resizeStartRoom;
    if (r.shape === 'circle') {
        // Resize circle = thay đổi bán kính
        var dx = snappedX - r.cx;
        var dy = snappedY - r.cy;
        r.radius = Math.max(10, Math.sqrt(dx * dx + dy * dy));
        r.x = r.cx - r.radius;
        r.y = r.cy - r.radius;
        r.width = r.radius * 2;
        r.height = r.radius * 2;
        return;
    }
    // Rect resize (giữ nguyên logic cũ)
    switch (resizeHandle) {
        case 'se': r.width = Math.max(GRID_SIZE, snappedX - r.x); r.height = Math.max(GRID_SIZE, snappedY - r.y); break;
        case 'e': r.width = Math.max(GRID_SIZE, snappedX - r.x); break;
        case 's': r.height = Math.max(GRID_SIZE, snappedY - r.y); break;
        case 'nw': { var nw = s.x + s.width - snappedX; var nh = s.y + s.height - snappedY; if (nw >= GRID_SIZE) { r.x = snappedX; r.width = nw; } if (nh >= GRID_SIZE) { r.y = snappedY; r.height = nh; } break; }
        case 'n': { var nh = s.y + s.height - snappedY; if (nh >= GRID_SIZE) { r.y = snappedY; r.height = nh; } break; }
        case 'ne': { r.width = Math.max(GRID_SIZE, snappedX - r.x); var nh = s.y + s.height - snappedY; if (nh >= GRID_SIZE) { r.y = snappedY; r.height = nh; } break; }
        case 'sw': { var nw = s.x + s.width - snappedX; if (nw >= GRID_SIZE) { r.x = snappedX; r.width = nw; } r.height = Math.max(GRID_SIZE, snappedY - r.y); break; }
        case 'w': { var nw = s.x + s.width - snappedX; if (nw >= GRID_SIZE) { r.x = snappedX; r.width = nw; } break; }
    }
}
