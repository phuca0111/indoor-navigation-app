// ============================================================
// SELECTION-BRIDGE-UI.JS — Gắn legacy selected* ↔ EditorCore.SelectionBridge
// Phải load sau state.js (biến selectedObject / selectedRoom)
// ============================================================

function setLegacySelectionOnly(type, data) {
    if (type === 'room' && data) {
        selectedRoom = data;
        selectedObject = { type: 'room', data: data };
        return;
    }
    if (!type || data == null) {
        selectedRoom = null;
        selectedObject = null;
        return;
    }
    selectedRoom = null;
    selectedObject = { type: type, data: data };
}

/**
 * Đặt selection legacy + đồng bộ SelectionManager.
 * @param {string|null} type — room | wall | line | door | poi | qr | node | null
 * @param {object|null} data
 * @param {{skipUi?: boolean}} [opts]
 */
function setEditorSelection(type, data, opts) {
    opts = opts || {};
    setLegacySelectionOnly(type, data);
    if (window.EditorCore && EditorCore.SelectionBridge) {
        EditorCore.SelectionBridge.syncToSelectionManager(selectedObject, selectedRoom);
    }
    if (!opts.skipUi) {
        if (window.EditorCore && EditorCore.PropertyInspector && typeof EditorCore.PropertyInspector.refresh === 'function') {
            EditorCore.PropertyInspector.refresh();
        }
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof updateObjectList === 'function') updateObjectList();
        if (typeof draw === 'function') draw();
    }
}

function clearEditorSelection(opts) {
    setEditorSelection(null, null, opts);
}

(function initSelectionBridgeUi() {
    if (!window.EditorCore || !EditorCore.SelectionBridge) return;

    EditorCore.SelectionBridge.init({
        eventBus: EditorCore.eventBus,
        onLegacySelectionApplied: function (type, data) {
            setLegacySelectionOnly(type, data);
            if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
            if (typeof updateObjectList === 'function') updateObjectList();
            if (typeof draw === 'function') draw();
        }
    });
})();
