(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.DigitalTwin = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function createBinding(raw) {
        if (!raw || raw.entityId == null || !raw.sensorId) return null;
        return {
            id: raw.id || ('twin_' + Date.now() + '_' + Math.floor(Math.random() * 10000)),
            entityType: raw.entityType || 'room',
            entityId: raw.entityId,
            sensorId: String(raw.sensorId),
            metric: String(raw.metric || 'value'),
            warningAbove: Number.isFinite(Number(raw.warningAbove)) ? Number(raw.warningAbove) : null,
            criticalAbove: Number.isFinite(Number(raw.criticalAbove)) ? Number(raw.criticalAbove) : null,
            staleAfterMs: Math.max(1000, Number(raw.staleAfterMs) || 300000),
            latest: raw.latest || null
        };
    }
    function ingest(binding, event) {
        binding = createBinding(binding);
        if (!binding || !event || String(event.sensorId) !== binding.sensorId) return { accepted: false, binding: binding };
        var timestamp = new Date(event.timestamp || Date.now()).getTime();
        if (!Number.isFinite(timestamp)) return { accepted: false, binding: binding };
        var previous = binding.latest && new Date(binding.latest.timestamp).getTime();
        if (Number.isFinite(previous) && timestamp < previous) return { accepted: false, outdated: true, binding: binding };
        binding.latest = {
            value: event.value,
            timestamp: new Date(timestamp).toISOString(),
            unit: String(event.unit || '')
        };
        return { accepted: true, binding: binding };
    }
    function status(binding, now) {
        binding = createBinding(binding);
        if (!binding || !binding.latest) return 'unknown';
        var timestamp = new Date(binding.latest.timestamp).getTime();
        if (!Number.isFinite(timestamp) || (Number(now || Date.now()) - timestamp) > binding.staleAfterMs) return 'stale';
        var value = Number(binding.latest.value);
        if (Number.isFinite(value) && binding.criticalAbove != null && value >= binding.criticalAbove) return 'critical';
        if (Number.isFinite(value) && binding.warningAbove != null && value >= binding.warningAbove) return 'warning';
        return 'normal';
    }
    function buildOverlay(bindings, now) {
        return (bindings || []).map(createBinding).filter(Boolean).map(function (binding) {
            return {
                entityType: binding.entityType,
                entityId: binding.entityId,
                sensorId: binding.sensorId,
                metric: binding.metric,
                latest: binding.latest,
                status: status(binding, now)
            };
        });
    }

    function createTelemetryStore(initialBindings, options) {
        options = options || {};
        var maxHistory = Math.max(1, Math.min(10000, Number(options.maxHistory) || 500));
        var bindings = {};
        var history = {};
        var listeners = [];
        (initialBindings || []).forEach(function (raw) {
            var binding = createBinding(raw);
            if (binding) bindings[binding.id] = binding;
        });
        function emit(payload) {
            listeners.slice().forEach(function (listener) {
                try { listener(payload); } catch (_) {}
            });
        }
        return {
            addBinding: function (raw) {
                var binding = createBinding(raw);
                if (!binding) return null;
                bindings[binding.id] = binding;
                return JSON.parse(JSON.stringify(binding));
            },
            removeBinding: function (id) {
                if (!bindings[id]) return false;
                delete bindings[id]; return true;
            },
            ingestEvent: function (event) {
                if (!event || !event.sensorId) return { accepted: false, updated: 0 };
                var updated = 0;
                Object.keys(bindings).forEach(function (id) {
                    if (bindings[id].sensorId !== String(event.sensorId)) return;
                    var result = ingest(bindings[id], event);
                    if (result.accepted) {
                        bindings[id] = result.binding;
                        updated++;
                    }
                });
                if (!updated) return { accepted: false, updated: 0 };
                var sensorId = String(event.sensorId);
                history[sensorId] = history[sensorId] || [];
                history[sensorId].push({
                    value: event.value,
                    unit: String(event.unit || ''),
                    timestamp: new Date(event.timestamp || Date.now()).toISOString()
                });
                if (history[sensorId].length > maxHistory) {
                    history[sensorId].splice(0, history[sensorId].length - maxHistory);
                }
                var payload = { accepted: true, updated: updated, sensorId: sensorId };
                emit(payload);
                return payload;
            },
            getBinding: function (id) {
                return bindings[id] ? JSON.parse(JSON.stringify(bindings[id])) : null;
            },
            getBindings: function () {
                return Object.keys(bindings).sort().map(function (id) {
                    return JSON.parse(JSON.stringify(bindings[id]));
                });
            },
            getHistory: function (sensorId, from, to) {
                var min = from != null ? new Date(from).getTime() : -Infinity;
                var max = to != null ? new Date(to).getTime() : Infinity;
                return (history[String(sensorId)] || []).filter(function (item) {
                    var time = new Date(item.timestamp).getTime();
                    return time >= min && time <= max;
                }).map(function (item) { return Object.assign({}, item); });
            },
            analytics: function (sensorId, from, to) {
                var numeric = this.getHistory(sensorId, from, to)
                    .map(function (item) { return Number(item.value); })
                    .filter(Number.isFinite);
                if (!numeric.length) return { count: 0, min: null, max: null, average: null };
                var sum = numeric.reduce(function (total, value) { return total + value; }, 0);
                return {
                    count: numeric.length,
                    min: Math.min.apply(null, numeric),
                    max: Math.max.apply(null, numeric),
                    average: sum / numeric.length
                };
            },
            staleBindings: function (now) {
                return this.getBindings().filter(function (binding) {
                    return status(binding, now) === 'stale';
                });
            },
            subscribe: function (listener) {
                if (typeof listener !== 'function') return function () {};
                listeners.push(listener);
                return function () {
                    listeners = listeners.filter(function (item) { return item !== listener; });
                };
            },
            serializeBindings: function () { return this.getBindings(); }
        };
    }

    function isSafeRealtimeUrl(url) {
        url = String(url || '');
        return /^wss:\/\//i.test(url) || /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
    }

    function createRealtimeClient(options) {
        options = options || {};
        var url = String(options.url || '');
        var WebSocketCtor = options.WebSocketCtor;
        var scheduler = options.scheduler || {
            setTimeout: function (fn, delay) { return setTimeout(fn, delay); },
            clearTimeout: function (id) { clearTimeout(id); }
        };
        var socket = null;
        var timer = null;
        var stopped = true;
        var retries = 0;
        var maxRetries = Math.max(0, Number(options.maxRetries) || 5);
        var reconnectMs = Math.max(100, Number(options.reconnectMs) || 2000);
        function notify(state, detail) {
            if (typeof options.onStatus === 'function') options.onStatus(state, detail);
        }
        function scheduleReconnect() {
            if (stopped || retries >= maxRetries) return;
            retries++;
            timer = scheduler.setTimeout(connect, reconnectMs * retries);
        }
        function connect() {
            if (!isSafeRealtimeUrl(url)) return { ok: false, error: 'UNSAFE_REALTIME_URL' };
            if (typeof WebSocketCtor !== 'function') return { ok: false, error: 'WEBSOCKET_UNAVAILABLE' };
            stopped = false;
            try {
                socket = new WebSocketCtor(url);
                socket.onopen = function () { retries = 0; notify('connected'); };
                socket.onmessage = function (message) {
                    try {
                        var event = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
                        if (typeof options.onEvent === 'function') options.onEvent(event);
                    } catch (error) {
                        notify('invalid_message', error.message);
                    }
                };
                socket.onerror = function (error) { notify('error', error); };
                socket.onclose = function () {
                    notify('disconnected');
                    scheduleReconnect();
                };
                notify('connecting');
                return { ok: true };
            } catch (error) {
                notify('error', error.message);
                scheduleReconnect();
                return { ok: false, error: error.message };
            }
        }
        function close() {
            stopped = true;
            if (timer != null) scheduler.clearTimeout(timer);
            timer = null;
            if (socket && typeof socket.close === 'function') socket.close();
            socket = null;
        }
        return {
            connect: connect,
            close: close,
            getState: function () {
                return { stopped: stopped, retries: retries, connected: !!socket };
            }
        };
    }

    return {
        createBinding: createBinding,
        ingest: ingest,
        status: status,
        buildOverlay: buildOverlay,
        createTelemetryStore: createTelemetryStore,
        isSafeRealtimeUrl: isSafeRealtimeUrl,
        createRealtimeClient: createRealtimeClient
    };
});
