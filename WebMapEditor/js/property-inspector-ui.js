// ============================================================
// PROPERTY-INSPECTOR-UI.JS — Render schema fields từ EditorCore.PropertyInspector
// Bổ sung / thay phần hard-code trong js/properties.js (Phase 0 wire)
// ============================================================

function getInspectorDescriptor() {
    if (!window.EditorCore || !EditorCore.PropertyInspector) return null;
    return EditorCore.PropertyInspector.getDescriptor();
}

function applyInspectorField(key, rawValue) {
    if (!window.EditorCore || !EditorCore.PropertyInspector) return;
    if (typeof saveState === 'function') saveState();
    var patch = {};
    var val = rawValue;
    if (rawValue === 'true') val = true;
    else if (rawValue === 'false') val = false;
    else if (key === 'labelAutoScale') val = !!rawValue && rawValue !== 'false';
    else if (typeof rawValue === 'string' && rawValue !== '' && !isNaN(Number(rawValue))
        && key !== 'name' && key !== 'serial' && key !== 'type') {
        val = Number(rawValue);
    }
    // Color từ schema: chuẩn hóa hex nếu room dùng rgb()
    if (key === 'color' && typeof val === 'string' && val.indexOf('rgb') === 0 && typeof rgbToHex === 'function') {
        val = rgbToHex(val);
    }

    // Field lưu px nhưng nhập theo mét (vd chiều dài cửa)
    var desc = EditorCore.PropertyInspector.getDescriptor
        ? EditorCore.PropertyInspector.getDescriptor()
        : null;
    var fieldMeta = null;
    if (desc && desc.schema && desc.schema.fields) {
        for (var fi = 0; fi < desc.schema.fields.length; fi++) {
            if (desc.schema.fields[fi].key === key) {
                fieldMeta = desc.schema.fields[fi];
                break;
            }
        }
    }
    if (fieldMeta && fieldMeta.unit === 'm' && fieldMeta.valueIn === 'px'
        && typeof metersToPixels === 'function' && Number.isFinite(val)) {
        var minM = fieldMeta.min != null ? fieldMeta.min : 0.1;
        val = Math.max(minM, val);
        val = Math.round(metersToPixels(val));
        if (val < 10) val = 10;
    }

    patch[key] = val;
    EditorCore.PropertyInspector.applyPatch(patch);
    if (typeof draw === 'function') draw();
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
}

function renderSchemaPropGroup(descriptor, opts) {
    opts = opts || {};
    if (!descriptor || !descriptor.schema || !descriptor.schema.fields) return '';

    var title = opts.title || descriptor.schema.label || descriptor.type || 'Thuộc tính';
    var html = '<div class="prop-group prop-schema">';
    html += '<div class="prop-group-title">' + escapeHtmlValue(title) + '</div>';

    descriptor.schema.fields.forEach(function (field) {
        if (opts.skipKeys && opts.skipKeys.indexOf(field.key) >= 0) return;
        var val = descriptor.values[field.key];
        var inputId = 'insp-' + field.key;
        html += '<div class="prop-row"><label>' + escapeHtmlValue(field.label || field.key) + ':</label>';

        if (field.type === 'boolean') {
            html += '<select onchange="applyInspectorField(\'' + field.key + '\', this.value)">' +
                '<option value="false"' + (!val ? ' selected' : '') + '>Không</option>' +
                '<option value="true"' + (val ? ' selected' : '') + '>Có</option></select>';
        } else if (field.type === 'enum' && field.options) {
            html += '<select onchange="applyInspectorField(\'' + field.key + '\', this.value)">';
            field.options.forEach(function (opt) {
                html += '<option value="' + escapeHtmlValue(opt) + '"' + (val === opt ? ' selected' : '') + '>' +
                    escapeHtmlValue(opt) + '</option>';
            });
            html += '</select>';
        } else if (field.type === 'color') {
            var colorVal = val || '#111827';
            if (typeof colorVal === 'string' && colorVal.indexOf('rgb') === 0 && typeof rgbToHex === 'function') {
                colorVal = rgbToHex(colorVal);
            }
            html += '<input type="color" id="' + inputId + '" value="' + escapeHtmlValue(colorVal) +
                '" onchange="applyInspectorField(\'' + field.key + '\', this.value)">';
        } else if (field.type === 'number') {
            var displayVal = val;
            var min = field.min != null ? ' min="' + field.min + '"' : '';
            var max = field.max != null ? ' max="' + field.max + '"' : '';
            var step = field.step != null ? ' step="' + field.step + '"' : '';
            var unitHtml = '';
            if (field.unit === 'm' && field.valueIn === 'px' && typeof pixelsToMeters === 'function') {
                displayVal = (val != null && Number.isFinite(Number(val)))
                    ? pixelsToMeters(Number(val)).toFixed(2)
                    : '';
                unitHtml = '<span class="unit">m</span>';
                if (!step) step = ' step="0.1"';
            } else if (field.key === 'lineWeight' || field.key === 'thickness' || field.key === 'radius') {
                unitHtml = '<span class="unit">px</span>';
            } else if (field.unit) {
                unitHtml = '<span class="unit">' + escapeHtmlValue(field.unit) + '</span>';
            }
            html += '<input type="number"' + min + max + step + ' value="' +
                escapeHtmlValue(displayVal != null ? displayVal : '') +
                '" onchange="applyInspectorField(\'' + field.key + '\', this.value)">' + unitHtml;
        } else {
            html += '<input type="text" value="' + escapeHtmlValue(val != null ? val : '') +
                '" onchange="applyInspectorField(\'' + field.key + '\', this.value)">';
        }
        html += '</div>';
    });

    html += '</div>';
    return html;
}

(function initPropertyInspectorUi() {
    if (!window.EditorCore || !EditorCore.eventBus) return;
    EditorCore.eventBus.on('property:inspect', function () {
        /* Panel legacy gọi updatePropertiesPanel trực tiếp; hook dự phòng Phase 2 */
    });
})();
