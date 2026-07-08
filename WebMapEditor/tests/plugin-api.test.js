import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PluginAPI = require('../core/plugin-api.js');
const ToolRegistry = require('../core/tool-registry.js');

globalThis.EditorCore = globalThis.EditorCore || {};
globalThis.EditorCore.ToolRegistry = ToolRegistry;

describe('PluginAPI — Phase 0.5 skeleton', function () {
    beforeEach(function () {
        PluginAPI.reset();
        ToolRegistry.clear();
    });

    it('registerTool ủy quyền ToolRegistry', function () {
        var tool = PluginAPI.registerTool({ id: 'test-tool', name: 'Test', shortcut: 't' });
        expect(tool.id).toBe('test-tool');
        expect(ToolRegistry.get('test-tool')).toBeTruthy();
    });

    it('registerExporter và getExporter', function () {
        var handler = function () { return { ok: true }; };
        PluginAPI.registerExporter('json', handler);
        expect(PluginAPI.getExporter('JSON')).toBe(handler);
    });

    it('registerImporter và getImporter', function () {
        var handler = function () { return null; };
        PluginAPI.registerImporter('dxf', handler);
        expect(PluginAPI.getImporter('dxf')).toBe(handler);
    });

    it('runCustomValidators gom findings', function () {
        PluginAPI.registerValidator('RULE_A', function () {
            return { ruleId: 'RULE_A', severity: 'warning', message: 'Cảnh báo' };
        });
        PluginAPI.registerValidator('RULE_B', function () {
            return { ruleId: 'RULE_B', severity: 'error', message: 'Lỗi' };
        });
        var result = PluginAPI.runCustomValidators({});
        expect(result.ok).toBe(false);
        expect(result.findings.length).toBe(2);
    });

    it('listRegistered tổng hợp registry', function () {
        PluginAPI.registerTool({ id: 'line', shortcut: 'l' });
        PluginAPI.registerExporter('svg', function () {});
        PluginAPI.registerPanel('analytics', {});
        var list = PluginAPI.listRegistered();
        expect(list.tools).toContain('line');
        expect(list.exporters).toContain('svg');
        expect(list.panels).toContain('analytics');
    });
});
