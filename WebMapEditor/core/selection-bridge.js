// ============================================================
// SELECTION-BRIDGE.JS — Đồng bộ legacy selected* ↔ SelectionManager (Phase 0 — §5.7)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.SelectionBridge = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    var TYPE_TO_ARRAY_KEY = {
        room: 'rooms',
        wall: 'walls',
        line: 'lines',
        door: 'doors',
        poi: 'pois',
        qr: 'qrs',
        node: 'pathNodes'
    };

    var _syncingToManager = false;
    var _onLegacySelectionApplied = null;

    function getLegacyArrays() {
        var g = root;
        return {
            rooms: g.rooms || [],
            walls: g.walls || [],
            lines: g.lines || [],
            doors: g.doors || [],
            pois: g.pois || [],
            qrs: g.qrs || [],
            pathNodes: g.pathNodes || []
        };
    }

    function findInArray(arr, id) {
        if (!arr || !arr.length || id == null) return null;
        var sid = String(id);
        for (var i = 0; i < arr.length; i++) {
            if (String(arr[i].id) === sid) return arr[i];
        }
        return null;
    }

    function resolveLegacyObject(ref) {
        if (!ref || ref.id == null) return null;
        var key = TYPE_TO_ARRAY_KEY[ref.type];
        if (!key) return null;
        var arrays = getLegacyArrays();
        var data = findInArray(arrays[key], ref.id);
        if (!data) return null;
        return data;
    }

    function refFromLegacy(selectedObject, selectedRoom) {
        if (selectedObject && selectedObject.data) {
            return { id: selectedObject.data.id, type: selectedObject.type };
        }
        if (selectedRoom) {
            return { id: selectedRoom.id, type: 'room' };
        }
        return null;
    }

    function syncToSelectionManager(selectedObject, selectedRoom) {
        var SM = root.EditorCore && root.EditorCore.SelectionManager;
        if (!SM) return;
        var ref = refFromLegacy(selectedObject, selectedRoom);
        _syncingToManager = true;
        try {
            if (!ref) SM.clear();
            else SM.select(ref);
        } finally {
            _syncingToManager = false;
        }
    }

    function applyManagerPrimary(primary) {
        if (_syncingToManager) return;
        if (typeof _onLegacySelectionApplied !== 'function') return;
        if (!primary) {
            _onLegacySelectionApplied(null, null);
            return;
        }
        var data = resolveLegacyObject(primary);
        if (!data) {
            _onLegacySelectionApplied(null, null);
            return;
        }
        _onLegacySelectionApplied(primary.type, data);
    }

    function init(opts) {
        opts = opts || {};
        _onLegacySelectionApplied = opts.onLegacySelectionApplied || null;
        var bus = opts.eventBus || (root.EditorCore && root.EditorCore.eventBus);
        if (bus && typeof bus.on === 'function') {
            bus.on('selection:changed', function (payload) {
                applyManagerPrimary(payload && payload.primary);
            });
        }
        if (root.EditorCore && root.EditorCore.PropertyInspector
            && typeof root.EditorCore.PropertyInspector.setResolver === 'function') {
            root.EditorCore.PropertyInspector.setResolver(resolveLegacyObject);
        }
    }

    return {
        init: init,
        resolveLegacyObject: resolveLegacyObject,
        refFromLegacy: refFromLegacy,
        syncToSelectionManager: syncToSelectionManager,
        isSyncingToManager: function () { return _syncingToManager; },
        TYPE_TO_ARRAY_KEY: TYPE_TO_ARRAY_KEY
    };
});
