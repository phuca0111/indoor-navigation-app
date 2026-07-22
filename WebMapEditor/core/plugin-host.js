(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(root);
    else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PluginHost = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    var API_VERSION = '1.0.0';
    var PERMISSIONS = ['tools', 'validators', 'importers', 'exporters', 'panels'];

    function major(version) {
        var match = String(version || '1.0.0').match(/^(\d+)/);
        return match ? Number(match[1]) : 1;
    }

    function validateManifest(manifest) {
        if (!manifest || !/^[a-z0-9][a-z0-9._-]*$/i.test(manifest.id || '')) {
            return { ok: false, error: 'INVALID_MANIFEST' };
        }
        var permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
        if (permissions.some(function (permission) { return PERMISSIONS.indexOf(permission) < 0; })) {
            return { ok: false, error: 'INVALID_PERMISSION' };
        }
        if (major(manifest.apiVersion) !== major(API_VERSION)) {
            return { ok: false, error: 'INCOMPATIBLE_API_VERSION' };
        }
        return {
            ok: true,
            manifest: {
                id: manifest.id,
                name: String(manifest.name || manifest.id),
                version: String(manifest.version || '1.0.0'),
                apiVersion: String(manifest.apiVersion || API_VERSION),
                permissions: permissions.slice(),
                trustedBuiltin: manifest.trustedBuiltin === true
            }
        };
    }

    function createHost(options) {
        options = options || {};
        var installed = {};
        function pluginApi() {
            return options.pluginApi || (root.EditorCore && root.EditorCore.PluginAPI);
        }
        function requirePermission(record, permission) {
            if (record.manifest.permissions.indexOf(permission) < 0) {
                throw new Error('PLUGIN_PERMISSION_DENIED:' + permission);
            }
        }
        function scoped(record) {
            var api = pluginApi();
            function register(permission, method, args) {
                requirePermission(record, permission);
                if (!api || typeof api[method] !== 'function') throw new Error('PLUGIN_API_UNAVAILABLE:' + method);
                var result = api[method].apply(api, args);
                if (!result || result.ok === false) throw new Error(result && result.error || 'PLUGIN_REGISTER_FAILED');
                if (result.token) record.tokens.push(result.token);
                return result;
            }
            return Object.freeze({
                registerTool: function (name, def) {
                    return register('tools', 'registerTool', [record.manifest.id + '.' + name, def]);
                },
                registerValidator: function (fn, opts) {
                    return register('validators', 'registerValidator', [fn, opts]);
                },
                registerImporter: function (format, fn) {
                    return register('importers', 'registerImporter', [format, fn]);
                },
                registerExporter: function (format, fn) {
                    return register('exporters', 'registerExporter', [format, fn]);
                },
                registerPanel: function (id, panel) {
                    return register('panels', 'registerPanel', [record.manifest.id + '.' + id, panel]);
                },
                pluginId: record.manifest.id,
                apiVersion: API_VERSION
            });
        }
        function cleanup(record) {
            var api = pluginApi();
            record.tokens.slice().reverse().forEach(function (contributionToken) {
                if (api && typeof api.unregisterContribution === 'function') {
                    api.unregisterContribution(contributionToken);
                }
            });
            record.tokens = [];
        }
        return {
            install: function (manifest, moduleFactory) {
                var validation = validateManifest(manifest);
                if (!validation.ok) return validation;
                if (typeof moduleFactory !== 'function') {
                    return { ok: false, error: 'REMOTE_CODE_NOT_ALLOWED' };
                }
                if (installed[validation.manifest.id]) {
                    return { ok: false, error: 'PLUGIN_ALREADY_INSTALLED' };
                }
                installed[validation.manifest.id] = {
                    manifest: validation.manifest,
                    factory: moduleFactory,
                    instance: null,
                    active: false,
                    tokens: []
                };
                return { ok: true, plugin: this.get(validation.manifest.id) };
            },
            activate: function (id) {
                var record = installed[id];
                if (!record) return { ok: false, error: 'PLUGIN_NOT_INSTALLED' };
                if (record.active) return { ok: true, duplicated: true };
                try {
                    record.instance = record.factory();
                    if (!record.instance || typeof record.instance.activate !== 'function') {
                        throw new Error('PLUGIN_ACTIVATE_MISSING');
                    }
                    record.instance.activate(scoped(record));
                    record.active = true;
                    return { ok: true };
                } catch (error) {
                    cleanup(record);
                    record.instance = null;
                    return { ok: false, error: error.message };
                }
            },
            deactivate: function (id) {
                var record = installed[id];
                if (!record) return { ok: false, error: 'PLUGIN_NOT_INSTALLED' };
                if (!record.active) return { ok: true, duplicated: true };
                var deactivateError = null;
                try {
                    if (record.instance && typeof record.instance.deactivate === 'function') {
                        record.instance.deactivate();
                    }
                } catch (error) {
                    deactivateError = error;
                } finally {
                    cleanup(record);
                    record.instance = null;
                    record.active = false;
                }
                return deactivateError
                    ? { ok: false, error: deactivateError.message }
                    : { ok: true };
            },
            uninstall: function (id) {
                if (!installed[id]) return false;
                this.deactivate(id);
                delete installed[id];
                return true;
            },
            get: function (id) {
                var record = installed[id];
                return record ? {
                    manifest: Object.assign({}, record.manifest),
                    active: record.active,
                    contributionCount: record.tokens.length
                } : null;
            },
            list: function () {
                var self = this;
                return Object.keys(installed).sort().map(function (id) { return self.get(id); });
            }
        };
    }

    return {
        API_VERSION: API_VERSION,
        PERMISSIONS: PERMISSIONS.slice(),
        validateManifest: validateManifest,
        createHost: createHost
    };
});
