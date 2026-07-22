(function () {
    function state() {
        window.editorAdvanced = window.editorAdvanced || {
            constraints: [], xrefs: [], pluginInstalls: [], twinBindings: []
        };
        return window.editorAdvanced;
    }
    function selected() {
        return typeof selectedObject !== 'undefined' ? selectedObject : null;
    }
    function persist(message) {
        if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
        if (typeof draw === 'function') draw();
        if (typeof showToast === 'function') showToast(message, 'success');
    }
    function addConstraint(type) {
        var ref = selected();
        if (!ref || !ref.data || !Array.isArray(ref.data.points) || ref.data.points.length < 2) {
            if (typeof showToast === 'function') showToast('Chọn tường/đoạn có ít nhất 2 đỉnh', 'error');
            return;
        }
        var raw = { type: type, objectType: ref.type, objectId: ref.data.id, a: 0, b: 1 };
        if (type === 'distance') {
            var current = Math.hypot(
                ref.data.points[1].x - ref.data.points[0].x,
                ref.data.points[1].y - ref.data.points[0].y
            );
            var value = prompt('Khoảng cách ràng buộc (px):', String(Math.round(current * 100) / 100));
            if (value == null) return;
            raw.value = Number(value);
        }
        var engine = EditorCore.ConstraintEngine;
        var constraint = engine.normalize(raw);
        if (!constraint) {
            if (typeof showToast === 'function') showToast('Ràng buộc không hợp lệ', 'error');
            return;
        }
        if (typeof saveState === 'function') saveState();
        state().constraints.push(constraint);
        engine.apply(ref.data, constraint);
        persist('Đã thêm ràng buộc ' + type);
    }
    function configureDynamicBlock() {
        var ref = selected();
        if (!ref || ref.type !== 'blockRef') {
            if (typeof showToast === 'function') showToast('Chọn một Insert trước', 'error');
            return;
        }
        var manager = EditorCore.BlockManager;
        var def = manager.findDefinition(blocks, ref.data.blockId);
        if (!def) return;
        if (!def.dynamicParameters || !def.dynamicParameters.length) {
            def.dynamicParameters = manager.normalizeDynamicParameters([
                { name: 'width', type: 'stretchX', defaultValue: 1, min: 0.1, max: 10 },
                { name: 'height', type: 'stretchY', defaultValue: 1, min: 0.1, max: 10 }
            ]);
        }
        manager.initDynamicValues(def, ref.data);
        var width = prompt('Dynamic Block — hệ số rộng:', String(ref.data.dynamicValues.width || 1));
        if (width == null) return;
        var height = prompt('Dynamic Block — hệ số cao:', String(ref.data.dynamicValues.height || 1));
        if (height == null) return;
        if (typeof saveState === 'function') saveState();
        manager.setDynamicValue(def, ref.data, 'width', Number(width));
        manager.setDynamicValue(def, ref.data, 'height', Number(height));
        persist('Đã cập nhật Dynamic Block');
    }
    function importXref(file) {
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (event) {
            try {
                var snapshot = JSON.parse(String(event.target.result || '{}'));
                var ref = EditorCore.XRefManager.normalize({
                    name: file.name, source: file.name, snapshot: snapshot
                });
                if (!ref) throw new Error('Snapshot rỗng');
                state().xrefs.push(ref);
                persist('Đã gắn XRef ' + file.name);
            } catch (error) {
                if (typeof showToast === 'function') showToast('XRef lỗi: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    }
    function installPluginManifest(file) {
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (event) {
            try {
                var store = EditorCore.PluginMarketplace.createStore(state().pluginInstalls);
                var result = store.install(JSON.parse(String(event.target.result || '{}')));
                if (!result.ok) throw new Error(result.error);
                state().pluginInstalls = store.serialize();
                persist('Đã cài manifest plugin (đang tắt)');
            } catch (error) {
                if (typeof showToast === 'function') showToast('Plugin lỗi: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    }
    function bindDigitalTwin() {
        var ref = selected();
        if (!ref || !ref.data || ref.data.id == null) {
            if (typeof showToast === 'function') showToast('Chọn đối tượng cần gắn cảm biến', 'error');
            return;
        }
        var sensorId = prompt('Sensor ID:', ref.type + '-' + ref.data.id);
        if (!sensorId) return;
        var binding = EditorCore.DigitalTwin.createBinding({
            entityType: ref.type, entityId: ref.data.id, sensorId: sensorId
        });
        state().twinBindings.push(binding);
        persist('Đã gắn Digital Twin sensor ' + sensorId);
    }
    function showStatus() {
        var s = state();
        var message = 'Nâng cao: ' + s.constraints.length + ' constraints · ' +
            s.xrefs.length + ' XRef · ' + s.pluginInstalls.length + ' plugin · ' +
            s.twinBindings.length + ' sensor';
        if (typeof showToast === 'function') showToast(message, 'info');
    }
    window.addEditorConstraint = addConstraint;
    window.configureDynamicBlock = configureDynamicBlock;
    window.importXref = importXref;
    window.installPluginManifest = installPluginManifest;
    window.bindDigitalTwin = bindDigitalTwin;
    window.showAdvancedStatus = showStatus;
})();
