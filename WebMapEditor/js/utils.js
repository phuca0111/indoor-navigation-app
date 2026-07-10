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
