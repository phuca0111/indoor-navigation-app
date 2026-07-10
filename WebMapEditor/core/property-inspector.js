// ============================================================
// PROPERTY-INSPECTOR.JS — Bind selection → schema (Phase 0 skeleton — §5.11)
// Chưa thay js/properties.js UI; cung cấp API cho Phase 2+
// ============================================================
(function (root, factory) {
    var deps = function () {
        return {
            SelectionManager: root.EditorCore && root.EditorCore.SelectionManager,
            PropertySchemas: root.EditorCore && root.EditorCore.PropertySchemas,
            EventBus: root.EditorCore && root.EditorCore.EventBus
        };
    };

    if (typeof module === 'object' && module.exports) {
        module.exports = factory(deps);
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PropertyInspector = factory(deps);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (getDeps) {
    'use strict';

    var _resolveObject = null;

    function init(opts) {
        opts = opts || {};
        _resolveObject = opts.resolveObject || null;
        var d = getDeps();
        if (d.EventBus && typeof d.EventBus.on === 'function') {
            d.EventBus.on('selection:changed', function () {
                refresh();
            });
        }
    }

    function setResolver(fn) {
        _resolveObject = fn;
    }

    function resolvePrimary() {
        var d = getDeps();
        var sel = d.SelectionManager;
        if (!sel || !sel.getPrimary) return null;
        var ref = sel.getPrimary();
        if (!ref) return null;
        if (typeof _resolveObject === 'function') {
            return _resolveObject(ref);
        }
        return ref;
    }

    function getDescriptor() {
        var d = getDeps();
        var sel = d.SelectionManager;
        var ref = sel && sel.getPrimary ? sel.getPrimary() : null;
        var obj = resolvePrimary();
        if (!obj) return { type: null, schema: null, values: {}, object: null };

        var type = (ref && ref.type) || obj.type || obj._type || 'cad';
        var schemas = d.PropertySchemas;
        var schema = schemas ? schemas.getSchema(type) : null;
        var values = {};
        if (schema && schemas) {
            (schema.fields || []).forEach(function (field) {
                values[field.key] = schemas.getValueByPath(obj, field.key);
            });
        }
        return { type: type, schema: schema, values: values, object: obj };
    }

    function applyPatch(patch) {
        var obj = resolvePrimary();
        if (!obj || !patch) return false;
        var d = getDeps();
        var schemas = d.PropertySchemas;
        if (!schemas) return false;
        Object.keys(patch).forEach(function (key) {
            schemas.setValueByPath(obj, key, patch[key]);
        });
        if (d.EventBus) d.EventBus.emit('property:changed', { object: obj, patch: patch });
        return true;
    }

    function refresh() {
        var d = getDeps();
        if (d.EventBus) {
            d.EventBus.emit('property:inspect', getDescriptor());
        }
    }

    return {
        init: init,
        setResolver: setResolver,
        getDescriptor: getDescriptor,
        applyPatch: applyPatch,
        refresh: refresh
    };
});
