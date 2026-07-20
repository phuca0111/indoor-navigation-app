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

// ---- Ruler / Measure helpers (thước đo) ----

// Độ dài đoạn (px) theo cạnh huyền
function getRulerSegmentLengthPx(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    return Math.hypot(dx, dy);
}

// Nhãn thước: "<m> m · <px> px" — meters = (px / gridSize) * metersPerGrid
function formatRulerLabel(lengthPx, metersPerGridArg, gridSizeArg) {
    var gs = (gridSizeArg != null) ? gridSizeArg
        : (typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40);
    var mpg = (metersPerGridArg != null) ? metersPerGridArg
        : (typeof metersPerGrid !== 'undefined' ? metersPerGrid : 1);
    var meters = (gs ? (lengthPx / gs) : 0) * mpg;
    return meters.toFixed(2) + ' m · ' + Math.round(lengthPx) + ' px';
}

// Ép điểm cuối về phương ngang/dọc khi giữ Shift (ortho)
function constrainRulerEnd(start, end, ortho) {
    if (!ortho) return { x: end.x, y: end.y };
    var dx = end.x - start.x, dy = end.y - start.y;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: end.x, y: start.y };
    return { x: start.x, y: end.y };
}

// Alias tương thích tên gọi cũ
function constrainOrthoPoint(start, end, ortho) {
    return constrainRulerEnd(start, end, ortho);
}

// Snap 1 trục (legacy) — grid checkbox; ưu tiên dùng snapWorldPoint cho vẽ 2D
function snapToGrid(val) {
    if (typeof EditorCore !== 'undefined' && EditorCore.SnapBridge) {
        return EditorCore.SnapBridge.legacySnapAxis(val);
    }
    var sc = document.getElementById('snapCheck');
    if (sc && !sc.checked) return val;

    var snapped = Math.round(val / GRID_SIZE) * GRID_SIZE;
    var dist = Math.abs(val - snapped);
    if (dist < 10) return snapped;
    return val;
}

// Snap 2D — OSNAP (endpoint/midpoint/grid) khi SnapEngine sẵn sàng
function snapWorldPoint(x, y, opts) {
    if (typeof EditorCore !== 'undefined' && EditorCore.SnapBridge) {
        return EditorCore.SnapBridge.snapWorldPoint(x, y, opts);
    }
    return { x: snapToGrid(x), y: snapToGrid(y), kind: 'grid', source: 'legacy' };
}

/** Giữ Shift = tắt toàn bộ snap (endpoint/midpoint + lưới + polar) — đặt điểm đúng vị trí chuột. */
function getSnapOpts(e) {
    if (e && e.shiftKey) return { objectSnap: false, gridSnap: false, polar: false };
    return undefined;
}

/**
 * Bổ sung opts.anchor cho PER snap khi đang vẽ Wall/Line (điểm neo = đỉnh trước).
 * @param {object} [snapOpts]
 * @param {string} [tool] — currentTool
 */
function enrichSnapOpts(snapOpts, tool) {
    var opts = snapOpts ? Object.assign({}, snapOpts) : {};
    if (typeof EditorCore === 'undefined' || !EditorCore) return opts;

    if (tool === 'wall' && EditorCore.PolylineTool && EditorCore.PolylineTool.getState() === 'drawing') {
        var pts = EditorCore.PolylineTool.getPoints();
        if (pts.length) {
            var last = pts[pts.length - 1];
            opts.anchor = { x: last.x, y: last.y };
        }
    }
    if (tool === 'line' && EditorCore.LineTool && EditorCore.LineTool.getState() === 'drawing') {
        var sp = EditorCore.LineTool.getStartPoint();
        if (sp) opts.anchor = { x: sp.x, y: sp.y };
    }
    return opts;
}

function isObjectSnapSuppressed(e) {
    return !!(e && e.shiftKey);
}

function syncSpatialIndexFromLegacy() {
    if (typeof EditorCore !== 'undefined' && EditorCore.SnapBridge) {
        return EditorCore.SnapBridge.syncSpatialIndexFromLegacy();
    }
    return null;
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

// ============================================================
// Linetype (kiểu nét) + LWeight (độ dày nét) — chuẩn CAD
// ============================================================
var LINE_STYLES = ['solid', 'dashed', 'dotted', 'dashdot'];
var LINE_STYLE_LABELS = {
    solid: 'Liền',
    dashed: 'Đứt',
    dotted: 'Chấm',
    dashdot: 'Gạch chấm'
};

/** Chuẩn hóa kiểu nét về 1 trong LINE_STYLES (mặc định 'solid'). */
function normalizeLineStyle(style) {
    return LINE_STYLES.indexOf(style) >= 0 ? style : 'solid';
}

/** Giới hạn độ dày nét trong [0.5, 20] px, mặc định 2. */
function clampLineWeight(w) {
    var n = Number(w);
    if (!Number.isFinite(n)) return 2;
    return Math.max(0.5, Math.min(20, n));
}

/**
 * Mảng dash cho ctx.setLineDash theo kiểu nét, đã chia zoom để giữ tỉ lệ khi phóng to.
 * @param {string} style solid|dashed|dotted|dashdot
 * @param {number} zoom
 * @returns {number[]} [] nếu nét liền
 */
function getLineDashPattern(style, zoom) {
    var z = (zoom && zoom > 0) ? zoom : 1;
    switch (normalizeLineStyle(style)) {
        case 'dashed': return [8 / z, 5 / z];
        case 'dotted': return [1.5 / z, 4 / z];
        case 'dashdot': return [10 / z, 4 / z, 1.5 / z, 4 / z];
        case 'solid':
        default: return [];
    }
}

if (typeof window !== 'undefined') {
    window.LINE_STYLES = LINE_STYLES;
    window.LINE_STYLE_LABELS = LINE_STYLE_LABELS;
    window.normalizeLineStyle = normalizeLineStyle;
    window.clampLineWeight = clampLineWeight;
    window.getLineDashPattern = getLineDashPattern;
}

// Export cho môi trường test (Node). Trên trình duyệt các hàm là global như cũ.
if (typeof module === 'object' && module.exports) {
    module.exports = {
        pixelsToMeters: pixelsToMeters,
        metersToPixels: metersToPixels,
        getRulerSegmentLengthPx: getRulerSegmentLengthPx,
        formatRulerLabel: formatRulerLabel,
        constrainRulerEnd: constrainRulerEnd,
        constrainOrthoPoint: constrainOrthoPoint,
        LINE_STYLES: LINE_STYLES,
        LINE_STYLE_LABELS: LINE_STYLE_LABELS,
        normalizeLineStyle: normalizeLineStyle,
        clampLineWeight: clampLineWeight,
        getLineDashPattern: getLineDashPattern
    };
}
