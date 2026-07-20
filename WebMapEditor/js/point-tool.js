// ============================================================
// POINT-TOOL.JS — Lệnh Point (PO): điểm mốc CAD (marker + snap NODE)
// Khác POI (điểm tiện ích điều hướng). Lưu trong cadPoints[].
// Kiểu hiển thị gần AutoCAD PDMODE: dot / cross / plus / circle-cross.
// ============================================================

var CAD_POINT_STYLES = ['dot', 'cross', 'plus', 'circle-cross'];
var CAD_POINT_STYLE_LABELS = {
    dot: 'Chấm',
    cross: 'Chéo (X)',
    plus: 'Chữ thập (+)',
    'circle-cross': 'Tròn + chéo'
};
var CAD_POINT_DEFAULT_SIZE = 8; // px tại zoom=1
var CAD_POINT_DEFAULT_COLOR = '#e11d48';

function normalizePointStyle(style) {
    var s = String(style || '').toLowerCase();
    if (CAD_POINT_STYLES.indexOf(s) >= 0) return s;
    return 'cross';
}

function getCadPointHitRadius(z) {
    var zoomVal = (z != null ? z : (typeof zoom !== 'undefined' ? zoom : 1)) || 1;
    return Math.max(6, CAD_POINT_DEFAULT_SIZE + 2) / zoomVal;
}

/** Kiểm tra (wx,wy) có trúng điểm mốc không — pure (có thể test). */
function hitCadPoint(pt, wx, wy, radius) {
    if (!pt || wx == null || wy == null) return false;
    var r = radius != null ? radius : getCadPointHitRadius(1);
    var dx = wx - pt.x, dy = wy - pt.y;
    return dx * dx + dy * dy <= r * r;
}

function createCadPoint(x, y, options) {
    options = options || {};
    var sp = (typeof snapWorldPoint === 'function') ? snapWorldPoint(x, y) : { x: x, y: y };
    var obj = {
        id: nextCadPointId++,
        name: options.name || ('Điểm #' + nextCadPointId),
        x: sp.x,
        y: sp.y,
        style: normalizePointStyle(options.style || window.defaultCadPointStyle || 'cross'),
        size: options.size != null ? options.size : CAD_POINT_DEFAULT_SIZE,
        color: options.color || CAD_POINT_DEFAULT_COLOR,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default'
    };
    // Sửa name sau khi id đã gán (tránh lệch #)
    if (!options.name) obj.name = 'Điểm #' + obj.id;
    cadPoints.push(obj);
    if (typeof EditorCore !== 'undefined' && EditorCore.ObjectTransform) {
        EditorCore.ObjectTransform.ensureOriginalGeometry('point', obj);
    }
    if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
    return obj;
}

function findCadPointAt(wx, wy) {
    var r = getCadPointHitRadius();
    for (var i = cadPoints.length - 1; i >= 0; i--) {
        var p = cadPoints[i];
        if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(p)) continue;
        if (hitCadPoint(p, wx, wy, r)) return p;
    }
    return null;
}

function deleteCadPoint(pt) {
    if (!pt) return;
    cadPoints = cadPoints.filter(function (p) { return p.id !== pt.id; });
}

function beginPointTool() {
    if (typeof showToast === 'function') {
        showToast('Điểm mốc (PO): click để đặt điểm — dùng làm mốc snap (NODE)', 'info');
    }
    var hint = document.getElementById('commandHint');
    if (hint) hint.textContent = 'Điểm mốc (PO): click để đặt điểm tham chiếu snap';
}

function handlePointClick(wx, wy) {
    if (typeof saveState === 'function') saveState();
    var pt = createCadPoint(wx, wy);
    if (typeof setEditorSelection === 'function') setEditorSelection('point', pt);
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') showToast('Đã đặt điểm mốc #' + pt.id, 'success');
    if (typeof draw === 'function') draw();
    return pt;
}

/**
 * Vẽ marker điểm mốc lên ctx (world coords). Pure-ish để dễ test style.
 */
function strokeCadPointMarker(ctx2d, pt, zoomVal, isSelected) {
    if (!ctx2d || !pt) return;
    var z = zoomVal || 1;
    var size = ((pt.size != null ? pt.size : CAD_POINT_DEFAULT_SIZE) / z);
    var style = normalizePointStyle(pt.style);
    var color = isSelected ? '#f59e0b' : (pt.color || CAD_POINT_DEFAULT_COLOR);
    ctx2d.save();
    ctx2d.strokeStyle = color;
    ctx2d.fillStyle = color;
    ctx2d.lineWidth = (isSelected ? 2 : 1.5) / z;
    ctx2d.lineCap = 'round';

    if (style === 'dot') {
        ctx2d.beginPath();
        ctx2d.arc(pt.x, pt.y, size * 0.35, 0, Math.PI * 2);
        ctx2d.fill();
    } else if (style === 'plus') {
        ctx2d.beginPath();
        ctx2d.moveTo(pt.x - size, pt.y);
        ctx2d.lineTo(pt.x + size, pt.y);
        ctx2d.moveTo(pt.x, pt.y - size);
        ctx2d.lineTo(pt.x, pt.y + size);
        ctx2d.stroke();
    } else if (style === 'circle-cross') {
        ctx2d.beginPath();
        ctx2d.arc(pt.x, pt.y, size * 0.85, 0, Math.PI * 2);
        ctx2d.stroke();
        ctx2d.beginPath();
        ctx2d.moveTo(pt.x - size, pt.y - size);
        ctx2d.lineTo(pt.x + size, pt.y + size);
        ctx2d.moveTo(pt.x + size, pt.y - size);
        ctx2d.lineTo(pt.x - size, pt.y + size);
        ctx2d.stroke();
    } else {
        // cross (X) — mặc định CAD
        ctx2d.beginPath();
        ctx2d.moveTo(pt.x - size, pt.y - size);
        ctx2d.lineTo(pt.x + size, pt.y + size);
        ctx2d.moveTo(pt.x + size, pt.y - size);
        ctx2d.lineTo(pt.x - size, pt.y + size);
        ctx2d.stroke();
    }

    if (isSelected) {
        ctx2d.beginPath();
        ctx2d.arc(pt.x, pt.y, size * 1.35, 0, Math.PI * 2);
        ctx2d.setLineDash([3 / z, 2 / z]);
        ctx2d.strokeStyle = '#f59e0b';
        ctx2d.lineWidth = 1 / z;
        ctx2d.stroke();
        ctx2d.setLineDash([]);
    }
    ctx2d.restore();
}

function drawCadPoint(pt, isSelected) {
    if (typeof ctx === 'undefined' || !ctx) return;
    strokeCadPointMarker(ctx, pt, typeof zoom !== 'undefined' ? zoom : 1, !!isSelected);
}

if (typeof window !== 'undefined') {
    window.CAD_POINT_STYLES = CAD_POINT_STYLES;
    window.CAD_POINT_STYLE_LABELS = CAD_POINT_STYLE_LABELS;
    window.normalizePointStyle = normalizePointStyle;
    window.getCadPointHitRadius = getCadPointHitRadius;
    window.hitCadPoint = hitCadPoint;
    window.createCadPoint = createCadPoint;
    window.findCadPointAt = findCadPointAt;
    window.deleteCadPoint = deleteCadPoint;
    window.beginPointTool = beginPointTool;
    window.handlePointClick = handlePointClick;
    window.drawCadPoint = drawCadPoint;
    window.strokeCadPointMarker = strokeCadPointMarker;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CAD_POINT_STYLES: CAD_POINT_STYLES,
        CAD_POINT_STYLE_LABELS: CAD_POINT_STYLE_LABELS,
        normalizePointStyle: normalizePointStyle,
        getCadPointHitRadius: getCadPointHitRadius,
        hitCadPoint: hitCadPoint,
        strokeCadPointMarker: strokeCadPointMarker
    };
}
