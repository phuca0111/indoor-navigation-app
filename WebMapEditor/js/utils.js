// ============================================================
// UTILS.JS - Hàm tiện ích: Chuyển đổi tọa độ, snap, color
// ============================================================

// Chuyển tọa độ màn hình → tọa độ thế giới
function screenToWorld(sx, sy) {
    return {
        x: (sx - panX) / zoom,
        y: (sy - panY) / zoom
    };
}

// Chuyển tọa độ thế giới → tọa độ màn hình
function worldToScreen(wx, wy) {
    return {
        x: wx * zoom + panX,
        y: wy * zoom + panY
    };
}

// Chuyển pixels → mét
function pixelsToMeters(px) {
    return (px / GRID_SIZE) * metersPerGrid;
}

// Chuyển mét → pixels
function metersToPixels(m) {
    return (m / metersPerGrid) * GRID_SIZE;
}

// Snap giá trị vào lưới — chỉ khi bật checkbox「Hút vào lưới」
function isGridSnapEnabled() {
    var sc = document.getElementById('snapCheck');
    return !!(sc && sc.checked);
}

function isEdgeSnapEnabled() {
    var ec = document.getElementById('edgeSnapCheck');
    return !!(ec && ec.checked);
}

function snapToGrid(val) {
    if (!isGridSnapEnabled()) return val;

    var tolerance = 10;
    if (window.EditorCore && EditorCore.Config) {
        tolerance = EditorCore.Config.get('snap.gridTolerancePx', 10);
    }

    var snapped = Math.round(val / GRID_SIZE) * GRID_SIZE;
    var dist = Math.abs(val - snapped);

    if (dist < tolerance) return snapped;
    return val;
}

var SNAP_ROOM_EDGE_THRESHOLD = 24;

function closestPointOnSegment(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    if (dx === 0 && dy === 0) return { x: x1, y: y1 };
    var t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + t * dx, y: y1 + t * dy };
}

function distancePointToSegment(px, py, x1, y1, x2, y2) {
    var cp = closestPointOnSegment(px, py, x1, y1, x2, y2);
    var sx = px - cp.x;
    var sy = py - cp.y;
    return Math.sqrt(sx * sx + sy * sy);
}

function getRoomEdgeSegments(room) {
    if (!room) return [];
    if (room.shape === 'polygon' && room.points && room.points.length >= 2) {
        var segs = [];
        for (var i = 0; i < room.points.length; i++) {
            var a = room.points[i];
            var b = room.points[(i + 1) % room.points.length];
            segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        }
        return segs;
    }
    var x = room.x;
    var y = room.y;
    var w = room.width || 0;
    var h = room.height || 0;
    if (room.shape === 'circle') {
        var cx = room.cx != null ? room.cx : x + w / 2;
        var cy = room.cy != null ? room.cy : y + h / 2;
        var r = room.radius != null ? room.radius : Math.min(w, h) / 2;
        x = cx - r;
        y = cy - r;
        w = r * 2;
        h = r * 2;
    }
    return [
        { x1: x, y1: y, x2: x + w, y2: y },
        { x1: x + w, y1: y, x2: x + w, y2: y + h },
        { x1: x + w, y1: y + h, x2: x, y2: y + h },
        { x1: x, y1: y + h, x2: x, y2: y }
    ];
}

/** Hút cửa vào viền phòng — chỉ khi bật「Hút viền phòng」. */
function snapDoorToRoomEdge(x, y, threshold) {
    if (!isEdgeSnapEnabled()) return null;
    if (typeof rooms === 'undefined' || !rooms.length) return null;
    if (threshold == null && window.EditorCore && EditorCore.Config) {
        threshold = EditorCore.Config.get('snap.roomEdgeThresholdPx', 24);
    }
    threshold = threshold != null ? threshold : SNAP_ROOM_EDGE_THRESHOLD;
    var best = null;
    var bestDist = threshold;

    for (var ri = 0; ri < rooms.length; ri++) {
        var edgeSegs = getRoomEdgeSegments(rooms[ri]);
        for (var si = 0; si < edgeSegs.length; si++) {
            var seg = edgeSegs[si];
            var d = distancePointToSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
            if (d < bestDist) {
                var cp = closestPointOnSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
                var sdx = seg.x2 - seg.x1;
                var sdy = seg.y2 - seg.y1;
                var rotation = Math.abs(sdx) >= Math.abs(sdy) ? 0 : 90;
                bestDist = d;
                best = { x: cp.x, y: cp.y, rotation: rotation };
            }
        }
    }
    return best;
}

/** Đặt/kéo cửa: viền (nếu bật) → lưới (nếu bật) → tự do. */
function resolveDoorPosition(x, y) {
    if (isEdgeSnapEnabled()) {
        var edge = snapDoorToRoomEdge(x, y);
        if (edge) {
            return { x: edge.x, y: edge.y, rotation: edge.rotation };
        }
    }
    if (isGridSnapEnabled()) {
        return { x: snapToGrid(x), y: snapToGrid(y), rotation: null };
    }
    return { x: x, y: y, rotation: null };
}

function getRulerSegmentLengthPx(start, end) {
    if (!start || !end) return 0;
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function formatRulerLabel(distPx, metersPerGridVal, gridSize) {
    var g = gridSize != null ? gridSize : (typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40);
    var mpg = metersPerGridVal != null ? metersPerGridVal
        : (typeof metersPerGrid !== 'undefined' ? metersPerGrid : 0.5);
    var distM = (distPx / g) * mpg;
    return distM.toFixed(2) + ' m · ' + Math.round(distPx) + ' px';
}

function constrainOrthoPoint(start, end, ortho) {
    if (!start || !end) return end;
    if (!ortho) return end;
    var dx = Math.abs(end.x - start.x);
    var dy = Math.abs(end.y - start.y);
    if (dx >= dy) return { x: end.x, y: start.y };
    return { x: start.x, y: end.y };
}

/** @deprecated alias — dùng constrainOrthoPoint */
function constrainRulerEnd(start, end, ortho) {
    return constrainOrthoPoint(start, end, ortho);
}

/**
 * Điểm khi vẽ đoạn thẳng: Shift = ngang/dọc từ anchor, sau đó hút lưới (nếu bật).
 * @param {{x,y}|null} anchor — điểm đầu đoạn (null = không ortho)
 */
function resolveLinePoint(anchor, world, shiftKey) {
    var pt = (anchor && shiftKey)
        ? constrainOrthoPoint(anchor, world, true)
        : { x: world.x, y: world.y };
    if (isGridSnapEnabled()) {
        return { x: snapToGrid(pt.x), y: snapToGrid(pt.y) };
    }
    return pt;
}

function clearRulerMeasurement() {
    if (typeof rulerStart !== 'undefined') rulerStart = null;
    if (typeof rulerEnd !== 'undefined') rulerEnd = null;
    if (typeof rulerAwaitingEnd !== 'undefined') rulerAwaitingEnd = false;
    if (typeof isDrawingRuler !== 'undefined') isDrawingRuler = false;
}

function showRulerMeasurementResult(distPx) {
    if (distPx <= 5) return;
    var mode = getRulerMode();
    var g = typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40;
    var mpg = typeof metersPerGrid !== 'undefined' ? metersPerGrid : 0.5;
    if (mode === 'calibrate' && !(typeof isScaleEditingLocked === 'function' && isScaleEditingLocked())) {
        var guessM = ((distPx / g) * mpg).toFixed(2);
        var m = prompt('Đoạn thẳng này dài bao nhiêu mét thực tế?', guessM);
        if (m !== null && !isNaN(parseFloat(m))) {
            var realMeters = parseFloat(m);
            if (Number.isFinite(realMeters) && realMeters > 0) {
                var nextScale = (realMeters / distPx) * g;
                if (Number.isFinite(nextScale) && nextScale > 0) {
                    metersPerGrid = nextScale;
                    if (typeof document !== 'undefined' && document.getElementById('scaleInput')) {
                        document.getElementById('scaleInput').value = metersPerGrid.toFixed(2);
                    }
                    if (typeof showToast === 'function') {
                        showToast('Đã căn tỷ lệ: 1 ô lưới = ' + metersPerGrid.toFixed(2) + ' m', 'success');
                    }
                }
            }
        }
    } else if (typeof showToast === 'function') {
        showToast('Đo: ' + formatRulerLabel(distPx, mpg, g), 'success');
    }
}
if (typeof window !== 'undefined') {
    window.clearRulerMeasurement = clearRulerMeasurement;
    window.constrainRulerEnd = constrainRulerEnd;
    window.constrainOrthoPoint = constrainOrthoPoint;
    window.resolveLinePoint = resolveLinePoint;
    window.showRulerMeasurementResult = showRulerMeasurementResult;
}

function getRulerMode() {
    if (typeof rulerMode !== 'undefined') return rulerMode;
    if (window.EditorCore && EditorCore.Config) {
        return EditorCore.Config.get('ruler.defaultMode', 'measure');
    }
    return 'measure';
}

function setRulerMode(mode) {
    if (typeof isScaleEditingLocked === 'function' && isScaleEditingLocked() && mode === 'calibrate') {
        mode = 'measure';
    }
    if (mode !== 'measure' && mode !== 'calibrate') return;
    if (typeof rulerMode !== 'undefined') rulerMode = mode;
    var sel = typeof document !== 'undefined' ? document.getElementById('rulerModeSelect') : null;
    if (sel && !sel.disabled) sel.value = mode;
}

function getProjectScaleRatio() {
    if (window.EditorCore && EditorCore.Config) {
        return EditorCore.Config.get('scale.ratio', 0.5);
    }
    return 0.5;
}

function isScaleConfigLocked() {
    if (window.EditorCore && EditorCore.Config) {
        return !!EditorCore.Config.get('scale.locked', true);
    }
    return true;
}

/** Khóa sửa tỷ lệ: config locked HOẶC đã load từ server */
function isScaleEditingLocked() {
    if (isScaleConfigLocked()) return true;
    return typeof scaleLockedFromServer !== 'undefined' && !!scaleLockedFromServer;
}

function applyScalePolicy(opts) {
    opts = opts || {};
    var ratio = getProjectScaleRatio();
    if (isScaleConfigLocked() || opts.forceProjectRatio) {
        if (typeof metersPerGrid !== 'undefined') metersPerGrid = ratio;
    }
    if (typeof metersPerGrid !== 'undefined' && isScaleEditingLocked()) {
        metersPerGrid = ratio;
    }

    var inp = typeof document !== 'undefined' ? document.getElementById('scaleInput') : null;
    if (inp) {
        inp.value = (typeof metersPerGrid !== 'undefined' ? metersPerGrid : ratio).toFixed(2);
        inp.readOnly = isScaleEditingLocked();
        inp.title = isScaleEditingLocked()
            ? (EditorCore && EditorCore.Config ? EditorCore.Config.get('scale.hint', '') : 'Tỷ lệ khóa')
            : '1 ô lưới = X mét (khuyến nghị 0.5)';
    }

    var rulerSel = typeof document !== 'undefined' ? document.getElementById('rulerModeSelect') : null;
    if (rulerSel) {
        if (isScaleEditingLocked()) {
            rulerSel.disabled = true;
            setRulerMode('measure');
        } else {
            rulerSel.disabled = false;
        }
        var calOpt = rulerSel.querySelector('option[value="calibrate"]');
        if (calOpt) calOpt.hidden = isScaleEditingLocked();
    }
}
if (typeof window !== 'undefined') {
    window.applyScalePolicy = applyScalePolicy;
    window.isScaleEditingLocked = isScaleEditingLocked;
}

if (typeof module === 'object' && module.exports) {
    module.exports = {
        formatRulerLabel: formatRulerLabel,
        getRulerSegmentLengthPx: getRulerSegmentLengthPx,
        constrainOrthoPoint: constrainOrthoPoint,
        constrainRulerEnd: constrainRulerEnd,
        resolveLinePoint: resolveLinePoint,
        getRulerMode: getRulerMode,
        setRulerMode: setRulerMode,
        getProjectScaleRatio: getProjectScaleRatio,
        isScaleEditingLocked: isScaleEditingLocked,
        applyScalePolicy: applyScalePolicy
    };
}

// Chuyển màu CSS sang hex cho input[type=color]
function rgbToHex(color) {
    if (color.startsWith('#') && color.length === 7) return color;
    const temp = document.createElement('div');
    temp.style.color = color;
    document.body.appendChild(temp);
    const computed = getComputedStyle(temp).color;
    document.body.removeChild(temp);
    const match = computed.match(/\d+/g);
    if (!match) return '#cccccc';
    return '#' + match.slice(0, 3).map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
}
