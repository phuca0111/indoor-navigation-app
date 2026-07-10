// ============================================================
// INDEX.JS — Khởi tạo EditorCore V4
// ============================================================
(function (root) {
    'use strict';

    if (!root.EditorCore) {
        console.warn('[EditorCore] Thiếu module core — kiểm tra thứ tự script trong index.html');
        return;
    }

    root.EditorCore.VERSION = '4.0.0-phase0';
    root.EditorCore.PHASE0_STABLE = true;

    if (root.EditorCore.Config) {
        root.EditorCore.Config.load();
        root.EditorCore.Config.applyToLegacy();
    }

    if (root.EditorCore.ProjectManager) {
        root.EditorCore.ProjectManager.resolveContext();
    }

    if (root.EditorCore.SelectionManager && root.EditorCore.eventBus) {
        root.EditorCore.SelectionManager.init({ eventBus: root.EditorCore.eventBus });
    }

    if (root.EditorCore.VersionManager && root.EditorCore.eventBus) {
        root.EditorCore.VersionManager.init({ eventBus: root.EditorCore.eventBus });
    }

    if (root.EditorCore.PropertyInspector) {
        root.EditorCore.PropertyInspector.init({
            resolveObject: function (ref) {
                if (root.EditorCore.SelectionBridge && root.EditorCore.SelectionBridge.resolveLegacyObject) {
                    var legacy = root.EditorCore.SelectionBridge.resolveLegacyObject(ref);
                    if (legacy) return legacy;
                }
                if (!ref || !root.EditorCore.document) return null;
                var objs = root.EditorCore.document.objects || [];
                return objs.find(function (o) { return String(o.id) === String(ref.id); }) || ref;
            }
        });
    }

    if (root.EditorCore.PerfMonitor) {
        root.EditorCore.PerfMonitor.autoInitFromQuery();
    }

    if (root.EditorCore.eventBus) {
        root.EditorCore.eventBus.on('DOCUMENT_CHANGED', function () {
            if (root.EditorCore.LegacyBridge) {
                root.EditorCore.LegacyBridge.syncDocumentFromLegacy();
            }
        });
    }

    if (root.EditorCore.SpatialIndex && typeof root.EditorCore.SpatialIndex.init === 'function') {
        root.EditorCore.SpatialIndex.init();
    }

    if (root.EditorCore.LayerManager) {
        root.EditorCore.LayerManager.syncFromDocument();
    }

    if (root.EditorCore.SpatialIndex) {
        console.log('[EditorCore] SpatialIndex —', root.EditorCore.SpatialIndex.getStats());
    }
    if (root.EditorCore.SnapEngine) {
        console.log('[EditorCore] SnapEngine modes —', root.EditorCore.SnapEngine.getModes());
    }
    if (root.EditorCore.ToolRegistry) {
        console.log('[EditorCore] Tools —', root.EditorCore.ToolRegistry.getAll().map(function (t) {
            return t.id;
        }));
    }
    if (root.EditorCore.PolylineTool) {
        console.log('[EditorCore] PolylineTool state —', root.EditorCore.PolylineTool.getState());
    }
    if (root.EditorCore.Config) {
        console.log('[EditorCore] Config grid —', root.EditorCore.Config.get('grid.size'));
    }
    if (root.EditorCore.ProjectManager) {
        console.log('[EditorCore] Project —', root.EditorCore.ProjectManager.getContext());
    }

    console.log('[EditorCore] V4 loaded —', root.EditorCore.VERSION, 'Phase0 stable:', root.EditorCore.PHASE0_STABLE);
})(typeof globalThis !== 'undefined' ? globalThis : this);
