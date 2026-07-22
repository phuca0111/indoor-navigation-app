// ============================================================
// ALIGN-TOOL.JS — Lệnh Align (AL): căn chỉnh + xoay + scale theo 2 cặp điểm
// Áp cho đối tượng có đỉnh: đoạn (line), tường (wall), cung (arc), phòng đa giác.
// Thứ tự click: NGUỒN 1 → ĐÍCH 1 → NGUỒN 2 → ĐÍCH 2
// ============================================================

var alignSession = null; // { target:{type,data}, pts:[{x,y}...], preview:{x,y} }

function getAlignTarget() {
    if (typeof selectedObject !== 'undefined' && selectedObject && selectedObject.data) {
        var d = selectedObject.data;
        if (Array.isArray(d.points) && d.points.length >= 2) return selectedObject;
    }
    if (typeof selectedRoom !== 'undefined' && selectedRoom &&
        Array.isArray(selectedRoom.points) && selectedRoom.points.length >= 2) {
        return { type: 'room', data: selectedRoom };
    }
    return null;
}

function beginAlignTool() {
    var target = getAlignTarget();
    if (!target) {
        alignSession = null;
        if (typeof showToast === 'function') {
            showToast('Align: hãy chọn 1 đối tượng có đỉnh (đoạn/tường/cung/phòng đa giác) rồi chọn lại lệnh', 'error');
        }
        return false;
    }
    alignSession = { target: target, pts: [], preview: null };
    if (typeof showToast === 'function') {
        showToast('Align: click NGUỒN 1 → ĐÍCH 1 → NGUỒN 2 → ĐÍCH 2', 'info');
    }
    return true;
}

function cancelAlignSession() {
    if (!alignSession) return false;
    alignSession = null;
    return true;
}

function updateAlignPreview(wx, wy) {
    if (!alignSession) return;
    alignSession.preview = { x: wx, y: wy };
}

function applyAlignToTarget(target, m) {
    var ge = window.EditorCore && EditorCore.GeometryEngine;
    if (!target || !target.data || !ge || !ge.applyTransformPoint) return false;
    var data = target.data;
    if (typeof saveState === 'function') saveState();
    data.points = (data.points || []).map(function (pt) { return ge.applyTransformPoint(m, pt); });
    if (data.type === 'arc' && data.arc) {
        var c = ge.applyTransformPoint(m, { x: data.arc.cx, y: data.arc.cy });
        data.arc.cx = c.x;
        data.arc.cy = c.y;
        data.arc.radius = data.arc.radius * (m.scale || 1);
    }
    // Tường: scale độ dày theo tỉ lệ đồng dạng để giữ tỉ lệ bản vẽ
    if (target.type === 'wall' && data.thickness && (m.scale || 1) !== 1) {
        data.thickness = Math.max(1, data.thickness * m.scale);
    }
    if (window.EditorCore && EditorCore.ObjectTransform) {
        var kind = target.type === 'wall' ? 'wall' : (target.type === 'room' ? 'room' : 'line');
        if (target.type === 'room' && EditorCore.ObjectTransform.updatePolygonBBox) {
            EditorCore.ObjectTransform.updatePolygonBBox(data);
        }
        if (EditorCore.ObjectTransform.ensureOriginalGeometry) {
            EditorCore.ObjectTransform.ensureOriginalGeometry(kind, data);
        }
    }
    if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    return true;
}

function handleAlignClick(wx, wy) {
    if (!alignSession) {
        if (!beginAlignTool()) return;
    }
    alignSession.pts.push({ x: wx, y: wy });
    alignSession.preview = null;
    var n = alignSession.pts.length;
    var prompts = { 1: 'click ĐÍCH 1', 2: 'click NGUỒN 2', 3: 'click ĐÍCH 2' };
    if (n < 4) {
        if (typeof showToast === 'function' && prompts[n]) showToast('Align: ' + prompts[n], 'info');
        if (typeof draw === 'function') draw();
        return;
    }
    var p = alignSession.pts;
    var ge = window.EditorCore && EditorCore.GeometryEngine;
    var m = ge && ge.computeAlignTransform ? ge.computeAlignTransform(p[0], p[2], p[1], p[3]) : null;
    var target = alignSession.target;
    alignSession = { target: target, pts: [], preview: null };
    if (!m) {
        if (typeof showToast === 'function') showToast('Align: 2 điểm nguồn trùng nhau', 'error');
        return;
    }
    applyAlignToTarget(target, m);
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof showToast === 'function') {
        showToast('Align: scale ×' + (m.scale || 1).toFixed(2) + ', xoay ' +
            (m.rotation * 180 / Math.PI).toFixed(1) + '°', 'success');
    }
    if (typeof draw === 'function') draw();
}

function drawAlignPreview() {
    if (!alignSession || typeof ctx === 'undefined') return;
    var z = (typeof zoom !== 'undefined' && zoom) ? zoom : 1;
    var pts = alignSession.pts;
    ctx.save();
    // Cặp NGUỒN 1 → ĐÍCH 1 (xanh), NGUỒN 2 → ĐÍCH 2 (cam)
    var colors = ['#2563eb', '#2563eb', '#f59e0b', '#f59e0b'];
    for (var i = 0; i < pts.length; i++) {
        ctx.fillStyle = colors[i] || '#2563eb';
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 4 / z, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.lineWidth = 1.2 / z;
    ctx.setLineDash([5 / z, 4 / z]);
    if (pts.length >= 2) {
        ctx.strokeStyle = '#2563eb';
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
    }
    if (pts.length >= 4) {
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath(); ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y); ctx.stroke();
    }
    // Đường chờ tới con trỏ
    if (alignSession.preview && pts.length < 4) {
        var last = pts[pts.length - 1];
        if (last) {
            ctx.strokeStyle = 'rgba(100,116,139,0.7)';
            ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(alignSession.preview.x, alignSession.preview.y); ctx.stroke();
        }
    }
    ctx.setLineDash([]);
    ctx.restore();
}

window.beginAlignTool = beginAlignTool;
window.cancelAlignSession = cancelAlignSession;
window.handleAlignClick = handleAlignClick;
window.updateAlignPreview = updateAlignPreview;
window.drawAlignPreview = drawAlignPreview;
window.applyAlignToTarget = applyAlignToTarget;
