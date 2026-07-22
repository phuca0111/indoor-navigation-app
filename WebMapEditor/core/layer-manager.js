// ============================================================
// LAYER-MANAGER.JS — CRUD layer + active layer (Phase 1 skeleton)
// Spec: webedit_nangcap.md — Document.layers[], chưa UI panel đầy đủ
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.LayerManager = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var rootRef = typeof globalThis !== 'undefined' ? globalThis : this;

    var DEFAULT_LAYER_ID = 'default';
    var layers = [];
    var activeLayerId = DEFAULT_LAYER_ID;
    var idCounter = 0;

    function emitChanged(detail) {
        if (rootRef.EditorCore && rootRef.EditorCore.eventBus) {
            rootRef.EditorCore.eventBus.emit('LAYER_CHANGED', detail || {});
        }
    }

    function cloneLayer(layer) {
        return {
            id: layer.id,
            name: layer.name,
            visible: !!layer.visible,
            locked: !!layer.locked,
            color: layer.color || null
        };
    }

    function defaultLayer() {
        return { id: DEFAULT_LAYER_ID, name: '0', visible: true, locked: false, color: null };
    }

    function nextLayerId() {
        idCounter += 1;
        return 'layer_' + idCounter;
    }

    function getDocument() {
        return rootRef.EditorCore && rootRef.EditorCore.document
            ? rootRef.EditorCore.document
            : null;
    }

    function syncToDocument() {
        var doc = getDocument();
        if (!doc) return;
        doc.layers = layers.map(cloneLayer);
    }

    function reset(layerList) {
        layers = (layerList && layerList.length ? layerList : [defaultLayer()]).map(cloneLayer);
        if (!layers.some(function (l) { return l.id === DEFAULT_LAYER_ID; })) {
            layers.unshift(defaultLayer());
        }
        activeLayerId = DEFAULT_LAYER_ID;
        syncToDocument();
        emitChanged({ action: 'reset' });
    }

    function getAll() {
        return layers.map(cloneLayer);
    }

    function get(id) {
        var found = layers.find(function (l) { return l.id === id; });
        return found ? cloneLayer(found) : null;
    }

    function getActiveLayerId() {
        return activeLayerId;
    }

    function getActiveLayer() {
        return get(activeLayerId) || get(DEFAULT_LAYER_ID);
    }

    function setActiveLayer(id) {
        if (!get(id)) return false;
        activeLayerId = id;
        emitChanged({ action: 'active', layerId: id });
        return true;
    }

    /**
     * @param {object} opts — { name, color }
     * @returns {object|null}
     */
    function addLayer(opts) {
        opts = opts || {};
        var name = String(opts.name || '').trim();
        if (!name) name = 'Lớp ' + (layers.length + 1);
        var layer = {
            id: opts.id || nextLayerId(),
            name: name,
            visible: opts.visible !== false,
            locked: !!opts.locked,
            color: opts.color || null
        };
        layers.push(layer);
        syncToDocument();
        emitChanged({ action: 'add', layer: cloneLayer(layer) });
        return cloneLayer(layer);
    }

    function renameLayer(id, name) {
        var layer = layers.find(function (l) { return l.id === id; });
        if (!layer) return false;
        layer.name = String(name || layer.name).trim() || layer.name;
        syncToDocument();
        emitChanged({ action: 'rename', layerId: id, name: layer.name });
        return true;
    }

    function setVisible(id, visible) {
        var layer = layers.find(function (l) { return l.id === id; });
        if (!layer) return false;
        layer.visible = !!visible;
        syncToDocument();
        emitChanged({ action: 'visible', layerId: id, visible: layer.visible });
        return true;
    }

    function setLocked(id, locked) {
        var layer = layers.find(function (l) { return l.id === id; });
        if (!layer) return false;
        layer.locked = !!locked;
        syncToDocument();
        emitChanged({ action: 'locked', layerId: id, locked: layer.locked });
        return true;
    }

    function setColor(id, color) {
        var layer = layers.find(function (l) { return l.id === id; });
        if (!layer) return false;
        layer.color = color || null;
        syncToDocument();
        emitChanged({ action: 'color', layerId: id, color: layer.color });
        return true;
    }

    /**
     * Đổi thứ tự lớp trong danh sách. dir < 0 = lên trên, dir >= 0 = xuống dưới.
     */
    function moveLayer(id, dir) {
        var idx = layers.findIndex(function (l) { return l.id === id; });
        if (idx < 0) return false;
        var target = idx + (dir < 0 ? -1 : 1);
        if (target < 0 || target >= layers.length) return false;
        var tmp = layers[idx];
        layers[idx] = layers[target];
        layers[target] = tmp;
        syncToDocument();
        emitChanged({ action: 'reorder', layerId: id });
        return true;
    }

    function removeLayer(id) {
        if (id === DEFAULT_LAYER_ID) return false;
        var idx = layers.findIndex(function (l) { return l.id === id; });
        if (idx < 0) return false;

        layers.splice(idx, 1);
        var doc = getDocument();
        if (doc && Array.isArray(doc.objects)) {
            doc.objects.forEach(function (obj) {
                if (obj && obj.layerId === id) obj.layerId = DEFAULT_LAYER_ID;
            });
        }
        if (activeLayerId === id) activeLayerId = DEFAULT_LAYER_ID;
        syncToDocument();
        emitChanged({ action: 'remove', layerId: id });
        return true;
    }

    function isLayerVisible(id) {
        var layer = get(id);
        return layer ? layer.visible : true;
    }

    function isLayerLocked(id) {
        var layer = get(id);
        return layer ? layer.locked : false;
    }

    function isActiveLayerLocked() {
        return isLayerLocked(activeLayerId);
    }

    function assignObjectLayer(objectId, layerId) {
        if (!get(layerId)) return false;
        var doc = getDocument();
        if (!doc || !Array.isArray(doc.objects)) return false;
        var obj = doc.objects.find(function (o) { return o && o.id === objectId; });
        if (!obj) return false;
        obj.layerId = layerId;
        emitChanged({ action: 'assign', objectId: objectId, layerId: layerId });
        return true;
    }

    function getObjectsOnLayer(layerId) {
        var doc = getDocument();
        if (!doc || !Array.isArray(doc.objects)) return [];
        return doc.objects.filter(function (o) { return o && o.layerId === layerId; });
    }

    function syncFromDocument() {
        var doc = getDocument();
        if (!doc || !Array.isArray(doc.layers) || !doc.layers.length) {
            reset();
            return getAll();
        }
        layers = doc.layers.map(cloneLayer);
        if (!layers.some(function (l) { return l.id === DEFAULT_LAYER_ID; })) {
            layers.unshift(defaultLayer());
        }
        if (!get(activeLayerId)) activeLayerId = DEFAULT_LAYER_ID;
        return getAll();
    }

    return {
        DEFAULT_LAYER_ID: DEFAULT_LAYER_ID,
        reset: reset,
        getAll: getAll,
        get: get,
        getActiveLayerId: getActiveLayerId,
        getActiveLayer: getActiveLayer,
        setActiveLayer: setActiveLayer,
        addLayer: addLayer,
        renameLayer: renameLayer,
        setVisible: setVisible,
        setLocked: setLocked,
        setColor: setColor,
        moveLayer: moveLayer,
        removeLayer: removeLayer,
        isLayerVisible: isLayerVisible,
        isLayerLocked: isLayerLocked,
        isActiveLayerLocked: isActiveLayerLocked,
        assignObjectLayer: assignObjectLayer,
        getObjectsOnLayer: getObjectsOnLayer,
        syncFromDocument: syncFromDocument,
        syncToDocument: syncToDocument
    };
});

