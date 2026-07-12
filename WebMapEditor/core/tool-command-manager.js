// ============================================================
// TOOL-COMMAND-MANAGER.JS — Lifecycle lệnh CAD (spec §5.10)
// Gõ PL/L/W/G… → activate tool; Escape cancel; Enter repeat (command bar)
// Khác command-manager.js (undo pattern cho object mutations)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.ToolCommandManager = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var DEFAULT_ALIASES = {
        line: 'line', l: 'line', ln: 'line',
        polyline: 'wall', pl: 'wall', pline: 'wall',
        wall: 'wall', w: 'wall',
        polygon: 'polygon', g: 'polygon', pol: 'polygon',
        select: 'select', v: 'select',
        room: 'room', r: 'room',
        circle: 'circle', c: 'circle',
        door: 'door', d: 'door',
        poi: 'poi', p: 'poi',
        qr: 'qr', q: 'qr',
        path: 'path', n: 'path',
        ruler: 'ruler', s: 'ruler', di: 'ruler',
        // Phase 2 Editing
        move: 'move', m: 'move',
        copy: 'copy', co: 'copy', cp: 'copy',
        rotate: 'rotate', ro: 'rotate',
        scale: 'scale', sc: 'scale',
        mirror: 'mirror', mi: 'mirror',
        trim: 'trim', tr: 'trim',
        extend: 'extend', ex: 'extend',
        pedit: 'pedit', pe: 'pedit',
        mline: 'mline', ml: 'mline',
        array: 'array', ar: 'array',
        matchprop: 'matchprop', ma: 'matchprop', match: 'matchprop',
        // Block / Insert
        block: 'block', b: 'block',
        insert: 'insert', i: 'insert'
    };

    function createToolCommandManager(options) {
        options = options || {};
        var eventBus = options.eventBus || null;
        var onActivate = options.onActivate || function () {};
        var onCancel = options.onCancel || function () {};

        var aliases = {};
        var knownTools = {};
        var history = [];
        var maxHistory = 24;
        var activeCommand = null;
        var lastCommandId = null;

        Object.keys(DEFAULT_ALIASES).forEach(function (alias) {
            register(alias, DEFAULT_ALIASES[alias]);
        });

        function normalize(text) {
            return String(text || '').trim().toLowerCase();
        }

        function firstToken(text) {
            var n = normalize(text);
            if (!n) return '';
            return n.split(/\s+/)[0];
        }

        function register(alias, toolId) {
            var key = normalize(alias);
            var id = normalize(toolId);
            if (!key || !id) return false;
            aliases[key] = id;
            knownTools[id] = true;
            return true;
        }

        function resolve(input) {
            var token = firstToken(input);
            if (!token) return null;
            if (knownTools[token]) return token;
            if (aliases[token]) return aliases[token];
            return null;
        }

        function pushHistory(toolId, source) {
            history.unshift({
                toolId: toolId,
                source: source || 'execute',
                at: Date.now()
            });
            if (history.length > maxHistory) history.length = maxHistory;
        }

        function execute(input, opts) {
            var toolId = resolve(input);
            if (!toolId && input) {
                var direct = normalize(input);
                if (knownTools[direct]) toolId = direct;
            }
            if (!toolId) {
                return { ok: false, error: 'UNKNOWN_COMMAND', input: input };
            }

            activeCommand = { toolId: toolId, startedAt: Date.now() };
            lastCommandId = toolId;
            pushHistory(toolId, (opts && opts.source) || 'execute');

            onActivate(toolId, opts || {});
            if (eventBus) {
                eventBus.emit('TOOL_COMMAND_STARTED', { toolId: toolId, input: input });
            }
            return { ok: true, toolId: toolId };
        }

        function cancel() {
            onCancel();
            var prev = activeCommand;
            activeCommand = null;
            if (eventBus) {
                eventBus.emit('TOOL_COMMAND_CANCELLED', { toolId: prev ? prev.toolId : null });
            }
            return true;
        }

        function complete(toolId) {
            activeCommand = null;
            if (eventBus) {
                eventBus.emit('TOOL_COMMAND_COMPLETED', { toolId: toolId || lastCommandId });
            }
        }

        function repeat() {
            if (!lastCommandId) {
                return { ok: false, error: 'NO_LAST_COMMAND' };
            }
            return execute(lastCommandId, { source: 'repeat' });
        }

        function getHistory() {
            return history.slice();
        }

        function getLastCommand() {
            return lastCommandId;
        }

        function getActiveCommand() {
            return activeCommand ? Object.assign({}, activeCommand) : null;
        }

        function getAliases() {
            return Object.assign({}, aliases);
        }

        return {
            register: register,
            resolve: resolve,
            execute: execute,
            cancel: cancel,
            complete: complete,
            repeat: repeat,
            getHistory: getHistory,
            getLastCommand: getLastCommand,
            getActiveCommand: getActiveCommand,
            getAliases: getAliases
        };
    }

    return { create: createToolCommandManager };
});
