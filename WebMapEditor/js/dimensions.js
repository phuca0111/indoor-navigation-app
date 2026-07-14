// ============================================================
// DIMENSIONS.JS — Dimlinear (DLI) + Dimaligned (DAL) Phase 3
// ============================================================

/** Session vẽ: null | { kind:'dimlinear'|'dimaligned', step:1|2|3, p1?, p2?, preview? } */
var dimlinearSession = null;
var dimalignedSession = null;

function getDimensionManager() {
    if (typeof EditorCore !== 'undefined' && EditorCore.DimensionManager) {
        return EditorCore.DimensionManager;
    }
    return null;
}

function cancelDimlinearSession() {
    if (!dimlinearSession) return false;
    dimlinearSession = null;
    return true;
}

function cancelDimalignedSession() {
    if (!dimalignedSession) return false;
    dimalignedSession = null;
    return true;
}

function cancelAllDimensionSessions() {
    var a = cancelDimlinearSession();
    var b = cancelDimalignedSession();
    return a || b;
}

function beginDimlinearTool() {
    cancelDimalignedSession();
    dimlinearSession = { step: 1, p1: null, p2: null, preview: null };
    if (typeof showToast === 'function') {
        showToast('Dimlinear: click điểm 1 → điểm 2 → vị trí đường dim', 'info');
    }
}

function beginDimalignedTool() {
    cancelDimlinearSession();
    dimalignedSession = { step: 1, p1: null, p2: null, preview: null };
    if (typeof showToast === 'function') {
        showToast('Dimaligned: click điểm 1 → điểm 2 → vị trí đường dim (theo cạnh)', 'info');
    }
}

function handleDimlinearClick(wx, wy) {
    var DM = getDimensionManager();
    if (!DM) return;
    if (!dimlinearSession) beginDimlinearTool();

    if (dimlinearSession.step === 1) {
        dimlinearSession.p1 = { x: wx, y: wy };
        dimlinearSession.step = 2;
        dimlinearSession.preview = { x: wx, y: wy };
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        return;
    }

    if (dimlinearSession.step === 2) {
        var dx = wx - dimlinearSession.p1.x;
        var dy = wy - dimlinearSession.p1.y;
        if (Math.sqrt(dx * dx + dy * dy) < DM.MIN_LEN_PX) {
            if (typeof showToast === 'function') showToast('Hai điểm quá gần', 'error');
            return;
        }
        dimlinearSession.p2 = { x: wx, y: wy };
        dimlinearSession.step = 3;
        dimlinearSession.preview = { x: wx, y: wy };
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        return;
    }

    createDimlinearAt(dimlinearSession.p1, dimlinearSession.p2, { x: wx, y: wy });
    dimlinearSession = { step: 1, p1: null, p2: null, preview: null };
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
}

function handleDimalignedClick(wx, wy) {
    var DM = getDimensionManager();
    if (!DM) return;
    if (!dimalignedSession) beginDimalignedTool();

    if (dimalignedSession.step === 1) {
        dimalignedSession.p1 = { x: wx, y: wy };
        dimalignedSession.step = 2;
        dimalignedSession.preview = { x: wx, y: wy };
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        return;
    }

    if (dimalignedSession.step === 2) {
        var dx = wx - dimalignedSession.p1.x;
        var dy = wy - dimalignedSession.p1.y;
        if (Math.sqrt(dx * dx + dy * dy) < DM.MIN_LEN_PX) {
            if (typeof showToast === 'function') showToast('Hai điểm quá gần', 'error');
            return;
        }
        dimalignedSession.p2 = { x: wx, y: wy };
        dimalignedSession.step = 3;
        dimalignedSession.preview = { x: wx, y: wy };
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        return;
    }

    createDimalignedAt(dimalignedSession.p1, dimalignedSession.p2, { x: wx, y: wy });
    dimalignedSession = { step: 1, p1: null, p2: null, preview: null };
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
}

function updateDimlinearPreview(wx, wy) {
    if (!dimlinearSession || dimlinearSession.step < 2) return;
    dimlinearSession.preview = { x: wx, y: wy };
}

function updateDimalignedPreview(wx, wy) {
    if (!dimalignedSession || dimalignedSession.step < 2) return;
    dimalignedSession.preview = { x: wx, y: wy };
}

function createDimlinearAt(p1, p2, place) {
    var DM = getDimensionManager();
    if (!DM) return null;
    var dim = DM.createDimlinear(p1, p2, place, {
        id: nextDimId++,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default'
    });
    if (!dim) {
        if (typeof showToast === 'function') showToast('Không tạo được dim (quá ngắn)', 'error');
        return null;
    }
    if (typeof saveState === 'function') saveState();
    dimensions.push(dim);
    if (typeof setEditorSelection === 'function') setEditorSelection('dimension', dim);
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') {
        showToast('Dimlinear: ' + formatDimensionLabel(dim), 'success');
    }
    if (typeof draw === 'function') draw();
    return dim;
}

function createDimalignedAt(p1, p2, place) {
    var DM = getDimensionManager();
    if (!DM) return null;
    var dim = DM.createDimaligned(p1, p2, place, {
        id: nextDimId++,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default'
    });
    if (!dim) {
        if (typeof showToast === 'function') showToast('Không tạo được dim (quá ngắn)', 'error');
        return null;
    }
    if (typeof saveState === 'function') saveState();
    dimensions.push(dim);
    if (typeof setEditorSelection === 'function') setEditorSelection('dimension', dim);
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') {
        showToast('Dimaligned: ' + formatDimensionLabel(dim), 'success');
    }
    if (typeof draw === 'function') draw();
    return dim;
}

function formatDimensionLabel(dim) {
    var DM = getDimensionManager();
    if (!DM) return '';
    var mpg = typeof metersPerGrid !== 'undefined' ? metersPerGrid : 0.5;
    var gs = typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40;
    if (DM.getDisplayLabel) return DM.getDisplayLabel(dim, mpg, gs, 2);
    var layout = DM.getLayout(dim);
    if (!layout) return '';
    return DM.formatLabel(layout.lengthPx, mpg, gs, 2);
}

/** Chiều dài đo thật (bỏ qua textOverride) */
function formatDimensionMeasuredLabel(dim) {
    var DM = getDimensionManager();
    if (!DM) return '';
    var layout = DM.getLayout(dim);
    if (!layout) return '';
    var mpg = typeof metersPerGrid !== 'undefined' ? metersPerGrid : 0.5;
    var gs = typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40;
    return DM.formatLabel(layout.lengthPx, mpg, gs, 2);
}

function applyDimensionOffsetAt(dim, wx, wy) {
    var DM = getDimensionManager();
    if (!DM || !dim || !DM.updateOffsetFromPlace) return false;
    return DM.updateOffsetFromPlace(dim, { x: wx, y: wy });
}

function applyDimensionTextOverride(text) {
    if (!selectedObject || selectedObject.type !== 'dimension') return;
    var DM = getDimensionManager();
    if (!DM || !DM.setTextOverride) return;
    if (typeof saveState === 'function') saveState();
    DM.setTextOverride(selectedObject.data, text);
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof draw === 'function') draw();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
}

function clearDimensionTextOverride() {
    applyDimensionTextOverride('');
}

function beginDimeditTool() {
    cancelAllDimensionSessions();
    if (typeof showToast === 'function') {
        showToast('DIMEdit: chọn dim → kéo đổi vị trí · panel sửa nhãn', 'info');
    }
}

function handleDimeditClick(wx, wy) {
    var hit = findDimensionAt(wx, wy);
    if (hit) {
        if (typeof saveState === 'function') saveState();
        if (typeof setEditorSelection === 'function') setEditorSelection('dimension', hit);
        isDraggingDim = true;
        applyDimensionOffsetAt(hit, wx, wy);
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof draw === 'function') draw();
        return;
    }
    if (selectedObject && selectedObject.type === 'dimension') {
        if (typeof saveState === 'function') saveState();
        applyDimensionOffsetAt(selectedObject.data, wx, wy);
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof draw === 'function') draw();
        if (typeof showToast === 'function') showToast('Đã cập nhật vị trí dim', 'success');
        return;
    }
    if (typeof showToast === 'function') showToast('DIMEdit: click một dim để sửa', 'error');
}

function findDimensionAt(wx, wy) {
    var DM = getDimensionManager();
    if (!DM || !Array.isArray(dimensions)) return null;
    var th = 6 / (typeof zoom !== 'undefined' ? zoom : 1);
    for (var i = dimensions.length - 1; i >= 0; i--) {
        var d = dimensions[i];
        if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(d)) continue;
        if (DM.hitTest(d, wx, wy, th)) return d;
    }
    return null;
}

function deleteDimension(dim) {
    if (!dim) return;
    dimensions = dimensions.filter(function (d) { return d.id !== dim.id; });
}

function drawDimensionTicks(layout) {
    var a = layout.dimLine[0], b = layout.dimLine[1];
    var tick = layout.arrow;
    var vx = b.x - a.x, vy = b.y - a.y;
    var len = Math.sqrt(vx * vx + vy * vy);
    var px, py;
    if (len < 1e-6) {
        px = 0;
        py = 1;
    } else if (layout.orientation === 'aligned' && layout.nx != null) {
        px = layout.nx;
        py = layout.ny;
    } else if (layout.orientation === 'horizontal') {
        px = 0;
        py = 1;
    } else if (layout.orientation === 'vertical') {
        px = 1;
        py = 0;
    } else {
        px = -vy / len;
        py = vx / len;
    }
    ctx.beginPath();
    ctx.moveTo(a.x - px * tick, a.y - py * tick);
    ctx.lineTo(a.x + px * tick, a.y + py * tick);
    ctx.moveTo(b.x - px * tick, b.y - py * tick);
    ctx.lineTo(b.x + px * tick, b.y + py * tick);
    ctx.stroke();
}

function drawCadDimensions() {
    if (typeof dimensions === 'undefined' || !Array.isArray(dimensions) || !dimensions.length) return;
    var DM = getDimensionManager();
    if (!DM || typeof ctx === 'undefined') return;
    var mpg = typeof metersPerGrid !== 'undefined' ? metersPerGrid : 0.5;
    var gs = typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40;

    dimensions.forEach(function (dim) {
        if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(dim)) return;
        var layout = DM.getLayout(dim);
        if (!layout) return;
        var sel = selectedObject && selectedObject.type === 'dimension' && selectedObject.data === dim;
        var defaultColor = dim.type === 'dimaligned' ? '#c026d3' : '#e11d48';
        var color = sel ? '#2563eb' : (dim.color || defaultColor);
        var lw = sel ? 2 : 1.25;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = lw / (typeof zoom !== 'undefined' ? zoom : 1);
        ctx.setLineDash([]);

        [layout.ext1, layout.ext2].forEach(function (seg) {
            ctx.beginPath();
            ctx.moveTo(seg[0].x, seg[0].y);
            ctx.lineTo(seg[1].x, seg[1].y);
            ctx.stroke();
        });

        ctx.beginPath();
        ctx.moveTo(layout.dimLine[0].x, layout.dimLine[0].y);
        ctx.lineTo(layout.dimLine[1].x, layout.dimLine[1].y);
        ctx.stroke();

        drawDimensionTicks(layout);

        var text = DM.getDisplayLabel
            ? DM.getDisplayLabel(dim, mpg, gs, 2)
            : DM.formatLabel(layout.lengthPx, mpg, gs, 2);
        var fontPx = 12 / (typeof zoom !== 'undefined' ? zoom : 1);
        ctx.font = 'bold ' + fontPx + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var pad = 3 / (typeof zoom !== 'undefined' ? zoom : 1);
        var tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(layout.label.x - tw / 2 - pad, layout.label.y - fontPx / 2 - pad,
            tw + pad * 2, fontPx + pad * 2);
        ctx.fillStyle = color;
        ctx.fillText(text, layout.label.x, layout.label.y);
        ctx.restore();
    });
}

function drawDimSessionPreview(session, createFn) {
    if (!session || !session.p1 || !session.preview) return;
    if (typeof ctx === 'undefined') return;
    var DM = getDimensionManager();
    var color = createFn === 'aligned' ? '#c026d3' : '#e11d48';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 / (typeof zoom !== 'undefined' ? zoom : 1);
    ctx.setLineDash([4 / (typeof zoom !== 'undefined' ? zoom : 1), 4 / (typeof zoom !== 'undefined' ? zoom : 1)]);

    if (session.step === 2) {
        ctx.beginPath();
        ctx.moveTo(session.p1.x, session.p1.y);
        ctx.lineTo(session.preview.x, session.preview.y);
        ctx.stroke();
    } else if (session.step === 3 && session.p2 && DM) {
        var draft = createFn === 'aligned'
            ? DM.createDimaligned(session.p1, session.p2, session.preview, { id: -1 })
            : DM.createDimlinear(session.p1, session.p2, session.preview, { id: -1 });
        if (draft) {
            var layout = DM.getLayout(draft);
            if (layout) {
                ctx.setLineDash([]);
                [layout.ext1, layout.ext2, layout.dimLine].forEach(function (seg) {
                    ctx.beginPath();
                    ctx.moveTo(seg[0].x, seg[0].y);
                    ctx.lineTo(seg[1].x, seg[1].y);
                    ctx.stroke();
                });
                var mpg = typeof metersPerGrid !== 'undefined' ? metersPerGrid : 0.5;
                var gs = typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40;
                var text = DM.formatLabel(layout.lengthPx, mpg, gs, 2);
                ctx.fillStyle = color;
                ctx.font = 'bold ' + (12 / (typeof zoom !== 'undefined' ? zoom : 1)) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, layout.label.x, layout.label.y);
            }
        }
    }
    ctx.restore();
}

function drawDimlinearPreview() {
    drawDimSessionPreview(dimlinearSession, 'linear');
}

function drawDimalignedPreview() {
    drawDimSessionPreview(dimalignedSession, 'aligned');
}

function renderDimensionPropertiesHtml(dim) {
    if (!dim) return '';
    var measured = typeof formatDimensionMeasuredLabel === 'function'
        ? formatDimensionMeasuredLabel(dim) : formatDimensionLabel(dim);
    var display = formatDimensionLabel(dim);
    var isAligned = dim.type === 'dimaligned';
    var title = isAligned ? 'Dimaligned' : 'Dimlinear';
    var ori = isAligned
        ? 'Theo cạnh (aligned)'
        : (dim.orientation === 'vertical' ? 'Dọc (vertical)' : 'Ngang (horizontal)');
    var overrideVal = dim.textOverride != null ? String(dim.textOverride) : '';
    var safeOverride = typeof escapeHtmlValue === 'function' ? escapeHtmlValue(overrideVal) : overrideVal;
    return '<div class="prop-group">' +
        '<h4>📏 ' + title + ' #' + dim.id + '</h4>' +
        '<div class="prop-row"><label>Đo thật:</label><span>' + measured + '</span></div>' +
        '<div class="prop-row"><label>Hiển thị:</label><span>' + display + '</span></div>' +
        '<div class="prop-row"><label>Kiểu:</label><span>' + ori + '</span></div>' +
        '<div class="prop-row"><label>Offset:</label><span>' + Math.round(dim.offset || 0) + ' px</span></div>' +
        '<div class="prop-group-title">DIMEdit (DED)</div>' +
        '<div class="prop-row"><label>Nhãn:</label>' +
        '<input type="text" id="dimTextOverride" value="' + safeOverride + '" placeholder="' + measured + '" ' +
        'style="flex:1;min-width:0" ' +
        'onkeydown="if(event.key===\'Enter\'){event.preventDefault();applyDimensionTextOverride(this.value);}">' +
        '<button class="btn btn-sm btn-primary" type="button" ' +
        'onclick="applyDimensionTextOverride(document.getElementById(\'dimTextOverride\').value)">Lưu</button></div>' +
        '<div class="prop-row" style="gap:4px;flex-wrap:wrap">' +
        '<button class="btn btn-sm btn-outline" type="button" onclick="clearDimensionTextOverride()">Khôi phục đo</button>' +
        '</div>' +
        '<p class="hint-text">Kéo dim trên map (V hoặc <b>DED</b>) để đổi vị trí đường đo. Annotation — không sang Android.</p>' +
        '</div>';
}

window.cancelDimlinearSession = cancelDimlinearSession;
window.cancelDimalignedSession = cancelDimalignedSession;
window.cancelAllDimensionSessions = cancelAllDimensionSessions;
window.beginDimlinearTool = beginDimlinearTool;
window.beginDimalignedTool = beginDimalignedTool;
window.beginDimeditTool = beginDimeditTool;
window.handleDimlinearClick = handleDimlinearClick;
window.handleDimalignedClick = handleDimalignedClick;
window.handleDimeditClick = handleDimeditClick;
window.updateDimlinearPreview = updateDimlinearPreview;
window.updateDimalignedPreview = updateDimalignedPreview;
window.applyDimensionOffsetAt = applyDimensionOffsetAt;
window.applyDimensionTextOverride = applyDimensionTextOverride;
window.clearDimensionTextOverride = clearDimensionTextOverride;
window.findDimensionAt = findDimensionAt;
window.deleteDimension = deleteDimension;
window.drawCadDimensions = drawCadDimensions;
window.drawDimlinearPreview = drawDimlinearPreview;
window.drawDimalignedPreview = drawDimalignedPreview;
window.renderDimensionPropertiesHtml = renderDimensionPropertiesHtml;
window.formatDimensionLabel = formatDimensionLabel;
window.formatDimensionMeasuredLabel = formatDimensionMeasuredLabel;
