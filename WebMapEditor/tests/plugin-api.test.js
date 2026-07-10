import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// PluginAPI đọc deps từ globalThis.EditorCore
globalThis.EditorCore = globalThis.EditorCore || {};
const PluginAPI = require('../core/plugin-api.js');

describe('PluginAPI', function () {
    beforeEach(function () {
        // Reset bằng cách clear plugins qua register lại — API không có clear;
        // tạo instance mới bằng require cache clear không cần thiết nếu test idempotent.
        globalThis.EditorCore.ToolRegistry = {
            register: function (name, def) {
                this._last = { name: name, def: def };
            },
            _last: null
        };
    });

    it('registerPlugin + getPlugin + listPlugins', function () {
        var r = PluginAPI.registerPlugin('demo', { name: 'Demo', version: '2.0.0' });
        expect(r.ok).toBe(true);
        expect(PluginAPI.getPlugin('demo').name).toBe('Demo');
        expect(PluginAPI.listPlugins().some(function (p) { return p.id === 'demo'; })).toBe(true);
    });

    it('registerPlugin thiếu args thất bại', function () {
        expect(PluginAPI.registerPlugin(null, {}).ok).toBe(false);
        expect(PluginAPI.registerPlugin('x', null).ok).toBe(false);
    });

    it('registerTool dùng ToolRegistry', function () {
        var r = PluginAPI.registerTool('custom', { label: 'Custom' });
        expect(r.ok).toBe(true);
        expect(globalThis.EditorCore.ToolRegistry._last.name).toBe('custom');
    });

    it('registerTool không có registry → no_tool_registry', function () {
        delete globalThis.EditorCore.ToolRegistry;
        // Re-require không cần — getDeps đọc live
        var r = PluginAPI.registerTool('x', {});
        expect(r.ok).toBe(false);
        expect(r.error).toBe('no_tool_registry');
        globalThis.EditorCore.ToolRegistry = { register: function () {} };
    });

    it('registerValidator + runValidators', function () {
        PluginAPI.registerValidator(function (data) {
            if (!data || !data.ok) return [{ level: 'error', code: 'bad', message: 'bad' }];
            return [];
        });
        var issues = PluginAPI.runValidators({ ok: false });
        expect(issues.some(function (i) { return i.code === 'bad'; })).toBe(true);
        expect(PluginAPI.runValidators({ ok: true })).toHaveLength(0);
    });

    it('registerExporter + exportAs', function () {
        PluginAPI.registerExporter('geojson', function (doc) {
            return { type: 'FeatureCollection', id: doc && doc.id };
        });
        var out = PluginAPI.exportAs('geojson', { id: 7 });
        expect(out.ok).toBe(true);
        expect(out.data.type).toBe('FeatureCollection');
        expect(PluginAPI.exportAs('unknown').ok).toBe(false);
    });
});
