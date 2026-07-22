(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PluginMarketplace = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var ALLOWED_PERMISSIONS = ['tools', 'validators', 'importers', 'exporters', 'panels'];
    function normalizeManifest(raw) {
        if (!raw || !/^[a-z0-9][a-z0-9._-]*$/i.test(raw.id || '')) return null;
        var permissions = Array.isArray(raw.permissions) ? raw.permissions : [];
        if (permissions.some(function (permission) { return ALLOWED_PERMISSIONS.indexOf(permission) < 0; })) return null;
        return {
            id: raw.id,
            name: String(raw.name || raw.id),
            version: String(raw.version || '1.0.0'),
            description: String(raw.description || ''),
            permissions: permissions.slice(),
            entry: String(raw.entry || ''),
            official: !!raw.official
        };
    }
    function createStore(initial) {
        var installed = {};
        (initial || []).forEach(function (item) {
            var manifest = normalizeManifest(item.manifest || item);
            if (manifest) installed[manifest.id] = { manifest: manifest, enabled: item.enabled !== false };
        });
        return {
            install: function (raw) {
                var manifest = normalizeManifest(raw);
                if (!manifest) return { ok: false, error: 'INVALID_MANIFEST' };
                installed[manifest.id] = { manifest: manifest, enabled: false };
                return { ok: true, plugin: this.get(manifest.id) };
            },
            uninstall: function (id) {
                if (!installed[id]) return false;
                delete installed[id]; return true;
            },
            enable: function (id) {
                if (!installed[id]) return false;
                installed[id].enabled = true; return true;
            },
            disable: function (id) {
                if (!installed[id]) return false;
                installed[id].enabled = false; return true;
            },
            get: function (id) {
                return installed[id]
                    ? { manifest: Object.assign({}, installed[id].manifest), enabled: installed[id].enabled }
                    : null;
            },
            list: function () {
                var self = this;
                return Object.keys(installed).sort().map(function (id) { return self.get(id); });
            },
            serialize: function () { return this.list(); }
        };
    }
    return { ALLOWED_PERMISSIONS: ALLOWED_PERMISSIONS.slice(), normalizeManifest: normalizeManifest, createStore: createStore };
});
