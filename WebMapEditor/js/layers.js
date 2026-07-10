// ============================================================
// LAYERS.JS — Helpers tích hợp Legacy editor ↔ LayerManager
// ============================================================

function legacyGetLayerManager() {
    try {
        return (window.EditorCore && window.EditorCore.LayerManager) ? window.EditorCore.LayerManager : null;
    } catch (_) {
        return null;
    }
}

function legacyGetDefaultLayerId() {
    var lm = legacyGetLayerManager();
    return (lm && lm.DEFAULT_LAYER_ID) ? lm.DEFAULT_LAYER_ID : 'default';
}

function legacyGetActiveLayerId() {
    var lm = legacyGetLayerManager();
    if (!lm) return legacyGetDefaultLayerId();
    try {
        return lm.getActiveLayerId() || legacyGetDefaultLayerId();
    } catch (_) {
        return legacyGetDefaultLayerId();
    }
}

function legacyEnsureObjectLayerId(obj, fallbackId) {
    if (!obj || typeof obj !== 'object') return obj;
    if (obj.layerId == null) obj.layerId = fallbackId || legacyGetDefaultLayerId();
    return obj;
}

function legacyIsLayerVisible(layerId) {
    var lm = legacyGetLayerManager();
    if (!lm) return true;
    try {
        return lm.isLayerVisible(layerId || legacyGetDefaultLayerId());
    } catch (_) {
        return true;
    }
}

function legacyIsObjectVisible(obj) {
    if (!obj || typeof obj !== 'object') return true;
    var layerId = (obj.layerId != null) ? obj.layerId : legacyGetDefaultLayerId();
    return legacyIsLayerVisible(layerId);
}

function legacyIsLayerLocked(layerId) {
    var lm = legacyGetLayerManager();
    if (!lm || typeof lm.isLayerLocked !== 'function') return false;
    try {
        return !!lm.isLayerLocked(layerId || legacyGetDefaultLayerId());
    } catch (_) {
        return false;
    }
}

function legacyIsActiveLayerLocked() {
    var lm = legacyGetLayerManager();
    if (!lm || typeof lm.isActiveLayerLocked !== 'function') return false;
    try {
        return !!lm.isActiveLayerLocked();
    } catch (_) {
        return false;
    }
}

function legacyIsObjectLayerLocked(obj) {
    if (!obj || typeof obj !== 'object') return false;
    var layerId = (obj.layerId != null) ? obj.layerId : legacyGetDefaultLayerId();
    return legacyIsLayerLocked(layerId);
}

/** Chặn vẽ khi lớp active đang khóa. Trả true nếu bị chặn. */
function blockIfActiveLayerLocked(actionLabel) {
    if (!legacyIsActiveLayerLocked()) return false;
    var msg = 'Lớp đang chọn đã khóa — không thể ' + (actionLabel || 'vẽ') + '. Mở khóa lớp hoặc chọn lớp khác.';
    if (typeof showToast === 'function') showToast(msg, 'error');
    else console.warn(msg);
    return true;
}

/** Chặn sửa/xóa khi đối tượng thuộc lớp khóa. */
function blockIfObjectLayerLocked(obj, actionLabel) {
    if (!legacyIsObjectLayerLocked(obj)) return false;
    var msg = 'Đối tượng thuộc lớp khóa — không thể ' + (actionLabel || 'sửa') + '.';
    if (typeof showToast === 'function') showToast(msg, 'error');
    else console.warn(msg);
    return true;
}

function reassignLegacyObjectsLayer(fromId, toId) {
    var target = toId || legacyGetDefaultLayerId();
    function reassign(arr) {
        if (!Array.isArray(arr)) return;
        arr.forEach(function (o) {
            if (o && (o.layerId || 'default') === fromId) o.layerId = target;
        });
    }
    reassign(typeof rooms !== 'undefined' ? rooms : window.rooms);
    reassign(typeof walls !== 'undefined' ? walls : window.walls);
    reassign(typeof lines !== 'undefined' ? lines : window.lines);
    reassign(typeof doors !== 'undefined' ? doors : window.doors);
    reassign(typeof pois !== 'undefined' ? pois : window.pois);
    reassign(typeof qrs !== 'undefined' ? qrs : window.qrs);
    reassign(typeof pathNodes !== 'undefined' ? pathNodes : window.pathNodes);
}

function getLayersSnapshot() {
    var lm = legacyGetLayerManager();
    if (!lm || typeof lm.getAll !== 'function') {
        return [{ id: 'default', name: '0', visible: true, locked: false, color: null }];
    }
    return lm.getAll();
}

function applyLayersSnapshot(layersList, activeId) {
    var lm = legacyGetLayerManager();
    if (!lm || typeof lm.reset !== 'function') return;
    lm.reset(layersList && layersList.length ? layersList : null);
    if (activeId && typeof lm.setActiveLayer === 'function') {
        lm.setActiveLayer(activeId);
    }
}
