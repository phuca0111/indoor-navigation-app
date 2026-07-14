// ============================================================
// LINES.JS - Đoạn thẳng hỗ trợ (CAD), không phải tường
// ============================================================

function createLineSegment(start, end, options) {
    if (!start || !end) return null;
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var length = Math.sqrt(dx * dx + dy * dy);
    if (length < 4) return null;

    var line = {
        id: nextLineId++,
        type: 'segment',
        color: (options && options.color) || '#3b82f6',
        lineWeight: (options && options.lineWeight) || 2,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default',
        points: [
            { x: start.x, y: start.y },
            { x: end.x, y: end.y }
        ]
    };
    lines.push(line);
    if (typeof EditorCore !== 'undefined' && EditorCore.ObjectTransform) {
        EditorCore.ObjectTransform.ensureOriginalGeometry('line', line);
    }
    if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
    return line;
}

function findLineAt(wx, wy) {
    var threshold = 6 / zoom;
    for (var i = lines.length - 1; i >= 0; i--) {
        var ln = lines[i];
        if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(ln)) continue;
        if (!ln.points || ln.points.length < 2) continue;
        var a = ln.points[0];
        var b = ln.points[1];
        var d = distancePointToSegment(wx, wy, a.x, a.y, b.x, b.y);
        if (d <= threshold) return ln;
    }
    return null;
}

function deleteLine(line) {
    lines = lines.filter(function (ln) { return ln.id !== line.id; });
}

/** Tâm polyline (line/wall) — dùng xoay handle */
function getPolylineCentroid(obj) {
    if (!obj || !obj.points || !obj.points.length) return { x: 0, y: 0 };
    if (window.EditorCore && EditorCore.ObjectTransform) {
        var kind = (obj.thickness != null || obj.is_outer != null) ? 'wall' : 'line';
        return EditorCore.ObjectTransform.getObjectCentroid(kind, obj);
    }
    var sx = 0, sy = 0;
    for (var i = 0; i < obj.points.length; i++) {
        sx += obj.points[i].x;
        sy += obj.points[i].y;
    }
    return { x: sx / obj.points.length, y: sy / obj.points.length };
}

/** Góc hướng đoạn (điểm 0→1), độ 0–360 */
function getPolylineHeadingDeg(obj) {
    if (!obj || !obj.points || obj.points.length < 2) return 0;
    var a = obj.points[0], b = obj.points[1];
    var deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    return ((deg % 360) + 360) % 360;
}

/**
 * Handle xoay phía trên tâm đoạn/tường (giống phòng).
 * @returns {{x,y,center}}
 */
function getSegmentRotateHandle(obj) {
    var c = getPolylineCentroid(obj);
    var dist = 28;
    return { x: c.x, y: c.y - dist, center: c };
}

function hitSegmentRotateHandle(wx, wy, obj) {
    if (!obj || !obj.points) return false;
    var h = getSegmentRotateHandle(obj);
    var threshold = ((typeof HANDLE_SIZE !== 'undefined' ? HANDLE_SIZE : 8) + 4) / zoom;
    return Math.abs(wx - h.x) < threshold && Math.abs(wy - h.y) < threshold;
}

/** Index đỉnh gần (wx,wy) hoặc -1 */
function hitPolylineVertex(wx, wy, obj, threshold) {
    if (!obj || !obj.points || !obj.points.length) return -1;
    var thr = threshold != null ? threshold : (8 / zoom);
    var best = -1, bestD = thr;
    for (var i = 0; i < obj.points.length; i++) {
        var d = Math.hypot(wx - obj.points[i].x, wy - obj.points[i].y);
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

function drawSegmentVertexHandles(obj, color) {
    if (!obj || !obj.points || typeof ctx === 'undefined') return;
    var size = ((typeof HANDLE_SIZE !== 'undefined' ? HANDLE_SIZE : 8)) / zoom;
    var col = color || '#3b82f6';
    for (var i = 0; i < obj.points.length; i++) {
        var p = obj.points[i];
        ctx.fillStyle = '#fff';
        ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5 / zoom;
        ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
    }
}

function drawSegmentRotateHandle(obj, opts) {
    opts = opts || {};
    if (!obj || !obj.points || typeof ctx === 'undefined') return;
    if (typeof getSegmentRotateHandle !== 'function') return;
    var h = getSegmentRotateHandle(obj);
    var c = h.center;
    var accent = opts.color || '#3b82f6';
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(h.x, h.y);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 5 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1 / zoom;
    ctx.stroke();

    var showDeg = window.isRotatingSegment || window.showRoomAngleLabels;
    var deg = null;
    if (window.isRotatingSegment && window.liveSegmentRotateDeg != null) {
        deg = window.liveSegmentRotateDeg;
    } else if (showDeg) {
        deg = getPolylineHeadingDeg(obj);
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

/**
 * Cắt đuôi thừa: kéo đỉnh đầu/cuối về giao gần nhất với tường/đoạn khác.
 * @param {'line'|'wall'} type
 * @param {object} obj
 * @param {0|'start'|'end'|number} end — 0/'start' = đỉnh đầu, length-1/'end' = đỉnh cuối
 * @returns {boolean}
 */
function retractPolylineEndpointToNearestCutter(type, obj, end) {
    if (!obj || !obj.points || obj.points.length < 2) return false;
    var ge = window.EditorCore && EditorCore.GeometryEngine;
    if (!ge || !ge.segmentIntersection) return false;

    var endIndex = 0;
    if (end === 'end' || end === 1 || end === 'last') {
        endIndex = obj.points.length - 1;
    } else if (typeof end === 'number' && end > 0) {
        endIndex = Math.min(obj.points.length - 1, end | 0);
    }

    var neighbor = endIndex === 0 ? 1 : endIndex - 1;
    var tip = obj.points[endIndex];
    var base = obj.points[neighbor];
    if (!tip || !base) return false;

    function collectCutters(arr, kind) {
        var out = [];
        if (!arr) return out;
        for (var i = 0; i < arr.length; i++) {
            var o = arr[i];
            if (!o || !o.points || o.points.length < 2) continue;
            if (o === obj) continue;
            for (var j = 0; j < o.points.length - 1; j++) {
                out.push({ a: o.points[j], b: o.points[j + 1], kind: kind, id: o.id });
            }
        }
        return out;
    }

    var cutters = collectCutters(typeof walls !== 'undefined' ? walls : [], 'wall')
        .concat(collectCutters(typeof lines !== 'undefined' ? lines : [], 'line'));

    var best = null;
    var bestT = -1;
    for (var c = 0; c < cutters.length; c++) {
        var hit = ge.segmentIntersection(base, tip, cutters[c].a, cutters[c].b);
        if (!hit) continue;
        // Giao giữa base→tip (gần đỉnh thừa hơn = t lớn hơn)
        if (hit.t > 0.02 && hit.t < 0.999 && hit.t > bestT) {
            bestT = hit.t;
            best = { x: hit.x, y: hit.y };
        }
    }

    if (!best) return false;
    tip.x = best.x;
    tip.y = best.y;
    if (type === 'room' && window.EditorCore && EditorCore.ObjectTransform) {
        EditorCore.ObjectTransform.updatePolygonBBox(obj);
    }
    return true;
}

window.getPolylineCentroid = getPolylineCentroid;
window.getPolylineHeadingDeg = getPolylineHeadingDeg;
window.getSegmentRotateHandle = getSegmentRotateHandle;
window.hitSegmentRotateHandle = hitSegmentRotateHandle;
window.hitPolylineVertex = hitPolylineVertex;
window.drawSegmentVertexHandles = drawSegmentVertexHandles;
window.drawSegmentRotateHandle = drawSegmentRotateHandle;
window.retractPolylineEndpointToNearestCutter = retractPolylineEndpointToNearestCutter;
