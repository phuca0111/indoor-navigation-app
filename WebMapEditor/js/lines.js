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
        // Hỗ trợ cả đoạn 2 điểm lẫn cung/polyline nhiều điểm
        for (var s = 0; s < ln.points.length - 1; s++) {
            var a = ln.points[s];
            var b = ln.points[s + 1];
            var d = distancePointToSegment(wx, wy, a.x, a.y, b.x, b.y);
            if (d <= threshold) return ln;
        }
    }
    return null;
}

/**
 * Tạo cung tròn (ARC) qua 3 điểm — lưu dưới dạng line polyline type='arc'
 * để tái dùng toàn bộ hạ tầng line (chọn/di chuyển/xoay/lưu/snap).
 */
function createArc(a, b, c, options) {
    var ge = window.EditorCore && EditorCore.GeometryEngine;
    if (!ge || !ge.arcFrom3Points) return null;
    var arc = ge.arcFrom3Points(a, b, c);
    if (!arc) return null; // 3 điểm thẳng hàng
    var pts = ge.arcToPolyline(arc, 32);
    if (!pts || pts.length < 2) return null;
    var obj = {
        id: nextLineId++,
        type: 'arc',
        color: (options && options.color) || '#3b82f6',
        lineWeight: (options && options.lineWeight) || 2,
        lineStyle: (options && options.lineStyle) || 'solid',
        arc: { cx: arc.cx, cy: arc.cy, radius: arc.radius },
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default',
        points: pts
    };
    lines.push(obj);
    if (typeof EditorCore !== 'undefined' && EditorCore.ObjectTransform) {
        EditorCore.ObjectTransform.ensureOriginalGeometry('line', obj);
    }
    if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
    return obj;
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

// ============================================================
// ARC TOOL (A) — cung tròn qua 3 điểm (đầu → giữa → cuối)
// ============================================================
var arcSession = null; // { step:1|2|3, p1, p2, preview }

function beginArcTool() {
    arcSession = { step: 1, p1: null, p2: null, preview: null };
    if (typeof showToast === 'function') {
        showToast('Cung: click điểm ĐẦU → điểm GIỮA (trên cung) → điểm CUỐI', 'info');
    }
}

function cancelArcSession() {
    if (!arcSession) return false;
    arcSession = null;
    return true;
}

function handleArcClick(wx, wy) {
    if (!arcSession) beginArcTool();
    var s = arcSession;
    if (s.step === 1) {
        s.p1 = { x: wx, y: wy };
        s.step = 2;
        s.preview = { x: wx, y: wy };
        if (typeof showToast === 'function') showToast('Cung: click điểm GIỮA (trên cung)', 'info');
        return;
    }
    if (s.step === 2) {
        s.p2 = { x: wx, y: wy };
        s.step = 3;
        s.preview = { x: wx, y: wy };
        if (typeof showToast === 'function') showToast('Cung: click điểm CUỐI', 'info');
        return;
    }
    if (typeof saveState === 'function') saveState();
    var arc = createArc(s.p1, s.p2, { x: wx, y: wy });
    arcSession = { step: 1, p1: null, p2: null, preview: null };
    if (!arc) {
        if (typeof showToast === 'function') showToast('3 điểm thẳng hàng — không tạo được cung', 'error');
        return;
    }
    if (typeof setEditorSelection === 'function') setEditorSelection('line', arc);
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') showToast('Đã tạo cung tròn', 'success');
    if (typeof draw === 'function') draw();
}

function updateArcPreview(wx, wy) {
    if (!arcSession || arcSession.step < 2) return;
    arcSession.preview = { x: wx, y: wy };
}

function drawArcPreview() {
    if (!arcSession || !arcSession.p1 || typeof ctx === 'undefined') return;
    var z = (typeof zoom !== 'undefined' && zoom) ? zoom : 1;
    var s = arcSession;
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([5 / z, 4 / z]);
    if (s.step === 2 && s.preview) {
        ctx.beginPath();
        ctx.moveTo(s.p1.x, s.p1.y);
        ctx.lineTo(s.preview.x, s.preview.y);
        ctx.stroke();
    } else if (s.step === 3 && s.p2 && s.preview) {
        var ge = window.EditorCore && EditorCore.GeometryEngine;
        var arc = ge && ge.arcFrom3Points ? ge.arcFrom3Points(s.p1, s.p2, s.preview) : null;
        if (arc) {
            var pts = ge.arcToPolyline(arc, 32);
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(s.p1.x, s.p1.y);
            ctx.lineTo(s.preview.x, s.preview.y);
            ctx.stroke();
        }
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#3b82f6';
    [s.p1, s.p2].forEach(function (p) {
        if (!p) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / z, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

// ============================================================
// ELLIPSE TOOL (EL) — elip theo tâm → đầu trục lớn → điểm trục nhỏ
// Lưu dưới dạng line polyline kín type='ellipse' để tái dùng hạ tầng line.
// ============================================================
var ellipseSession = null; // { step:1|2|3, center, major, preview }

function ellipseParamsFrom(center, major, minorPoint) {
    var dx = major.x - center.x, dy = major.y - center.y;
    var rx = Math.hypot(dx, dy);
    var rot = Math.atan2(dy, dx);
    // Pháp tuyến của trục lớn để đo bán trục nhỏ
    var nx = -Math.sin(rot), ny = Math.cos(rot);
    var ry = Math.abs((minorPoint.x - center.x) * nx + (minorPoint.y - center.y) * ny);
    return { cx: center.x, cy: center.y, rx: rx, ry: ry, rotation: rot };
}

function createEllipse(center, major, minorPoint, options) {
    var ge = window.EditorCore && EditorCore.GeometryEngine;
    if (!ge || !ge.ellipsePolyline) return null;
    var p = ellipseParamsFrom(center, major, minorPoint);
    if (p.rx < 1 || p.ry < 1) return null; // quá nhỏ
    var pts = ge.ellipsePolyline(p.cx, p.cy, p.rx, p.ry, p.rotation, 48);
    if (!pts || pts.length < 3) return null;
    var obj = {
        id: nextLineId++,
        type: 'ellipse',
        color: (options && options.color) || '#3b82f6',
        lineWeight: (options && options.lineWeight) || 2,
        lineStyle: (options && options.lineStyle) || 'solid',
        ellipse: { cx: p.cx, cy: p.cy, rx: p.rx, ry: p.ry, rotation: p.rotation },
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default',
        points: pts
    };
    lines.push(obj);
    if (typeof EditorCore !== 'undefined' && EditorCore.ObjectTransform) {
        EditorCore.ObjectTransform.ensureOriginalGeometry('line', obj);
    }
    if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
    return obj;
}

function beginEllipseTool() {
    ellipseSession = { step: 1, center: null, major: null, preview: null };
    if (typeof showToast === 'function') {
        showToast('Elip: click TÂM → đầu TRỤC LỚN → điểm TRỤC NHỎ', 'info');
    }
}

function cancelEllipseSession() {
    if (!ellipseSession) return false;
    ellipseSession = null;
    return true;
}

function handleEllipseClick(wx, wy) {
    if (!ellipseSession) beginEllipseTool();
    var s = ellipseSession;
    if (s.step === 1) {
        s.center = { x: wx, y: wy };
        s.preview = { x: wx, y: wy };
        s.step = 2;
        if (typeof showToast === 'function') showToast('Elip: click đầu TRỤC LỚN', 'info');
        return;
    }
    if (s.step === 2) {
        s.major = { x: wx, y: wy };
        s.preview = { x: wx, y: wy };
        s.step = 3;
        if (typeof showToast === 'function') showToast('Elip: click điểm TRỤC NHỎ', 'info');
        return;
    }
    if (typeof saveState === 'function') saveState();
    var el = createEllipse(s.center, s.major, { x: wx, y: wy });
    ellipseSession = { step: 1, center: null, major: null, preview: null };
    if (!el) {
        if (typeof showToast === 'function') showToast('Elip quá nhỏ — thử lại', 'error');
        return;
    }
    if (typeof setEditorSelection === 'function') setEditorSelection('line', el);
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') showToast('Đã tạo elip', 'success');
    if (typeof draw === 'function') draw();
}

function updateEllipsePreview(wx, wy) {
    if (!ellipseSession || ellipseSession.step < 2) return;
    ellipseSession.preview = { x: wx, y: wy };
}

function drawEllipsePreview() {
    if (!ellipseSession || !ellipseSession.center || typeof ctx === 'undefined') return;
    var z = (typeof zoom !== 'undefined' && zoom) ? zoom : 1;
    var s = ellipseSession;
    var ge = window.EditorCore && EditorCore.GeometryEngine;
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([5 / z, 4 / z]);
    if (s.step === 2 && s.preview) {
        ctx.beginPath();
        ctx.moveTo(s.center.x, s.center.y);
        ctx.lineTo(s.preview.x, s.preview.y);
        ctx.stroke();
    } else if (s.step === 3 && s.major && s.preview && ge && ge.ellipsePolyline) {
        var p = ellipseParamsFrom(s.center, s.major, s.preview);
        var pts = ge.ellipsePolyline(p.cx, p.cy, p.rx, p.ry, p.rotation, 48);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#3b82f6';
    [s.center, s.major].forEach(function (pt) {
        if (!pt) return;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4 / z, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

window.createArc = createArc;
window.beginArcTool = beginArcTool;
window.cancelArcSession = cancelArcSession;
window.handleArcClick = handleArcClick;
window.updateArcPreview = updateArcPreview;
window.drawArcPreview = drawArcPreview;
window.createEllipse = createEllipse;
window.beginEllipseTool = beginEllipseTool;
window.cancelEllipseSession = cancelEllipseSession;
window.handleEllipseClick = handleEllipseClick;
window.updateEllipsePreview = updateEllipsePreview;
window.drawEllipsePreview = drawEllipsePreview;
window.getPolylineCentroid = getPolylineCentroid;
window.getPolylineHeadingDeg = getPolylineHeadingDeg;
window.getSegmentRotateHandle = getSegmentRotateHandle;
window.hitSegmentRotateHandle = hitSegmentRotateHandle;
window.hitPolylineVertex = hitPolylineVertex;
window.drawSegmentVertexHandles = drawSegmentVertexHandles;
window.drawSegmentRotateHandle = drawSegmentRotateHandle;
window.retractPolylineEndpointToNearestCutter = retractPolylineEndpointToNearestCutter;
