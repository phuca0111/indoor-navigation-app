import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.EditorCore = globalThis.EditorCore || {};
const ToolRegistry = require('../core/tool-registry.js');
globalThis.EditorCore.ToolRegistry = ToolRegistry;
const PluginAPI = require('../core/plugin-api.js');
globalThis.EditorCore.PluginAPI = PluginAPI;
const PluginHost = require('../core/plugin-host.js');

describe('PluginHost an toàn', function () {
    beforeEach(function () {
        ToolRegistry.clear();
        PluginAPI._reset();
        globalThis.EditorCore.ToolRegistry = ToolRegistry;
        globalThis.EditorCore.PluginAPI = PluginAPI;
    });

    it('activate/deactivate quản lý vòng đời và thu hồi contribution', function () {
        var host = PluginHost.createHost({ pluginApi: PluginAPI });
        expect(host.install({
            id: 'builtin.demo',
            apiVersion: '1.2.0',
            permissions: ['tools', 'validators']
        }, function () {
            return {
                activate: function (api) {
                    api.registerTool('draw', { name: 'Demo Draw' });
                    api.registerValidator(function () { return 'demo issue'; });
                }
            };
        }).ok).toBe(true);
        expect(host.activate('builtin.demo').ok).toBe(true);
        expect(ToolRegistry.get('builtin.demo.draw')).toBeTruthy();
        expect(PluginAPI.runValidators({})).toHaveLength(1);
        expect(host.get('builtin.demo').contributionCount).toBe(2);

        expect(host.deactivate('builtin.demo').ok).toBe(true);
        expect(ToolRegistry.get('builtin.demo.draw')).toBeNull();
        expect(PluginAPI.runValidators({})).toHaveLength(0);
    });

    it('permission denied rollback mọi contribution đã đăng ký', function () {
        var host = PluginHost.createHost({ pluginApi: PluginAPI });
        host.install({
            id: 'builtin.denied',
            permissions: ['validators']
        }, function () {
            return {
                activate: function (api) {
                    api.registerValidator(function () { return []; });
                    api.registerPanel('unsafe', {});
                }
            };
        });
        var activated = host.activate('builtin.denied');
        expect(activated.ok).toBe(false);
        expect(activated.error).toBe('PLUGIN_PERMISSION_DENIED:panels');
        expect(PluginAPI.runValidators({})).toHaveLength(0);
    });

    it('không tải entry từ xa và chặn API major không tương thích', function () {
        var host = PluginHost.createHost();
        expect(host.install({
            id: 'remote.plugin', entry: 'https://example.com/plugin.js', permissions: []
        }).error).toBe('REMOTE_CODE_NOT_ALLOWED');
        expect(host.install({
            id: 'future.plugin', apiVersion: '2.0.0', permissions: []
        }, function () {}).error).toBe('INCOMPATIBLE_API_VERSION');
    });

    it('không ghi đè plugin đang cài và vẫn cleanup khi deactivate lỗi', function () {
        var host = PluginHost.createHost({ pluginApi: PluginAPI });
        var manifest = { id: 'builtin.cleanup', permissions: ['validators'] };
        expect(host.install(manifest, function () {
            return {
                activate: function (api) {
                    api.registerValidator(function () { return ['active']; });
                },
                deactivate: function () { throw new Error('DEACTIVATE_FAILED'); }
            };
        }).ok).toBe(true);
        expect(host.install(manifest, function () {}).error).toBe('PLUGIN_ALREADY_INSTALLED');
        expect(host.activate(manifest.id).ok).toBe(true);
        var stopped = host.deactivate(manifest.id);
        expect(stopped).toEqual({ ok: false, error: 'DEACTIVATE_FAILED' });
        expect(PluginAPI.runValidators({})).toHaveLength(0);
        expect(host.get(manifest.id).active).toBe(false);
    });
});
