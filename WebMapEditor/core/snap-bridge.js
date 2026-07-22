// ============================================================
// SNAP-BRIDGE.JS — Nối SnapEngine V4 ↔ legacy utils/tools
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        var api = factory(root);
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.SnapBridge = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    function getGridSize() {
        if (typeof root.GRID_SIZE === 'number' && root.GRID_SIZE > 0) return root.GRID_SIZE;
        if (root.EditorCore && root.EditorCore.Config) {
            return root.EditorCore.Config.get('grid.size', 40);
        }
        return 40;
    }

    function isGridSnapCheckboxEnabled() {
        if (typeof document === 'undefined') return true;
        var sc = document.getElementById('snapCheck');
        if (sc) return sc.checked;
        return true;
    }

    function legacySnapAxis(val) {
        if (!isGridSnapCheckboxEnabled()) return val;
        var gridSize = getGridSize();
        var snapped = Math.round(val / gridSize) * gridSize;
        if (Math.abs(val - snapped) < 10) return snapped;
        return val;
    }

    function snapWorldPoint(x, y, opts) {
        x = Number(x) || 0;
        y = Number(y) || 0;
        if (root.EditorCore && root.EditorCore.SnapEngine) {
            var fromSnap = root.EditorCore.FromSnap;
            var enriched = fromSnap ? fromSnap.enrich(opts) : (opts || {});
            var result = root.EditorCore.SnapEngine.snapPoint({ x: x, y: y }, enriched);
            if (fromSnap && result && result.kind === 'from') fromSnap.consume();
            return result;
        }
        return {
            x: legacySnapAxis(x),
            y: legacySnapAxis(y),
            kind: 'grid',
            source: 'legacy'
        };
    }

    function syncSpatialIndexFromLegacy() {
        if (root.EditorCore && root.EditorCore.SpatialIndex && root.EditorCore.SpatialIndex.syncFromLegacyWindow) {
            return root.EditorCore.SpatialIndex.syncFromLegacyWindow();
        }
        return null;
    }

    return {
        legacySnapAxis: legacySnapAxis,
        snapWorldPoint: snapWorldPoint,
        syncSpatialIndexFromLegacy: syncSpatialIndexFromLegacy
    };
});
