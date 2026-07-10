// ============================================================
// LAYERS-UI.JS — UI panel LayerManager (Phase 1 — đầy đủ)
// Visible / Lock / Active / Thêm / Đổi tên / Xóa + đếm object
// ============================================================

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function objCountOnLayer(layerId) {
    var d = (layerId == null ? 'default' : layerId);
    function count(arr) {
        if (!Array.isArray(arr)) return 0;
        return arr.filter(function (o) {
            return o && (o.layerId || 'default') === d;
        }).length;
    }
    return count(window.rooms) + count(window.doors) + count(window.walls) +
        count(window.lines) + count(window.pois) + count(window.qrs) +
        count(window.pathNodes);
}

function renderLayersPanel() {
    if (!window.EditorCore || !EditorCore.LayerManager) return;
    var panel = document.getElementById('layersPanel');
    if (!panel) return;

    var lm = EditorCore.LayerManager;
    var layers = lm.getAll ? lm.getAll() : [];
    var activeId = lm.getActiveLayerId ? lm.getActiveLayerId() : (lm.DEFAULT_LAYER_ID || 'default');
    var defaultId = lm.DEFAULT_LAYER_ID || 'default';

    panel.innerHTML = layers.map(function (l) {
        var visible = lm.isLayerVisible ? lm.isLayerVisible(l.id) : !!l.visible;
        var locked = lm.isLayerLocked ? lm.isLayerLocked(l.id) : !!l.locked;
        var isActive = (l.id === activeId);
        var count = objCountOnLayer(l.id);
        var isDefault = (l.id === defaultId);
        var lockIcon = locked ? '🔒' : '🔓';

        return '' +
            '<div class="layer-row ' + (isActive ? 'is-active' : '') + '" data-layer-id="' + escapeHtml(l.id) + '"' +
            ' onclick="setActiveLayerUI(\'' + escapeHtml(l.id) + '\')">' +
            '  <input type="checkbox" class="layer-visible" ' + (visible ? 'checked' : '') +
            '     title="Hiển thị" onclick="event.stopPropagation(); toggleLayerVisibleUI(\'' + escapeHtml(l.id) + '\', this.checked)">' +
            '  <input type="checkbox" class="layer-locked" ' + (locked ? 'checked' : '') +
            '     title="Khóa lớp (không vẽ/sửa)" onclick="event.stopPropagation(); toggleLayerLockedUI(\'' + escapeHtml(l.id) + '\', this.checked)">' +
            '  <div class="layer-row__name" title="' + escapeHtml(l.name) + '">' +
            escapeHtml(String(l.name || '')) + (locked ? ' ' + lockIcon : '') +
            '</div>' +
            '  <div class="layer-row__count" title="Số đối tượng">' + count + '</div>' +
            '  <button type="button" class="layer-row__btn" title="Đổi tên"' +
            '    onclick="event.stopPropagation(); renameLayerUI(\'' + escapeHtml(l.id) + '\')">✎</button>' +
            (isDefault
                ? '<button type="button" class="layer-row__btn layer-row__btn--disabled" title="Không xóa lớp mặc định" disabled>×</button>'
                : '<button type="button" class="layer-row__btn layer-row__btn--danger" title="Xóa lớp"' +
                  ' onclick="event.stopPropagation(); removeLayerUI(\'' + escapeHtml(l.id) + '\')">×</button>') +
            '</div>';
    }).join('');
}

function setActiveLayerUI(layerId) {
    if (!window.EditorCore || !EditorCore.LayerManager) return;
    if (EditorCore.LayerManager.setActiveLayer) EditorCore.LayerManager.setActiveLayer(layerId);
}

function toggleLayerVisibleUI(layerId, visible) {
    if (!window.EditorCore || !EditorCore.LayerManager) return;
    if (EditorCore.LayerManager.setVisible) EditorCore.LayerManager.setVisible(layerId, visible);
    if (typeof draw === 'function') draw();
}

function toggleLayerLockedUI(layerId, locked) {
    if (!window.EditorCore || !EditorCore.LayerManager) return;
    if (EditorCore.LayerManager.setLocked) EditorCore.LayerManager.setLocked(layerId, locked);
    if (typeof draw === 'function') draw();
}

function addLayerUI() {
    if (!window.EditorCore || !EditorCore.LayerManager) return;
    var name = prompt('Tên lớp mới:', '');
    if (name == null) return;
    name = String(name).trim();
    if (!name) return;

    var added = EditorCore.LayerManager.addLayer({ name: name });
    if (added && EditorCore.LayerManager.setActiveLayer) {
        EditorCore.LayerManager.setActiveLayer(added.id);
    }
    if (typeof draw === 'function') draw();
}

function renameLayerUI(layerId) {
    if (!window.EditorCore || !EditorCore.LayerManager) return;
    var layer = EditorCore.LayerManager.get(layerId);
    if (!layer) return;
    var name = prompt('Đổi tên lớp:', layer.name || '');
    if (name == null) return;
    name = String(name).trim();
    if (!name) return;
    EditorCore.LayerManager.renameLayer(layerId, name);
}

function removeLayerUI(layerId) {
    if (!window.EditorCore || !EditorCore.LayerManager) return;
    var lm = EditorCore.LayerManager;
    var defaultId = lm.DEFAULT_LAYER_ID || 'default';
    if (layerId === defaultId) {
        if (typeof showToast === 'function') showToast('Không thể xóa lớp mặc định', 'error');
        return;
    }
    var layer = lm.get(layerId);
    var count = objCountOnLayer(layerId);
    var msg = 'Xóa lớp "' + (layer && layer.name ? layer.name : layerId) + '"?\n' +
        (count > 0
            ? count + ' đối tượng sẽ chuyển về lớp mặc định.'
            : 'Lớp trống.');
    if (!confirm(msg)) return;

    if (typeof reassignLegacyObjectsLayer === 'function') {
        reassignLegacyObjectsLayer(layerId, defaultId);
    }
    lm.removeLayer(layerId);
    if (typeof draw === 'function') draw();
    if (typeof updateObjectList === 'function') updateObjectList();
}

(function initLayerUI() {
    var inited = false;
    function start() {
        if (inited) return;
        inited = true;
        if (!window.EditorCore || !EditorCore.LayerManager || !EditorCore.eventBus) return;
        renderLayersPanel();
        EditorCore.eventBus.on('LAYER_CHANGED', function () {
            renderLayersPanel();
            if (typeof draw === 'function') draw();
        });
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(start, 0);
    } else {
        window.addEventListener('load', start, { once: true });
    }
})();
