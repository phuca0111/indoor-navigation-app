// ============================================================
// EXPLODE-TOOL.JS — Lệnh Explode (X): phá đối tượng ghép thành nguyên thủy
//   • Block Insert  → các đối tượng gốc (phòng/tường/đường/cửa/POI)
//   • Polyline line  (≥3 đỉnh) → các đoạn thẳng 2 điểm
//   • Polyline wall  (≥3 đỉnh) → các đoạn tường 2 điểm
// Cung (arc) và đoạn 2 điểm không phá (giữ nguyên như AutoCAD).
// ============================================================

function getExplodeBM() {
    return (typeof EditorCore !== 'undefined' && EditorCore.BlockManager) ? EditorCore.BlockManager : null;
}

function getExplodeGE() {
    return (typeof EditorCore !== 'undefined' && EditorCore.GeometryEngine) ? EditorCore.GeometryEngine : null;
}

/** Gán id mới + layer cho entity world rồi push vào mảng tương ứng. */
function pushExplodedEntity(type, data, layerId) {
    if (!data) return null;
    data.layerId = data.layerId || layerId || 'default';
    if (type === 'room') {
        data.id = (typeof nextRoomId !== 'undefined') ? nextRoomId++ : Date.now();
        if (typeof applyDefaultRoomLabelStyle === 'function') applyDefaultRoomLabelStyle(data);
        rooms.push(data);
    } else if (type === 'wall') {
        data.id = (typeof nextWallId !== 'undefined') ? nextWallId++ : Date.now();
        if (data.lineStyle == null) data.lineStyle = 'solid';
        walls.push(data);
    } else if (type === 'line') {
        data.id = (typeof nextLineId !== 'undefined') ? nextLineId++ : Date.now();
        if (data.lineWeight == null) data.lineWeight = 2;
        if (data.lineStyle == null) data.lineStyle = 'solid';
        lines.push(data);
    } else if (type === 'door') {
        data.id = (typeof nextDoorId !== 'undefined') ? nextDoorId++ : Date.now();
        doors.push(data);
    } else if (type === 'poi') {
        data.id = (typeof nextPoiId !== 'undefined') ? nextPoiId++ : Date.now();
        pois.push(data);
    } else {
        return null;
    }
    return data;
}

/** Phá 1 block insert → nguyên thủy. Trả về số đối tượng tạo ra. */
function explodeInsertObject(inst) {
    var BM = getExplodeBM();
    if (!BM || !inst) return 0;
    var def = (typeof findBlockDefinition === 'function') ? findBlockDefinition(inst.blockId) : null;
    if (!def || !def.entities || !def.entities.length) return 0;
    var parts = BM.explodeInsert(def, inst);
    var made = 0;
    parts.forEach(function (part) {
        if (pushExplodedEntity(part.type, part.data, inst.layerId)) made++;
    });
    blockInserts = blockInserts.filter(function (b) { return b.id !== inst.id; });
    return made;
}

/** Phá polyline (line hoặc wall) ≥3 đỉnh thành các đoạn 2 điểm. */
function explodePolylineObject(obj, kind) {
    var GE = getExplodeGE();
    if (!GE || !obj || !Array.isArray(obj.points) || obj.points.length < 3) return 0;
    if (kind === 'line' && obj.type === 'arc') return 0; // cung: không phá
    var segs = GE.explodePolyline(obj.points, false);
    if (segs.length < 2) return 0;
    segs.forEach(function (seg) {
        var data;
        if (kind === 'wall') {
            data = {
                type: 'segment',
                is_outer: !!obj.is_outer,
                thickness: obj.thickness || 4,
                lineStyle: obj.lineStyle || 'solid',
                points: [seg.a, seg.b]
            };
        } else {
            data = {
                type: 'segment',
                color: obj.color || '#3b82f6',
                lineWeight: obj.lineWeight || 2,
                lineStyle: obj.lineStyle || 'solid',
                points: [seg.a, seg.b]
            };
        }
        pushExplodedEntity(kind, data, obj.layerId);
    });
    if (kind === 'wall') {
        walls = walls.filter(function (w) { return w.id !== obj.id; });
    } else {
        lines = lines.filter(function (ln) { return ln.id !== obj.id; });
    }
    return segs.length;
}

/** Xử lý click tool Explode: chọn đối tượng tại điểm và phá. */
function handleExplodeClick(wx, wy) {
    var made = 0;
    var label = '';

    var inst = (typeof findBlockInsertAt === 'function') ? findBlockInsertAt(wx, wy) : null;
    if (inst) {
        if (typeof saveState === 'function') saveState();
        made = explodeInsertObject(inst);
        label = 'block';
    } else {
        var ln = (typeof findLineAt === 'function') ? findLineAt(wx, wy) : null;
        if (ln && ln.type === 'arc') {
            if (typeof showToast === 'function') showToast('Cung tròn không thể phá', 'error');
            return;
        }
        if (ln && ln.points && ln.points.length >= 3) {
            if (typeof saveState === 'function') saveState();
            made = explodePolylineObject(ln, 'line');
            label = 'đường';
        } else {
            var w = (typeof findWallAt === 'function') ? findWallAt(wx, wy) : null;
            if (w && w.points && w.points.length >= 3) {
                if (typeof saveState === 'function') saveState();
                made = explodePolylineObject(w, 'wall');
                label = 'tường';
            }
        }
    }

    if (made > 0) {
        if (typeof clearEditorSelection === 'function') clearEditorSelection({ skipUi: true });
        if (typeof selectedRoom !== 'undefined') selectedRoom = null;
        if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
        if (typeof updateObjectList === 'function') updateObjectList();
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
        if (typeof draw === 'function') draw();
        if (typeof showToast === 'function') showToast('Đã phá ' + label + ' → ' + made + ' đối tượng', 'success');
    } else {
        if (typeof showToast === 'function') {
            showToast('Không có gì để phá tại đây (chỉ block hoặc polyline ≥3 đỉnh)', 'error');
        }
    }
}

window.explodeInsertObject = explodeInsertObject;
window.explodePolylineObject = explodePolylineObject;
window.handleExplodeClick = handleExplodeClick;
