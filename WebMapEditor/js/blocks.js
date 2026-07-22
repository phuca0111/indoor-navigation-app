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
    // Gom đối tượng: ưu tiên tập chọn nhiều (selectionSet — Đợt 3), fallback chọn đơn
    var rawItems = [];
    if (Array.isArray(window.selectionSet) && window.selectionSet.length) {
        rawItems = window.selectionSet.map(function (s) {
            return { type: s.type, data: s.data };
        });
    } else if (selectedObject && selectedObject.data && selectedObject.type) {
        if (selectedObject.type === 'blockRef') {
            if (typeof showToast === 'function') {
                showToast('Chọn đối tượng gốc (cửa/POI/đường…), không phải Insert', 'error');
            }
            return false;
        }
        rawItems = [{ type: selectedObject.type, data: selectedObject.data }];
    } else if (selectedRoom) {
        rawItems = [{ type: 'room', data: selectedRoom }];
    }

    var items = BM.filterInsertableItems(rawItems);
    if (!items.length) {
        if (typeof showToast === 'function') {
            showToast('Chọn ≥1 đối tượng (phòng/tường/đường/cửa/POI) rồi bấm Block (B)', 'error');
        }
        return false;
    }

    var firstData = items[0].data;
    var defaultName = (firstData.name ? String(firstData.name) : items[0].type) + '_block';
    var name = prompt('Tên block (vd WC, Cua_chinh) — gồm ' + items.length + ' đối tượng:', defaultName);
    if (name == null) return false;
    name = String(name).trim();
    if (!name) {
        if (typeof showToast === 'function') showToast('Tên block không hợp lệ', 'error');
        return false;
    }

    var box = BM.selectionBBox(items);
    if (!box) return false;
    var baseX = box.minX;
    var baseY = box.minY;

    var def = BM.createDefinition(name, items, {
        id: 'blk_' + (nextBlockDefId++),
        baseX: baseX,
        baseY: baseY
    });
    if (!def) return false;

    saveState();
    blocks.push(def);
    items.forEach(function (it) { removeSourceObject(it.type, it.data); });
    if (typeof msClear === 'function') { try { msClear(); } catch (e) { /* noop */ } }

    var inst = BM.createInsert(def.id, baseX, baseY, {
        id: nextBlockInsertId++,
        name: name,
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default',
        def: def
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

// ---- Block palette (thư viện block) — thay cho prompt chọn số ----

function buildBlockPaletteHtml(summaries) {
    if (!summaries || !summaries.length) {
        return '<p class="block-palette-empty">Chưa có block nào. Chọn đối tượng rồi bấm <b>Block (B)</b> để tạo.</p>';
    }
    return summaries.map(function (s) {
        return '<div class="block-palette-item" data-block-id="' + escapeHtmlValue(String(s.id)) + '">' +
            '<div class="block-palette-info">' +
            '<span class="block-palette-name">' + escapeHtmlValue(s.name) + '</span>' +
            '<span class="block-palette-count">' + s.count + ' đối tượng</span>' +
            '</div>' +
            '<div class="block-palette-actions">' +
            '<button type="button" class="btn btn-sm btn-primary" data-block-insert="' + escapeHtmlValue(String(s.id)) + '">Chèn</button>' +
            '<button type="button" class="btn btn-sm btn-outline" data-block-delete="' + escapeHtmlValue(String(s.id)) + '" title="Xóa khỏi thư viện">✕</button>' +
            '</div></div>';
    }).join('');
}
window.buildBlockPaletteHtml = buildBlockPaletteHtml;

function closeBlockPalette() {
    var ov = document.getElementById('blockPaletteOverlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
}
window.closeBlockPalette = closeBlockPalette;

function openBlockPalette() {
    var BM = getBlockManager();
    if (!BM) return false;
    closeBlockPalette();
    var summaries = BM.summarizeForPalette(blocks);

    var ov = document.createElement('div');
    ov.id = 'blockPaletteOverlay';
    ov.className = 'block-palette-overlay';
    ov.innerHTML =
        '<div class="block-palette-panel" role="dialog" aria-label="Thư viện block">' +
        '<div class="block-palette-header"><span>Thư viện Block (' + summaries.length + ')</span>' +
        '<button type="button" class="block-palette-close" aria-label="Đóng">✕</button></div>' +
        '<div class="block-palette-list">' + buildBlockPaletteHtml(summaries) + '</div>' +
        '<p class="hint-text">Click «Chèn» rồi click trên map để đặt block. Esc để hủy.</p>' +
        '</div>';
    document.body.appendChild(ov);

    ov.addEventListener('click', function (e) {
        var insId = e.target && e.target.getAttribute && e.target.getAttribute('data-block-insert');
        var delId = e.target && e.target.getAttribute && e.target.getAttribute('data-block-delete');
        if (insId) { choosePaletteBlock(insId); return; }
        if (delId) { deleteBlockDefinition(delId); openBlockPalette(); return; }
        if (e.target === ov || (e.target.classList && e.target.classList.contains('block-palette-close'))) {
            closeBlockPalette();
            if (window.pendingInsertBlockId == null && currentTool === 'insert' && typeof selectTool === 'function') {
                selectTool('select');
            }
        }
    });
    return true;
}
window.openBlockPalette = openBlockPalette;

function choosePaletteBlock(id) {
    var def = findBlockDefinition(id);
    if (!def) {
        if (typeof showToast === 'function') showToast('Không tìm thấy block', 'error');
        return false;
    }
    window.pendingInsertBlockId = id;
    currentTool = 'insert';
    if (typeof updateCursor === 'function') updateCursor();
    closeBlockPalette();
    var hint = document.getElementById('commandHint');
    if (hint) hint.textContent = 'Insert «' + def.name + '»: click điểm chèn (Esc hủy)';
    if (typeof showToast === 'function') {
        showToast('Click trên map để chèn «' + def.name + '»', 'success');
    }
    if (typeof draw === 'function') draw();
    return true;
}
window.choosePaletteBlock = choosePaletteBlock;

function deleteBlockDefinition(id) {
    var def = findBlockDefinition(id);
    if (!def) return false;
    saveState();
    blocks = blocks.filter(function (b) { return String(b.id) !== String(id); });
    blockInserts = blockInserts.filter(function (ins) { return String(ins.blockId) !== String(id); });
    if (typeof updateObjectList === 'function') updateObjectList();
    if (typeof draw === 'function') draw();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') showToast('Đã xóa block «' + def.name + '»', 'success');
    return true;
}
window.deleteBlockDefinition = deleteBlockDefinition;

function beginInsertTool() {
    if (!blocks.length) {
        if (typeof showToast === 'function') showToast('Chưa có block — chọn đối tượng rồi Block (B)', 'error');
        if (typeof selectTool === 'function') selectTool('select');
        return false;
    }
    openBlockPalette();
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
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default',
        def: def
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
    var had = false;
    if (document.getElementById('blockPaletteOverlay')) { closeBlockPalette(); had = true; }
    if (window.pendingInsertBlockId) {
        window.pendingInsertBlockId = null;
        var hint = document.getElementById('commandHint');
        if (hint) hint.textContent = '';
        had = true;
    }
    return had;
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
        // Nhãn thuộc tính (ATT) — toạ độ local trên definition
        if (BM.resolveInsertAttributes && BM.localToWorld) {
            var resolved = BM.resolveInsertAttributes(def, inst);
            var fontPx = 11 / zoom;
            ctx.font = fontPx + 'px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = selected ? '#e11d48' : '#475569';
            resolved.forEach(function (a) {
                if (!a.visible || !a.value) return;
                var wp = BM.localToWorld(a.x, a.y, inst);
                var label = a.value;
                ctx.fillText(label, wp.x + 4 / zoom, wp.y);
            });
        }
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
    var BM = getBlockManager();
    var def = findBlockDefinition(inst.blockId);
    var defName = def ? def.name : '(thiếu định nghĩa)';
    var html = '<div class="prop-group">' +
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

    // ATTEdit — giá trị thuộc tính trên Insert
    var resolved = (BM && BM.resolveInsertAttributes)
        ? BM.resolveInsertAttributes(def, inst)
        : [];
    html += '<div class="prop-group">' +
        '<div class="prop-group-title">Thuộc tính (ATTEdit)</div>';
    if (!resolved.length) {
        html += '<p class="hint-text">Chưa có thuộc tính. Dùng <b>ATT</b> để định nghĩa trên block.</p>';
    } else {
        resolved.forEach(function (a) {
            html += '<div class="prop-row"><label title="' + escapeHtmlValue(a.tag) + '">' +
                escapeHtmlValue(a.prompt || a.tag) + ':</label>' +
                '<input type="text" value="' + escapeHtmlValue(a.value) + '" ' +
                'onchange="updateBlockInsertAttr(\'' + escapeHtmlValue(a.tag) + '\', this.value)"></div>';
        });
    }
    html += '<div class="prop-row" style="gap:6px;flex-wrap:wrap;">' +
        '<button type="button" class="btn btn-sm btn-outline" onclick="runAttdefOnSelected()">+ ATTDef</button>' +
        '<button type="button" class="btn btn-sm btn-outline" onclick="runAtteditPrompt()">ATE sửa nhanh</button>' +
        '</div></div>';
    return html;
}
window.renderBlockRefPropertiesHtml = renderBlockRefPropertiesHtml;

function updateBlockInsertAttr(tag, value) {
    if (!selectedObject || selectedObject.type !== 'blockRef' || !selectedObject.data) return;
    var BM = getBlockManager();
    if (!BM) return;
    if (typeof saveState === 'function') saveState();
    BM.setInsertAttrValue(selectedObject.data, tag, value);
    if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
    if (typeof draw === 'function') draw();
}
window.updateBlockInsertAttr = updateBlockInsertAttr;

/**
 * ATTDef (ATT): thêm thuộc tính vào định nghĩa block của Insert đang chọn.
 */
function runAttdefOnSelected() {
    var BM = getBlockManager();
    if (!BM) {
        if (typeof showToast === 'function') showToast('BlockManager chưa sẵn sàng', 'error');
        return false;
    }
    if (!selectedObject || selectedObject.type !== 'blockRef' || !selectedObject.data) {
        if (typeof showToast === 'function') showToast('ATTDef: chọn 1 Insert block trước', 'error');
        return false;
    }
    var inst = selectedObject.data;
    var def = findBlockDefinition(inst.blockId);
    if (!def) {
        if (typeof showToast === 'function') showToast('Không tìm thấy định nghĩa block', 'error');
        return false;
    }
    var tag = prompt('ATTDef — Tag thuộc tính (vd NAME, CODE, QR):', 'NAME');
    if (tag == null) return false;
    tag = BM.normalizeAttrTag(tag);
    if (!tag) {
        if (typeof showToast === 'function') showToast('Tag không hợp lệ', 'error');
        return false;
    }
    var promptText = prompt('Nhãn hiển thị (prompt):', tag);
    if (promptText == null) return false;
    var defVal = prompt('Giá trị mặc định:', '');
    if (defVal == null) return false;

    if (typeof saveState === 'function') saveState();
    var added = BM.addAttributeDef(def, {
        tag: tag,
        prompt: String(promptText).trim() || tag,
        defaultValue: String(defVal),
        x: 0,
        y: -14 - ((def.attributes && def.attributes.length) || 0) * 12
    });
    if (!added) {
        if (typeof showToast === 'function') showToast('Không thêm được thuộc tính', 'error');
        return false;
    }
    // Đồng bộ mọi Insert cùng block: gắn default nếu chưa có giá trị
    (blockInserts || []).forEach(function (bi) {
        if (String(bi.blockId) !== String(def.id)) return;
        BM.initInsertAttrValues(def, bi);
        if (bi === inst) BM.setInsertAttrValue(bi, tag, defVal);
    });
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof draw === 'function') draw();
    if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
    if (typeof showToast === 'function') {
        showToast('Đã thêm thuộc tính «' + tag + '» vào block «' + def.name + '»', 'success');
    }
    return true;
}
window.runAttdefOnSelected = runAttdefOnSelected;

/**
 * ATTEdit (ATE): sửa nhanh từng thuộc tính qua prompt (hoặc dùng panel).
 */
function runAtteditPrompt() {
    var BM = getBlockManager();
    if (!BM) return false;
    if (!selectedObject || selectedObject.type !== 'blockRef' || !selectedObject.data) {
        if (typeof showToast === 'function') showToast('ATTEdit: chọn 1 Insert block trước', 'error');
        return false;
    }
    var inst = selectedObject.data;
    var def = findBlockDefinition(inst.blockId);
    var resolved = BM.resolveInsertAttributes(def, inst);
    if (!resolved.length) {
        if (typeof showToast === 'function') showToast('Block chưa có thuộc tính — dùng ATT trước', 'error');
        return false;
    }
    if (typeof saveState === 'function') saveState();
    var changed = 0;
    for (var i = 0; i < resolved.length; i++) {
        var a = resolved[i];
        var nv = prompt(a.prompt + ' [' + a.tag + ']:', a.value);
        if (nv == null) continue;
        BM.setInsertAttrValue(inst, a.tag, nv);
        changed++;
    }
    if (changed) {
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof draw === 'function') draw();
        if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
        if (typeof showToast === 'function') showToast('Đã cập nhật ' + changed + ' thuộc tính', 'success');
    }
    return changed > 0;
}
window.runAtteditPrompt = runAtteditPrompt;

function beginAttdefTool() {
    if (typeof runAttdefOnSelected === 'function') runAttdefOnSelected();
}
window.beginAttdefTool = beginAttdefTool;

function beginAtteditTool() {
    if (typeof runAtteditPrompt === 'function') runAtteditPrompt();
}
window.beginAtteditTool = beginAtteditTool;
