(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.XRefManager = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function normalizeSource(source) {
        if (typeof source === 'string') {
            return { type: 'local', name: source };
        }
        source = source || {};
        var type = ['local', 'project', 'url', 'embedded'].indexOf(source.type) >= 0
            ? source.type : 'embedded';
        var out = { type: type };
        ['name', 'uri', 'projectId', 'buildingId', 'floor'].forEach(function (key) {
            if (source[key] != null) out[key] = String(source[key]);
        });
        if (source.version != null && Number.isFinite(Number(source.version))) {
            out.version = Number(source.version);
        }
        return out;
    }
    function checksumSnapshot(snapshot) {
        var text = JSON.stringify(snapshot || {});
        var hash = 2166136261;
        for (var i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
    }
    function validateSnapshot(snapshot, maxEntities) {
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
            return { ok: false, error: 'INVALID_SNAPSHOT', count: 0 };
        }
        maxEntities = Math.max(1, Number(maxEntities) || 50000);
        var count = ['rooms', 'walls', 'lines', 'doors', 'pois'].reduce(function (sum, key) {
            return sum + (Array.isArray(snapshot[key]) ? snapshot[key].length : 0);
        }, 0);
        return count > maxEntities
            ? { ok: false, error: 'ENTITY_LIMIT_EXCEEDED', count: count }
            : { ok: true, count: count };
    }
    function normalize(ref) {
        if (!ref || !ref.name || (!ref.snapshot && !ref.source)) return null;
        var snapshot = ref.snapshot && typeof ref.snapshot === 'object' ? ref.snapshot : {};
        if (!validateSnapshot(snapshot, ref.maxEntities).ok) return null;
        var scale = Number(ref.scale);
        return {
            id: ref.id || ('xref_' + Date.now() + '_' + Math.floor(Math.random() * 10000)),
            name: String(ref.name),
            source: normalizeSource(ref.source),
            version: Number.isFinite(Number(ref.version)) ? Number(ref.version) : 1,
            checksum: String(ref.checksum || checksumSnapshot(snapshot)),
            x: Number(ref.x) || 0,
            y: Number(ref.y) || 0,
            rotation: Number(ref.rotation) || 0,
            scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
            visible: ref.visible !== false,
            locked: true,
            loaded: ref.loaded !== false,
            snapshot: clone(snapshot),
            dependencies: Array.isArray(ref.dependencies) ? ref.dependencies.map(String) : [],
            updatedAt: ref.updatedAt || new Date().toISOString()
        };
    }
    function transformPoint(point, ref) {
        var rad = ref.rotation * Math.PI / 180;
        var cos = Math.cos(rad), sin = Math.sin(rad), scale = ref.scale;
        return {
            x: ref.x + point.x * scale * cos - point.y * scale * sin,
            y: ref.y + point.x * scale * sin + point.y * scale * cos
        };
    }
    function transformEntity(entity, ref) {
        var out = clone(entity);
        if (Array.isArray(out.points)) out.points = out.points.map(function (p) { return transformPoint(p, ref); });
        if (out.x != null && out.y != null) {
            var p = transformPoint({ x: out.x, y: out.y }, ref);
            out.x = p.x; out.y = p.y;
        }
        if (out.cx != null && out.cy != null) {
            var center = transformPoint({ x: out.cx, y: out.cy }, ref);
            out.cx = center.x; out.cy = center.y;
        }
        if (out.width != null) out.width *= ref.scale;
        if (out.height != null) out.height *= ref.scale;
        if (out.radius != null) out.radius *= ref.scale;
        out._xrefId = ref.id;
        out._xrefLocked = true;
        return out;
    }
    function resolve(ref) {
        ref = normalize(ref);
        if (!ref || !ref.visible || !ref.loaded) return [];
        var result = [];
        ['rooms', 'walls', 'lines', 'doors', 'pois'].forEach(function (key) {
            (ref.snapshot[key] || []).forEach(function (entity) {
                result.push({ type: key.replace(/s$/, ''), data: transformEntity(entity, ref) });
            });
        });
        return result;
    }
    function reload(ref, snapshot, checksum) {
        var validation = validateSnapshot(snapshot);
        if (!validation.ok) return null;
        var updated = normalize(Object.assign({}, ref, {
            snapshot: snapshot,
            loaded: true,
            version: (Number(ref.version) || 0) + 1,
            checksum: checksum || checksumSnapshot(snapshot),
            updatedAt: new Date().toISOString()
        }));
        return updated;
    }

    function detectReferenceCycles(refs, currentProjectId) {
        var graph = {};
        (refs || []).map(normalize).filter(Boolean).forEach(function (ref) {
            var from = String(currentProjectId || 'current');
            var to = ref.source.type === 'project' && ref.source.projectId
                ? String(ref.source.projectId) : ('xref:' + ref.id);
            graph[from] = graph[from] || [];
            graph[from].push(to);
            if (ref.dependencies.length) graph[to] = ref.dependencies.slice();
        });
        var visiting = {}, visited = {}, cycles = [];
        function walk(node, path) {
            if (visiting[node]) {
                var start = path.indexOf(node);
                cycles.push(path.slice(start).concat(node));
                return;
            }
            if (visited[node]) return;
            visiting[node] = true;
            (graph[node] || []).forEach(function (next) { walk(next, path.concat(next)); });
            delete visiting[node];
            visited[node] = true;
        }
        Object.keys(graph).forEach(function (node) { walk(node, [node]); });
        return cycles;
    }

    function createStore(initial, options) {
        options = options || {};
        var refs = {};
        (initial || []).forEach(function (item) {
            var normalized = normalize(item);
            if (normalized) refs[normalized.id] = normalized;
        });
        return {
            attach: function (raw) {
                var ref = normalize(raw);
                if (!ref) return { ok: false, error: 'INVALID_XREF' };
                var next = Object.keys(refs).map(function (id) { return refs[id]; }).concat(ref);
                var cycles = detectReferenceCycles(next, options.currentProjectId);
                if (cycles.length) return { ok: false, error: 'XREF_CYCLE', cycles: cycles };
                refs[ref.id] = ref;
                return { ok: true, ref: clone(ref) };
            },
            detach: function (id) {
                if (!refs[id]) return false;
                delete refs[id]; return true;
            },
            unload: function (id) {
                if (!refs[id]) return false;
                refs[id].loaded = false; return true;
            },
            load: function (id) {
                if (!refs[id]) return false;
                refs[id].loaded = true; return true;
            },
            refresh: async function (id, loader) {
                var ref = refs[id];
                if (!ref || typeof loader !== 'function') return { ok: false, error: 'INVALID_REFRESH' };
                try {
                    var result = await loader(clone(ref.source), clone(ref));
                    var snapshot = result && result.snapshot ? result.snapshot : result;
                    var updated = reload(ref, snapshot, result && result.checksum);
                    if (!updated) return { ok: false, error: 'INVALID_SNAPSHOT' };
                    if (result && result.version != null) updated.version = Number(result.version);
                    refs[id] = updated;
                    return { ok: true, ref: clone(updated) };
                } catch (error) {
                    return { ok: false, error: error.message };
                }
            },
            get: function (id) { return refs[id] ? clone(refs[id]) : null; },
            list: function () {
                return Object.keys(refs).sort().map(function (id) { return clone(refs[id]); });
            },
            serialize: function () { return this.list(); }
        };
    }
    return {
        normalize: normalize,
        normalizeSource: normalizeSource,
        checksumSnapshot: checksumSnapshot,
        validateSnapshot: validateSnapshot,
        transformPoint: transformPoint,
        transformEntity: transformEntity,
        resolve: resolve,
        reload: reload,
        detectReferenceCycles: detectReferenceCycles,
        createStore: createStore
    };
});
