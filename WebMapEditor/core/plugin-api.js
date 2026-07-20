// ============================================================
// PLUGIN-API.JS — Đăng ký tool / validator / exporter (Phase 0.5 — §5.9)
// ============================================================
(function (root, factory) {
    var deps = function () {
        return {
            ToolRegistry: root.EditorCore && root.EditorCore.ToolRegistry,
            ValidationEngine: root.EditorCore && root.EditorCore.ValidationEngine,
            ExportPipeline: root.EditorCore && root.EditorCore.ExportPipeline
        };
    };

    if (typeof module === 'object' && module.exports) {
        module.exports = factory(deps);
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PluginAPI = factory(deps);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (getDeps) {
    'use strict';

    var _plugins = {};
    var _validators = [];
    var _exporters = [];
    var _importers = [];
    var _panels = [];

    function registerPlugin(id, manifest) {
        if (!id || !manifest) return { ok: false, error: 'invalid_args' };
        _plugins[id] = Object.assign({ id: id, version: '1.0.0' }, manifest);
        return { ok: true, id: id };
    }

    function getPlugin(id) {
        return _plugins[id] ? Object.assign({}, _plugins[id]) : null;
    }

    function listPlugins() {
        return Object.keys(_plugins).map(function (id) { return getPlugin(id); });
    }

    function registerTool(name, toolDef) {
        var d = getDeps();
        if (!d.ToolRegistry || typeof d.ToolRegistry.register !== 'function') {
            return { ok: false, error: 'no_tool_registry' };
        }
        d.ToolRegistry.register(name, toolDef);
        return { ok: true, name: name };
    }

    function registerValidator(fn, opts) {
        if (typeof fn !== 'function') return { ok: false, error: 'not_function' };
        _validators.push({ fn: fn, priority: (opts && opts.priority) || 0 });
        _validators.sort(function (a, b) { return b.priority - a.priority; });
        return { ok: true, count: _validators.length };
    }

    function normalizeIssue(raw) {
        if (raw == null) return null;
        if (typeof raw === 'string') return { level: 'error', code: '', message: raw, meta: {} };
        var level = (raw.level || raw.severity) === 'warning' ? 'warning' : 'error';
        return {
            level: level,
            code: raw.code || '',
            message: raw.message || raw.msg || '',
            meta: raw.meta || raw.details || {}
        };
    }

    function runValidators(mapData) {
        var issues = [];
        _validators.forEach(function (v) {
            try {
                var res = v.fn(mapData);
                if (Array.isArray(res)) {
                    res.forEach(function (r) {
                        var norm = normalizeIssue(r);
                        if (norm) issues.push(norm);
                    });
                } else if (res) {
                    var single = normalizeIssue(res);
                    if (single) issues.push(single);
                }
            } catch (e) {
                issues.push({ level: 'error', code: 'plugin_validator_error', message: e.message, meta: {} });
            }
        });
        return issues;
    }

    function registerExporter(format, fn) {
        if (!format || typeof fn !== 'function') return { ok: false, error: 'invalid_args' };
        _exporters.push({ format: format, fn: fn });
        return { ok: true, format: format };
    }

    function exportAs(format, doc) {
        var match = _exporters.filter(function (e) { return e.format === format; });
        if (!match.length) return { ok: false, error: 'unknown_format' };
        try {
            return { ok: true, data: match[0].fn(doc) };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    function registerImporter(format, fn) {
        if (!format || typeof fn !== 'function') return { ok: false, error: 'invalid_args' };
        _importers.push({ format: format, fn: fn });
        return { ok: true, format: format };
    }

    function importFrom(format, raw) {
        var match = _importers.filter(function (e) { return e.format === format; });
        if (!match.length) return { ok: false, error: 'unknown_format' };
        try {
            return { ok: true, data: match[0].fn(raw) };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    function listImporterFormats() {
        return _importers.map(function (e) { return e.format; });
    }

    function registerPanel(id, panelDef) {
        if (!id || !panelDef) return { ok: false, error: 'invalid_args' };
        _panels = _panels.filter(function (p) { return p.id !== id; });
        _panels.push({ id: id, panel: panelDef });
        return { ok: true, id: id };
    }

    function getPanels() {
        return _panels.map(function (p) { return Object.assign({ id: p.id }, p.panel); });
    }

    // test-only: xóa mọi registry để cô lập test
    function _reset() {
        _plugins = {};
        _validators = [];
        _exporters = [];
        _importers = [];
        _panels = [];
    }

    return {
        registerPlugin: registerPlugin,
        getPlugin: getPlugin,
        listPlugins: listPlugins,
        registerTool: registerTool,
        registerValidator: registerValidator,
        runValidators: runValidators,
        registerExporter: registerExporter,
        exportAs: exportAs,
        registerImporter: registerImporter,
        importFrom: importFrom,
        listImporterFormats: listImporterFormats,
        registerPanel: registerPanel,
        getPanels: getPanels,
        _reset: _reset
    };
});
