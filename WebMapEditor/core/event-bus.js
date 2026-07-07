// ============================================================
// EVENT-BUS.JS — Pub/sub nội bộ WebMapEditor V4
// ============================================================
(function (root) {
    'use strict';

    function createEventBus() {
        const listeners = new Map();

        function on(event, handler) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(handler);
            return function off() {
                const set = listeners.get(event);
                if (set) set.delete(handler);
            };
        }

        function emit(event, payload) {
            const set = listeners.get(event);
            if (!set) return;
            set.forEach(function (handler) {
                try {
                    handler(payload);
                } catch (err) {
                    console.error('[EventBus]', event, err);
                }
            });
        }

        function once(event, handler) {
            const off = on(event, function (payload) {
                off();
                handler(payload);
            });
            return off;
        }

        return { on, once, emit };
    }

    root.EditorCore = root.EditorCore || {};
    root.EditorCore.EventBus = createEventBus();
    root.EditorCore.eventBus = root.EditorCore.EventBus;
})(typeof globalThis !== 'undefined' ? globalThis : this);
