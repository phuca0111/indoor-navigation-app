// ============================================================
// DXF-IO.JS — Xuất/Nhập DXF (AutoCAD R12/R14 ASCII, tối giản)
//   Hỗ trợ entity: LINE, LWPOLYLINE, CIRCLE.
//   Trục Y: DXF dùng Y-hướng-lên còn canvas Y-hướng-xuống ⇒ lật dấu Y hai chiều
//   (export ghi -y, import đọc y=-value) nên round-trip qua parser này là đồng nhất.
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.DxfIO = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function num(n) {
        var v = Number(n);
        if (!isFinite(v)) v = 0;
        return v.toFixed(3);
    }

    function emitPolyline(points, closed, layer) {
        if (!points || points.length < 2) return '';
        var s = '0\nLWPOLYLINE\n8\n' + (layer || '0') + '\n';
        s += '100\nAcDbEntity\n100\nAcDbPolyline\n';
        s += '90\n' + points.length + '\n';
        s += '70\n' + (closed ? 1 : 0) + '\n';
        for (var i = 0; i < points.length; i++) {
            s += '10\n' + num(points[i].x) + '\n20\n' + num(-points[i].y) + '\n';
        }
        return s;
    }

    function emitCircle(cx, cy, r, layer) {
        return '0\nCIRCLE\n8\n' + (layer || '0') + '\n40\n' + num(r) +
            '\n10\n' + num(cx) + '\n20\n' + num(-cy) + '\n';
    }

    /**
     * Sinh chuỗi DXF từ dữ liệu bản đồ.
     * data: { walls:[{points}], lines:[{points,type}], rooms:[{shape,...}] }
     */
    function exportDXF(data) {
        data = data || {};
        var body = '0\nSECTION\n2\nENTITIES\n';

        (data.walls || []).forEach(function (w) {
            if (w && w.points && w.points.length >= 2) {
                body += emitPolyline(w.points, false, 'WALLS');
            }
        });

        (data.lines || []).forEach(function (ln) {
            if (ln && ln.points && ln.points.length >= 2) {
                body += emitPolyline(ln.points, false, ln.type === 'arc' ? 'ARCS' : 'LINES');
            }
        });

        (data.rooms || []).forEach(function (r) {
            if (!r) return;
            if (r.shape === 'circle' && r.radius) {
                var cx = r.cx != null ? r.cx : (r.x + (r.width || 0) / 2);
                var cy = r.cy != null ? r.cy : (r.y + (r.height || 0) / 2);
                body += emitCircle(cx, cy, r.radius, 'ROOMS');
            } else if (r.shape === 'polygon' && r.points && r.points.length >= 2) {
                body += emitPolyline(r.points, true, 'ROOMS');
            } else if (r.width != null && r.height != null) {
                var x = r.x, y = r.y, w2 = r.width, h2 = r.height;
                body += emitPolyline([
                    { x: x, y: y }, { x: x + w2, y: y },
                    { x: x + w2, y: y + h2 }, { x: x, y: y + h2 }
                ], true, 'ROOMS');
            }
        });

        body += '0\nENDSEC\n0\nEOF\n';
        return body;
    }

    /**
     * Parse chuỗi DXF → { polylines:[{points,closed,layer}], circles:[{cx,cy,radius,layer}] }
     * Bỏ qua entity không hỗ trợ. Toạ độ đã lật Y về hệ canvas.
     */
    function parseDXF(text) {
        var result = { polylines: [], circles: [] };
        if (!text || typeof text !== 'string') return result;
        var lines = text.split(/\r\n|\r|\n/);
        // Gom thành cặp (code, value)
        var pairs = [];
        for (var i = 0; i + 1 < lines.length; i += 2) {
            var code = parseInt(lines[i].trim(), 10);
            if (isNaN(code)) { i -= 1; continue; } // lệch dòng: thử dịch 1
            pairs.push({ code: code, value: lines[i + 1] });
        }

        var i2 = 0;
        // Chỉ xử lý trong ENTITIES cho gọn: quét toàn bộ, bắt theo code 0
        function collectEntity(startType) {
            var ent = { type: startType, layer: '0', pts10: [], pts20: [], x1: null, y1: null, x2: null, y2: null, radius: null, closed: false };
            while (i2 < pairs.length && pairs[i2].code !== 0) {
                var p = pairs[i2];
                var val = p.value != null ? p.value.trim() : '';
                switch (p.code) {
                    case 8: ent.layer = val; break;
                    case 70: ent.closed = (parseInt(val, 10) & 1) === 1; break;
                    case 10:
                        if (startType === 'LINE') ent.x1 = parseFloat(val);
                        else if (startType === 'CIRCLE') ent.cx = parseFloat(val);
                        else ent.pts10.push(parseFloat(val));
                        break;
                    case 20:
                        if (startType === 'LINE') ent.y1 = -parseFloat(val);
                        else if (startType === 'CIRCLE') ent.cy = -parseFloat(val);
                        else ent.pts20.push(-parseFloat(val));
                        break;
                    case 11: ent.x2 = parseFloat(val); break;
                    case 21: ent.y2 = -parseFloat(val); break;
                    case 40: ent.radius = parseFloat(val); break;
                    default: break;
                }
                i2++;
            }
            return ent;
        }

        while (i2 < pairs.length) {
            var pr = pairs[i2];
            if (pr.code === 0) {
                var t = (pr.value || '').trim().toUpperCase();
                i2++;
                if (t === 'LINE') {
                    var e = collectEntity('LINE');
                    if (e.x1 != null && e.x2 != null) {
                        result.polylines.push({
                            layer: e.layer, closed: false,
                            points: [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }]
                        });
                    }
                } else if (t === 'LWPOLYLINE' || t === 'POLYLINE') {
                    var e2 = collectEntity('LWPOLYLINE');
                    var pts = [];
                    for (var k = 0; k < e2.pts10.length && k < e2.pts20.length; k++) {
                        pts.push({ x: e2.pts10[k], y: e2.pts20[k] });
                    }
                    if (pts.length >= 2) {
                        result.polylines.push({ layer: e2.layer, closed: e2.closed, points: pts });
                    }
                } else if (t === 'CIRCLE') {
                    var e3 = collectEntity('CIRCLE');
                    if (e3.cx != null && e3.radius != null) {
                        result.circles.push({ cx: e3.cx, cy: e3.cy, radius: e3.radius, layer: e3.layer });
                    }
                }
                // entity khác: bỏ qua (đã dừng ở code 0 kế tiếp bên trong collectEntity? không)
            } else {
                i2++;
            }
        }
        return result;
    }

    return {
        exportDXF: exportDXF,
        parseDXF: parseDXF
    };
});
