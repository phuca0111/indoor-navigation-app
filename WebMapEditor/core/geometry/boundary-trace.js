// ============================================================
// BOUNDARY-TRACE.JS — Lệnh Boundary (BO): tạo vùng kín từ tường/đoạn bao quanh
// Thuật toán: dựng đồ thị phẳng (cắt đoạn tại giao điểm) → duyệt "half-edge"
// theo hướng rẽ phải nhỏ nhất để liệt kê mọi mặt (face) → chọn mặt kín nhỏ nhất chứa điểm.
// Module thuần (không phụ thuộc DOM) để test mọi tình huống.
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.BoundaryTrace = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var EPS = 1e-6;
    var MERGE = 1e-3; // gộp đỉnh gần trùng (đơn vị pixel)

    function keyOf(x, y) {
        return Math.round(x / MERGE) + ',' + Math.round(y / MERGE);
    }

    // Giao 2 đoạn (bao gồm đầu mút) — trả {x,y,t} với t là tham số trên đoạn a→b
    function segInt(a, b, c, d) {
        var rX = b.x - a.x, rY = b.y - a.y;
        var sX = d.x - c.x, sY = d.y - c.y;
        var denom = rX * sY - rY * sX;
        if (Math.abs(denom) < 1e-12) return null; // song song / trùng phương
        var qpX = c.x - a.x, qpY = c.y - a.y;
        var t = (qpX * sY - qpY * sX) / denom;
        var u = (qpX * rY - qpY * rX) / denom;
        if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
        return { x: a.x + t * rX, y: a.y + t * rY, t: t };
    }

    function pointInPolygon(pt, poly) {
        if (!pt || !poly || poly.length < 3) return false;
        var x = pt.x, y = pt.y, inside = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
            var hit = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
            if (hit) inside = !inside;
        }
        return inside;
    }

    function signedArea(poly) {
        var s = 0;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            s += (poly[j].x * poly[i].y - poly[i].x * poly[j].y);
        }
        return s / 2;
    }

    // Cắt mọi đoạn tại giao điểm với các đoạn khác → mảng đoạn con không cắt nhau
    function splitSegments(segs) {
        var out = [];
        for (var i = 0; i < segs.length; i++) {
            var a = segs[i].a, b = segs[i].b;
            if (Math.hypot(b.x - a.x, b.y - a.y) < MERGE) continue;
            var ts = [0, 1];
            for (var j = 0; j < segs.length; j++) {
                if (i === j) continue;
                var hit = segInt(a, b, segs[j].a, segs[j].b);
                if (hit) ts.push(Math.max(0, Math.min(1, hit.t)));
            }
            ts.sort(function (p, q) { return p - q; });
            for (var k = 0; k < ts.length - 1; k++) {
                var t0 = ts[k], t1 = ts[k + 1];
                if (t1 - t0 < EPS) continue;
                var p0 = { x: a.x + t0 * (b.x - a.x), y: a.y + t0 * (b.y - a.y) };
                var p1 = { x: a.x + t1 * (b.x - a.x), y: a.y + t1 * (b.y - a.y) };
                if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < MERGE) continue;
                out.push({ a: p0, b: p1 });
            }
        }
        return out;
    }

    function buildGraph(splitSegs) {
        var verts = {}; // key -> {x,y,nbrs:{key:true}}
        function add(p) {
            var k = keyOf(p.x, p.y);
            if (!verts[k]) verts[k] = { x: p.x, y: p.y, nbrs: {} };
            return k;
        }
        for (var i = 0; i < splitSegs.length; i++) {
            var ka = add(splitSegs[i].a), kb = add(splitSegs[i].b);
            if (ka === kb) continue;
            verts[ka].nbrs[kb] = true;
            verts[kb].nbrs[ka] = true;
        }
        return verts;
    }

    // Bỏ lặp các cạnh cụt (đỉnh chỉ có ≤1 láng giềng) — không tham gia vùng kín nào
    function pruneDangling(verts) {
        var changed = true;
        while (changed) {
            changed = false;
            var keys = Object.keys(verts);
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (!verts[k]) continue;
                var nbrs = Object.keys(verts[k].nbrs);
                if (nbrs.length <= 1) {
                    for (var j = 0; j < nbrs.length; j++) {
                        if (verts[nbrs[j]]) delete verts[nbrs[j]].nbrs[k];
                    }
                    delete verts[k];
                    changed = true;
                }
            }
        }
    }

    // Tại đỉnh v (đến từ `from`), chọn cạnh tiếp theo rẽ theo chiều kim đồng hồ nhỏ nhất
    function nextNeighbor(verts, v, from) {
        var V = verts[v];
        var base = Math.atan2(verts[from].y - V.y, verts[from].x - V.x); // hướng v→from
        var best = null, bestDelta = Infinity;
        var keys = Object.keys(V.nbrs);
        for (var i = 0; i < keys.length; i++) {
            var n = keys[i];
            var N = verts[n];
            var ang = Math.atan2(N.y - V.y, N.x - V.x);
            var delta = base - ang;
            while (delta <= EPS) delta += Math.PI * 2; // (0, 2π]; quay lại `from` ≈ 2π
            if (delta < bestDelta) { bestDelta = delta; best = n; }
        }
        return best;
    }

    function traceFaces(verts) {
        var visited = {};
        var faces = [];
        var vKeys = Object.keys(verts);
        for (var i = 0; i < vKeys.length; i++) {
            var start = vKeys[i];
            var nbrs = Object.keys(verts[start].nbrs);
            for (var j = 0; j < nbrs.length; j++) {
                var first = nbrs[j];
                var heKey = start + '|' + first;
                if (visited[heKey]) continue;
                var face = [];
                var curA = start, curB = first, guard = 0;
                while (true) {
                    visited[curA + '|' + curB] = true;
                    face.push({ x: verts[curA].x, y: verts[curA].y });
                    var nxt = nextNeighbor(verts, curB, curA);
                    if (nxt == null) break;
                    curA = curB;
                    curB = nxt;
                    if (curA === start && curB === first) break;
                    if (++guard > 200000) break;
                }
                if (face.length >= 3) faces.push(face);
            }
        }
        return faces;
    }

    /**
     * Tìm vùng kín nhỏ nhất bao quanh `point` từ tập đoạn `segments`.
     * @param {Array<{a:{x,y},b:{x,y}}>} segments
     * @param {{x,y}} point
     * @returns {Array<{x,y}>|null} danh sách đỉnh polygon (không đóng lặp đỉnh cuối) hoặc null
     */
    function trace(segments, point) {
        if (!Array.isArray(segments) || !segments.length || !point) return null;
        var split = splitSegments(segments);
        if (!split.length) return null;
        var verts = buildGraph(split);
        pruneDangling(verts);
        var faces = traceFaces(verts).filter(function (f) {
            return f.length >= 3 && Math.abs(signedArea(f)) > MERGE;
        });
        if (!faces.length) return null;

        // Bỏ 1 mặt lớn nhất (mặt ngoài vô hạn). Mặt trong & ngoài của cùng 1 vòng có
        // hình dạng giống nhau nên bỏ bất kỳ cái nào cũng cho polygon đúng.
        var maxIdx = 0, maxArea = -1;
        for (var i = 0; i < faces.length; i++) {
            var ar = Math.abs(signedArea(faces[i]));
            if (ar > maxArea) { maxArea = ar; maxIdx = i; }
        }
        faces.splice(maxIdx, 1);

        var best = null, bestArea = Infinity;
        for (var k = 0; k < faces.length; k++) {
            if (!pointInPolygon(point, faces[k])) continue;
            var a2 = Math.abs(signedArea(faces[k]));
            if (a2 < bestArea) { bestArea = a2; best = faces[k]; }
        }
        if (!best) return null;
        return dedupe(best);
    }

    // Khoảng cách từ điểm p tới đường thẳng qua a,b
    function distToLine(p, a, b) {
        var vx = b.x - a.x, vy = b.y - a.y;
        var len = Math.hypot(vx, vy);
        if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
        return Math.abs((p.x - a.x) * vy - (p.y - a.y) * vx) / len;
    }

    // Bỏ đỉnh trùng liên tiếp + đỉnh cuối trùng đỉnh đầu + đỉnh thẳng hàng
    function dedupe(poly) {
        var out = [];
        for (var i = 0; i < poly.length; i++) {
            var p = poly[i];
            var last = out[out.length - 1];
            if (last && Math.hypot(last.x - p.x, last.y - p.y) < MERGE) continue;
            out.push({ x: p.x, y: p.y });
        }
        if (out.length > 1) {
            var f = out[0], l = out[out.length - 1];
            if (Math.hypot(f.x - l.x, f.y - l.y) < MERGE) out.pop();
        }
        // Bỏ đỉnh nằm thẳng hàng giữa 2 đỉnh kề (đường bao đi thẳng qua điểm cắt)
        if (out.length > 3) {
            var changed = true;
            while (changed && out.length > 3) {
                changed = false;
                for (var k = 0; k < out.length; k++) {
                    var prev = out[(k - 1 + out.length) % out.length];
                    var cur = out[k];
                    var next = out[(k + 1) % out.length];
                    if (distToLine(cur, prev, next) < MERGE) {
                        out.splice(k, 1);
                        changed = true;
                        break;
                    }
                }
            }
        }
        return out;
    }

    // Gom đoạn từ 1 polyline (điểm liên tiếp)
    function polylineToSegments(points) {
        var segs = [];
        if (!Array.isArray(points)) return segs;
        for (var i = 0; i < points.length - 1; i++) {
            segs.push({ a: { x: points[i].x, y: points[i].y }, b: { x: points[i + 1].x, y: points[i + 1].y } });
        }
        return segs;
    }

    return {
        trace: trace,
        splitSegments: splitSegments,
        signedArea: signedArea,
        pointInPolygon: pointInPolygon,
        polylineToSegments: polylineToSegments,
        _keyOf: keyOf
    };
});
