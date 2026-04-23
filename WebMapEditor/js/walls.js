// ============================================================
// WALLS.JS - Logic tường (segment/polyline)
// ============================================================

function createWallSegment(start, end, options) {
    if (!start || !end) return null;
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var length = Math.sqrt(dx * dx + dy * dy);
    if (length < 4) return null;

    var wall = {
        id: nextWallId++,
        type: 'segment',
        thickness: (options && options.thickness) || 4,
        is_outer: !!(options && options.is_outer),
        points: [
            { x: start.x, y: start.y },
            { x: end.x, y: end.y }
        ]
    };
    walls.push(wall);
    return wall;
}

function findWallAt(wx, wy) {
    var threshold = 8 / zoom;
    for (var i = walls.length - 1; i >= 0; i--) {
        var w = walls[i];
        if (!w.points || w.points.length < 2) continue;
        for (var j = 0; j < w.points.length - 1; j++) {
            var a = w.points[j];
            var b = w.points[j + 1];
            var d = distancePointToSegment(wx, wy, a.x, a.y, b.x, b.y);
            if (d <= threshold) return w;
        }
    }
    return null;
}

function deleteWall(wall) {
    walls = walls.filter(function (w) { return w.id !== wall.id; });
}

function distancePointToSegment(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    if (dx === 0 && dy === 0) {
        var ddx = px - x1;
        var ddy = py - y1;
        return Math.sqrt(ddx * ddx + ddy * ddy);
    }
    var t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    var cx = x1 + t * dx;
    var cy = y1 + t * dy;
    var sx = px - cx;
    var sy = py - cy;
    return Math.sqrt(sx * sx + sy * sy);
}
