// ============================================================
// PLUGIN-API.JS — Registry mở rộng (Phase 0.5 skeleton)
// Spec: webedit_nangcap.md §5.13 — Tool / Exporter / Importer / Validator / Panel
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PluginAPI = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var rootRef = typeof globalThis !== 'undefined' ? globalThis : this;

    var exporters = Object.create(null);
    var importers = Object.create(null);
    var validators = Object.create(null);
    var panels = Object.create(null);

    function emitRegistered(kind, id) {
        if (rootRef.EditorCore && rootRef.EditorCore.eventBus) {
            rootRef.EditorCore.eventBus.emit('PLUGIN_REGISTERED', { kind: kind, id: id });
        }
    }

    function registerTool(def) {
        if (!rootRef.EditorCore || !rootRef.EditorCore.ToolRegistry) {
            throw new Error('PluginAPI.registerTool: ToolRegistry chưa load');
        }
        var entry = rootRef.EditorCore.ToolRegistry.registerTool(def);
        emitRegistered('tool', entry.id);
        return entry;
    }

    function registerExporter(format, handler) {
        if (!format || typeof handler !== 'function') {
            throw new Error('PluginAPI.registerExporter: cần format và handler');
        }
        var key = String(format).toLowerCase();
        exporters[key] = handler;
        emitRegistered('exporter', key);
        return key;
    }

    function registerImporter(format, handler) {
        if (!format || typeof handler !== 'function') {
            throw new Error('PluginAPI.registerImporter: cần format và handler');
        }
        var key = String(format).toLowerCase();
        importers[key] = handler;
        emitRegistered('importer', key);
        return key;
    }

    function registerValidator(ruleId, handler) {
        if (!ruleId || typeof handler !== 'function') {
            throw new Error('PluginAPI.registerValidator: cần ruleId và handler');
        }
        var key = String(ruleId);
        validators[key] = handler;
        emitRegistered('validator', key);
        return key;
    }

    function registerPanel(panelId, component) {
        if (!panelId) throw new Error('PluginAPI.registerPanel: thiếu panelId');
        var key = String(panelId);
        panels[key] = component;
        emitRegistered('panel', key);
        return key;
    }

    function getExporter(format) {
        return exporters[String(format).toLowerCase()] || null;
    }

    function getImporter(format) {
        return importers[String(format).toLowerCase()] || null;
    }

    function getValidator(ruleId) {
        return validators[String(ruleId)] || null;
    }

    function getPanel(panelId) {
        return panels[String(panelId)] || null;
    }

    /**
     * Chạy mọi custom validator đã đăng ký.
     * @param {object} ctx — { document, mapData, ... }
     * @returns {{ ok: boolean, findings: Array }}
     */
    function runCustomValidators(ctx) {
        var findings = [];
        Object.keys(validators).forEach(function (ruleId) {
            try {
                var result = validators[ruleId](ctx || {});
                if (!result) return;
                if (Array.isArray(result)) findings = findings.concat(result);
                else if (result.message) findings.push(result);
            } catch (err) {
                findings.push({
                    ruleId: ruleId,
                    severity: 'error',
                    message: 'Validator lỗi: ' + (err && err.message ? err.message : String(err))
                });
            }
        });
        var errors = findings.filter(function (f) { return f.severity === 'error'; });
        return { ok: errors.length === 0, findings: findings };
    }

    function listRegistered() {
        var toolIds = rootRef.EditorCore && rootRef.EditorCore.ToolRegistry
            ? rootRef.EditorCore.ToolRegistry.getAll().map(function (t) { return t.id; })
            : [];
        return {
            tools: toolIds,
            exporters: Object.keys(exporters),
            importers: Object.keys(importers),
            validators: Object.keys(validators),
            panels: Object.keys(panels)
        };
    }

    function reset() {
        exporters = Object.create(null);
        importers = Object.create(null);
        validators = Object.create(null);
        panels = Object.create(null);
    }

    return {
        registerTool: registerTool,
        registerExporter: registerExporter,
        registerImporter: registerImporter,
        registerValidator: registerValidator,
        registerPanel: registerPanel,
        getExporter: getExporter,
        getImporter: getImporter,
        getValidator: getValidator,
        getPanel: getPanel,
        runCustomValidators: runCustomValidators,
        listRegistered: listRegistered,
        reset: reset
    };
});
