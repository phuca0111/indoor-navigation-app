// ============================================================
// BLOCK-MANAGER.JS — Phase 2: định nghĩa Block + instance Insert
// Entities trong definition: toạ độ relative tới điểm gốc (basePoint lúc tạo).
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.BlockManager = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function cloneJson(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function entityBBox(type, data) {
        if (!data) return null;
        if (type === 'room') {
            if (data.shape === 'circle') {
                return {
                    minX: data.cx - data.radius,
                    minY: data.cy - data.radius,
                    maxX: data.cx + data.radius,
                    maxY: data.cy + data.radius
                };
            }
            if (data.shape === 'polygon' && data.points && data.points.length) {
                var minX = data.points[0].x, maxX = data.points[0].x;
                var minY = data.points[0].y, maxY = data.points[0].y;
                data.points.forEach(function (p) {
                    if (p.x < minX) minX = p.x;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                });
                return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
            }
            return {
                minX: data.x,
                minY: data.y,
                maxX: data.x + data.width,
                maxY: data.y + data.height
            };
        }
        if ((type === 'wall' || type === 'line') && data.points && data.points.length) {
            var wMinX = data.points[0].x, wMaxX = data.points[0].x;
            var wMinY = data.points[0].y, wMaxY = data.points[0].y;
            data.points.forEach(function (p) {
                if (p.x < wMinX) wMinX = p.x;
                if (p.x > wMaxX) wMaxX = p.x;
                if (p.y < wMinY) wMinY = p.y;
                if (p.y > wMaxY) wMaxY = p.y;
            });
            return { minX: wMinX, minY: wMinY, maxX: wMaxX, maxY: wMaxY };
        }
        if (data.x != null && data.y != null) {
            var pad = (data.width != null ? data.width / 2 : 12);
            return {
                minX: data.x - pad,
                minY: data.y - pad,
                maxX: data.x + pad,
                maxY: data.y + pad
            };
        }
        return null;
    }

    function unionBBox(a, b) {
        if (!a) return b;
        if (!b) return a;
        return {
            minX: Math.min(a.minX, b.minX),
            minY: Math.min(a.minY, b.minY),
            maxX: Math.max(a.maxX, b.maxX),
            maxY: Math.max(a.maxY, b.maxY)
        };
    }

    function selectionBBox(items) {
        var box = null;
        (items || []).forEach(function (it) {
            box = unionBBox(box, entityBBox(it.type, it.data));
        });
        return box;
    }

    function translateEntityInPlace(type, data, dx, dy) {
        if (!data) return;
        if (type === 'room') {
            if (data.shape === 'circle') {
                data.cx += dx;
                data.cy += dy;
                data.x = data.cx - data.radius;
                data.y = data.cy - data.radius;
            } else if (data.shape === 'polygon' && data.points) {
                data.points.forEach(function (p) {
                    p.x += dx;
                    p.y += dy;
                });
                data.x += dx;
                data.y += dy;
            } else {
                data.x += dx;
                data.y += dy;
            }
            return;
        }
        if ((type === 'wall' || type === 'line') && data.points) {
            data.points.forEach(function (p) {
                p.x += dx;
                p.y += dy;
            });
            return;
        }
        if (data.x != null) data.x += dx;
        if (data.y != null) data.y += dy;
    }

    function toRelativeEntity(type, data, baseX, baseY) {
        var copy = cloneJson(data);
        delete copy.id;
        delete copy._originalGeometry;
        delete copy.lastScaleRatio;
        translateEntityInPlace(type, copy, -baseX, -baseY);
        return { type: type, data: copy };
    }

    /**
     * Tạo định nghĩa block từ danh sách {type, data} (world coords).
     * basePoint mặc định = góc dưới-trái bbox.
     */
    function createDefinition(name, items, opts) {
        opts = opts || {};
        items = (items || []).filter(function (it) {
            return it && it.type && it.data && ['room', 'wall', 'line', 'door', 'poi'].indexOf(it.type) >= 0;
        });
        if (!items.length) return null;
        var box = selectionBBox(items);
        if (!box) return null;
        var baseX = opts.baseX != null ? opts.baseX : box.minX;
        var baseY = opts.baseY != null ? opts.baseY : box.minY;
        var id = opts.id || ('blk_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
        return {
            id: id,
            name: String(name || 'Block').trim() || 'Block',
            basePoint: { x: 0, y: 0 },
            entities: items.map(function (it) {
                return toRelativeEntity(it.type, it.data, baseX, baseY);
            }),
            createdAt: Date.now()
        };
    }

    function createInsert(blockId, x, y, opts) {
        opts = opts || {};
        return {
            id: opts.id != null ? opts.id : Date.now(),
            blockId: blockId,
            name: opts.name || 'Insert',
            x: x,
            y: y,
            rotation: opts.rotation || 0,
            scale: opts.scale != null ? opts.scale : 1,
            layerId: opts.layerId || 'default'
        };
    }

    function localToWorld(lx, ly, insert) {
        var s = insert.scale != null ? insert.scale : 1;
        var rad = (insert.rotation || 0) * Math.PI / 180;
        var cos = Math.cos(rad);
        var sin = Math.sin(rad);
        var x = lx * s;
        var y = ly * s;
        return {
            x: insert.x + x * cos - y * sin,
            y: insert.y + x * sin + y * cos
        };
    }

    function worldEntityFromLocal(type, localData, insert) {
        var data = cloneJson(localData);
        var s = insert.scale != null ? insert.scale : 1;
        var rad = (insert.rotation || 0) * Math.PI / 180;
        var cos = Math.cos(rad);
        var sin = Math.sin(rad);

        function mapPoint(p) {
            var x = p.x * s;
            var y = p.y * s;
            return {
                x: insert.x + x * cos - y * sin,
                y: insert.y + x * sin + y * cos
            };
        }

        if (type === 'room') {
            if (data.shape === 'circle') {
                var c = mapPoint({ x: data.cx, y: data.cy });
                data.radius = data.radius * s;
                data.cx = c.x;
                data.cy = c.y;
                data.x = data.cx - data.radius;
                data.y = data.cy - data.radius;
                data.width = data.radius * 2;
                data.height = data.radius * 2;
            } else if (data.shape === 'polygon' && data.points) {
                data.points = data.points.map(mapPoint);
                var minX = data.points[0].x, maxX = data.points[0].x;
                var minY = data.points[0].y, maxY = data.points[0].y;
                data.points.forEach(function (p) {
                    if (p.x < minX) minX = p.x;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                });
                data.x = minX;
                data.y = minY;
                data.width = maxX - minX;
                data.height = maxY - minY;
            } else {
                var p1 = mapPoint({ x: data.x, y: data.y });
                var p2 = mapPoint({ x: data.x + data.width, y: data.y + data.height });
                data.x = Math.min(p1.x, p2.x);
                data.y = Math.min(p1.y, p2.y);
                data.width = Math.abs(p2.x - p1.x);
                data.height = Math.abs(p2.y - p1.y);
            }
            return data;
        }
        if ((type === 'wall' || type === 'line') && data.points) {
            data.points = data.points.map(mapPoint);
            if (type === 'line' && data.lineWeight) data.lineWeight = data.lineWeight * s;
            if (type === 'wall' && data.thickness) data.thickness = data.thickness * s;
            return data;
        }
        if (data.x != null && data.y != null) {
            var w = mapPoint({ x: data.x, y: data.y });
            data.x = w.x;
            data.y = w.y;
            if (data.width != null) data.width = data.width * s;
            if (data.rotation != null) data.rotation = (data.rotation || 0) + (insert.rotation || 0);
            return data;
        }
        return data;
    }

    function findDefinition(blocks, blockId) {
        if (!blocks || blockId == null) return null;
        var sid = String(blockId);
        for (var i = 0; i < blocks.length; i++) {
            if (String(blocks[i].id) === sid) return blocks[i];
        }
        return null;
    }

    function insertBBox(def, insert) {
        if (!def || !insert || !def.entities) return null;
        var box = null;
        def.entities.forEach(function (ent) {
            var world = worldEntityFromLocal(ent.type, ent.data, insert);
            box = unionBBox(box, entityBBox(ent.type, world));
        });
        return box;
    }

    function hitTestInsert(def, insert, wx, wy, pad) {
        pad = pad != null ? pad : 4;
        var box = insertBBox(def, insert);
        if (!box) {
            var dx = wx - insert.x;
            var dy = wy - insert.y;
            return dx * dx + dy * dy <= (12 + pad) * (12 + pad);
        }
        return wx >= box.minX - pad && wx <= box.maxX + pad
            && wy >= box.minY - pad && wy <= box.maxY + pad;
    }

    return {
        cloneJson: cloneJson,
        entityBBox: entityBBox,
        selectionBBox: selectionBBox,
        createDefinition: createDefinition,
        createInsert: createInsert,
        localToWorld: localToWorld,
        worldEntityFromLocal: worldEntityFromLocal,
        findDefinition: findDefinition,
        insertBBox: insertBBox,
        hitTestInsert: hitTestInsert,
        translateEntityInPlace: translateEntityInPlace
    };
});
