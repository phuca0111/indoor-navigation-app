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
    /** Bật true khi Phase 0 checklist 100% — publish mới ưu tiên Map Adapter */
    root.EditorCore.PHASE0_STABLE = false;

    if (root.EditorCore.eventBus) {
        root.EditorCore.eventBus.on('DOCUMENT_CHANGED', function () {
            if (root.EditorCore.LegacyBridge) {
                root.EditorCore.LegacyBridge.syncDocumentFromLegacy();
            }
        });
    }

    console.log('[EditorCore] V4 Phase 0 loaded —', root.EditorCore.VERSION);
})(typeof globalThis !== 'undefined' ? globalThis : this);
