// ============================================================
// COMMAND-MANAGER.JS — Command pattern skeleton (Phase 0)
// Tool gọi execute(); Document mutate qua command, không trực tiếp
// ============================================================
(function (root) {
    'use strict';

    function createCommandManager(eventBus) {
        var undoStack = [];
        var redoStack = [];
        var maxHistory = 50;

        function execute(command) {
            if (!command || typeof command.execute !== 'function') {
                throw new Error('CommandManager: command.execute required');
            }
            command.execute();
            undoStack.push(command);
            if (undoStack.length > maxHistory) undoStack.shift();
            redoStack = [];
            if (eventBus) eventBus.emit('COMMAND_EXECUTED', { command: command.name || 'anonymous' });
            if (eventBus) eventBus.emit('DOCUMENT_CHANGED', {});
        }

        function undo() {
            var command = undoStack.pop();
            if (!command || typeof command.undo !== 'function') return false;
            command.undo();
            redoStack.push(command);
            if (eventBus) eventBus.emit('COMMAND_UNDONE', {});
            if (eventBus) eventBus.emit('DOCUMENT_CHANGED', {});
            return true;
        }

        function redo() {
            var command = redoStack.pop();
            if (!command || typeof command.execute !== 'function') return false;
            command.execute();
            undoStack.push(command);
            if (eventBus) eventBus.emit('COMMAND_REDONE', {});
            if (eventBus) eventBus.emit('DOCUMENT_CHANGED', {});
            return true;
        }

        function clear() {
            undoStack = [];
            redoStack = [];
        }

        return {
            execute: execute,
            undo: undo,
            redo: redo,
            clear: clear,
            canUndo: function () { return undoStack.length > 0; },
            canRedo: function () { return redoStack.length > 0; }
        };
    }

    root.EditorCore = root.EditorCore || {};
    root.EditorCore.commandManager = createCommandManager(root.EditorCore.eventBus);
})(typeof globalThis !== 'undefined' ? globalThis : this);
