// ============================================================
// GEOMETRY-ENGINE.JS — Toán hình học 2D (Phase 0 skeleton — §5.23)
// Trim / intersect / point-in-polygon — dùng chung Snap + Phase 2 editing
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.GeometryEngine = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function dist2(ax, ay, bx, by) {
        var dx = ax - bx, dy = ay - by;
        return dx * dx + dy * dy;
    }

    function segmentIntersection(a, b, c, d) {
        var ax = a.x, ay = a.y, bx = b.x, by = b.y;
        var cx = c.x, cy = c.y, dx = d.x, dy = d.y;
        var rX = bx - ax, rY = by - ay;
        var sX = dx - cx, sY = dy - cy;
        var denom = rX * sY - rY * sX;
        if (Math.abs(denom) < 1e-10) return null;
        var qpX = cx - ax, qpY = cy - ay;
        var t = (qpX * sY - qpY * sX) / denom;
        var u = (qpX * rY - qpY * rX) / denom;
        var eps = 1e-6;
        if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
        return { x: ax + t * rX, y: ay + t * rY, t: t, u: u };
    }

    function distance(a, b) {
        return Math.sqrt(dist2(a.x, a.y, b.x, b.y));
    }

    /**
     * Giao 2 ĐƯỜNG THẲNG vô hạn qua AB và CD (không giới hạn đoạn) — dùng Fillet/Chamfer.
     * @returns {{x,y,t,u}|null} null nếu song song.
     */
    function lineIntersection(a, b, c, d) {
        var rX = b.x - a.x, rY = b.y - a.y;
        var sX = d.x - c.x, sY = d.y - c.y;
        var denom = rX * sY - rY * sX;
        if (Math.abs(denom) < 1e-10) return null;
        var qpX = c.x - a.x, qpY = c.y - a.y;
        var t = (qpX * sY - qpY * sX) / denom;
        var u = (qpX * rY - qpY * rX) / denom;
        return { x: a.x + t * rX, y: a.y + t * rY, t: t, u: u };
    }

    /** Ray-casting — point trong polygon (đỉnh đóng hoặc mở) */
    function pointInPolygon(point, polygon) {
        if (!point || !polygon || polygon.length < 3) return false;
        var x = point.x, y = point.y;
        var inside = false;
        for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            var xi = polygon[i].x, yi = polygon[i].y;
            var xj = polygon[j].x, yj = polygon[j].y;
            var intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-10) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /** Chiếu điểm P lên đoạn AB — trả t trong [0,1] nếu trên đoạn */
    function projectOnSegment(p, a, b) {
        var vx = b.x - a.x, vy = b.y - a.y;
        var len2 = vx * vx + vy * vy;
        if (len2 < 1e-10) return { x: a.x, y: a.y, t: 0, onSegment: true };
        var t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
        var onSegment = t >= 0 && t <= 1;
        t = Math.max(0, Math.min(1, t));
        return { x: a.x + t * vx, y: a.y + t * vy, t: t, onSegment: onSegment };
    }

    /**
     * Trim đoạn target theo cutting: BỎ phần cùng phía với clickPt (giống AutoCAD Trim).
     * @returns {{a:{x,y}, b:{x,y}}|null} đoạn còn lại
     */
    function trimSegment(targetA, targetB, cutA, cutB, clickPt) {
        var hit = segmentIntersection(targetA, targetB, cutA, cutB);
        if (!hit) return null;
        var proj = projectOnSegment(clickPt, targetA, targetB);
        var hitT = hit.t;
        if (hitT < 0) hitT = 0;
        if (hitT > 1) hitT = 1;
        // Click phía B của giao → bỏ phía B → giữ A→giao
        if (proj.t >= hitT) {
            return { a: { x: targetA.x, y: targetA.y }, b: { x: hit.x, y: hit.y } };
        }
        // Click phía A → bỏ phía A → giữ giao→B
        return { a: { x: hit.x, y: hit.y }, b: { x: targetB.x, y: targetB.y } };
    }

    /**
     * Trim với nhiều biên: BỎ khoảng chứa click (đuôi ngoài / đoạn giữa hai tường).
     * Nếu còn 2 nửa tách rời → trả thêm otherHalf để tạo đoạn thứ hai.
     * @returns {{a,b, otherHalf?:{a,b}}|null}
     */
    function trimAgainstCutters(targetA, targetB, cutters, clickPt) {
        if (!cutters || !cutters.length) return null;
        var proj = projectOnSegment(clickPt, targetA, targetB);
        var clickT = proj.t;
        var hits = [];
        for (var i = 0; i < cutters.length; i++) {
            var hit = segmentIntersection(targetA, targetB, cutters[i].a, cutters[i].b);
            if (!hit) continue;
            var t = Math.max(0, Math.min(1, hit.t));
            // Gộp giao trùng (cùng chỗ)
            var dup = false;
            for (var k = 0; k < hits.length; k++) {
                if (Math.abs(hits[k].t - t) < 1e-4) { dup = true; break; }
            }
            if (!dup) hits.push({ x: hit.x, y: hit.y, t: t });
        }
        if (!hits.length) return null;
        hits.sort(function (p, q) { return p.t - q.t; });

        // Các mốc: 0 | hit0 | hit1 | ... | 1 — tìm khoảng chứa click để BỎ
        var leftT = 0;
        var rightT = 1;
        var leftPt = { x: targetA.x, y: targetA.y };
        var rightPt = { x: targetB.x, y: targetB.y };
        for (var h = 0; h < hits.length; h++) {
            if (clickT >= hits[h].t) {
                leftT = hits[h].t;
                leftPt = { x: hits[h].x, y: hits[h].y };
            }
        }
        for (var h2 = hits.length - 1; h2 >= 0; h2--) {
            if (clickT <= hits[h2].t) {
                rightT = hits[h2].t;
                rightPt = { x: hits[h2].x, y: hits[h2].y };
            }
        }

        // Click đúng tại giao → chọn khoảng gần hơn theo phía tip (ưu tiên đuôi)
        if (Math.abs(rightT - leftT) < 1e-6) {
            var nearest = hits[0];
            var bestD = Math.abs(hits[0].t - clickT);
            for (var n = 1; n < hits.length; n++) {
                var dn = Math.abs(hits[n].t - clickT);
                if (dn < bestD) { bestD = dn; nearest = hits[n]; }
            }
            if (clickT >= nearest.t) {
                return { a: { x: targetA.x, y: targetA.y }, b: { x: nearest.x, y: nearest.y } };
            }
            return { a: { x: nearest.x, y: nearest.y }, b: { x: targetB.x, y: targetB.y } };
        }

        var keepLeft = leftT > 1e-4;
        var keepRight = rightT < 1 - 1e-4;
        if (!keepLeft && !keepRight) return null;

        // Bỏ đuôi đầu (click trước giao đầu): chỉ giữ từ rightPt → B
        if (!keepLeft && keepRight) {
            return { a: rightPt, b: { x: targetB.x, y: targetB.y } };
        }
        // Bỏ đuôi cuối (click sau giao cuối): chỉ giữ A → leftPt  ← case ảnh user
        if (keepLeft && !keepRight) {
            return { a: { x: targetA.x, y: targetA.y }, b: leftPt };
        }
        // Bỏ đoạn giữa hai biên: giữ 2 nửa
        return {
            a: { x: targetA.x, y: targetA.y },
            b: leftPt,
            otherHalf: { a: rightPt, b: { x: targetB.x, y: targetB.y } }
        };
    }

    /**
     * Cắt đôi đoạn tại điểm chiếu của click (Break).
     * @returns {{left:{a,b}, right:{a,b}}|null}
     */
    function breakSegmentAt(targetA, targetB, clickPt) {
        var proj = projectOnSegment(clickPt, targetA, targetB);
        if (!proj.onSegment && (proj.t <= 0.02 || proj.t >= 0.98)) return null;
        var mid = { x: proj.x, y: proj.y };
        var leftLen = Math.hypot(mid.x - targetA.x, mid.y - targetA.y);
        var rightLen = Math.hypot(targetB.x - mid.x, targetB.y - mid.y);
        if (leftLen < 2 || rightLen < 2) return null;
        return {
            left: { a: { x: targetA.x, y: targetA.y }, b: mid },
            right: { a: { x: mid.x, y: mid.y }, b: { x: targetB.x, y: targetB.y } },
            mid: mid,
            t: proj.t
        };
    }

    /**
     * Extend đoạn target tới giao với đường cắt (kéo dài vô hạn target + đoạn cut).
     */
    function extendSegment(targetA, targetB, cutA, cutB) {
        var ax = targetA.x, ay = targetA.y, bx = targetB.x, by = targetB.y;
        var cx = cutA.x, cy = cutA.y, dx = cutB.x, dy = cutB.y;
        var rX = bx - ax, rY = by - ay;
        var sX = dx - cx, sY = dy - cy;
        var denom = rX * sY - rY * sX;
        if (Math.abs(denom) < 1e-10) return null;
        var qpX = cx - ax, qpY = cy - ay;
        var t = (qpX * sY - qpY * sX) / denom;
        var u = (qpX * rY - qpY * rX) / denom;
        // cut phải nằm trên đoạn cắt (u in [0,1]); target có thể ngoài [0,1]
        if (u < -1e-6 || u > 1 + 1e-6) return null;
        var ix = ax + t * rX, iy = ay + t * rY;
        // Nếu giao đã nằm trên đoạn target → không cần extend
        if (t >= -1e-6 && t <= 1 + 1e-6) return null;
        // Kéo endpoint gần phía giao
        if (t < 0) {
            return { a: { x: ix, y: iy }, b: { x: bx, y: by } };
        }
        return { a: { x: ax, y: ay }, b: { x: ix, y: iy } };
    }

    /** Offset đoạn AB sang 2 phía theo khoảng cách d (px) — dùng MLine */
    function offsetSegment(a, b, dist) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-10) return null;
        var nx = -dy / len, ny = dx / len;
        return {
            left: [
                { x: a.x + nx * dist, y: a.y + ny * dist },
                { x: b.x + nx * dist, y: b.y + ny * dist }
            ],
            right: [
                { x: a.x - nx * dist, y: a.y - ny * dist },
                { x: b.x - nx * dist, y: b.y - ny * dist }
            ],
            center: [a, b]
        };
    }

    /**
     * Dựng cung tròn qua 3 điểm (start → mid → end). Chuẩn AutoCAD ARC 3-point.
     * @returns {{cx,cy,radius,startAngle,endAngle,anticlockwise}|null} null nếu 3 điểm thẳng hàng
     */
    function arcFrom3Points(a, b, c) {
        if (!a || !b || !c) return null;
        var ax = a.x, ay = a.y, bx = b.x, by = b.y, cx = c.x, cy = c.y;
        var d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        if (Math.abs(d) < 1e-9) return null; // thẳng hàng
        var a2 = ax * ax + ay * ay;
        var b2 = bx * bx + by * by;
        var c2 = cx * cx + cy * cy;
        var ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
        var uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
        var radius = Math.hypot(ax - ux, ay - uy);
        if (!(radius > 0) || !isFinite(radius)) return null;
        var startAngle = Math.atan2(ay - uy, ax - ux);
        var midAngle = Math.atan2(by - uy, bx - ux);
        var endAngle = Math.atan2(cy - uy, cx - ux);
        // Chiều quét: đi từ start qua mid tới end. Kiểm tra mid có nằm trên cung CCW không.
        var anticlockwise = !angleInArc(startAngle, endAngle, midAngle, false);
        return {
            cx: ux, cy: uy, radius: radius,
            startAngle: startAngle, endAngle: endAngle,
            anticlockwise: anticlockwise
        };
    }

    /** Chuẩn hóa góc về [0, 2π). */
    function norm2pi(t) {
        var TAU = Math.PI * 2;
        t = t % TAU;
        if (t < 0) t += TAU;
        return t;
    }

    /**
     * Kiểm tra góc theta có nằm trên cung từ start→end theo chiều CW (anticlockwise=false)
     * hoặc CCW (anticlockwise=true) hay không.
     */
    function angleInArc(start, end, theta, anticlockwise) {
        var s = norm2pi(start), e = norm2pi(end), t = norm2pi(theta);
        if (!anticlockwise) {
            // chiều tăng (CCW theo toán học): từ s tới e tăng dần
            var span = norm2pi(e - s);
            var rel = norm2pi(t - s);
            return rel <= span + 1e-9;
        }
        var span2 = norm2pi(s - e);
        var rel2 = norm2pi(s - t);
        return rel2 <= span2 + 1e-9;
    }

    /** Sinh polyline xấp xỉ cung để hit-test / xuất. segments = số đoạn. */
    function arcToPolyline(arc, segments) {
        if (!arc) return [];
        var n = Math.max(2, segments || 24);
        var s = arc.startAngle, e = arc.endAngle;
        var sweep;
        if (arc.anticlockwise) {
            sweep = -norm2pi(s - e);
        } else {
            sweep = norm2pi(e - s);
        }
        if (Math.abs(sweep) < 1e-9) sweep = Math.PI * 2;
        var pts = [];
        for (var i = 0; i <= n; i++) {
            var ang = s + sweep * (i / n);
            pts.push({ x: arc.cx + arc.radius * Math.cos(ang), y: arc.cy + arc.radius * Math.sin(ang) });
        }
        return pts;
    }

    /**
     * Ma trận đồng dạng (translate + rotate + uniform scale) đưa s1→d1 và s2→d2.
     * Chuẩn lệnh ALIGN (AL) của AutoCAD với 2 cặp điểm.
     * x' = m11*x + m12*y + tx ; y' = m21*x + m22*y + ty
     * @returns {{m11,m12,m21,m22,tx,ty,scale,rotation}|null}
     */
    function computeAlignTransform(s1, s2, d1, d2) {
        if (!s1 || !s2 || !d1 || !d2) return null;
        var sdx = s2.x - s1.x, sdy = s2.y - s1.y;
        var ddx = d2.x - d1.x, ddy = d2.y - d1.y;
        var sl = Math.hypot(sdx, sdy);
        var dl = Math.hypot(ddx, ddy);
        if (sl < 1e-9) return null;
        var scale = (dl < 1e-9) ? 1 : dl / sl;
        var rotation = Math.atan2(ddy, ddx) - Math.atan2(sdy, sdx);
        var c = Math.cos(rotation) * scale;
        var s = Math.sin(rotation) * scale;
        return {
            m11: c, m12: -s,
            m21: s, m22: c,
            tx: d1.x - c * s1.x + s * s1.y,
            ty: d1.y - s * s1.x - c * s1.y,
            scale: scale,
            rotation: rotation
        };
    }

    /** Áp ma trận đồng dạng lên 1 điểm {x,y} → điểm mới. */
    function applyTransformPoint(m, p) {
        if (!m || !p) return p;
        return {
            x: m.m11 * p.x + m.m12 * p.y + m.tx,
            y: m.m21 * p.x + m.m22 * p.y + m.ty
        };
    }

    /**
     * Phá polyline thành danh sách đoạn 2 điểm (Explode).
     * points: [{x,y}...]; closed=true để nối đỉnh cuối về đỉnh đầu.
     * Bỏ qua các đoạn có độ dài ~0. Trả về [{a:{x,y}, b:{x,y}}...].
     */
    function explodePolyline(points, closed) {
        if (!Array.isArray(points) || points.length < 2) return [];
        var segs = [];
        var n = points.length;
        var last = closed ? n : n - 1;
        for (var i = 0; i < last; i++) {
            var a = points[i];
            var b = points[(i + 1) % n];
            if (!a || !b) continue;
            if (distance(a, b) < 1e-6) continue;
            segs.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
        }
        return segs;
    }

    /**
     * Offset (song song) một polyline theo khoảng cách có dấu (miter join).
     * dist > 0: lệch sang trái pháp tuyến (theo chiều a→b); dist < 0: sang phải.
     * closed=true: nối vòng. Trả về mảng đỉnh mới cùng số lượng đỉnh.
     * Góc nhọn parallel → fallback dịch theo pháp tuyến của đoạn kề.
     */
    function offsetPolyline(points, dist, closed) {
        if (!Array.isArray(points) || points.length < 2) return [];
        var n = points.length;
        var segCount = closed ? n : n - 1;
        var normals = [];
        for (var i = 0; i < segCount; i++) {
            var a = points[i];
            var b = points[(i + 1) % n];
            var dx = b.x - a.x, dy = b.y - a.y;
            var len = Math.sqrt(dx * dx + dy * dy) || 1;
            normals.push({ x: -dy / len, y: dx / len });
        }
        function offA(i) {
            return { x: points[i].x + normals[i].x * dist, y: points[i].y + normals[i].y * dist };
        }
        function offB(i) {
            var j = (i + 1) % n;
            return { x: points[j].x + normals[i].x * dist, y: points[j].y + normals[i].y * dist };
        }
        var out = [];
        if (!closed) {
            out.push(offA(0));
            for (var k = 1; k < segCount; k++) {
                var p = lineIntersection(offA(k - 1), offB(k - 1), offA(k), offB(k));
                out.push(p ? { x: p.x, y: p.y } : offA(k));
            }
            out.push(offB(segCount - 1));
        } else {
            for (var m = 0; m < segCount; m++) {
                var prev = (m - 1 + segCount) % segCount;
                var q = lineIntersection(offA(prev), offB(prev), offA(m), offB(m));
                out.push(q ? { x: q.x, y: q.y } : offA(m));
            }
        }
        return out;
    }

    /**
     * Sinh polyline kín xấp xỉ hình elip.
     * Tâm (cx,cy), bán trục rx/ry, xoay rotation (rad). Trả về segs+1 điểm (điểm
     * cuối trùng điểm đầu để khép kín). Dùng cho công cụ Ellipse.
     */
    function ellipsePolyline(cx, cy, rx, ry, rotation, segs) {
        rotation = rotation || 0;
        segs = Math.max(8, segs || 48);
        var c = Math.cos(rotation), s = Math.sin(rotation);
        var pts = [];
        for (var i = 0; i < segs; i++) {
            var th = (Math.PI * 2 * i) / segs;
            var ex = rx * Math.cos(th);
            var ey = ry * Math.sin(th);
            pts.push({ x: cx + ex * c - ey * s, y: cy + ex * s + ey * c });
        }
        pts.push({ x: pts[0].x, y: pts[0].y });
        return pts;
    }

    /**
     * Đa giác đều n cạnh (Polygon / POL).
     * Tâm (cx,cy), bán kính tới đỉnh (inscribed circumradius), số cạnh sides≥3,
     * rotation (rad) = góc đỉnh đầu. Trả về n điểm (không lặp đỉnh đầu).
     */
    function regularPolygon(cx, cy, radius, sides, rotation) {
        sides = Math.round(sides || 6);
        if (sides < 3) sides = 3;
        if (sides > 64) sides = 64;
        radius = Math.abs(radius || 0);
        rotation = rotation || 0;
        var pts = [];
        for (var i = 0; i < sides; i++) {
            var th = rotation + (Math.PI * 2 * i) / sides;
            pts.push({
                x: cx + radius * Math.cos(th),
                y: cy + radius * Math.sin(th)
            });
        }
        return pts;
    }

    /**
     * Nối 2 polyline (Join). Chọn cặp đầu mút gần nhau nhất để ghép, tự đảo
     * chiều khi cần. Nếu 2 đầu mút trùng (khoảng cách < tol) thì bỏ điểm lặp.
     * @returns {{points:[{x,y}], gap:number}|null}
     */
    function joinPolylines(ptsA, ptsB, tol) {
        if (!Array.isArray(ptsA) || !Array.isArray(ptsB) || ptsA.length < 2 || ptsB.length < 2) return null;
        tol = tol != null ? tol : 1e-6;
        var a0 = ptsA[0], a1 = ptsA[ptsA.length - 1];
        var b0 = ptsB[0], b1 = ptsB[ptsB.length - 1];
        function rev(arr) { return arr.slice().reverse(); }
        // 4 cách ghép: [đuôi A nối đầu B]
        var options = [
            { gap: distance(a1, b0), A: ptsA, B: ptsB },       // A..a1 - b0..B
            { gap: distance(a1, b1), A: ptsA, B: rev(ptsB) },  // A..a1 - b1..B(rev)
            { gap: distance(a0, b0), A: rev(ptsA), B: ptsB },  // A(rev)..a0 - b0..B
            { gap: distance(a0, b1), A: rev(ptsA), B: rev(ptsB) }
        ];
        var best = options[0];
        for (var i = 1; i < options.length; i++) {
            if (options[i].gap < best.gap) best = options[i];
        }
        var merged = best.A.map(function (p) { return { x: p.x, y: p.y }; });
        var bPts = best.B;
        var startIdx = (best.gap < tol) ? 1 : 0; // bỏ điểm trùng nếu chạm nhau
        for (var j = startIdx; j < bPts.length; j++) {
            merged.push({ x: bPts[j].x, y: bPts[j].y });
        }
        return { points: merged, gap: best.gap };
    }

    /**
     * Đóng polyline (PEdit Close): nếu đầu≠đuôi thì thêm đỉnh đầu vào cuối;
     * nếu đã gần khép thì snap đuôi về đầu.
     * @returns {{points:[{x,y}], closed:boolean, alreadyClosed:boolean}|null}
     */
    function closePolyline(points, tol) {
        if (!Array.isArray(points) || points.length < 3) return null;
        tol = tol != null ? tol : 1e-6;
        var out = points.map(function (p) { return { x: p.x, y: p.y }; });
        var a = out[0], b = out[out.length - 1];
        var gap = distance(a, b);
        if (gap < tol) {
            out[out.length - 1] = { x: a.x, y: a.y };
            return { points: out, closed: true, alreadyClosed: true };
        }
        out.push({ x: a.x, y: a.y });
        return { points: out, closed: true, alreadyClosed: false };
    }

    function fitPolyline(points, closed) {
        if (!Array.isArray(points) || points.length < 3) return null;
        var source = points.map(function (p) { return { x: Number(p.x), y: Number(p.y) }; });
        if (source.some(function (p) { return !Number.isFinite(p.x) || !Number.isFinite(p.y); })) return null;
        if (closed && distance(source[0], source[source.length - 1]) < 1e-6) source.pop();
        var out = [];
        if (!closed) out.push(source[0]);
        for (var i = 0; i < source.length - (closed ? 0 : 1); i++) {
            var a = source[i];
            var b = source[(i + 1) % source.length];
            out.push(
                { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
                { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }
            );
        }
        if (!closed) out.push(source[source.length - 1]);
        if (closed && out.length) out.push({ x: out[0].x, y: out[0].y });
        return out;
    }

    function splinePolyline(points, closed, samplesPerSegment) {
        if (!Array.isArray(points) || points.length < 3) return null;
        var source = points.map(function (p) { return { x: Number(p.x), y: Number(p.y) }; });
        if (source.some(function (p) { return !Number.isFinite(p.x) || !Number.isFinite(p.y); })) return null;
        if (closed && distance(source[0], source[source.length - 1]) < 1e-6) source.pop();
        samplesPerSegment = Math.max(2, Math.min(32, Math.round(samplesPerSegment || 8)));
        var out = [];
        var segmentCount = closed ? source.length : source.length - 1;
        function at(index) {
            if (closed) return source[(index + source.length) % source.length];
            return source[Math.max(0, Math.min(source.length - 1, index))];
        }
        for (var i = 0; i < segmentCount; i++) {
            var p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
            for (var step = 0; step < samplesPerSegment; step++) {
                var t = step / samplesPerSegment;
                var t2 = t * t, t3 = t2 * t;
                out.push({
                    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
                        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
                        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
                });
            }
        }
        if (closed) out.push({ x: out[0].x, y: out[0].y });
        else out.push({ x: source[source.length - 1].x, y: source[source.length - 1].y });
        return out;
    }

    return {
        segmentIntersection: segmentIntersection,
        lineIntersection: lineIntersection,
        distance: distance,
        pointInPolygon: pointInPolygon,
        projectOnSegment: projectOnSegment,
        trimSegment: trimSegment,
        trimAgainstCutters: trimAgainstCutters,
        breakSegmentAt: breakSegmentAt,
        extendSegment: extendSegment,
        offsetSegment: offsetSegment,
        arcFrom3Points: arcFrom3Points,
        arcToPolyline: arcToPolyline,
        angleInArc: angleInArc,
        computeAlignTransform: computeAlignTransform,
        applyTransformPoint: applyTransformPoint,
        explodePolyline: explodePolyline,
        offsetPolyline: offsetPolyline,
        joinPolylines: joinPolylines,
        closePolyline: closePolyline,
        fitPolyline: fitPolyline,
        splinePolyline: splinePolyline,
        ellipsePolyline: ellipsePolyline,
        regularPolygon: regularPolygon
    };
});
