// ============================================================
// LEGACY-BRIDGE.JS — Đồng bộ mảng global ↔ Document (Phase 0)
// ============================================================
(function (root) {
    'use strict';

    function captureLegacyState() {
        var mapNameEl = typeof document !== 'undefined' ? document.getElementById('mapName') : null;
        var mapName = mapNameEl ? mapNameEl.value : 'Bản đồ mới';

        return {
            mapName: mapName,
            scaleRatio: typeof metersPerGrid !== 'undefined' && Number.isFinite(metersPerGrid) && metersPerGrid > 0
                ? metersPerGrid
                : 0.5,
            mapBearingOffset: Number.isFinite(root.mapBearingOffset) ? root.mapBearingOffset : 0,
            backgroundImage: root.bgImageBase64 || '',
            rooms: typeof rooms !== 'undefined' ? rooms.slice() : [],
            doors: typeof doors !== 'undefined' ? doors.slice() : [],
            pois: typeof pois !== 'undefined' ? pois.slice() : [],
            pathNodes: typeof pathNodes !== 'undefined' ? pathNodes.slice() : [],
            pathEdges: typeof pathEdges !== 'undefined' ? pathEdges.slice() : [],
            walls: typeof walls !== 'undefined' ? walls.slice() : [],
            qrs: typeof qrs !== 'undefined' ? qrs.slice() : []
        };
    }

    function syncDocumentFromLegacy() {
        if (!root.EditorCore || !root.EditorCore.document) return null;
        var state = captureLegacyState();
        root.EditorCore.document.fromLegacyState(state);
        if (root.EditorCore.eventBus) {
            root.EditorCore.eventBus.emit('DOCUMENT_SYNCED', { source: 'legacy' });
        }
        return root.EditorCore.document;
    }

    function buildPublishPayloadFromEditor() {
        syncDocumentFromLegacy();
        return root.EditorCore.buildPublishPayloadFromDocument(root.EditorCore.document);
    }

    root.EditorCore = root.EditorCore || {};
    root.EditorCore.LegacyBridge = {
        captureLegacyState: captureLegacyState,
        syncDocumentFromLegacy: syncDocumentFromLegacy,
        buildPublishPayloadFromEditor: buildPublishPayloadFromEditor
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
