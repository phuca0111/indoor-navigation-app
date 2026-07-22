import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ToolRegistry = require('../core/tool-registry.js');

// PluginAPI đọc deps từ globalThis.EditorCore
globalThis.EditorCore = globalThis.EditorCore || {};
const PluginAPI = require('../core/plugin-api.js');

describe('PluginAPI', function () {
    beforeEach(function () {
        // Reset bằng cách clear plugins qua register lại — API không có clear;
        // tạo instance mới bằng require cache clear không cần thiết nếu test idempotent.
        ToolRegistry.clear();
        globalThis.EditorCore.ToolRegistry = ToolRegistry;
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
        expect(ToolRegistry.get('custom')).toMatchObject({ id: 'custom', name: 'custom' });
    });

    it('registerTool không có registry → no_tool_registry', function () {
        delete globalThis.EditorCore.ToolRegistry;
        // Re-require không cần — getDeps đọc live
        var r = PluginAPI.registerTool('x', {});
        expect(r.ok).toBe(false);
        expect(r.error).toBe('no_tool_registry');
        globalThis.EditorCore.ToolRegistry = ToolRegistry;
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

describe('PluginAPI — registry mở rộng (§5.13)', function () {
    beforeEach(function () {
        PluginAPI._reset();
    });

    it('runValidators chuẩn hóa issue dạng string và object đơn', function () {
        PluginAPI.registerValidator(function () { return 'lỗi chuỗi'; });
        PluginAPI.registerValidator(function () { return { code: 'C1', message: 'm', level: 'warning' }; });
        var issues = PluginAPI.runValidators({});
        expect(issues).toHaveLength(2);
        expect(issues[0].level).toBe('error');
        expect(issues[0].message).toBe('lỗi chuỗi');
        expect(issues[1].level).toBe('warning');
        expect(issues[1].code).toBe('C1');
    });

    it('runValidators theo priority (cao chạy trước)', function () {
        var order = [];
        PluginAPI.registerValidator(function () { order.push('low'); return []; }, { priority: 1 });
        PluginAPI.registerValidator(function () { order.push('high'); return []; }, { priority: 10 });
        PluginAPI.runValidators({});
        expect(order).toEqual(['high', 'low']);
    });

    it('validator ném lỗi → gói thành plugin_validator_error', function () {
        PluginAPI.registerValidator(function () { throw new Error('boom'); });
        var issues = PluginAPI.runValidators({});
        expect(issues.some(function (i) { return i.code === 'plugin_validator_error'; })).toBe(true);
    });

    it('registerImporter + importFrom', function () {
        PluginAPI.registerImporter('dxf', function (raw) { return { lines: raw.length }; });
        var out = PluginAPI.importFrom('dxf', 'ABC');
        expect(out.ok).toBe(true);
        expect(out.data.lines).toBe(3);
        expect(PluginAPI.importFrom('svg', '').ok).toBe(false);
        expect(PluginAPI.listImporterFormats()).toContain('dxf');
    });

    it('importFrom bắt lỗi handler', function () {
        PluginAPI.registerImporter('bad', function () { throw new Error('x'); });
        var out = PluginAPI.importFrom('bad', '');
        expect(out.ok).toBe(false);
        expect(out.error).toBe('x');
    });

    it('registerImporter thiếu args thất bại', function () {
        expect(PluginAPI.registerImporter('', function () {}).ok).toBe(false);
        expect(PluginAPI.registerImporter('x', null).ok).toBe(false);
    });

    it('registerPanel + getPanels (đăng ký lại thì thay thế)', function () {
        PluginAPI.registerPanel('p1', { title: 'A' });
        PluginAPI.registerPanel('p1', { title: 'B' });
        PluginAPI.registerPanel('p2', { title: 'C' });
        var panels = PluginAPI.getPanels();
        expect(panels).toHaveLength(2);
        expect(panels.filter(function (p) { return p.id === 'p1'; })[0].title).toBe('B');
    });

    it('_reset xóa mọi registry', function () {
        PluginAPI.registerValidator(function () { return []; });
        PluginAPI.registerExporter('x', function () {});
        PluginAPI.registerImporter('y', function () {});
        PluginAPI.registerPanel('z', {});
        PluginAPI._reset();
        expect(PluginAPI.runValidators({})).toHaveLength(0);
        expect(PluginAPI.exportAs('x').ok).toBe(false);
        expect(PluginAPI.importFrom('y').ok).toBe(false);
        expect(PluginAPI.getPanels()).toHaveLength(0);
    });
});
