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
