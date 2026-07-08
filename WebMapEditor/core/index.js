// ============================================================
// INDEX.JS — Khởi tạo EditorCore V4 (Phase 0)
// ============================================================
(function (root) {
    'use strict';

    if (!root.EditorCore) {
        console.warn('[EditorCore] Thiếu module core — kiểm tra thứ tự script trong index.html');
        return;
    }

    root.EditorCore.VERSION = '4.0.0-phase0';
    /** Phase 0 smoke pass 2026-07-08 — publish qua Map Adapter + Document */
    root.EditorCore.PHASE0_STABLE = true;

    if (root.EditorCore.Config) {
        root.EditorCore.Config.init();
        root.EditorCore.Config.loadFromUrl('config/editor.json').then(function () {
            if (typeof window.syncStateFromEditorConfig === 'function') {
                window.syncStateFromEditorConfig();
            }
        });
    }

    if (root.EditorCore.ValidationConfig) {
        root.EditorCore.ValidationConfig.loadFromUrl('config/validation.json');
    }

    if (root.EditorCore.ProjectManager && typeof window !== 'undefined' && window.location) {
        root.EditorCore.ProjectManager.syncFromWindowLocation(window.location);
    }

    if (root.EditorCore.VersionManager) {
        root.EditorCore.VersionManager.syncFromProjectManager();
    }

    if (root.EditorCore.AssetManager && typeof window !== 'undefined') {
        root.EditorCore.AssetManager.syncFromLegacyWindow();
    }

    if (root.EditorCore.SpatialIndex && root.EditorCore.eventBus) {
        root.EditorCore.eventBus.on('DOCUMENT_SYNCED', function () {
            if (root.EditorCore.SpatialIndex) {
                root.EditorCore.SpatialIndex.syncFromLegacyWindow();
            }
            if (root.EditorCore.LayerManager) {
                root.EditorCore.LayerManager.syncFromDocument();
            }
        });
    }

    if (root.EditorCore.LayerManager) {
        root.EditorCore.LayerManager.syncFromDocument();
    }

    if (root.EditorCore.eventBus) {
        root.EditorCore.eventBus.on('DOCUMENT_CHANGED', function () {
            if (root.EditorCore.LegacyBridge) {
                root.EditorCore.LegacyBridge.syncDocumentFromLegacy();
            }
        });
    }

    console.log('[EditorCore] V4 Phase 0 loaded —', root.EditorCore.VERSION,
        root.EditorCore.PHASE0_STABLE ? '(STABLE · publish → Map Adapter)' : '(preview)');
})(typeof globalThis !== 'undefined' ? globalThis : this);
