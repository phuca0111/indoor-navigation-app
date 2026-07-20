// ============================================================
// OFFSET-TOOL.JS — Lệnh Offset (O): tạo bản song song cách đều
//   Áp cho: đoạn/đa tuyến (line, KHÔNG gồm arc) và tường (wall).
//   UX kiểu "Through": click chọn đối tượng → rê chuột (khoảng cách + phía
//   lấy theo con trỏ) → click để tạo bản song song. Giữ nguyên đối tượng gốc,
//   cho phép offset nhiều lần liên tiếp từ cùng đối tượng.
// ============================================================

var offsetSession = null; // { kind:'line'|'wall', obj, preview:[{x,y}], dist }

function getOffsetGE() {
    return (typeof EditorCore !== 'undefined' && EditorCore.GeometryEngine) ? EditorCore.GeometryEngine : null;
}

function beginOffsetTool() {
    // Nếu đang chọn 1 line/wall thì dùng luôn làm đối tượng gốc
    offsetSession = { kind: null, obj: null, preview: null, dist: 0 };
    if (typeof selectedObject !== 'undefined' && selectedObject && selectedObject.data) {
        if (selectedObject.type === 'line' && selectedObject.data.type !== 'arc') {
            offsetSession.kind = 'line';
            offsetSession.obj = selectedObject.data;
        } else if (selectedObject.type === 'wall') {
            offsetSession.kind = 'wall';
            offsetSession.obj = selectedObject.data;
        }
    }
    updateOffsetHint();
}

function cancelOffsetSession() {
    var had = !!(offsetSession && (offsetSession.obj || offsetSession.preview));
    offsetSession = null;
    return had;
}

function updateOffsetHint() {
    var hint = document.getElementById('commandHint');
    if (!hint) return;
    if (offsetSession && offsetSession.obj) {
        hint.textContent = 'Offset (O): rê chuột chọn phía + khoảng cách rồi click để tạo bản song song (Esc hủy)';
    } else {
        hint.textContent = 'Offset (O): click chọn đoạn/tường cần tạo bản song song';
    }
}

/** Khoảng cách có dấu từ con trỏ tới polyline (dựa trên đoạn gần nhất). */
function offsetSignedDistance(points, wx, wy) {
    var bestD = Infinity, best = null;
    for (var i = 0; i < points.length - 1; i++) {
        var a = points[i], b = points[i + 1];
        var dx = b.x - a.x, dy = b.y - a.y;
        var len2 = dx * dx + dy * dy;
        if (len2 < 1e-9) continue;
        var t = ((wx - a.x) * dx + (wy - a.y) * dy) / len2;
        var tc = Math.max(0, Math.min(1, t));
        var px = a.x + tc * dx, py = a.y + tc * dy;
        var d = Math.hypot(wx - px, wy - py);
        if (d < bestD) {
            bestD = d;
            var len = Math.sqrt(len2);
            var nx = -dy / len, ny = dx / len; // pháp tuyến trái
            var signed = (wx - a.x) * nx + (wy - a.y) * ny;
            best = signed;
        }
    }
    return best;
}

function updateOffsetPreview(wx, wy) {
    if (!offsetSession || !offsetSession.obj) return;
    var GE = getOffsetGE();
    if (!GE || !GE.offsetPolyline) return;
    var pts = offsetSession.obj.points;
    if (!pts || pts.length < 2) return;
    var signed = offsetSignedDistance(pts, wx, wy);
    if (signed == null || Math.abs(signed) < 0.5) { offsetSession.preview = null; return; }
    offsetSession.dist = signed;
    offsetSession.preview = GE.offsetPolyline(pts, signed, false);
}

function commitOffset() {
    if (!offsetSession || !offsetSession.obj || !offsetSession.preview) return false;
    var src = offsetSession.obj;
    var pts = offsetSession.preview.map(function (p) { return { x: p.x, y: p.y }; });
    if (typeof saveState === 'function') saveState();
    var created;
    if (offsetSession.kind === 'wall') {
        created = {
            id: (typeof nextWallId !== 'undefined') ? nextWallId++ : Date.now(),
            type: 'segment',
            is_outer: !!src.is_outer,
            thickness: src.thickness || 4,
            lineStyle: src.lineStyle || 'solid',
            layerId: src.layerId || 'default',
            points: pts
        };
        walls.push(created);
    } else {
        created = {
            id: (typeof nextLineId !== 'undefined') ? nextLineId++ : Date.now(),
            type: 'segment',
            color: src.color || '#3b82f6',
            lineWeight: src.lineWeight || 2,
            lineStyle: src.lineStyle || 'solid',
            layerId: src.layerId || 'default',
            points: pts
        };
        lines.push(created);
    }
    offsetSession.preview = null;
    if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') showToast('Đã tạo bản song song', 'success');
    return true;
}

function handleOffsetClick(wx, wy) {
    if (!offsetSession) beginOffsetTool();
    if (!offsetSession.obj) {
        // Bước 1: chọn đối tượng gốc
        var ln = (typeof findLineAt === 'function') ? findLineAt(wx, wy) : null;
        if (ln && ln.type === 'arc') {
            if (typeof showToast === 'function') showToast('Cung tròn chưa hỗ trợ offset', 'error');
            return;
        }
        if (ln && ln.points && ln.points.length >= 2) {
            offsetSession.kind = 'line';
            offsetSession.obj = ln;
        } else {
            var w = (typeof findWallAt === 'function') ? findWallAt(wx, wy) : null;
            if (w && w.points && w.points.length >= 2) {
                offsetSession.kind = 'wall';
                offsetSession.obj = w;
            }
        }
        if (!offsetSession.obj) {
            if (typeof showToast === 'function') showToast('Click trúng một đoạn/tường để offset', 'error');
        }
        updateOffsetHint();
        if (typeof draw === 'function') draw();
        return;
    }
    // Bước 2: chốt bản song song (giữ đối tượng gốc để offset tiếp)
    updateOffsetPreview(wx, wy);
    commitOffset();
    if (typeof draw === 'function') draw();
}

function drawOffsetPreview() {
    if (!offsetSession || !ctx) return;
    // Highlight đối tượng gốc
    if (offsetSession.obj && offsetSession.obj.points && offsetSession.obj.points.length >= 2) {
        var op = offsetSession.obj.points;
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(op[0].x, op[0].y);
        for (var i = 1; i < op.length; i++) ctx.lineTo(op[i].x, op[i].y);
        ctx.stroke();
        ctx.restore();
    }
    // Preview bản song song
    if (offsetSession.preview && offsetSession.preview.length >= 2) {
        var pp = offsetSession.preview;
        ctx.save();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.beginPath();
        ctx.moveTo(pp[0].x, pp[0].y);
        for (var j = 1; j < pp.length; j++) ctx.lineTo(pp[j].x, pp[j].y);
        ctx.stroke();
        ctx.restore();
    }
}

window.beginOffsetTool = beginOffsetTool;
window.cancelOffsetSession = cancelOffsetSession;
window.handleOffsetClick = handleOffsetClick;
window.updateOffsetPreview = updateOffsetPreview;
window.drawOffsetPreview = drawOffsetPreview;
