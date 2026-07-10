// ============================================================
// EXPORT-PIPELINE.JS — Validation → Map Adapter (Phase 0 minimal)
// Luận văn: 3 bước — Validate → Transform → JSON (5.17)
// ============================================================
(function (root) {
    'use strict';

    function buildMapDataForPublish() {
        if (root.EditorCore && root.EditorCore.PHASE0_STABLE === true &&
            root.EditorCore.LegacyBridge &&
            typeof root.EditorCore.LegacyBridge.buildPublishPayloadFromEditor === 'function') {
            if (typeof console !== 'undefined' && console.debug) {
                console.debug('[ExportPipeline] build via Map Adapter (PHASE0_STABLE)');
            }
            return root.EditorCore.LegacyBridge.buildPublishPayloadFromEditor();
        }
        if (typeof buildPublishPayloadInline === 'function') {
            return buildPublishPayloadInline();
        }
        if (root.EditorCore && typeof root.EditorCore.buildPublishPayload === 'function' &&
            root.EditorCore.LegacyBridge) {
            return root.EditorCore.buildPublishPayload(
                root.EditorCore.LegacyBridge.captureLegacyState()
            );
        }
        throw new Error('Không có nguồn dữ liệu publish (api.js chưa load?)');
    }

    /**
     * @param {{ skipValidation?: boolean }} options
     * @returns {{ ok: boolean, mapData?: object, validation?: object, cancelled?: boolean }}
     */
    function runExportPipeline(options) {
        options = options || {};
        var mapData = buildMapDataForPublish();

        if (root.EditorCore && typeof root.EditorCore.assertPublishSchema === 'function') {
            root.EditorCore.assertPublishSchema(mapData);
        }

        if (options.skipValidation) {
            return { ok: true, mapData: mapData, validation: { ok: true, errors: [], warnings: [] } };
        }

        if (!root.EditorCore || typeof root.EditorCore.validateMapData !== 'function') {
            return { ok: true, mapData: mapData, validation: { ok: true, errors: [], warnings: [] } };
        }

        var validation = root.EditorCore.validateMapData(mapData);
        if (!validation.ok) {
            return { ok: false, mapData: mapData, validation: validation };
        }
        return { ok: true, mapData: mapData, validation: validation };
    }

    root.EditorCore = root.EditorCore || {};
    root.EditorCore.ExportPipeline = {
        run: runExportPipeline,
        buildMapDataForPublish: buildMapDataForPublish
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
