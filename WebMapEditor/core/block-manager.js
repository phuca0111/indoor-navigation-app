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

    var SUPPORTED_TYPES = ['room', 'wall', 'line', 'door', 'poi'];

    function cloneJson(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function normalizeDynamicParameter(param) {
        if (!param || !param.name ||
            ['stretchX', 'stretchY', 'visibility', 'flipX', 'flipY', 'lookup'].indexOf(param.type) < 0) {
            return null;
        }
        var out = {
            name: String(param.name),
            type: param.type,
            defaultValue: param.defaultValue != null
                ? param.defaultValue
                : (param.type === 'visibility' || param.type === 'lookup' ? 'default'
                    : (param.type === 'flipX' || param.type === 'flipY' ? false : 1))
        };
        if (param.type === 'stretchX' || param.type === 'stretchY') {
            out.min = Number.isFinite(Number(param.min)) ? Number(param.min) : 0.1;
            out.max = Number.isFinite(Number(param.max)) ? Number(param.max) : 10;
        } else if (param.type === 'visibility') {
            out.states = Array.isArray(param.states) ? param.states.map(String) : ['default'];
            if (out.states.indexOf(String(out.defaultValue)) < 0) out.defaultValue = out.states[0];
        } else if (param.type === 'lookup') {
            out.table = param.table && typeof param.table === 'object' ? cloneJson(param.table) : {};
            out.states = Object.keys(out.table);
            if (!out.states.length) out.states = ['default'];
            if (out.states.indexOf(String(out.defaultValue)) < 0) out.defaultValue = out.states[0];
        } else {
            out.defaultValue = !!out.defaultValue;
        }
        return out;
    }

    function normalizeDynamicParameters(params) {
        return (params || []).map(normalizeDynamicParameter).filter(Boolean);
    }

    // Lọc danh sách {type,data} chỉ giữ loại đối tượng có thể đưa vào block.
    function filterInsertableItems(items) {
        return (items || []).filter(function (it) {
            return it && it.type && it.data && SUPPORTED_TYPES.indexOf(it.type) >= 0;
        });
    }

    // Tóm tắt thư viện block để hiển thị palette: {id,name,count,createdAt}
    function summarizeForPalette(blocks) {
        return (blocks || []).map(function (b) {
            return {
                id: b.id,
                name: b.name || 'Block',
                count: (b.entities && b.entities.length) || 0,
                createdAt: b.createdAt || 0
            };
        });
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
            attributes: Array.isArray(opts.attributes)
                ? opts.attributes.map(normalizeAttributeDef).filter(Boolean)
                : [],
            dynamicParameters: normalizeDynamicParameters(opts.dynamicParameters),
            dynamicActions: Array.isArray(opts.dynamicActions) ? cloneJson(opts.dynamicActions) : [],
            createdAt: Date.now()
        };
    }

    /** Chuẩn hoá tag thuộc tính (AutoCAD-style: NAME, CODE…). */
    function normalizeAttrTag(tag) {
        return String(tag || '').trim().toUpperCase().replace(/\s+/g, '_');
    }

    function normalizeAttributeDef(attr) {
        if (!attr) return null;
        var tag = normalizeAttrTag(attr.tag);
        if (!tag) return null;
        return {
            tag: tag,
            prompt: String(attr.prompt != null && attr.prompt !== '' ? attr.prompt : tag),
            defaultValue: String(attr.defaultValue != null ? attr.defaultValue : ''),
            x: attr.x != null && isFinite(attr.x) ? Number(attr.x) : 0,
            y: attr.y != null && isFinite(attr.y) ? Number(attr.y) : -14,
            visible: attr.visible === false ? false : true
        };
    }

    /**
     * Thêm / ghi đè attribute trên định nghĩa block (ATTDef).
     * @returns {object|null} attribute đã chuẩn hoá
     */
    function addAttributeDef(def, attr) {
        if (!def) return null;
        var a = normalizeAttributeDef(attr);
        if (!a) return null;
        if (!Array.isArray(def.attributes)) def.attributes = [];
        var idx = -1;
        for (var i = 0; i < def.attributes.length; i++) {
            if (def.attributes[i].tag === a.tag) { idx = i; break; }
        }
        if (idx >= 0) def.attributes[idx] = a;
        else def.attributes.push(a);
        return a;
    }

    function removeAttributeDef(def, tag) {
        tag = normalizeAttrTag(tag);
        if (!def || !tag || !Array.isArray(def.attributes)) return false;
        var before = def.attributes.length;
        def.attributes = def.attributes.filter(function (a) { return a.tag !== tag; });
        return def.attributes.length < before;
    }

    /** Gán giá trị thuộc tính trên Insert (ATTEdit). */
    function setInsertAttrValue(insert, tag, value) {
        tag = normalizeAttrTag(tag);
        if (!insert || !tag) return false;
        if (!insert.attrValues || typeof insert.attrValues !== 'object') insert.attrValues = {};
        insert.attrValues[tag] = String(value != null ? value : '');
        return true;
    }

    function getInsertAttrValue(def, insert, tag) {
        tag = normalizeAttrTag(tag);
        if (!tag) return '';
        if (insert && insert.attrValues && insert.attrValues[tag] != null) {
            return String(insert.attrValues[tag]);
        }
        var attrs = (def && def.attributes) || [];
        for (var i = 0; i < attrs.length; i++) {
            if (attrs[i].tag === tag) return String(attrs[i].defaultValue || '');
        }
        return '';
    }

    /**
     * Danh sách thuộc tính đã resolve (tag/prompt/value/vị trí) cho 1 Insert.
     */
    function resolveInsertAttributes(def, insert) {
        var attrs = (def && Array.isArray(def.attributes)) ? def.attributes : [];
        return attrs.map(function (a) {
            return {
                tag: a.tag,
                prompt: a.prompt || a.tag,
                value: getInsertAttrValue(def, insert, a.tag),
                x: a.x != null ? a.x : 0,
                y: a.y != null ? a.y : -14,
                visible: a.visible !== false
            };
        });
    }

    /** Điền attrValues mặc định từ definition (khi chèn mới). */
    function initInsertAttrValues(def, insert) {
        if (!insert) return insert;
        if (!insert.attrValues || typeof insert.attrValues !== 'object') insert.attrValues = {};
        var attrs = (def && def.attributes) || [];
        for (var i = 0; i < attrs.length; i++) {
            var t = attrs[i].tag;
            if (insert.attrValues[t] == null) {
                insert.attrValues[t] = String(attrs[i].defaultValue || '');
            }
        }
        return insert;
    }

    function createInsert(blockId, x, y, opts) {
        opts = opts || {};
        var insert = {
            id: opts.id != null ? opts.id : Date.now(),
            blockId: blockId,
            name: opts.name || 'Insert',
            x: x,
            y: y,
            rotation: opts.rotation || 0,
            scale: opts.scale != null ? opts.scale : 1,
            layerId: opts.layerId || 'default',
            attrValues: (opts.attrValues && typeof opts.attrValues === 'object')
                ? cloneJson(opts.attrValues)
                : {},
            dynamicValues: (opts.dynamicValues && typeof opts.dynamicValues === 'object')
                ? cloneJson(opts.dynamicValues)
                : {}
        };
        if (opts.def) initInsertAttrValues(opts.def, insert);
        if (opts.def) initDynamicValues(opts.def, insert);
        return insert;
    }

    function initDynamicValues(def, insert) {
        if (!insert.dynamicValues || typeof insert.dynamicValues !== 'object') insert.dynamicValues = {};
        normalizeDynamicParameters(def && def.dynamicParameters).forEach(function (param) {
            if (insert.dynamicValues[param.name] == null) insert.dynamicValues[param.name] = param.defaultValue;
        });
        return insert;
    }

    function coerceDynamicValue(param, value) {
        if (param.type === 'visibility' || param.type === 'lookup') {
            value = String(value);
            if (param.states.indexOf(value) < 0) return { ok: false };
        } else if (param.type === 'flipX' || param.type === 'flipY') {
            value = value === true || value === 1 || String(value).toLowerCase() === 'true';
        } else {
            value = Number(value);
            if (!Number.isFinite(value)) return { ok: false };
            value = Math.max(param.min, Math.min(param.max, value));
        }
        return { ok: true, value: value };
    }

    function setDynamicValue(def, insert, name, value) {
        var params = normalizeDynamicParameters(def && def.dynamicParameters);
        var param = params.find(function (p) { return p.name === name; });
        if (!param || !insert) return false;
        initDynamicValues(def, insert);
        var coerced = coerceDynamicValue(param, value);
        if (!coerced.ok) return false;
        value = coerced.value;
        insert.dynamicValues[name] = value;
        if (param.type === 'lookup' && param.table[value]) {
            Object.keys(param.table[value]).forEach(function (targetName) {
                if (targetName !== name) {
                    var targetParam = params.find(function (candidate) {
                        return candidate.name === targetName;
                    });
                    if (!targetParam) return;
                    var targetValue = coerceDynamicValue(targetParam, param.table[value][targetName]);
                    if (targetValue.ok) insert.dynamicValues[targetName] = targetValue.value;
                }
            });
        }
        evaluateDynamicActions(def, insert);
        return true;
    }

    function evaluateDynamicActions(def, insert, maxIterations) {
        var actions = def && Array.isArray(def.dynamicActions) ? def.dynamicActions : [];
        var params = normalizeDynamicParameters(def && def.dynamicParameters);
        if (!insert || !actions.length) return { changed: false, cyclic: false, iterations: 0 };
        initDynamicValues(def, insert);
        maxIterations = Math.max(1, Math.min(20, Math.round(maxIterations || 10)));
        var changedAny = false;
        var changed = false;
        var iteration = 0;
        do {
            changed = false;
            iteration++;
            actions.forEach(function (action) {
                if (!action || !action.when || !action.set) return;
                var actual = insert.dynamicValues[action.when.parameter];
                if (actual !== action.when.equals) return;
                Object.keys(action.set).forEach(function (key) {
                    var targetParam = params.find(function (param) { return param.name === key; });
                    if (!targetParam) return;
                    var coerced = coerceDynamicValue(targetParam, action.set[key]);
                    if (!coerced.ok) return;
                    var next = coerced.value;
                    if (insert.dynamicValues[key] !== next) {
                        insert.dynamicValues[key] = next;
                        changed = true;
                        changedAny = true;
                    }
                });
            });
        } while (changed && iteration < maxIterations);
        return { changed: changedAny, cyclic: changed && iteration >= maxIterations, iterations: iteration };
    }

    function dynamicFactors(def, insert) {
        var result = { x: 1, y: 1, visibility: null };
        normalizeDynamicParameters(def && def.dynamicParameters).forEach(function (param) {
            var value = insert && insert.dynamicValues && insert.dynamicValues[param.name] != null
                ? insert.dynamicValues[param.name] : param.defaultValue;
            if (param.type === 'stretchX') result.x *= Number(value) || 1;
            else if (param.type === 'stretchY') result.y *= Number(value) || 1;
            else if (param.type === 'flipX' && value) result.x *= -1;
            else if (param.type === 'flipY' && value) result.y *= -1;
            else if (param.type === 'visibility') result.visibility = String(value);
        });
        return result;
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

    function worldEntityFromLocal(type, localData, insert, def) {
        var data = cloneJson(localData);
        var s = insert.scale != null ? insert.scale : 1;
        var dynamic = dynamicFactors(def, insert);
        var rad = (insert.rotation || 0) * Math.PI / 180;
        var cos = Math.cos(rad);
        var sin = Math.sin(rad);

        function mapPoint(p) {
            var x = p.x * s * dynamic.x;
            var y = p.y * s * dynamic.y;
            return {
                x: insert.x + x * cos - y * sin,
                y: insert.y + x * sin + y * cos
            };
        }

        if (type === 'room') {
            if (data.shape === 'circle') {
                var c = mapPoint({ x: data.cx, y: data.cy });
                data.radius = data.radius * s * (Math.abs(dynamic.x) + Math.abs(dynamic.y)) / 2;
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
            var world = worldEntityFromLocal(ent.type, ent.data, insert, def);
            box = unionBBox(box, entityBBox(ent.type, world));
        });
        return box;
    }

    /**
     * Phá 1 Insert thành các entity nguyên thủy ở toạ độ world.
     * Pure: KHÔNG đụng state global — trả về [{type, data}] đã clone + biến đổi
     * theo vị trí/scale/rotation của insert. Lớp UI sẽ gán id mới và push vào mảng.
     */
    function explodeInsert(def, insert) {
        if (!def || !def.entities || !insert) return [];
        var dynamic = dynamicFactors(def, insert);
        return def.entities.filter(function (ent) {
            return !ent.visibilityState || dynamic.visibility == null || ent.visibilityState === dynamic.visibility;
        }).map(function (ent) {
            return {
                type: ent.type,
                data: worldEntityFromLocal(ent.type, ent.data, insert, def)
            };
        });
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
        filterInsertableItems: filterInsertableItems,
        summarizeForPalette: summarizeForPalette,
        entityBBox: entityBBox,
        selectionBBox: selectionBBox,
        createDefinition: createDefinition,
        createInsert: createInsert,
        normalizeAttrTag: normalizeAttrTag,
        normalizeAttributeDef: normalizeAttributeDef,
        normalizeDynamicParameter: normalizeDynamicParameter,
        normalizeDynamicParameters: normalizeDynamicParameters,
        addAttributeDef: addAttributeDef,
        removeAttributeDef: removeAttributeDef,
        setInsertAttrValue: setInsertAttrValue,
        getInsertAttrValue: getInsertAttrValue,
        resolveInsertAttributes: resolveInsertAttributes,
        initInsertAttrValues: initInsertAttrValues,
        initDynamicValues: initDynamicValues,
        setDynamicValue: setDynamicValue,
        evaluateDynamicActions: evaluateDynamicActions,
        dynamicFactors: dynamicFactors,
        localToWorld: localToWorld,
        worldEntityFromLocal: worldEntityFromLocal,
        findDefinition: findDefinition,
        insertBBox: insertBBox,
        hitTestInsert: hitTestInsert,
        explodeInsert: explodeInsert,
        translateEntityInPlace: translateEntityInPlace
    };
});
