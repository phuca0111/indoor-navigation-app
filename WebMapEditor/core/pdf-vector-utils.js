(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PdfVectorUtils = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function extractPolylines(opList, viewport, OPS, Util, options) {
        options = options || {};
        var diagnostics = options.diagnostics || {
            invalidOperators: 0, restoreUnderflow: 0, unbalancedSave: 0,
            truncated: false, warnings: []
        };
        var polylines = [];
        if (!opList || !Array.isArray(opList.fnArray) || !Array.isArray(opList.argsArray) ||
            !viewport || !Array.isArray(viewport.transform) || !Util) {
            diagnostics.warnings.push('INVALID_OPERATOR_LIST');
            return polylines;
        }
        var ctm = viewport.transform.slice();
        var stack = [];
        var curveSteps = Math.max(2, Math.min(64, Math.round(Number(options.curveSteps) || 8)));
        var maxPolylines = Math.max(1, Math.min(100000, Math.round(Number(options.maxPolylines) || 50000)));
        function dev(x, y) {
            var p = Util.applyTransform([x, y], ctm);
            return { x: p[0], y: p[1] };
        }
        function bezier(p0, c1, c2, p1, out, steps) {
            for (var s = 1; s <= steps; s++) {
                var t = s / steps, mt = 1 - t;
                out.push({
                    x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x +
                        3 * mt * t * t * c2.x + t * t * t * p1.x,
                    y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y +
                        3 * mt * t * t * c2.y + t * t * t * p1.y
                });
            }
        }
        for (var i = 0; i < opList.fnArray.length; i++) {
            var fn = opList.fnArray[i], args = opList.argsArray[i];
            if (fn === OPS.save) stack.push(ctm.slice());
            else if (fn === OPS.restore) {
                if (stack.length) ctm = stack.pop();
                else diagnostics.restoreUnderflow++;
            }
            else if (fn === OPS.transform) {
                if (args && args.length >= 6 && Array.prototype.slice.call(args, 0, 6).every(Number.isFinite)) {
                    ctm = Util.transform(ctm, args);
                } else diagnostics.invalidOperators++;
            }
            else if (fn === OPS.constructPath) {
                if (!args || !args[0] || typeof args[0].length !== 'number' ||
                    !args[1] || typeof args[1].length !== 'number') {
                    diagnostics.invalidOperators++;
                    continue;
                }
                var ops = args[0], coords = args[1], ci = 0, cur = null, sub = null;
                function flush() {
                    if (sub && sub.length >= 2 && polylines.length < maxPolylines) {
                        var clean = sub.filter(function (point, index) {
                            return !index || Math.hypot(
                                point.x - sub[index - 1].x,
                                point.y - sub[index - 1].y
                            ) > 1e-9;
                        });
                        if (clean.length >= 2) polylines.push(clean);
                    } else if (polylines.length >= maxPolylines) diagnostics.truncated = true;
                    sub = null;
                }
                for (var k = 0; k < ops.length; k++) {
                    var op = ops[k];
                    if (op === OPS.moveTo) {
                        flush();
                        cur = { x: coords[ci++], y: coords[ci++] };
                        sub = [dev(cur.x, cur.y)];
                    } else if (op === OPS.lineTo) {
                        var lx = coords[ci++], ly = coords[ci++];
                        if (!sub) sub = [dev(cur ? cur.x : lx, cur ? cur.y : ly)];
                        cur = { x: lx, y: ly };
                        sub.push(dev(lx, ly));
                    } else if (op === OPS.curveTo) {
                        var c1 = dev(coords[ci++], coords[ci++]);
                        var c2 = dev(coords[ci++], coords[ci++]);
                        var end = { x: coords[ci++], y: coords[ci++] };
                        if (!sub) sub = [dev(cur ? cur.x : end.x, cur ? cur.y : end.y)];
                        bezier(sub[sub.length - 1], c1, c2, dev(end.x, end.y), sub, curveSteps);
                        cur = end;
                    } else if (op === OPS.curveTo2) {
                        var v2 = dev(coords[ci++], coords[ci++]);
                        var end2 = { x: coords[ci++], y: coords[ci++] };
                        if (!sub) sub = [dev(cur ? cur.x : end2.x, cur ? cur.y : end2.y)];
                        bezier(sub[sub.length - 1], sub[sub.length - 1], v2,
                            dev(end2.x, end2.y), sub, curveSteps);
                        cur = end2;
                    } else if (op === OPS.curveTo3) {
                        var y1 = dev(coords[ci++], coords[ci++]);
                        var end3 = { x: coords[ci++], y: coords[ci++] };
                        var endDev = dev(end3.x, end3.y);
                        if (!sub) sub = [dev(cur ? cur.x : end3.x, cur ? cur.y : end3.y)];
                        bezier(sub[sub.length - 1], y1, endDev, endDev, sub, curveSteps);
                        cur = end3;
                    } else if (op === OPS.rectangle) {
                        var x = coords[ci++], y = coords[ci++], w = coords[ci++], h = coords[ci++];
                        polylines.push([
                            dev(x, y), dev(x + w, y), dev(x + w, y + h),
                            dev(x, y + h), dev(x, y)
                        ]);
                    } else if (op === OPS.closePath && sub && sub.length >= 2) {
                        sub.push({ x: sub[0].x, y: sub[0].y });
                    } else diagnostics.invalidOperators++;
                }
                flush();
            }
            if (diagnostics.truncated) break;
        }
        diagnostics.unbalancedSave = stack.length;
        return polylines;
    }

    function extractPolylinesDetailed(opList, viewport, OPS, Util, options) {
        var diagnostics = {
            invalidOperators: 0, restoreUnderflow: 0, unbalancedSave: 0,
            truncated: false, warnings: []
        };
        options = Object.assign({}, options, { diagnostics: diagnostics });
        var polylines = extractPolylines(opList, viewport, OPS, Util, options);
        return { polylines: polylines, diagnostics: diagnostics, bbox: polyBBox(polylines) };
    }

    function analyzeOperatorList(opList, OPS) {
        var functions = opList && Array.isArray(opList.fnArray) ? opList.fnArray : [];
        var counts = { paths: 0, images: 0, text: 0, save: 0, restore: 0, transforms: 0 };
        var imageOps = [
            OPS.paintImageXObject, OPS.paintInlineImageXObject,
            OPS.paintImageMaskXObject, OPS.paintSolidColorImageMask
        ];
        functions.forEach(function (fn) {
            if (fn === OPS.constructPath) counts.paths++;
            if (imageOps.indexOf(fn) >= 0) counts.images++;
            if (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText) counts.text++;
            if (fn === OPS.save) counts.save++;
            if (fn === OPS.restore) counts.restore++;
            if (fn === OPS.transform) counts.transforms++;
        });
        return counts;
    }

    function polyBBox(polylines) {
        if (!Array.isArray(polylines) || !polylines.length) return null;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        polylines.forEach(function (line) {
            (line || []).forEach(function (p) {
                if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
                minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
            });
        });
        if (!Number.isFinite(minX)) return null;
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
    }

    function classifyPage(opList, OPS) {
        var functions = opList && Array.isArray(opList.fnArray) ? opList.fnArray : [];
        var imageOps = [
            OPS.paintImageXObject,
            OPS.paintInlineImageXObject,
            OPS.paintImageMaskXObject,
            OPS.paintSolidColorImageMask
        ].filter(function (value) { return value != null; });
        var hasImage = functions.some(function (fn) { return imageOps.indexOf(fn) >= 0; });
        var hasVector = functions.some(function (fn) { return fn === OPS.constructPath; });
        return {
            hasImage: hasImage,
            hasVector: hasVector,
            mode: hasImage ? (hasVector ? 'mixed' : 'raster') : (hasVector ? 'vector' : 'empty')
        };
    }

    return {
        extractPolylines: extractPolylines,
        extractPolylinesDetailed: extractPolylinesDetailed,
        analyzeOperatorList: analyzeOperatorList,
        polyBBox: polyBBox,
        classifyPage: classifyPage
    };
});
