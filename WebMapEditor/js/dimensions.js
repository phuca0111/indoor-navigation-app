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
    var c = (typeof cancelDimAngularSession === 'function') ? cancelDimAngularSession() : false;
    return a || b || c;
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
    if (typeof setDimContinueBase === 'function') setDimContinueBase(dim);
    if (typeof setDimBaselineBase === 'function') setDimBaselineBase(dim);
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
    if (typeof setDimContinueBase === 'function') setDimContinueBase(dim);
    if (typeof setDimBaselineBase === 'function') setDimBaselineBase(dim);
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
        var defaultColor = DM.getLayout ? (dim.color || dimDefaultColor(dim.type)) : '#e11d48';
        var color = sel ? '#2563eb' : (dim.color || dimDefaultColor(dim.type));
        var lw = sel ? 2 : 1.25;
        var z = typeof zoom !== 'undefined' ? zoom : 1;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = lw / z;
        ctx.setLineDash([]);

        if (dim.type === 'dimradius' || dim.type === 'dimdiameter') {
            drawCircularDim(layout, color);
        } else if (dim.type === 'dimangular') {
            drawAngularDim(layout, color);
        } else {
            [layout.ext1, layout.ext2].forEach(function (seg) {
                if (!seg) return;
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
        }

        var text = DM.getDisplayLabel
            ? DM.getDisplayLabel(dim, mpg, gs, 2)
            : DM.formatLabel(layout.lengthPx, mpg, gs, 2);
        drawDimLabel(text, layout.label, color);
        ctx.restore();
    });
}

function dimDefaultColor(type) {
    if (type === 'dimaligned') return '#c026d3';
    if (type === 'dimradius' || type === 'dimdiameter') return '#0891b2';
    if (type === 'dimangular') return '#d97706';
    return '#e11d48';
}

function drawDimLabel(text, at, color) {
    if (!at) return;
    var z = typeof zoom !== 'undefined' ? zoom : 1;
    var fontPx = 12 / z;
    ctx.font = 'bold ' + fontPx + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var pad = 3 / z;
    var tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(at.x - tw / 2 - pad, at.y - fontPx / 2 - pad, tw + pad * 2, fontPx + pad * 2);
    ctx.fillStyle = color;
    ctx.fillText(text, at.x, at.y);
}

function drawArrowHead(at, dir, size) {
    var z = typeof zoom !== 'undefined' ? zoom : 1;
    var s = size / z;
    var ang = Math.atan2(dir.y, dir.x);
    ctx.beginPath();
    ctx.moveTo(at.x, at.y);
    ctx.lineTo(at.x - s * Math.cos(ang - 0.4), at.y - s * Math.sin(ang - 0.4));
    ctx.lineTo(at.x - s * Math.cos(ang + 0.4), at.y - s * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
}

function drawCircularDim(layout, color) {
    if (layout.leader) {
        ctx.beginPath();
        ctx.moveTo(layout.leader[0].x, layout.leader[0].y);
        ctx.lineTo(layout.leader[1].x, layout.leader[1].y);
        ctx.stroke();
        drawArrowHead(layout.arrowAt, layout.dir, layout.arrow);
    } else if (layout.dimLine) {
        ctx.beginPath();
        ctx.moveTo(layout.dimLine[0].x, layout.dimLine[0].y);
        ctx.lineTo(layout.dimLine[1].x, layout.dimLine[1].y);
        ctx.stroke();
        drawArrowHead(layout.arrowA, { x: -layout.dir.x, y: -layout.dir.y }, layout.arrow);
        drawArrowHead(layout.arrowB, layout.dir, layout.arrow);
    }
}

function drawAngularDim(layout, color) {
    var v = layout.vertex;
    // 2 tia mờ
    ctx.save();
    ctx.globalAlpha = 0.5;
    [layout.ray1, layout.ray2].forEach(function (seg) {
        ctx.beginPath();
        ctx.moveTo(seg[0].x, seg[0].y);
        ctx.lineTo(seg[1].x, seg[1].y);
        ctx.stroke();
    });
    ctx.restore();
    // cung tròn
    ctx.beginPath();
    ctx.arc(v.x, v.y, layout.r, layout.startAng, layout.endAng, layout.sweep < 0);
    ctx.stroke();
    // mũi tên 2 đầu cung (tiếp tuyến)
    var tan1 = { x: -Math.sin(layout.startAng) * Math.sign(layout.sweep), y: Math.cos(layout.startAng) * Math.sign(layout.sweep) };
    var tan2 = { x: Math.sin(layout.endAng) * Math.sign(layout.sweep), y: -Math.cos(layout.endAng) * Math.sign(layout.sweep) };
    drawArrowHead(layout.p1End, tan1, layout.arrow);
    drawArrowHead(layout.p2End, tan2, layout.arrow);
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

// ============================================================
// Dimcontinue (DCO) · Dimangular (DAN) · Dimradius · Dimdiameter — Phase 3+
// ============================================================

var dimContinueBase = null;   // { p2, orientation, offset, type }
var dimBaselineBase = null;   // { origin, orientation, offset, type } — chung gốc, xếp chồng
var dimAngularSession = null; // { step, vertex, ray1 }
var dimGenericPreview = null; // { tool, x, y }
var DIM_BASELINE_SPACING_PX = 22; // khoảng cách xếp chồng giữa các đường đo song song

function setDimContinueBase(dim) {
    if (!dim || (dim.type !== 'dimlinear' && dim.type !== 'dimaligned')) return;
    dimContinueBase = {
        p2: { x: dim.p2.x, y: dim.p2.y },
        orientation: dim.orientation,
        offset: dim.offset,
        type: dim.type
    };
}

/** Ghi nhận dim gốc cho lệnh Dimbaseline (DBA) — giữ điểm gốc p1, xếp chồng offset. */
function setDimBaselineBase(dim) {
    if (!dim || (dim.type !== 'dimlinear' && dim.type !== 'dimaligned')) return;
    dimBaselineBase = {
        origin: { x: dim.p1.x, y: dim.p1.y },
        orientation: dim.orientation,
        offset: dim.offset,
        type: dim.type
    };
}

function beginDimcontinueTool() {
    cancelAllDimensionSessions();
    if (!dimContinueBase && selectedObject && selectedObject.type === 'dimension') {
        setDimContinueBase(selectedObject.data);
    }
    if (typeof showToast === 'function') {
        showToast(dimContinueBase
            ? 'Đo nối tiếp: click điểm kế tiếp (nối từ dim trước)'
            : 'Đo nối tiếp: hãy tạo/chọn 1 dim thẳng hoặc nghiêng trước', dimContinueBase ? 'info' : 'error');
    }
}

function handleDimcontinueClick(wx, wy) {
    var DM = getDimensionManager();
    if (!DM) return;
    if (!dimContinueBase) {
        if (selectedObject && selectedObject.type === 'dimension') setDimContinueBase(selectedObject.data);
        if (!dimContinueBase) {
            if (typeof showToast === 'function') showToast('Chưa có dim gốc để nối', 'error');
            return;
        }
    }
    var base = dimContinueBase;
    var p1 = base.p2;
    var p2 = { x: wx, y: wy };
    var place;
    if (base.orientation === 'vertical') place = { x: (p1.x + p2.x) / 2 + base.offset, y: (p1.y + p2.y) / 2 };
    else place = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 + base.offset };

    var opts = {
        id: nextDimId++,
        orientation: base.orientation,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default'
    };
    var dim = base.type === 'dimaligned'
        ? DM.createDimaligned(p1, p2, place, opts)
        : DM.createDimlinear(p1, p2, place, opts);
    if (!dim) {
        if (typeof showToast === 'function') showToast('Không tạo được (quá ngắn)', 'error');
        return;
    }
    if (typeof saveState === 'function') saveState();
    dimensions.push(dim);
    setDimContinueBase(dim);
    if (typeof setDimBaselineBase === 'function') setDimBaselineBase(dim);
    if (typeof setEditorSelection === 'function') setEditorSelection('dimension', dim);
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') showToast('Đo nối: ' + formatDimensionLabel(dim), 'success');
}

/** Dimbaseline (DBA) — bắt đầu công cụ đo song song chung gốc. */
function beginDimbaselineTool() {
    cancelAllDimensionSessions();
    // Nếu đang chọn 1 dim thẳng/nghiêng → lấy làm gốc (cho phép đổi gốc)
    if (selectedObject && selectedObject.type === 'dimension') {
        setDimBaselineBase(selectedObject.data);
    }
    if (typeof showToast === 'function') {
        showToast(dimBaselineBase
            ? 'Đo song song: click điểm kế tiếp (chung điểm gốc)'
            : 'Đo song song: hãy tạo/chọn 1 dim thẳng hoặc nghiêng trước', dimBaselineBase ? 'info' : 'error');
    }
}

/** Xử lý click cho Dimbaseline: giữ p1 = gốc, xếp chồng offset. */
function handleDimbaselineClick(wx, wy) {
    var DM = getDimensionManager();
    if (!DM) return;
    if (!dimBaselineBase) {
        if (selectedObject && selectedObject.type === 'dimension') setDimBaselineBase(selectedObject.data);
        if (!dimBaselineBase) {
            if (typeof showToast === 'function') showToast('Chưa có dim gốc để đo song song', 'error');
            return;
        }
    }
    var base = dimBaselineBase;
    var p1 = base.origin;
    var p2 = { x: wx, y: wy };
    var opts = {
        id: nextDimId++,
        orientation: base.orientation,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default'
    };
    var dim = base.type === 'dimaligned'
        ? DM.createDimaligned(p1, p2, null, opts)
        : DM.createDimlinear(p1, p2, null, opts);
    if (!dim) {
        if (typeof showToast === 'function') showToast('Không tạo được (quá ngắn)', 'error');
        return;
    }
    // Xếp chồng: offset gốc + 1 bước, cùng dấu (cùng phía)
    var sign = (base.offset >= 0) ? 1 : -1;
    dim.offset = base.offset + sign * DIM_BASELINE_SPACING_PX;
    if (typeof saveState === 'function') saveState();
    dimensions.push(dim);
    base.offset = dim.offset; // dim kế xếp tiếp lên trên
    if (typeof setEditorSelection === 'function') setEditorSelection('dimension', dim);
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') showToast('Đo song song: ' + formatDimensionLabel(dim), 'success');
}

function beginDimangularTool() {
    cancelAllDimensionSessions();
    dimAngularSession = { step: 1, vertex: null, ray1: null };
    if (typeof showToast === 'function') {
        showToast('Đo góc: click ĐỈNH → điểm tia 1 → điểm tia 2', 'info');
    }
}

function handleDimangularClick(wx, wy) {
    var DM = getDimensionManager();
    if (!DM) return;
    if (!dimAngularSession) beginDimangularTool();
    var s = dimAngularSession;
    if (s.step === 1) {
        s.vertex = { x: wx, y: wy }; s.step = 2;
        if (typeof showToast === 'function') showToast('Đo góc: click điểm trên TIA 1', 'info');
        return;
    }
    if (s.step === 2) {
        s.ray1 = { x: wx, y: wy }; s.step = 3;
        if (typeof showToast === 'function') showToast('Đo góc: click điểm trên TIA 2', 'info');
        return;
    }
    var dim = DM.createDimangular(s.vertex, s.ray1, { x: wx, y: wy }, null, {
        id: nextDimId++,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default'
    });
    dimAngularSession = { step: 1, vertex: null, ray1: null };
    if (!dim) {
        if (typeof showToast === 'function') showToast('Không tạo được góc', 'error');
        return;
    }
    if (typeof saveState === 'function') saveState();
    dimensions.push(dim);
    if (typeof setEditorSelection === 'function') setEditorSelection('dimension', dim);
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') showToast('Đo góc: ' + formatDimensionLabel(dim), 'success');
}

function beginDimCircularTool(tool) {
    cancelAllDimensionSessions();
    if (typeof showToast === 'function') {
        showToast((tool === 'dimdiameter' ? 'Đo đường kính' : 'Đo bán kính') +
            ': click vào một phòng TRÒN', 'info');
    }
}

/** Tìm phòng tròn tại điểm (trả tâm + bán kính) */
function findCircleRoomAt(wx, wy) {
    if (typeof rooms === 'undefined' || !Array.isArray(rooms)) return null;
    for (var i = rooms.length - 1; i >= 0; i--) {
        var r = rooms[i];
        if (r.shape !== 'circle' || r.cx == null) continue;
        if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(r)) continue;
        var d = Math.hypot(wx - r.cx, wy - r.cy);
        if (d <= r.radius + 8 / (typeof zoom !== 'undefined' ? zoom : 1)) {
            return { cx: r.cx, cy: r.cy, radius: r.radius };
        }
    }
    return null;
}

function handleDimCircularClick(tool, wx, wy) {
    var DM = getDimensionManager();
    if (!DM) return;
    var circ = findCircleRoomAt(wx, wy);
    if (!circ) {
        if (typeof showToast === 'function') showToast('Hãy click vào một phòng tròn', 'error');
        return;
    }
    var ang = Math.atan2(wy - circ.cy, wx - circ.cx);
    if (!isFinite(ang)) ang = 0;
    var center = { x: circ.cx, y: circ.cy };
    var opts = {
        id: nextDimId++,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default'
    };
    var dim;
    if (tool === 'dimdiameter') {
        var e1 = { x: circ.cx - circ.radius * Math.cos(ang), y: circ.cy - circ.radius * Math.sin(ang) };
        var e2 = { x: circ.cx + circ.radius * Math.cos(ang), y: circ.cy + circ.radius * Math.sin(ang) };
        dim = DM.createDimdiameter(e1, e2, opts);
    } else {
        var edge = { x: circ.cx + circ.radius * Math.cos(ang), y: circ.cy + circ.radius * Math.sin(ang) };
        dim = DM.createDimradius(center, edge, opts);
    }
    if (!dim) {
        if (typeof showToast === 'function') showToast('Không tạo được', 'error');
        return;
    }
    if (typeof saveState === 'function') saveState();
    dimensions.push(dim);
    if (typeof setEditorSelection === 'function') setEditorSelection('dimension', dim);
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') showToast('Đã đo ' + formatDimensionLabel(dim), 'success');
}

function cancelDimAngularSession() {
    if (!dimAngularSession) return false;
    dimAngularSession = null;
    return true;
}

function updateDimGenericPreview(tool, wx, wy) {
    dimGenericPreview = { tool: tool, x: wx, y: wy };
}

function drawDimGenericPreview() {
    var DM = getDimensionManager();
    if (!DM || typeof ctx === 'undefined') return;
    var z = typeof zoom !== 'undefined' ? zoom : 1;
    // Đo góc: preview tia đã chọn
    if (dimAngularSession && dimAngularSession.vertex) {
        ctx.save();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1 / z;
        ctx.setLineDash([4 / z, 4 / z]);
        var v = dimAngularSession.vertex;
        var to = dimGenericPreview || v;
        if (dimAngularSession.step === 2) {
            ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        } else if (dimAngularSession.step === 3 && dimAngularSession.ray1) {
            ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(dimAngularSession.ray1.x, dimAngularSession.ray1.y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        }
        ctx.restore();
    }
    // Đo nối tiếp: preview từ điểm cuối dim gốc
    if (dimContinueBase && dimGenericPreview && dimGenericPreview.tool === 'dimcontinue') {
        ctx.save();
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 1 / z;
        ctx.setLineDash([4 / z, 4 / z]);
        ctx.beginPath();
        ctx.moveTo(dimContinueBase.p2.x, dimContinueBase.p2.y);
        ctx.lineTo(dimGenericPreview.x, dimGenericPreview.y);
        ctx.stroke();
        ctx.restore();
    }
    // Đo song song: preview từ điểm gốc chung
    if (dimBaselineBase && dimGenericPreview && dimGenericPreview.tool === 'dimbaseline') {
        ctx.save();
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 1 / z;
        ctx.setLineDash([2 / z, 4 / z]);
        ctx.beginPath();
        ctx.moveTo(dimBaselineBase.origin.x, dimBaselineBase.origin.y);
        ctx.lineTo(dimGenericPreview.x, dimGenericPreview.y);
        ctx.stroke();
        ctx.restore();
    }
}

function renderDimensionPropertiesHtml(dim) {
    if (!dim) return '';
    var measured = typeof formatDimensionMeasuredLabel === 'function'
        ? formatDimensionMeasuredLabel(dim) : formatDimensionLabel(dim);
    var display = formatDimensionLabel(dim);
    var isAligned = dim.type === 'dimaligned';
    var titleMap = {
        dimaligned: 'Dimaligned', dimradius: 'Đo bán kính', dimdiameter: 'Đo đường kính',
        dimangular: 'Đo góc', dimlinear: 'Dimlinear'
    };
    var title = titleMap[dim.type] || 'Dimlinear';
    var oriMap = {
        dimaligned: 'Theo cạnh (aligned)', dimradius: 'Bán kính (R)',
        dimdiameter: 'Đường kính (⌀)', dimangular: 'Góc (°)'
    };
    var ori = oriMap[dim.type]
        || (dim.orientation === 'vertical' ? 'Dọc (vertical)' : 'Ngang (horizontal)');
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
window.beginDimcontinueTool = beginDimcontinueTool;
window.handleDimcontinueClick = handleDimcontinueClick;
window.beginDimbaselineTool = beginDimbaselineTool;
window.handleDimbaselineClick = handleDimbaselineClick;
window.setDimBaselineBase = setDimBaselineBase;
window.beginDimangularTool = beginDimangularTool;
window.handleDimangularClick = handleDimangularClick;
window.beginDimCircularTool = beginDimCircularTool;
window.handleDimCircularClick = handleDimCircularClick;
window.findCircleRoomAt = findCircleRoomAt;
window.cancelDimAngularSession = cancelDimAngularSession;
window.updateDimGenericPreview = updateDimGenericPreview;
window.drawDimGenericPreview = drawDimGenericPreview;
window.setDimContinueBase = setDimContinueBase;
window.renderDimensionPropertiesHtml = renderDimensionPropertiesHtml;
window.formatDimensionLabel = formatDimensionLabel;
window.formatDimensionMeasuredLabel = formatDimensionMeasuredLabel;
