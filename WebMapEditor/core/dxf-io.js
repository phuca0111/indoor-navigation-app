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

    function safeLayer(layer) {
        return String(layer || '0').replace(/[\r\n\u0000]/g, '_').slice(0, 255);
    }

    function emitPolyline(points, closed, layer) {
        if (!points || points.length < 2) return '';
        var s = '0\nLWPOLYLINE\n8\n' + safeLayer(layer) + '\n';
        s += '100\nAcDbEntity\n100\nAcDbPolyline\n';
        s += '90\n' + points.length + '\n';
        s += '70\n' + (closed ? 1 : 0) + '\n';
        for (var i = 0; i < points.length; i++) {
            s += '10\n' + num(points[i].x) + '\n20\n' + num(-points[i].y) + '\n';
        }
        return s;
    }

    function emitCircle(cx, cy, r, layer) {
        return '0\nCIRCLE\n8\n' + safeLayer(layer) + '\n40\n' + num(r) +
            '\n10\n' + num(cx) + '\n20\n' + num(-cy) + '\n';
    }

    function emitArc(arc, points, layer) {
        if (!arc || !points || points.length < 2) return '';
        var first = points[0], last = points[points.length - 1];
        var start = -Math.atan2(first.y - arc.cy, first.x - arc.cx) * 180 / Math.PI;
        var end = -Math.atan2(last.y - arc.cy, last.x - arc.cx) * 180 / Math.PI;
        return '0\nARC\n8\n' + safeLayer(layer || 'ARCS') +
            '\n10\n' + num(arc.cx) + '\n20\n' + num(-arc.cy) +
            '\n40\n' + num(arc.radius) + '\n50\n' + num(start) + '\n51\n' + num(end) + '\n';
    }

    function emitEllipse(ellipse, layer) {
        if (!ellipse || !(ellipse.rx > 0) || !(ellipse.ry > 0)) return '';
        var rotation = Number(ellipse.rotation) || 0;
        var majorX = ellipse.rx * Math.cos(rotation);
        var majorY = -ellipse.rx * Math.sin(rotation);
        return '0\nELLIPSE\n8\n' + safeLayer(layer || 'ELLIPSES') +
            '\n10\n' + num(ellipse.cx) + '\n20\n' + num(-ellipse.cy) +
            '\n11\n' + num(majorX) + '\n21\n' + num(majorY) +
            '\n40\n' + num(ellipse.ry / ellipse.rx) +
            '\n41\n0.000\n42\n6.283\n';
    }

    function emitPoint(point, layer) {
        return '0\nPOINT\n8\n' + safeLayer(layer || 'POINTS') +
            '\n10\n' + num(point.x) + '\n20\n' + num(-point.y) + '\n';
    }

    /**
     * Sinh chuỗi DXF từ dữ liệu bản đồ.
     * data: { walls:[{points}], lines:[{points,type}], rooms:[{shape,...}] }
     */
    function exportDXF(data) {
        data = data || {};
        var units = Number.isFinite(Number(data.insUnits)) ? Math.round(Number(data.insUnits)) : 0;
        var body = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1014\n' +
            '9\n$INSUNITS\n70\n' + units + '\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';

        (data.walls || []).forEach(function (w) {
            if (w && w.points && w.points.length >= 2) {
                body += emitPolyline(w.points, !!w.closed, 'WALLS');
            }
        });

        (data.lines || []).forEach(function (ln) {
            if (ln && ln.points && ln.points.length >= 2) {
                if (ln.type === 'arc' && ln.arc) body += emitArc(ln.arc, ln.points, 'ARCS');
                else if (ln.type === 'ellipse' && ln.ellipse) body += emitEllipse(ln.ellipse, 'ELLIPSES');
                else body += emitPolyline(ln.points, !!ln.closed, 'LINES');
            }
        });

        (data.cadPoints || []).forEach(function (point) {
            if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
                body += emitPoint(point, 'POINTS');
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
    function expandBulges(points, bulges, closed) {
        if (!Array.isArray(points) || points.length < 2) return points || [];
        var out = [{ x: points[0].x, y: points[0].y }];
        var segmentCount = closed ? points.length : points.length - 1;
        for (var i = 0; i < segmentCount; i++) {
            var a = points[i], b = points[(i + 1) % points.length];
            var bulge = Number(bulges && bulges[i]) || 0;
            if (Math.abs(bulge) < 1e-10) {
                out.push({ x: b.x, y: b.y });
                continue;
            }
            var canvasBulge = -bulge;
            var theta = 4 * Math.atan(canvasBulge);
            var dx = b.x - a.x, dy = b.y - a.y;
            var chord = Math.hypot(dx, dy);
            if (chord < 1e-9 || Math.abs(Math.sin(theta / 2)) < 1e-9) {
                out.push({ x: b.x, y: b.y });
                continue;
            }
            var midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
            var offset = chord / (2 * Math.tan(theta / 2));
            var centerX = midX - dy / chord * offset;
            var centerY = midY + dx / chord * offset;
            var radius = Math.hypot(a.x - centerX, a.y - centerY);
            var start = Math.atan2(a.y - centerY, a.x - centerX);
            var steps = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 18)));
            for (var step = 1; step <= steps; step++) {
                var angle = start + theta * step / steps;
                out.push({
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                });
            }
        }
        if (closed && out.length > 1) {
            var last = out[out.length - 1];
            if (Math.hypot(last.x - out[0].x, last.y - out[0].y) < 1e-6) out.pop();
        }
        return out;
    }

    function parseDXF(text) {
        var result = {
            polylines: [], circles: [], arcs: [], ellipses: [], points: [], texts: [],
            diagnostics: { malformedPairs: 0, invalidEntities: 0, unsupportedEntities: [], warnings: [] }
        };
        if (!text || typeof text !== 'string') return result;
        var lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
        var pairs = [];
        for (var i = 0; i + 1 < lines.length;) {
            var code = parseInt(lines[i].trim(), 10);
            if (isNaN(code)) {
                result.diagnostics.malformedPairs++;
                i++;
                continue;
            }
            pairs.push({ code: code, value: lines[i + 1] });
            i += 2;
        }
        if (lines.length % 2) result.diagnostics.malformedPairs++;

        var entityPairs = null;
        for (var sectionIndex = 0; sectionIndex + 1 < pairs.length; sectionIndex++) {
            if (pairs[sectionIndex].code === 0 &&
                String(pairs[sectionIndex].value).trim().toUpperCase() === 'SECTION' &&
                pairs[sectionIndex + 1].code === 2 &&
                String(pairs[sectionIndex + 1].value).trim().toUpperCase() === 'ENTITIES') {
                var end = sectionIndex + 2;
                while (end < pairs.length && !(pairs[end].code === 0 &&
                    String(pairs[end].value).trim().toUpperCase() === 'ENDSEC')) end++;
                entityPairs = pairs.slice(sectionIndex + 2, end);
                break;
            }
        }
        if (!entityPairs) {
            entityPairs = pairs;
            result.diagnostics.warnings.push('ENTITIES_SECTION_MISSING');
        }

        var i2 = 0;
        function collectEntity(startType) {
            var ent = {
                type: startType, layer: '0', pts10: [], pts20: [], bulges: [],
                x1: null, y1: null, x2: null, y2: null, radius: null,
                startAngle: null, endAngle: null, ratio: null, startParam: null,
                endParam: null, closed: false, text: '', height: null
            };
            while (i2 < entityPairs.length && entityPairs[i2].code !== 0) {
                var p = entityPairs[i2];
                var val = p.value != null ? p.value.trim() : '';
                switch (p.code) {
                    case 1: ent.text += val; break;
                    case 3: ent.text += val; break;
                    case 8: ent.layer = val; break;
                    case 70: ent.closed = (parseInt(val, 10) & 1) === 1; break;
                    case 10:
                        if (startType === 'LINE') ent.x1 = parseFloat(val);
                        else if (['CIRCLE', 'ARC', 'ELLIPSE', 'POINT', 'TEXT', 'MTEXT'].indexOf(startType) >= 0) {
                            ent.cx = parseFloat(val);
                        } else {
                            ent.pts10.push(parseFloat(val));
                            if (startType === 'LWPOLYLINE' || startType === 'VERTEX') ent.bulges.push(0);
                        }
                        break;
                    case 20:
                        if (startType === 'LINE') ent.y1 = -parseFloat(val);
                        else if (['CIRCLE', 'ARC', 'ELLIPSE', 'POINT', 'TEXT', 'MTEXT'].indexOf(startType) >= 0) {
                            ent.cy = -parseFloat(val);
                        } else ent.pts20.push(-parseFloat(val));
                        break;
                    case 11: ent.x2 = parseFloat(val); break;
                    case 21: ent.y2 = -parseFloat(val); break;
                    case 40:
                        if (startType === 'ELLIPSE') ent.ratio = parseFloat(val);
                        else if (startType === 'TEXT' || startType === 'MTEXT') ent.height = parseFloat(val);
                        else ent.radius = parseFloat(val);
                        break;
                    case 41: ent.startParam = parseFloat(val); break;
                    case 42:
                        if (startType === 'LWPOLYLINE' || startType === 'VERTEX') {
                            if (ent.bulges.length) ent.bulges[ent.bulges.length - 1] = parseFloat(val);
                        }
                        else ent.endParam = parseFloat(val);
                        break;
                    case 50: ent.startAngle = parseFloat(val); break;
                    case 51: ent.endAngle = parseFloat(val); break;
                    default: break;
                }
                i2++;
            }
            return ent;
        }

        function finite() {
            return Array.prototype.every.call(arguments, Number.isFinite);
        }
        function pointsFrom(ent) {
            var points = [];
            for (var index = 0; index < ent.pts10.length && index < ent.pts20.length; index++) {
                if (finite(ent.pts10[index], ent.pts20[index])) {
                    points.push({ x: ent.pts10[index], y: ent.pts20[index] });
                }
            }
            return points;
        }
        function invalid() { result.diagnostics.invalidEntities++; }
        function unsupported(type) {
            if (result.diagnostics.unsupportedEntities.indexOf(type) < 0) {
                result.diagnostics.unsupportedEntities.push(type);
            }
        }

        var legacy = null;
        while (i2 < entityPairs.length) {
            var pair = entityPairs[i2];
            if (pair.code !== 0) { i2++; continue; }
            var type = String(pair.value || '').trim().toUpperCase();
            i2++;
            if (type === 'LINE') {
                var line = collectEntity(type);
                if (finite(line.x1, line.y1, line.x2, line.y2)) {
                    result.polylines.push({
                        layer: line.layer, closed: false,
                        points: [{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }]
                    });
                } else invalid();
            } else if (type === 'LWPOLYLINE') {
                var lw = collectEntity(type);
                var lwPoints = pointsFrom(lw);
                if (lwPoints.length >= 2) {
                    result.polylines.push({
                        layer: lw.layer,
                        closed: lw.closed,
                        points: expandBulges(lwPoints, lw.bulges, lw.closed)
                    });
                } else invalid();
            } else if (type === 'POLYLINE') {
                var header = collectEntity(type);
                legacy = { layer: header.layer, closed: header.closed, points: [], bulges: [] };
            } else if (type === 'VERTEX' && legacy) {
                var vertex = collectEntity(type);
                var vertexPoints = pointsFrom(vertex);
                if (vertexPoints[0]) {
                    legacy.points.push(vertexPoints[0]);
                    legacy.bulges.push(vertex.bulges[0] || 0);
                }
            } else if (type === 'SEQEND' && legacy) {
                collectEntity(type);
                if (legacy.points.length >= 2) {
                    legacy.points = expandBulges(legacy.points, legacy.bulges, legacy.closed);
                    result.polylines.push(legacy);
                } else invalid();
                legacy = null;
            } else if (type === 'CIRCLE') {
                var circle = collectEntity(type);
                if (finite(circle.cx, circle.cy, circle.radius) && circle.radius > 0) {
                    result.circles.push({
                        cx: circle.cx, cy: circle.cy, radius: circle.radius, layer: circle.layer
                    });
                } else invalid();
            } else if (type === 'ARC') {
                var arc = collectEntity(type);
                if (finite(arc.cx, arc.cy, arc.radius) && arc.radius > 0) {
                    result.arcs.push({
                        cx: arc.cx, cy: arc.cy, radius: arc.radius,
                        startAngle: -(arc.startAngle || 0) * Math.PI / 180,
                        endAngle: -(arc.endAngle || 0) * Math.PI / 180,
                        layer: arc.layer
                    });
                } else invalid();
            } else if (type === 'ELLIPSE') {
                var ellipse = collectEntity(type);
                var majorRadius = Math.hypot(ellipse.x2 || 0, ellipse.y2 || 0);
                if (finite(ellipse.cx, ellipse.cy, majorRadius, ellipse.ratio) &&
                    majorRadius > 0 && ellipse.ratio > 0) {
                    result.ellipses.push({
                        cx: ellipse.cx, cy: ellipse.cy,
                        rx: majorRadius, ry: majorRadius * ellipse.ratio,
                        rotation: Math.atan2(ellipse.y2, ellipse.x2),
                        startParam: ellipse.startParam, endParam: ellipse.endParam,
                        layer: ellipse.layer
                    });
                } else invalid();
            } else if (type === 'POINT') {
                var point = collectEntity(type);
                if (finite(point.cx, point.cy)) {
                    result.points.push({ x: point.cx, y: point.cy, layer: point.layer });
                } else invalid();
            } else if (type === 'TEXT' || type === 'MTEXT') {
                var textEntity = collectEntity(type);
                if (finite(textEntity.cx, textEntity.cy) && textEntity.text) {
                    result.texts.push({
                        x: textEntity.cx, y: textEntity.cy, text: textEntity.text,
                        height: textEntity.height, rotation: -(textEntity.startAngle || 0),
                        layer: textEntity.layer, multiline: type === 'MTEXT'
                    });
                } else invalid();
            } else {
                if (type && type !== 'ENDSEC' && type !== 'EOF') unsupported(type);
                collectEntity(type);
            }
            if (result.polylines.length + result.circles.length + result.arcs.length +
                result.ellipses.length + result.points.length + result.texts.length > 100000) {
                result.diagnostics.warnings.push('ENTITY_LIMIT_REACHED');
                break;
            }
        }
        if (legacy) invalid();
        return result;
    }

    return {
        exportDXF: exportDXF,
        parseDXF: parseDXF
    };
});
