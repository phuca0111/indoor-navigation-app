// ============================================================
// TOOL-REGISTRY.JS — Đăng ký tool (Phase 0 skeleton)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.ToolRegistry = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var tools = {};
    var shortcutMap = {};

    function normalizeShortcut(key) {
        return key ? String(key).toLowerCase() : '';
    }

    function registerTool(def) {
        if (!def || !def.id) {
            throw new Error('registerTool: thiếu id');
        }
        var entry = {
            id: def.id,
            name: def.name || def.id,
            shortcut: normalizeShortcut(def.shortcut),
            category: def.category || 'draw',
            icon: def.icon || def.id,
            buttonId: def.buttonId || ('btn-' + def.id),
            cursor: def.cursor || (def.id === 'select' ? 'default' : 'crosshair'),
            onActivate: def.onActivate || null,
            onDeactivate: def.onDeactivate || null,
            onPointerDown: def.onPointerDown || null,
            onPointerMove: def.onPointerMove || null,
            onPointerUp: def.onPointerUp || null,
            onKeyDown: def.onKeyDown || null
        };
        tools[entry.id] = entry;
        if (entry.shortcut) {
            shortcutMap[entry.shortcut] = entry.id;
        }
        return entry;
    }

    function unregisterTool(id) {
        var t = tools[id];
        if (t && t.shortcut) delete shortcutMap[t.shortcut];
        delete tools[id];
    }

    function get(id) {
        return tools[id] || null;
    }

    function getByShortcut(key) {
        var id = shortcutMap[normalizeShortcut(key)];
        return id ? tools[id] : null;
    }

    function getAll() {
        return Object.keys(tools).map(function (id) { return tools[id]; });
    }

    function getByCategory(category) {
        return getAll().filter(function (t) { return t.category === category; });
    }

    function activate(id, ctx) {
        var tool = get(id);
        if (!tool) return false;
        var prev = ctx && ctx.previousToolId ? get(ctx.previousToolId) : null;
        if (prev && prev.onDeactivate) prev.onDeactivate(ctx);
        if (tool.onActivate) tool.onActivate(ctx);
        return true;
    }

    function clear() {
        tools = {};
        shortcutMap = {};
    }

    return {
        registerTool: registerTool,
        unregisterTool: unregisterTool,
        get: get,
        getByShortcut: getByShortcut,
        getAll: getAll,
        getByCategory: getByCategory,
        activate: activate,
        clear: clear
    };
});
