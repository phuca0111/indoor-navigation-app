// ============================================================
// JOIN-TOOL.JS — Lệnh Join (J): nối 2 đối tượng thành 1 polyline
//   Áp cho: đoạn/đa tuyến (line, KHÔNG gồm arc) và tường (wall).
//   Thao tác: click đối tượng 1 → click đối tượng 2 (cùng loại) → nối theo
//   cặp đầu mút gần nhau nhất. Kết quả gộp vào đối tượng 1, xoá đối tượng 2,
//   cho phép nối tiếp nhiều lần.
// ============================================================

var joinSession = null; // { kind:'line'|'wall', obj }

function getJoinGE() {
    return (typeof EditorCore !== 'undefined' && EditorCore.GeometryEngine) ? EditorCore.GeometryEngine : null;
}

function pickJoinTarget(wx, wy) {
    var ln = (typeof findLineAt === 'function') ? findLineAt(wx, wy) : null;
    if (ln && ln.type === 'arc') return { kind: 'arc' }; // báo lỗi ở nơi gọi
    if (ln && ln.points && ln.points.length >= 2) return { kind: 'line', obj: ln };
    var w = (typeof findWallAt === 'function') ? findWallAt(wx, wy) : null;
    if (w && w.points && w.points.length >= 2) return { kind: 'wall', obj: w };
    return null;
}

function beginJoinTool() {
    joinSession = { kind: null, obj: null };
    if (typeof selectedObject !== 'undefined' && selectedObject && selectedObject.data) {
        if (selectedObject.type === 'line' && selectedObject.data.type !== 'arc') {
            joinSession.kind = 'line';
            joinSession.obj = selectedObject.data;
        } else if (selectedObject.type === 'wall') {
            joinSession.kind = 'wall';
            joinSession.obj = selectedObject.data;
        }
    }
    updateJoinHint();
}

function cancelJoinSession() {
    var had = !!(joinSession && joinSession.obj);
    joinSession = null;
    return had;
}

function updateJoinHint() {
    var hint = document.getElementById('commandHint');
    if (!hint) return;
    hint.textContent = (joinSession && joinSession.obj)
        ? 'Join (J): click đối tượng thứ 2 (cùng loại) để nối vào đối tượng đã chọn'
        : 'Join (J): click đối tượng thứ nhất cần nối';
}

function removeJoinObject(kind, obj) {
    if (kind === 'wall') {
        walls = walls.filter(function (w) { return w.id !== obj.id; });
    } else {
        lines = lines.filter(function (ln) { return ln.id !== obj.id; });
    }
}

function handleJoinClick(wx, wy) {
    if (!joinSession) beginJoinTool();
    var picked = pickJoinTarget(wx, wy);

    if (picked && picked.kind === 'arc') {
        if (typeof showToast === 'function') showToast('Cung tròn không hỗ trợ nối', 'error');
        return;
    }

    if (!joinSession.obj) {
        if (picked) {
            joinSession.kind = picked.kind;
            joinSession.obj = picked.obj;
        } else if (typeof showToast === 'function') {
            showToast('Click trúng một đoạn/tường để bắt đầu nối', 'error');
        }
        updateJoinHint();
        if (typeof draw === 'function') draw();
        return;
    }

    // Đã có đối tượng 1 → chọn đối tượng 2
    if (!picked) {
        if (typeof showToast === 'function') showToast('Click trúng đối tượng thứ 2', 'error');
        return;
    }
    if (picked.obj === joinSession.obj) return; // trùng chính nó
    if (picked.kind !== joinSession.kind) {
        if (typeof showToast === 'function') showToast('Chỉ nối cùng loại (đoạn với đoạn, tường với tường)', 'error');
        return;
    }

    var GE = getJoinGE();
    if (!GE || !GE.joinPolylines) return;
    var tol = 8 / (typeof zoom === 'number' && zoom ? zoom : 1);
    var res = GE.joinPolylines(joinSession.obj.points, picked.obj.points, tol);
    if (!res || res.points.length < 2) {
        if (typeof showToast === 'function') showToast('Không nối được 2 đối tượng này', 'error');
        return;
    }

    if (typeof saveState === 'function') saveState();
    joinSession.obj.points = res.points;
    if (joinSession.obj.type === 'arc') joinSession.obj.type = 'segment'; // an toàn
    removeJoinObject(picked.kind, picked.obj);

    if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof draw === 'function') draw();
    if (typeof showToast === 'function') {
        var msg = res.gap < 0.5 ? 'Đã nối 2 đối tượng' : 'Đã nối (bắc cầu khe hở ' + Math.round(res.gap) + 'px)';
        showToast(msg, 'success');
    }
}

function drawJoinPreview() {
    if (!joinSession || !joinSession.obj || !ctx) return;
    var op = joinSession.obj.points;
    if (!op || op.length < 2) return;
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5 / zoom;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(op[0].x, op[0].y);
    for (var i = 1; i < op.length; i++) ctx.lineTo(op[i].x, op[i].y);
    ctx.stroke();
    ctx.restore();
}

window.beginJoinTool = beginJoinTool;
window.cancelJoinSession = cancelJoinSession;
window.handleJoinClick = handleJoinClick;
window.drawJoinPreview = drawJoinPreview;
