// ============================================================
// OBJECT-TRANSFORM.JS — Phase 2: translate / rotate / scale / mirror / clone
// Làm việc với object legacy: room, wall, line, door, poi, qr, node
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.ObjectTransform = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function cloneJson(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function translatePoint(p, dx, dy) {
        return { x: p.x + dx, y: p.y + dy };
    }

    function rotatePoint(p, cx, cy, angleRad) {
        var cos = Math.cos(angleRad), sin = Math.sin(angleRad);
        var dx = p.x - cx, dy = p.y - cy;
        return {
            x: cx + dx * cos - dy * sin,
            y: cy + dx * sin + dy * cos
        };
    }

    function scalePoint(p, cx, cy, factor) {
        return {
            x: cx + (p.x - cx) * factor,
            y: cy + (p.y - cy) * factor
        };
    }

    /** Lật điểm qua đường thẳng AB */
    function mirrorPoint(p, a, b) {
        var vx = b.x - a.x, vy = b.y - a.y;
        var len2 = vx * vx + vy * vy;
        if (len2 < 1e-10) return { x: 2 * a.x - p.x, y: 2 * a.y - p.y };
        var t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
        var projX = a.x + t * vx, projY = a.y + t * vy;
        return { x: 2 * projX - p.x, y: 2 * projY - p.y };
    }

    function updatePolygonBBox(room) {
        var pts = room.points;
        if (!pts || !pts.length) return;
        var minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
        for (var i = 1; i < pts.length; i++) {
            if (pts[i].x < minX) minX = pts[i].x;
            if (pts[i].x > maxX) maxX = pts[i].x;
            if (pts[i].y < minY) minY = pts[i].y;
            if (pts[i].y > maxY) maxY = pts[i].y;
        }
        room.x = minX;
        room.y = minY;
        room.width = maxX - minX;
        room.height = maxY - minY;
    }

    function mapPoints(obj, fn) {
        if (obj.points && obj.points.length) {
            obj.points = obj.points.map(fn);
        }
        if (obj.vertices && obj.vertices.length) {
            obj.vertices = obj.vertices.map(fn);
        }
    }

    function translateObject(type, data, dx, dy) {
        if (!data) return data;
        if (type === 'room') {
            if (data.shape === 'circle') {
                data.cx += dx;
                data.cy += dy;
                data.x = data.cx - data.radius;
                data.y = data.cy - data.radius;
            } else if (data.shape === 'polygon' && data.points) {
                mapPoints(data, function (p) { return translatePoint(p, dx, dy); });
                updatePolygonBBox(data);
            } else {
                data.x += dx;
                data.y += dy;
            }
            return data;
        }
        if (type === 'wall' || type === 'line') {
            mapPoints(data, function (p) { return translatePoint(p, dx, dy); });
            if (data.arc) {
                data.arc.cx += dx;
                data.arc.cy += dy;
            }
            if (data.ellipse) {
                data.ellipse.cx += dx;
                data.ellipse.cy += dy;
            }
            return data;
        }
        if (data.x != null) data.x += dx;
        if (data.y != null) data.y += dy;
        return data;
    }

    function rotateObject(type, data, cx, cy, angleRad) {
        if (!data) return data;
        if (type === 'room') {
            if (data.shape === 'circle') {
                var c = rotatePoint({ x: data.cx, y: data.cy }, cx, cy, angleRad);
                data.cx = c.x;
                data.cy = c.y;
                data.x = data.cx - data.radius;
                data.y = data.cy - data.radius;
            } else if (data.shape === 'polygon' && data.points) {
                mapPoints(data, function (p) { return rotatePoint(p, cx, cy, angleRad); });
                updatePolygonBBox(data);
            } else {
                var corners = [
                    { x: data.x, y: data.y },
                    { x: data.x + data.width, y: data.y },
                    { x: data.x + data.width, y: data.y + data.height },
                    { x: data.x, y: data.y + data.height }
                ].map(function (p) { return rotatePoint(p, cx, cy, angleRad); });
                data.points = corners;
                data.shape = 'polygon';
                updatePolygonBBox(data);
            }
            return data;
        }
        if (type === 'wall' || type === 'line') {
            mapPoints(data, function (p) { return rotatePoint(p, cx, cy, angleRad); });
            if (data.arc) {
                var arcCenter = rotatePoint({ x: data.arc.cx, y: data.arc.cy }, cx, cy, angleRad);
                data.arc.cx = arcCenter.x;
                data.arc.cy = arcCenter.y;
            }
            if (data.ellipse) {
                var ellipseCenter = rotatePoint(
                    { x: data.ellipse.cx, y: data.ellipse.cy }, cx, cy, angleRad
                );
                data.ellipse.cx = ellipseCenter.x;
                data.ellipse.cy = ellipseCenter.y;
                data.ellipse.rotation = (data.ellipse.rotation || 0) + angleRad;
            }
            return data;
        }
        if (data.x != null && data.y != null) {
            var r = rotatePoint({ x: data.x, y: data.y }, cx, cy, angleRad);
            data.x = r.x;
            data.y = r.y;
        }
        if (type === 'door' && data.rotation != null) {
            data.rotation = (data.rotation || 0) + angleRad * 180 / Math.PI;
        }
        return data;
    }

    function scaleObject(type, data, cx, cy, factor) {
        if (!data || !(factor > 0)) return data;
        if (type === 'room') {
            if (data.shape === 'circle') {
                var c = scalePoint({ x: data.cx, y: data.cy }, cx, cy, factor);
                data.cx = c.x;
                data.cy = c.y;
                data.radius *= factor;
                data.x = data.cx - data.radius;
                data.y = data.cy - data.radius;
                data.width = data.radius * 2;
                data.height = data.radius * 2;
            } else if (data.shape === 'polygon' && data.points) {
                mapPoints(data, function (p) { return scalePoint(p, cx, cy, factor); });
                updatePolygonBBox(data);
            } else {
                var tl = scalePoint({ x: data.x, y: data.y }, cx, cy, factor);
                data.x = tl.x;
                data.y = tl.y;
                data.width *= factor;
                data.height *= factor;
            }
            return data;
        }
        if (type === 'wall' || type === 'line') {
            mapPoints(data, function (p) { return scalePoint(p, cx, cy, factor); });
            if (data.thickness) data.thickness *= factor;
            if (data.arc) {
                var arcCenter = scalePoint({ x: data.arc.cx, y: data.arc.cy }, cx, cy, factor);
                data.arc.cx = arcCenter.x;
                data.arc.cy = arcCenter.y;
                data.arc.radius *= factor;
            }
            if (data.ellipse) {
                var ellipseCenter = scalePoint(
                    { x: data.ellipse.cx, y: data.ellipse.cy }, cx, cy, factor
                );
                data.ellipse.cx = ellipseCenter.x;
                data.ellipse.cy = ellipseCenter.y;
                data.ellipse.rx *= factor;
                data.ellipse.ry *= factor;
            }
            return data;
        }
        if (data.x != null && data.y != null) {
            var s = scalePoint({ x: data.x, y: data.y }, cx, cy, factor);
            data.x = s.x;
            data.y = s.y;
        }
        return data;
    }

    function mirrorObject(type, data, a, b) {
        if (!data || !a || !b) return data;
        if (type === 'room') {
            if (data.shape === 'circle') {
                var c = mirrorPoint({ x: data.cx, y: data.cy }, a, b);
                data.cx = c.x;
                data.cy = c.y;
                data.x = data.cx - data.radius;
                data.y = data.cy - data.radius;
            } else if (data.shape === 'polygon' && data.points) {
                mapPoints(data, function (p) { return mirrorPoint(p, a, b); });
                updatePolygonBBox(data);
            } else {
                var p1 = mirrorPoint({ x: data.x, y: data.y }, a, b);
                var p2 = mirrorPoint({ x: data.x + data.width, y: data.y + data.height }, a, b);
                data.x = Math.min(p1.x, p2.x);
                data.y = Math.min(p1.y, p2.y);
                data.width = Math.abs(p2.x - p1.x);
                data.height = Math.abs(p2.y - p1.y);
            }
            return data;
        }
        if (type === 'wall' || type === 'line') {
            mapPoints(data, function (p) { return mirrorPoint(p, a, b); });
            if (data.arc) {
                var arcCenter = mirrorPoint({ x: data.arc.cx, y: data.arc.cy }, a, b);
                data.arc.cx = arcCenter.x;
                data.arc.cy = arcCenter.y;
            }
            if (data.ellipse) {
                var oldCenter = { x: data.ellipse.cx, y: data.ellipse.cy };
                var oldRotation = data.ellipse.rotation || 0;
                var oldMajor = {
                    x: oldCenter.x + data.ellipse.rx * Math.cos(oldRotation),
                    y: oldCenter.y + data.ellipse.rx * Math.sin(oldRotation)
                };
                var mirroredCenter = mirrorPoint(oldCenter, a, b);
                var mirroredMajor = mirrorPoint(oldMajor, a, b);
                data.ellipse.cx = mirroredCenter.x;
                data.ellipse.cy = mirroredCenter.y;
                data.ellipse.rotation = Math.atan2(
                    mirroredMajor.y - mirroredCenter.y,
                    mirroredMajor.x - mirroredCenter.x
                );
            }
            return data;
        }
        if (data.x != null && data.y != null) {
            var m = mirrorPoint({ x: data.x, y: data.y }, a, b);
            data.x = m.x;
            data.y = m.y;
        }
        return data;
    }

    /**
     * Clone object + gán id mới (không push vào mảng).
     * @param {function} nextIdFn — (type) => number
     */
    function cloneObject(type, data, nextIdFn) {
        var copy = cloneJson(data);
        if (typeof nextIdFn === 'function') {
            copy.id = nextIdFn(type);
        } else if (copy.id != null) {
            copy.id = copy.id + '_copy_' + Date.now();
        }
        if (type === 'room' && copy.name) {
            copy.name = copy.name + ' (copy)';
        }
        // Bản sao: nguyên bản = hình học lúc clone (không kế thừa snapshot nguồn)
        delete copy._originalGeometry;
        ensureOriginalGeometry(type, copy);
        return copy;
    }

    /** Snapshot hình học để «Về nguyên bản» — không gồm tên/màu/layer. */
    function snapshotGeometry(type, data) {
        var snap = {};
        if (type === 'room') {
            snap.shape = data.shape;
            if (data.shape === 'circle') {
                snap.cx = data.cx;
                snap.cy = data.cy;
                snap.radius = data.radius;
                snap.x = data.x;
                snap.y = data.y;
                snap.width = data.width;
                snap.height = data.height;
            } else if (data.shape === 'polygon' && data.points) {
                snap.points = cloneJson(data.points);
                snap.x = data.x;
                snap.y = data.y;
                snap.width = data.width;
                snap.height = data.height;
            } else {
                snap.x = data.x;
                snap.y = data.y;
                snap.width = data.width;
                snap.height = data.height;
            }
            if (typeof data.rotationDeg === 'number') snap.rotationDeg = data.rotationDeg;
            return snap;
        }
        if (type === 'wall' || type === 'line') {
            snap.points = cloneJson(data.points || []);
            if (data.arc) snap.arc = cloneJson(data.arc);
            if (data.ellipse) snap.ellipse = cloneJson(data.ellipse);
            return snap;
        }
        if (data.x != null) snap.x = data.x;
        if (data.y != null) snap.y = data.y;
        if (data.width != null) snap.width = data.width;
        if (data.rotation != null) snap.rotation = data.rotation;
        return snap;
    }

    /** Ghi nguyên bản lần đầu (lúc tạo). Không ghi đè nếu đã có. */
    function ensureOriginalGeometry(type, data) {
        if (!data || data._originalGeometry) return data;
        data._originalGeometry = snapshotGeometry(type, data);
        return data;
    }

    /** Khôi phục hình học từ snapshot lúc tạo. */
    function restoreOriginalGeometry(type, data) {
        if (!data || !data._originalGeometry) return false;
        var s = data._originalGeometry;
        if (type === 'room') {
            if (data.shape === 'circle' || s.shape === 'circle') {
                data.cx = s.cx;
                data.cy = s.cy;
                data.radius = s.radius;
                data.x = s.x;
                data.y = s.y;
                data.width = s.width;
                data.height = s.height;
            } else if ((data.shape === 'polygon' || s.shape === 'polygon') && s.points) {
                data.points = cloneJson(s.points);
                data.x = s.x;
                data.y = s.y;
                data.width = s.width;
                data.height = s.height;
            } else {
                data.x = s.x;
                data.y = s.y;
                data.width = s.width;
                data.height = s.height;
            }
            if (typeof s.rotationDeg === 'number') data.rotationDeg = s.rotationDeg;
            else delete data.rotationDeg;
        } else if (type === 'wall' || type === 'line') {
            data.points = cloneJson(s.points || []);
            if (s.arc) data.arc = cloneJson(s.arc);
            if (s.ellipse) data.ellipse = cloneJson(s.ellipse);
        } else {
            if (s.x != null) data.x = s.x;
            if (s.y != null) data.y = s.y;
            if (s.width != null) data.width = s.width;
            if (s.rotation != null) data.rotation = s.rotation;
        }
        data.lastScaleRatio = '1:1';
        return true;
    }

    function getObjectCentroid(type, data) {
        if (!data) return { x: 0, y: 0 };
        if (type === 'room') {
            if (data.shape === 'circle') return { x: data.cx, y: data.cy };
            if (data.shape === 'polygon' && data.points && data.points.length) {
                var sx = 0, sy = 0;
                data.points.forEach(function (p) { sx += p.x; sy += p.y; });
                return { x: sx / data.points.length, y: sy / data.points.length };
            }
            return { x: data.x + data.width / 2, y: data.y + data.height / 2 };
        }
        if ((type === 'wall' || type === 'line') && data.points && data.points.length) {
            var s2x = 0, s2y = 0;
            data.points.forEach(function (p) { s2x += p.x; s2y += p.y; });
            return { x: s2x / data.points.length, y: s2y / data.points.length };
        }
        return { x: data.x || 0, y: data.y || 0 };
    }

    return {
        translatePoint: translatePoint,
        rotatePoint: rotatePoint,
        scalePoint: scalePoint,
        mirrorPoint: mirrorPoint,
        translateObject: translateObject,
        rotateObject: rotateObject,
        scaleObject: scaleObject,
        mirrorObject: mirrorObject,
        cloneObject: cloneObject,
        getObjectCentroid: getObjectCentroid,
        updatePolygonBBox: updatePolygonBBox,
        cloneJson: cloneJson,
        snapshotGeometry: snapshotGeometry,
        ensureOriginalGeometry: ensureOriginalGeometry,
        restoreOriginalGeometry: restoreOriginalGeometry,
        /** Lật ngang qua trục dọc đi qua tâm */
        flipHorizontal: function (type, data) {
            var c = getObjectCentroid(type, data);
            return mirrorObject(type, data, { x: c.x, y: c.y - 10 }, { x: c.x, y: c.y + 10 });
        },
        /** Lật dọc qua trục ngang đi qua tâm */
        flipVertical: function (type, data) {
            var c = getObjectCentroid(type, data);
            return mirrorObject(type, data, { x: c.x - 10, y: c.y }, { x: c.x + 10, y: c.y });
        },
        /** Xoay quanh tâm object theo độ */
        rotateByDegrees: function (type, data, deg) {
            var c = getObjectCentroid(type, data);
            return rotateObject(type, data, c.x, c.y, (Number(deg) || 0) * Math.PI / 180);
        },
        /** Scale quanh tâm */
        scaleAboutCenter: function (type, data, factor) {
            var c = getObjectCentroid(type, data);
            return scaleObject(type, data, c.x, c.y, factor);
        }
    };
});
