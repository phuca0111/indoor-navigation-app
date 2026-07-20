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
     * @param {{ skipValidation?: boolean, mapData?: object }} options
     * @returns {{ ok: boolean, mapData?: object, validation?: object, cancelled?: boolean }}
     */
    function runExportPipeline(options) {
        options = options || {};
        var mapData = options.mapData || buildMapDataForPublish();
        // Gắn Block/Insert/lines dù build qua Map Adapter (Document chưa có field này)
        if (typeof attachEditorCadExtras === 'function') {
            mapData = attachEditorCadExtras(mapData);
        }

        if (root.EditorCore && typeof root.EditorCore.assertPublishSchema === 'function') {
            root.EditorCore.assertPublishSchema(mapData);
        }

        var navigationPayload = null;
        if (root.EditorCore && typeof root.EditorCore.toNavigationPayload === 'function') {
            try {
                navigationPayload = root.EditorCore.toNavigationPayload(mapData);
            } catch (eNav) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[ExportPipeline] toNavigationPayload:', eNav.message);
                }
            }
        }

        if (options.skipValidation) {
            return {
                ok: true,
                mapData: mapData,
                navigationPayload: navigationPayload,
                validation: { ok: true, errors: [], warnings: [] }
            };
        }

        var validation = (root.EditorCore && typeof root.EditorCore.validateMapData === 'function')
            ? root.EditorCore.validateMapData(mapData)
            : { ok: true, errors: [], warnings: [] };

        validation = mergePluginValidators(validation, mapData);

        return {
            ok: validation.ok,
            mapData: mapData,
            navigationPayload: navigationPayload,
            validation: validation
        };
    }

    // Gộp kết quả của các validator plugin (registerValidator) vào validation gốc
    function mergePluginValidators(validation, mapData) {
        var out = {
            ok: validation && validation.ok !== false,
            errors: (validation && validation.errors) ? validation.errors.slice() : [],
            warnings: (validation && validation.warnings) ? validation.warnings.slice() : []
        };
        var plugin = root.EditorCore && root.EditorCore.PluginAPI;
        if (!plugin || typeof plugin.runValidators !== 'function') {
            out.ok = out.errors.length === 0;
            return out;
        }
        var issues = [];
        try {
            issues = plugin.runValidators(mapData) || [];
        } catch (e) {
            issues = [{ level: 'error', code: 'plugin_validator_error', message: e.message, meta: {} }];
        }
        issues.forEach(function (it) {
            if (!it) return;
            if (it.level === 'warning') out.warnings.push(it);
            else out.errors.push(it);
        });
        out.ok = out.errors.length === 0;
        return out;
    }

    root.EditorCore = root.EditorCore || {};
    root.EditorCore.ExportPipeline = {
        run: runExportPipeline,
        buildMapDataForPublish: buildMapDataForPublish
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
