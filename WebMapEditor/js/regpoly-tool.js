// ============================================================
// REGPOLY-TOOL.JS — Lệnh Polygon đều (POL)
//   Click TÂM → click đỉnh (bán kính + góc). Số cạnh hỏi khi vào tool.
//   Kết quả: phòng shape='polygon' (tái dùng hạ tầng room).
// ============================================================

var regpolySession = null; // { step:1|2, center, sides, preview:{x,y} }

function clampRegPolySides(n) {
    n = Math.round(Number(n) || 6);
    if (n < 3) n = 3;
    if (n > 64) n = 64;
    return n;
}

function getDefaultRegPolySides() {
    return clampRegPolySides(window.defaultRegPolySides || 6);
}

function beginRegpolyTool(opts) {
    opts = opts || {};
    var sides;
    if (opts.sides != null) {
        sides = clampRegPolySides(opts.sides);
    } else if (opts.skipPrompt) {
        sides = getDefaultRegPolySides();
    } else {
        var cur = getDefaultRegPolySides();
        var ans = prompt('Số cạnh đa giác đều (3–64):', String(cur));
        if (ans == null) ans = String(cur);
        sides = clampRegPolySides(ans);
    }
    window.defaultRegPolySides = sides;
    regpolySession = { step: 1, center: null, sides: sides, preview: null };
    if (typeof showToast === 'function') {
        showToast('Đa giác đều ' + sides + ' cạnh: click TÂM → click ĐỈNH', 'info');
    }
    var hint = document.getElementById('commandHint');
    if (hint) hint.textContent = 'POL (' + sides + ' cạnh): click tâm, rồi click đỉnh';
}

function cancelRegpolySession() {
    if (!regpolySession) return false;
    regpolySession = null;
    return true;
}

function updateRegpolyPreview(wx, wy) {
    if (!regpolySession || regpolySession.step < 2) return;
    regpolySession.preview = { x: wx, y: wy };
}

function handleRegpolyClick(wx, wy) {
    if (!regpolySession) beginRegpolyTool();
    var s = regpolySession;
    if (s.step === 1) {
        s.center = { x: wx, y: wy };
        s.preview = { x: wx, y: wy };
        s.step = 2;
        if (typeof showToast === 'function') {
            showToast('Đa giác đều: click ĐỈNH (bán kính + góc)', 'info');
        }
        return;
    }
    var ge = window.EditorCore && EditorCore.GeometryEngine;
    if (!ge || !ge.regularPolygon || !s.center) return;
    var dx = wx - s.center.x, dy = wy - s.center.y;
    var radius = Math.hypot(dx, dy);
    if (radius < 8) {
        if (typeof showToast === 'function') showToast('Bán kính quá nhỏ — thử lại', 'error');
        return;
    }
    var rot = Math.atan2(dy, dx);
    var pts = ge.regularPolygon(s.center.x, s.center.y, radius, s.sides, rot);
    if (!pts || pts.length < 3 || typeof createPolygonRoom !== 'function') return;

    if (typeof saveState === 'function') saveState();
    var room = createPolygonRoom(pts);
    // Reset session nhưng giữ số cạnh để vẽ tiếp
    regpolySession = { step: 1, center: null, sides: s.sides, preview: null };
    if (!room) return;

    rooms.push(room);
    if (typeof setEditorSelection === 'function') setEditorSelection('room', room);
    if (typeof roomCountSpan !== 'undefined' && roomCountSpan) {
        roomCountSpan.textContent = 'Phòng: ' + rooms.length;
    }
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') {
        showToast('Đã tạo đa giác đều ' + s.sides + ' cạnh', 'success');
    }
    if (typeof draw === 'function') draw();
}

function drawRegpolyPreview() {
    if (!regpolySession || !regpolySession.center || typeof ctx === 'undefined') return;
    var z = (typeof zoom !== 'undefined' && zoom) ? zoom : 1;
    var s = regpolySession;
    var ge = window.EditorCore && EditorCore.GeometryEngine;
    ctx.save();
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 1.5 / z;
    ctx.setLineDash([5 / z, 4 / z]);

    // Tâm
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.arc(s.center.x, s.center.y, 4 / z, 0, Math.PI * 2);
    ctx.fill();

    if (s.step === 2 && s.preview && ge && ge.regularPolygon) {
        var dx = s.preview.x - s.center.x, dy = s.preview.y - s.center.y;
        var radius = Math.hypot(dx, dy);
        if (radius > 1) {
            var rot = Math.atan2(dy, dx);
            var pts = ge.regularPolygon(s.center.x, s.center.y, radius, s.sides, rot);
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.stroke();
            // Tia tâm → đỉnh
            ctx.beginPath();
            ctx.moveTo(s.center.x, s.center.y);
            ctx.lineTo(s.preview.x, s.preview.y);
            ctx.stroke();
        }
    }
    ctx.setLineDash([]);
    ctx.restore();
}

if (typeof window !== 'undefined') {
    window.beginRegpolyTool = beginRegpolyTool;
    window.cancelRegpolySession = cancelRegpolySession;
    window.handleRegpolyClick = handleRegpolyClick;
    window.updateRegpolyPreview = updateRegpolyPreview;
    window.drawRegpolyPreview = drawRegpolyPreview;
    window.clampRegPolySides = clampRegPolySides;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        clampRegPolySides: clampRegPolySides
    };
}
