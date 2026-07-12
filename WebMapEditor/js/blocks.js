// ============================================================
// BLOCKS.JS — UI Block (B) + Insert (I)
// State: blocks / blockInserts / nextBlock* nằm trong state.js
// ============================================================

/** Khi tool insert: id định nghĩa đang chờ click chèn */
window.pendingInsertBlockId = null;

function getBlockManager() {
    return (window.EditorCore && EditorCore.BlockManager) ? EditorCore.BlockManager : null;
}

function findBlockDefinition(blockId) {
    var BM = getBlockManager();
    return BM ? BM.findDefinition(blocks, blockId) : null;
}

function findBlockInsertAt(wx, wy) {
    var BM = getBlockManager();
    if (!BM || !blockInserts.length) return null;
    var pad = 6 / (typeof zoom === 'number' ? zoom : 1);
    for (var i = blockInserts.length - 1; i >= 0; i--) {
        var inst = blockInserts[i];
        if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(inst)) continue;
        var def = BM.findDefinition(blocks, inst.blockId);
        if (BM.hitTestInsert(def, inst, wx, wy, pad)) return inst;
    }
    return null;
}

function removeSourceObject(type, data) {
    if (!data) return;
    if (type === 'room') {
        rooms = rooms.filter(function (r) { return r.id !== data.id; });
    } else if (type === 'wall') {
        walls = walls.filter(function (w) { return w.id !== data.id; });
    } else if (type === 'line') {
        lines = lines.filter(function (ln) { return ln.id !== data.id; });
    } else if (type === 'door') {
        doors = doors.filter(function (d) { return d.id !== data.id; });
    } else if (type === 'poi') {
        pois = pois.filter(function (p) { return p.id !== data.id; });
    }
}

/**
 * Block từ đối tượng đang chọn → thư viện + thay bằng 1 Insert tại gốc.
 */
function createBlockFromSelection() {
    var BM = getBlockManager();
    if (!BM) {
        if (typeof showToast === 'function') showToast('BlockManager chưa sẵn sàng', 'error');
        return false;
    }
    var item = null;
    if (selectedObject && selectedObject.data && selectedObject.type) {
        if (selectedObject.type === 'blockRef') {
            if (typeof showToast === 'function') {
                showToast('Chọn đối tượng gốc (cửa/POI/đường…), không phải Insert', 'error');
            }
            return false;
        }
        item = { type: selectedObject.type, data: selectedObject.data };
    } else if (selectedRoom) {
        item = { type: 'room', data: selectedRoom };
    }
    if (!item) {
        if (typeof showToast === 'function') showToast('Chọn 1 đối tượng rồi bấm Block (B)', 'error');
        return false;
    }
    if (['room', 'wall', 'line', 'door', 'poi'].indexOf(item.type) < 0) {
        if (typeof showToast === 'function') showToast('Loại đối tượng chưa hỗ trợ Block', 'error');
        return false;
    }

    var defaultName = (item.data.name ? String(item.data.name) : item.type) + '_block';
    var name = prompt('Tên block (vd WC, Cua_chinh):', defaultName);
    if (name == null) return false;
    name = String(name).trim();
    if (!name) {
        if (typeof showToast === 'function') showToast('Tên block không hợp lệ', 'error');
        return false;
    }

    var box = BM.selectionBBox([item]);
    if (!box) return false;
    var baseX = box.minX;
    var baseY = box.minY;

    var def = BM.createDefinition(name, [item], {
        id: 'blk_' + (nextBlockDefId++),
        baseX: baseX,
        baseY: baseY
    });
    if (!def) return false;

    saveState();
    blocks.push(def);
    removeSourceObject(item.type, item.data);

    var inst = BM.createInsert(def.id, baseX, baseY, {
        id: nextBlockInsertId++,
        name: name,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default'
    });
    blockInserts.push(inst);
    clearEditorSelection({ skipUi: true });
    setEditorSelection('blockRef', inst);
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    draw();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') {
        showToast('Đã tạo block «' + name + '» — dùng Insert (I) để chèn thêm', 'success');
    }
    return true;
}
window.createBlockFromSelection = createBlockFromSelection;

function pickBlockIdForInsert() {
    if (!blocks.length) {
        if (typeof showToast === 'function') showToast('Chưa có block — chọn đối tượng rồi Block (B)', 'error');
        return null;
    }
    if (blocks.length === 1) return blocks[0].id;
    var list = blocks.map(function (b, i) {
        return (i + 1) + '. ' + b.name + ' (' + b.id + ')';
    }).join('\n');
    var ans = prompt('Chọn block để chèn (số thứ tự):\n' + list, '1');
    if (ans == null) return null;
    var n = parseInt(String(ans).trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > blocks.length) {
        if (typeof showToast === 'function') showToast('Số không hợp lệ', 'error');
        return null;
    }
    return blocks[n - 1].id;
}

function beginInsertTool() {
    var id = pickBlockIdForInsert();
    if (!id) {
        window.pendingInsertBlockId = null;
        if (typeof selectTool === 'function') selectTool('select');
        return false;
    }
    window.pendingInsertBlockId = id;
    var def = findBlockDefinition(id);
    var hint = document.getElementById('commandHint');
    if (hint) hint.textContent = 'Insert «' + ((def && def.name) || id) + '»: click điểm chèn (Esc hủy)';
    if (typeof showToast === 'function') {
        showToast('Click trên map để chèn «' + ((def && def.name) || id) + '»', 'success');
    }
    return true;
}
window.beginInsertTool = beginInsertTool;

function placeBlockInsertAt(wx, wy) {
    var BM = getBlockManager();
    var blockId = window.pendingInsertBlockId;
    if (!BM || !blockId) return false;
    var def = BM.findDefinition(blocks, blockId);
    if (!def) {
        if (typeof showToast === 'function') showToast('Không tìm thấy định nghĩa block', 'error');
        return false;
    }
    saveState();
    var inst = BM.createInsert(blockId, wx, wy, {
        id: nextBlockInsertId++,
        name: def.name,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default'
    });
    blockInserts.push(inst);
    window.pendingInsertBlockId = null;
    setEditorSelection('blockRef', inst);
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    draw();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') showToast('Đã chèn «' + def.name + '»', 'success');
    if (typeof selectTool === 'function') selectTool('select');
    return true;
}
window.placeBlockInsertAt = placeBlockInsertAt;

function cancelPendingInsert() {
    if (window.pendingInsertBlockId) {
        window.pendingInsertBlockId = null;
        var hint = document.getElementById('commandHint');
        if (hint) hint.textContent = '';
        return true;
    }
    return false;
}
window.cancelPendingInsert = cancelPendingInsert;

function drawBlockInserts() {
    if (!ctx || !blockInserts.length) return;
    var BM = getBlockManager();
    if (!BM) return;
    blockInserts.forEach(function (inst) {
        if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(inst)) return;
        var def = BM.findDefinition(blocks, inst.blockId);
        if (!def || !def.entities) return;
        var selected = selectedObject && selectedObject.type === 'blockRef' && selectedObject.data === inst;
        def.entities.forEach(function (ent) {
            var world = BM.worldEntityFromLocal(ent.type, ent.data, inst);
            if (ent.type === 'room' && typeof drawRoom === 'function') {
                drawRoom(world, selected);
            } else if (ent.type === 'wall' && typeof drawWall === 'function') {
                drawWall(world, selected);
            } else if (ent.type === 'line' && typeof drawLineSegment === 'function') {
                drawLineSegment(world, selected);
            } else if (ent.type === 'door' && typeof drawDoor === 'function') {
                drawDoor(world, selected);
            } else if (ent.type === 'poi' && typeof drawPoi === 'function') {
                drawPoi(world, selected);
            }
        });
        ctx.save();
        ctx.strokeStyle = selected ? '#e11d48' : '#64748b';
        ctx.fillStyle = selected ? 'rgba(225,29,72,0.25)' : 'rgba(100,116,139,0.2)';
        ctx.lineWidth = 1.5 / zoom;
        var r = 5 / zoom;
        ctx.beginPath();
        ctx.arc(inst.x, inst.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        if (selected) {
            var box = BM.insertBBox(def, inst);
            if (box) {
                ctx.save();
                ctx.strokeStyle = '#e11d48';
                ctx.setLineDash([4 / zoom, 3 / zoom]);
                ctx.lineWidth = 1 / zoom;
                ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
                ctx.restore();
            }
        }
    });
}
window.drawBlockInserts = drawBlockInserts;

function deleteBlockInsert(inst) {
    if (!inst) return;
    blockInserts = blockInserts.filter(function (b) { return b.id !== inst.id; });
}
window.deleteBlockInsert = deleteBlockInsert;

function renderBlockRefPropertiesHtml(inst) {
    if (!inst) return '';
    var def = findBlockDefinition(inst.blockId);
    var defName = def ? def.name : '(thiếu định nghĩa)';
    return '<div class="prop-group">' +
        '<div class="prop-group-title">Block Insert</div>' +
        '<div class="prop-row"><label>Tên:</label>' +
        '<input type="text" value="' + escapeHtmlValue(inst.name || '') + '" ' +
        'onchange="updateObjProp(\'name\', this.value)"></div>' +
        '<div class="prop-row"><label>Block:</label><span>' + escapeHtmlValue(defName) + '</span></div>' +
        '<div class="prop-row"><label>X:</label>' +
        '<input type="number" value="' + Math.round(inst.x) + '" ' +
        'onchange="updateObjProp(\'x\', Number(this.value))"></div>' +
        '<div class="prop-row"><label>Y:</label>' +
        '<input type="number" value="' + Math.round(inst.y) + '" ' +
        'onchange="updateObjProp(\'y\', Number(this.value))"></div>' +
        '<div class="prop-row"><label>Xoay:</label>' +
        '<input type="number" id="blkRot" value="' + (inst.rotation || 0) + '" step="1" style="width:64px">' +
        '<span class="unit">°</span>' +
        '<button class="btn btn-sm btn-outline" type="button" ' +
        'onclick="updateObjProp(\'rotation\', Number(document.getElementById(\'blkRot\').value))">Áp dụng</button></div>' +
        '<div class="prop-row"><label>Scale:</label>' +
        '<input type="number" value="' + (inst.scale != null ? inst.scale : 1) + '" step="0.1" min="0.1" style="width:64px" ' +
        'onchange="updateObjProp(\'scale\', Number(this.value))"></div>' +
        '<p class="hint-text">Thư viện: ' + blocks.length + ' block · Insert: ' + blockInserts.length + '</p>' +
        '</div>';
}
window.renderBlockRefPropertiesHtml = renderBlockRefPropertiesHtml;
