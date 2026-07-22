(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.SvgIO = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function n(value) {
        var number = Number(value);
        return Number.isFinite(number) ? String(Math.round(number * 1000) / 1000) : '0';
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function exportSVG(data) {
        data = data || {};
        var body = [];
        var allPoints = [];
        function layerOf(obj, fallback) { return esc(obj.layerId || fallback || 'default'); }
        function pointList(points) {
            (points || []).forEach(function (p) { allPoints.push(p); });
            return (points || []).map(function (p) { return n(p.x) + ',' + n(p.y); }).join(' ');
        }
        (data.walls || []).forEach(function (wall) {
            if (!wall || !wall.points || wall.points.length < 2) return;
            body.push('<' + (wall.closed ? 'polygon' : 'polyline') +
                ' data-editor-kind="wall" data-layer="' + layerOf(wall, 'WALLS') +
                '" points="' + pointList(wall.points) +
                '" fill="none" stroke="#111827" stroke-width="' + n(wall.thickness || 4) + '"/>');
        });
        (data.lines || []).forEach(function (line) {
            if (!line || !line.points || line.points.length < 2) return;
            var tag = line.closed ? 'polygon' : 'polyline';
            body.push('<' + tag + ' data-editor-kind="line" data-layer="' + layerOf(line, 'LINES') +
                '" points="' + pointList(line.points) +
                '" fill="none" stroke="' + esc(line.color || '#3b82f6') +
                '" stroke-width="' + n(line.lineWeight || 2) + '"/>');
        });
        (data.rooms || []).forEach(function (room) {
            if (!room) return;
            var layer = layerOf(room, 'ROOMS');
            if (room.shape === 'circle' && room.radius > 0) {
                allPoints.push(
                    { x: room.cx - room.radius, y: room.cy - room.radius },
                    { x: room.cx + room.radius, y: room.cy + room.radius }
                );
                body.push('<circle data-editor-kind="room" data-layer="' + layer +
                    '" cx="' + n(room.cx) + '" cy="' + n(room.cy) + '" r="' + n(room.radius) + '"/>');
            } else if (room.shape === 'polygon' && room.points && room.points.length >= 3) {
                body.push('<polygon data-editor-kind="room" data-layer="' + layer +
                    '" points="' + pointList(room.points) + '"/>');
            } else if (room.width != null && room.height != null) {
                allPoints.push(
                    { x: room.x, y: room.y },
                    { x: Number(room.x) + Number(room.width), y: Number(room.y) + Number(room.height) }
                );
                body.push('<rect data-editor-kind="room" data-layer="' + layer +
                    '" x="' + n(room.x) + '" y="' + n(room.y) +
                    '" width="' + n(room.width) + '" height="' + n(room.height) + '"/>');
            }
        });
        (data.cadPoints || []).forEach(function (point) {
            if (!point) return;
            allPoints.push(point);
            body.push('<circle data-editor-kind="point" data-layer="' + layerOf(point, 'POINTS') +
                '" cx="' + n(point.x) + '" cy="' + n(point.y) + '" r="2"/>');
        });
        var minX = 0, minY = 0, maxX = 100, maxY = 100;
        if (allPoints.length) {
            minX = Math.min.apply(null, allPoints.map(function (p) { return Number(p.x) || 0; }));
            minY = Math.min.apply(null, allPoints.map(function (p) { return Number(p.y) || 0; }));
            maxX = Math.max.apply(null, allPoints.map(function (p) { return Number(p.x) || 0; }));
            maxY = Math.max.apply(null, allPoints.map(function (p) { return Number(p.y) || 0; }));
        }
        var width = Math.max(1, maxX - minX), height = Math.max(1, maxY - minY);
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
            [n(minX), n(minY), n(width), n(height)].join(' ') + '">\n' +
            body.map(function (item) { return '  ' + item; }).join('\n') + '\n</svg>\n';
    }

    function attributes(source) {
        var out = {};
        String(source || '').replace(/([:\w-]+)\s*=\s*(["'])(.*?)\2/g, function (_, key, quote, value) {
            out[key.toLowerCase()] = value;
            return _;
        });
        return out;
    }

    function parsePoints(value) {
        var numbers = String(value || '').trim().split(/[\s,]+/).map(Number);
        var out = [];
        for (var i = 0; i + 1 < numbers.length; i += 2) {
            if (Number.isFinite(numbers[i]) && Number.isFinite(numbers[i + 1])) {
                out.push({ x: numbers[i], y: numbers[i + 1] });
            }
        }
        return out;
    }

    function multiplyMatrix(left, right) {
        return [
            left[0] * right[0] + left[2] * right[1],
            left[1] * right[0] + left[3] * right[1],
            left[0] * right[2] + left[2] * right[3],
            left[1] * right[2] + left[3] * right[3],
            left[0] * right[4] + left[2] * right[5] + left[4],
            left[1] * right[4] + left[3] * right[5] + left[5]
        ];
    }

    function parseTransform(value) {
        var matrix = [1, 0, 0, 1, 0, 0];
        String(value || '').replace(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi,
            function (_, name, raw) {
                var values = raw.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
                var next = [1, 0, 0, 1, 0, 0];
                name = name.toLowerCase();
                if (name === 'matrix' && values.length >= 6) next = values.slice(0, 6);
                else if (name === 'translate') next = [1, 0, 0, 1, values[0] || 0, values[1] || 0];
                else if (name === 'scale') {
                    next = [values[0] == null ? 1 : values[0], 0, 0,
                        values[1] == null ? (values[0] == null ? 1 : values[0]) : values[1], 0, 0];
                } else if (name === 'rotate') {
                    var angle = (values[0] || 0) * Math.PI / 180;
                    var rotation = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
                    if (values.length >= 3) {
                        next = multiplyMatrix(
                            multiplyMatrix([1, 0, 0, 1, values[1], values[2]], rotation),
                            [1, 0, 0, 1, -values[1], -values[2]]
                        );
                    } else next = rotation;
                } else if (name === 'skewx') next[2] = Math.tan((values[0] || 0) * Math.PI / 180);
                else if (name === 'skewy') next[1] = Math.tan((values[0] || 0) * Math.PI / 180);
                matrix = multiplyMatrix(matrix, next);
                return _;
            });
        return matrix;
    }

    function transformPoint(point, matrix) {
        return {
            x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
            y: matrix[1] * point.x + matrix[3] * point.y + matrix[5]
        };
    }

    function parsePath(value, diagnostics) {
        var tokens = String(value || '').match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) || [];
        var index = 0, command = '', current = { x: 0, y: 0 }, start = null, paths = [], path = null;
        function number() { return Number(tokens[index++]); }
        function point(relative) {
            var x = number(), y = number();
            return relative ? { x: current.x + x, y: current.y + y } : { x: x, y: y };
        }
        function ensurePath() {
            if (!path) { path = []; paths.push({ points: path, closed: false }); }
        }
        function sampleCurve(target, control1, control2, quadratic) {
            ensurePath();
            var origin = { x: current.x, y: current.y };
            for (var step = 1; step <= 12; step++) {
                var t = step / 12, u = 1 - t;
                if (quadratic) {
                    path.push({
                        x: u * u * origin.x + 2 * u * t * control1.x + t * t * target.x,
                        y: u * u * origin.y + 2 * u * t * control1.y + t * t * target.y
                    });
                } else {
                    path.push({
                        x: u * u * u * origin.x + 3 * u * u * t * control1.x +
                            3 * u * t * t * control2.x + t * t * t * target.x,
                        y: u * u * u * origin.y + 3 * u * u * t * control1.y +
                            3 * u * t * t * control2.y + t * t * t * target.y
                    });
                }
            }
            current = target;
        }
        while (index < tokens.length) {
            if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
            if (!command) break;
            var lower = command.toLowerCase(), relative = command === lower;
            if (lower === 'm') {
                current = point(relative);
                path = [current]; paths.push({ points: path, closed: false });
                start = current;
                command = relative ? 'l' : 'L';
            } else if (lower === 'l') {
                current = point(relative); ensurePath(); path.push(current);
            } else if (lower === 'h') {
                var horizontal = number();
                current = { x: relative ? current.x + horizontal : horizontal, y: current.y };
                ensurePath(); path.push(current);
            } else if (lower === 'v') {
                var vertical = number();
                current = { x: current.x, y: relative ? current.y + vertical : vertical };
                ensurePath(); path.push(current);
            } else if (lower === 'c') {
                var c1 = point(relative), c2 = point(relative), cubicTarget = point(relative);
                sampleCurve(cubicTarget, c1, c2, false);
            } else if (lower === 'q') {
                var control = point(relative), quadraticTarget = point(relative);
                sampleCurve(quadraticTarget, control, null, true);
            } else if (lower === 'a') {
                index += 5;
                current = point(relative); ensurePath(); path.push(current);
                if (diagnostics.unsupportedCommands.indexOf('A') < 0) diagnostics.unsupportedCommands.push('A');
            } else if (lower === 'z') {
                if (path && start) paths[paths.length - 1].closed = true;
                current = start || current; path = null; start = null; command = '';
            } else {
                if (diagnostics.unsupportedCommands.indexOf(command.toUpperCase()) < 0) {
                    diagnostics.unsupportedCommands.push(command.toUpperCase());
                }
                break;
            }
        }
        return paths.filter(function (item) { return item.points.length >= 2; });
    }

    function parseSVG(text) {
        var result = {
            polylines: [], circles: [], ellipses: [], points: [],
            diagnostics: { invalidElements: 0, unsupportedCommands: [], warnings: [] }
        };
        if (typeof text !== 'string' || !text.trim()) return result;
        var stack = [[1, 0, 0, 1, 0, 0]];
        String(text).replace(/<\s*(\/?)\s*(svg|g|line|polyline|polygon|rect|circle|ellipse|path)\b([^>]*)>/gi,
            function (_, closing, rawTag, rawAttrs) {
                var tag = rawTag.toLowerCase();
                if (closing) {
                    if ((tag === 'g' || tag === 'svg') && stack.length > 1) stack.pop();
                    return _;
                }
                var a = attributes(rawAttrs);
                var parentMatrix = stack[stack.length - 1];
                var matrix = multiplyMatrix(parentMatrix, parseTransform(a.transform));
                var selfClosing = /\/\s*$/.test(rawAttrs);
                if (tag === 'g' || tag === 'svg') {
                    if (!selfClosing) stack.push(matrix);
                    return _;
                }
                var kind = a['data-editor-kind'] || '';
                var layer = a['data-layer'] || 'default';
                if (tag === 'line') {
                    var linePoints = [
                        transformPoint({ x: Number(a.x1) || 0, y: Number(a.y1) || 0 }, matrix),
                        transformPoint({ x: Number(a.x2) || 0, y: Number(a.y2) || 0 }, matrix)
                    ];
                    result.polylines.push({
                        kind: kind || 'line', layer: layer, closed: false,
                        points: linePoints
                    });
                } else if (tag === 'polyline' || tag === 'polygon') {
                    var points = parsePoints(a.points).map(function (point) {
                        return transformPoint(point, matrix);
                    });
                    if (points.length >= 2) {
                        result.polylines.push({
                            kind: kind || 'line', layer: layer,
                            closed: tag === 'polygon', points: points
                        });
                    }
                } else if (tag === 'rect') {
                    var x = Number(a.x) || 0, y = Number(a.y) || 0;
                    var w = Number(a.width) || 0, h = Number(a.height) || 0;
                    if (w > 0 && h > 0) {
                        result.polylines.push({
                            kind: kind || 'room', layer: layer, closed: true,
                            points: [
                                { x: x, y: y }, { x: x + w, y: y },
                                { x: x + w, y: y + h }, { x: x, y: y + h }
                            ].map(function (point) { return transformPoint(point, matrix); })
                        });
                    } else result.diagnostics.invalidElements++;
                } else if (tag === 'circle') {
                    var center = transformPoint({ x: Number(a.cx) || 0, y: Number(a.cy) || 0 }, matrix);
                    var radius = Number(a.r) || 0;
                    var scaleX = Math.hypot(matrix[0], matrix[1]);
                    var scaleY = Math.hypot(matrix[2], matrix[3]);
                    var circle = {
                        cx: center.x, cy: center.y,
                        radius: radius * scaleX, kind: kind, layer: layer
                    };
                    if (circle.radius > 0) {
                        if (kind === 'point') result.points.push({ x: circle.cx, y: circle.cy, layer: layer });
                        else if (Math.abs(scaleX - scaleY) < 1e-9) result.circles.push(circle);
                        else result.ellipses.push({
                            cx: center.x, cy: center.y, rx: radius * scaleX, ry: radius * scaleY,
                            rotation: Math.atan2(matrix[1], matrix[0]), kind: kind, layer: layer
                        });
                    } else result.diagnostics.invalidElements++;
                } else if (tag === 'ellipse') {
                    var ellipseCenter = transformPoint({
                        x: Number(a.cx) || 0, y: Number(a.cy) || 0
                    }, matrix);
                    var ellipse = {
                        cx: ellipseCenter.x, cy: ellipseCenter.y,
                        rx: (Number(a.rx) || 0) * Math.hypot(matrix[0], matrix[1]),
                        ry: (Number(a.ry) || 0) * Math.hypot(matrix[2], matrix[3]),
                        rotation: Math.atan2(matrix[1], matrix[0]), kind: kind, layer: layer
                    };
                    if (ellipse.rx > 0 && ellipse.ry > 0) result.ellipses.push(ellipse);
                    else result.diagnostics.invalidElements++;
                } else if (tag === 'path') {
                    var parsedPaths = parsePath(a.d, result.diagnostics);
                    parsedPaths.forEach(function (parsed) {
                        result.polylines.push({
                            kind: kind || 'line', layer: layer, closed: parsed.closed,
                            points: parsed.points.map(function (point) {
                                return transformPoint(point, matrix);
                            })
                        });
                    });
                }
                return _;
            });
        return result;
    }

    return {
        exportSVG: exportSVG,
        parseSVG: parseSVG,
        parseTransform: parseTransform,
        parsePath: parsePath
    };
});
