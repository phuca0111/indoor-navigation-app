// ============================================================
// PROPERTIES.JS - Panel thuộc tính & Danh sách đối tượng
// ============================================================

const roomTypes = ['Văn phòng', 'Nhà vệ sinh', 'Thang máy', 'Cầu thang', 'Sảnh chờ', 'Phòng kỹ thuật', 'Phòng chức năng', 'Khác'];

function escapeHtmlValue(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// === CẬP NHẬT PANEL THUỘC TÍNH ===
function updatePropertiesPanel() {
    if (!propertiesDiv) return;

    // Không có gì được chọn -> Hiện hướng dẫn công cụ
    if (!selectedObject && !selectedRoom) {
        if (currentTool === 'path') {
            propertiesDiv.innerHTML = `
                <div class="tool-guide">
                    <p>💡 <b>Vẽ Đường đi (Path):</b></p>
                    <p>- Click vào Node để bắt đầu nối.</p>
                    <p>- Click tiếp vào Node khác để tạo đường.</p>
                    <p>- Click <b>Chuột phải</b> để ngắt chuỗi.</p>
                </div>`;
        } else if (currentTool === 'wall') {
            propertiesDiv.innerHTML = `
                <div class="tool-guide">
                    <p>💡 <b>Vẽ Tường (Wall):</b></p>
                    <p>- Click điểm đầu để bắt đầu.</p>
                    <p>- Click tiếp để tạo các đoạn nối tiếp.</p>
                    <p>- Nhấn phím <b>ESC</b> để ngắt chuỗi.</p>
                </div>`;
        } else {
            var bgHtml = '';
            if (window.bgImage) {
                bgHtml = `
                <div class="prop-group">
                    <div class="prop-group-title">🖼️ Cài đặt Ảnh nền</div>
                    <div class="prop-row">
                        <label>Hiệu chỉnh:</label>
                        <button class="btn btn-sm ${currentTool === 'bg-adjust' ? 'btn-primary' : 'btn-outline'}" 
                                onclick="selectTool(currentTool === 'bg-adjust' ? 'select' : 'bg-adjust')">
                            ${currentTool === 'bg-adjust' ? '📍 Đang chỉnh' : '🖱️ Bật kéo thả'}
                        </button>
                    </div>
                    <div class="prop-row">
                        <label>Vị trí X:</label>
                        <input type="number" value="${Math.round(window.bgX)}" oninput="updateBgProp('bgX', Number(this.value))">
                    </div>
                    <div class="prop-row">
                        <label>Vị trí Y:</label>
                        <input type="number" value="${Math.round(window.bgY)}" oninput="updateBgProp('bgY', Number(this.value))">
                    </div>
                    <div class="prop-row">
                        <label>Tỉ lệ:</label>
                        <input type="number" step="0.01" value="${window.bgScale.toFixed(2)}" oninput="updateBgProp('bgScale', Number(this.value))">
                    </div>
                    <div class="prop-row">
                        <label>Xoay:</label>
                        <div style="flex:1; display:flex; align-items:center; gap:8px;">
                            <input type="range" min="0" max="360" value="${window.bgRotation || 0}" 
                                   oninput="this.nextElementSibling.value = this.value; updateBgProp('bgRotation', Number(this.value))" 
                                   style="flex:1;">
                            <input type="number" value="${window.bgRotation || 0}" 
                                   oninput="this.previousElementSibling.value = this.value; updateBgProp('bgRotation', Number(this.value))" 
                                   style="width:50px;">
                            <span class="unit">°</span>
                        </div>
                    </div>
                    <div class="prop-row">
                        <label>Độ mờ:</label>
                        <input type="range" min="0" max="1" step="0.1" value="${window.bgOpacity}" oninput="updateBgProp('bgOpacity', Number(this.value))">
                    </div>
                    <p class="hint-text">💡 Bật "Kéo thả" để di chuyển ảnh trực tiếp trên Canvas.</p>
                </div>`;
            }
            propertiesDiv.innerHTML = bgHtml + '<p class="hint-text">Chọn một đối tượng để xem thuộc tính hoặc chọn công cụ để bắt đầu vẽ</p>';
        }
        return;
    }

    // Xác định loại đối tượng
    var obj = selectedObject;
    if (!obj && selectedRoom) {
        obj = { type: 'room', data: selectedRoom };
    }

    if (obj.type === 'room') showRoomProps(obj.data);
    else if (obj.type === 'door') showDoorProps(obj.data);
    else if (obj.type === 'wall') showWallProps(obj.data);
    else if (obj.type === 'poi') showPoiProps(obj.data);
    else if (obj.type === 'qr') showQrProps(obj.data);
    else if (obj.type === 'node') showNodeProps(obj.data);
}

// --- TƯỜNG ---
function showWallProps(w) {
    propertiesDiv.innerHTML =
        '<div class="prop-group">' +
        '<div class="prop-group-title">🧱 Tường #' + w.id + '</div>' +
        '<div class="prop-row"><label>Độ dày:</label>' +
        '<input type="number" min="1" max="20" value="' + (w.thickness || 4) + '" onchange="updateWallProp(\'thickness\', Number(this.value))"><span class="unit">px</span></div>' +
        '<div class="prop-row"><label>Tường bao:</label>' +
        '<select onchange="updateWallProp(\'is_outer\', this.value === \'true\')">' +
        '<option value="false"' + (!w.is_outer ? ' selected' : '') + '>Không</option>' +
        '<option value="true"' + (w.is_outer ? ' selected' : '') + '>Có</option>' +
        '</select></div>' +
        '<div class="prop-row"><label>Số điểm:</label><div class="prop-val">' + ((w.points || []).length) + '</div></div>' +
        '</div>' +
        '<div class="prop-group">' +
        '<div class="prop-group-title">Kích thước</div>' +
        '<div class="prop-row"><label>Chiều dài:</label>' +
        '<input type="number" step="0.01" value="' + calcWallLength(w) + '" onchange="updateWallLength(Number(this.value))"><span class="unit">m</span></div>' +
        '</div>' +
        '<div class="prop-group">' +
        '<div class="prop-group-title">🔗 Nối tiếp tới Tường khác</div>' +
        '<div class="prop-row">' +
        '<label>Tới ID:</label>' +
        '<div style="display:flex;gap:4px;flex:1;">' +
        '<input type="number" id="manualWallTarget" placeholder="ID..." style="width:50px;flex:1;">' +
        '<button class="btn btn-sm btn-primary" onclick="addManualWallEdge(' + w.id + ')">+ Nối</button>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

// Hàm nối tường thủ công qua ID
function addManualWallEdge(fromId) {
    var targetInput = document.getElementById('manualWallTarget');
    var targetId = parseInt(targetInput.value);

    if (isNaN(targetId)) {
        if (typeof showToast === 'function') showToast('Vui lòng nhập ID tường hợp lệ', 'error');
        return;
    }

    if (fromId === targetId) {
        if (typeof showToast === 'function') showToast('Không thể nối tới chính nó', 'error');
        return;
    }

    // Tìm 2 đối tượng tường
    var wallA = walls.find(function (w) { return w.id === fromId; });
    var wallB = walls.find(function (w) { return w.id === targetId; });

    if (wallA && wallB) {
        saveState();
        // Lấy điểm cuối của tường A và điểm đầu của tường B
        var pointA = wallA.points[wallA.points.length - 1];
        var pointB = wallB.points[0];

        // Tạo đoạn tường mới nối 2 điểm này
        createWallSegment(pointA, pointB, { thickness: wallA.thickness, is_outer: wallA.is_outer });

        updatePropertiesPanel();
        updateObjectList();
        draw();
        if (typeof showToast === 'function') showToast('Đã nối Tường #' + fromId + ' ➜ #' + targetId, 'success');
    } else {
        if (typeof showToast === 'function') showToast('Không tìm thấy Tường #' + targetId, 'error');
    }
}

// Tính chiều dài tường (mét)
function calcWallLength(w) {
    if (!w || !w.points || w.points.length < 2) return 0;
    var p1 = w.points[0];
    var p2 = w.points[w.points.length - 1];
    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    var distPx = Math.sqrt(dx * dx + dy * dy);
    return pixelsToMeters(distPx).toFixed(2);
}

// Cập nhật chiều dài tường
function updateWallLength(newLenMeters) {
    if (!selectedObject || selectedObject.type !== 'wall') return;
    var w = selectedObject.data;
    if (!w.points || w.points.length < 2) return;

    var newLenPx = metersToPixels(newLenMeters);
    if (newLenPx < 1) return;

    saveState();
    var p1 = w.points[0];
    var p2 = w.points[w.points.length - 1];

    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    var currentLenPx = Math.sqrt(dx * dx + dy * dy);

    if (currentLenPx === 0) {
        w.points[w.points.length - 1].x = p1.x + newLenPx;
    } else {
        var ratio = newLenPx / currentLenPx;
        w.points[w.points.length - 1].x = p1.x + dx * ratio;
        w.points[w.points.length - 1].y = p1.y + dy * ratio;
    }

    draw();
}

function updateWallProp(prop, value) {
    if (!selectedObject || selectedObject.type !== 'wall') return;
    saveState();
    selectedObject.data[prop] = value;
    draw();
}

// --- PHÒNG ---
function showRoomProps(r) {
    applyDefaultRoomLabelStyle(r);
    var wm = pixelsToMeters(r.width).toFixed(1);
    var hm = pixelsToMeters(r.height).toFixed(1);
    var area = (pixelsToMeters(r.width) * pixelsToMeters(r.height)).toFixed(1);
    var safeName = escapeHtmlValue(r.name);

    var typeOptions = '';
    roomTypes.forEach(function (t) {
        var sel = (r.type === t) ? ' selected' : '';
        typeOptions += '<option' + sel + '>' + t + '</option>';
    });

    propertiesDiv.innerHTML =
        '<div class="prop-group">' +
        '<div class="prop-group-title">Phòng #' + r.id + '</div>' +
        '<div class="prop-row"><label>Tên:</label>' +
        '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">' +
        '<textarea id="roomNameInput" rows="3" style="resize:vertical;min-height:56px;width:100%;" oninput="updateRoomProp(\'name\', this.value)">' + safeName + '</textarea>' +
        '<button class="btn btn-sm btn-primary" style="align-self:flex-end;padding:2px 10px;" onclick="updatePropertiesPanel()">Lưu tên</button></div></div>' +
        '<div class="prop-row"><label>Loại:</label>' +
        '<select onchange="updateRoomProp(\'type\', this.value)">' + typeOptions + '</select></div>' +
        '<div class="prop-row"><label>Màu:</label>' +
        '<input type="color" value="' + rgbToHex(r.color) + '" onchange="updateRoomProp(\'color\', this.value)"></div>' +
        '<div class="prop-row"><label>Vị trí X:</label>' +
        '<input type="number" value="' + Math.round(r.x) + '" onchange="updateRoomProp(\'x\', Number(this.value))"><span class="unit">px</span></div>' +
        '<div class="prop-row"><label>Vị trí Y:</label>' +
        '<input type="number" value="' + Math.round(r.y) + '" onchange="updateRoomProp(\'y\', Number(this.value))"><span class="unit">px</span></div>' +
        '</div>' +
        '<div class="prop-group">' +
        '<div class="prop-group-title">Kích thước</div>' +
        '<div class="prop-row"><label>Ngang:</label>' +
        '<input type="number" value="' + wm + '" step="0.1" onchange="updateRoomProp(\'width\', metersToPixels(Number(this.value)))"><span class="unit">m</span></div>' +
        '<div class="prop-row"><label>Dọc:</label>' +
        '<input type="number" value="' + hm + '" step="0.1" onchange="updateRoomProp(\'height\', metersToPixels(Number(this.value)))"><span class="unit">m</span></div>' +
        '<div class="prop-row"><label>S:</label><input type="text" value="' + area + '" disabled style="background:#f0f0e0"><span class="unit">m²</span></div>' +
        '</div>' +
        '<div class="prop-group">' +
        '<div class="prop-group-title">Hiển thị chữ</div>' +
        '<div class="prop-row"><label>Xoay chữ:</label>' +
        '<input type="number" min="-180" max="180" step="1" value="' + Math.round(r.labelRotation) + '" onchange="updateRoomProp(\'labelRotation\', Number(this.value))"><span class="unit">°</span></div>' +
        '<div class="prop-row"><label>Cỡ chữ:</label>' +
        '<input type="number" min="8" max="96" step="1" value="' + Math.round(r.labelFontSize) + '" onchange="updateRoomProp(\'labelFontSize\', Number(this.value))"><span class="unit">px</span></div>' +
        '<div class="prop-row"><label>Giãn dòng:</label>' +
        '<input type="number" min="1" max="2.5" step="0.1" value="' + Number(r.labelLineHeight).toFixed(1) + '" onchange="updateRoomProp(\'labelLineHeight\', Number(this.value))"><span class="unit">x</span></div>' +
        '<div class="prop-row"><label>Tự co giãn:</label>' +
        '<input type="checkbox" ' + (r.labelAutoScale ? 'checked' : '') + ' onchange="updateRoomProp(\'labelAutoScale\', this.checked)"></div>' +
        '<p class="hint-text">Mẹo: nhập nhiều dòng bằng Enter trong ô Tên.</p>' +
        '</div>' +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

// --- CỬA ---
function showDoorProps(d) {
    var typeOptions = '';
    for (var i = 0; i < doorTypes.length; i++) {
        var sel = (d.type === doorTypes[i]) ? ' selected' : '';
        typeOptions += '<option' + sel + '>' + doorTypes[i] + '</option>';
    }

    propertiesDiv.innerHTML =
        '<div class="prop-group">' +
        '<div class="prop-group-title">🚪 Cửa #' + d.id + '</div>' +
        '<div class="prop-row"><label>Tên:</label>' +
        '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">' +
        '<input type="text" value="' + d.name + '" oninput="updateObjProp(\'name\', this.value)" style="width:100%;">' +
        '<button class="btn btn-sm btn-primary" style="align-self:flex-end;padding:2px 10px;" onclick="updatePropertiesPanel()">Lưu tên</button></div></div>' +
        '<div class="prop-row"><label>Loại:</label>' +
        '<select onchange="updateObjProp(\'type\', this.value)">' + typeOptions + '</select></div>' +
        '<div class="prop-row"><label>Ngang:</label>' +
        '<input type="number" value="' + d.width + '" onchange="updateObjProp(\'width\', Number(this.value))"><span class="unit">px</span></div>' +
        '<div class="prop-row"><label>Xoay:</label>' +
        '<input type="number" min="0" max="360" step="1" value="' + (d.rotation || 0) + '" onchange="updateObjProp(\'rotation\', Number(this.value))"><span class="unit">°</span></div>' +
        '</div>' +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

// --- POI ---
function showPoiProps(p) {
    var typeOptions = '';
    for (var i = 0; i < poiTypes.length; i++) {
        var sel = (p.typeIndex === i) ? ' selected' : '';
        typeOptions += '<option value="' + i + '"' + sel + '>' + poiTypes[i].icon + ' ' + poiTypes[i].name + '</option>';
    }

    propertiesDiv.innerHTML =
        '<div class="prop-group">' +
        '<div class="prop-group-title">📍 POI #' + p.id + '</div>' +
        '<div class="prop-row"><label>Tên:</label>' +
        '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">' +
        '<input type="text" value="' + p.name + '" oninput="updateObjProp(\'name\', this.value)" style="width:100%;">' +
        '<button class="btn btn-sm btn-primary" style="align-self:flex-end;padding:2px 10px;" onclick="updatePropertiesPanel()">Lưu tên</button></div></div>' +
        '<div class="prop-row"><label>Loại:</label>' +
        '<select onchange="changePoiType(Number(this.value))">' + typeOptions + '</select></div>' +
        '<div class="prop-row"><label>Tọa độ X:</label>' +
        '<input type="number" value="' + Math.round(p.x) + '" onchange="updateObjProp(\'x\', Number(this.value))"><span class="unit">px</span></div>' +
        '<div class="prop-row"><label>Tọa độ Y:</label>' +
        '<input type="number" value="' + Math.round(p.y) + '" onchange="updateObjProp(\'y\', Number(this.value))"><span class="unit">px</span></div>' +
        '</div>' +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

// --- PATH NODE ---
function showNodeProps(n) {
    var neighborsList = '';
    for (var i = 0; i < n.neighbors.length; i++) {
        var neighborId = n.neighbors[i];
        neighborsList += '<span style="display:inline-block;background:rgba(255,255,255,0.1);padding:2px 8px;margin:2px;border-radius:6px;font-size:0.8rem;white-space:nowrap;">' +
            '#' + neighborId + ' <b onclick="removeEdge(' + n.id + ',' + neighborId + ')" style="color:#ef4444;cursor:pointer;margin-left:4px;" title="Xóa kết nối">×</b></span>';
    }
    if (neighborsList === '') neighborsList = '<span style="color:var(--text-dim)">Chưa nối</span>';

    var typeOptions =
        '<option value="normal"' + (n.nodeType === 'normal' ? ' selected' : '') + '>🔵 Thường</option>' +
        '<option value="elevator"' + (n.nodeType === 'elevator' ? ' selected' : '') + '>🟢 Thang máy</option>' +
        '<option value="stairs"' + (n.nodeType === 'stairs' ? ' selected' : '') + '>🟣 Cầu thang</option>';

    propertiesDiv.innerHTML =
        '<div class="prop-group">' +
        '<div class="prop-group-title">🔵 Node #' + n.id + '</div>' +
        '<div class="prop-row"><label>Loại Node:</label>' +
        '<select onchange="updateNodeProp(\'nodeType\', this.value)">' + typeOptions + '</select></div>' +
        '<div class="prop-row"><label>Tọa độ Y:</label>' +
        '<input type="number" value="' + Math.round(n.y) + '" onchange="updateNodeProp(\'y\', Number(this.value))"><span class="unit">px</span></div>' +
        '<div class="prop-row" style="margin-top:10px;"><label>Nối tới ID:</label>' +
        '<div style="display:flex;gap:4px;flex:1;"><input type="number" id="manualEdgeTarget" placeholder="ID..." style="width:60px;min-width:0;">' +
        '<button onclick="addManualEdge(' + n.id + ')" style="padding:2px 8px;background:var(--accent-primary);color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem;">+ Nối</button></div></div>' +
        '<div class="prop-row"><label>Danh sách kề:</label>' +
        '<div class="prop-val" style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:0.85rem;color:var(--text-dim);min-height:24px;">' + neighborsList + '</div></div>' +
        '</div>' +
        '<p class="hint-text">💡 Dùng tool Path, click 2 node liên tiếp để nối đường. Click chuột phải để ngắt chuỗi.</p>' +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa đối tượng</button>';
}

function updateNodeProp(prop, value) {
    if (!selectedObject || selectedObject.type !== 'node') return;
    saveState();
    selectedObject.data[prop] = value;
    updateObjectList();
    draw();
}

// Thêm kết nối thủ công qua ID
function addManualEdge(fromId) {
    var targetInput = document.getElementById('manualEdgeTarget');
    var targetId = parseInt(targetInput.value);

    if (isNaN(targetId)) {
        if (typeof showToast === 'function') showToast('Vui lòng nhập ID hợp lệ', 'error');
        return;
    }

    if (fromId === targetId) {
        if (typeof showToast === 'function') showToast('Không thể nối tới chính nó', 'error');
        return;
    }

    var nodeA = findNodeById(fromId);
    var nodeB = findNodeById(targetId);

    if (nodeA && nodeB) {
        saveState();
        connectNodes(nodeA, nodeB);
        updatePropertiesPanel();
        draw();
        if (typeof showToast === 'function') showToast('Đã nối #' + fromId + ' ↔ #' + targetId, 'success');
    } else {
        if (typeof showToast === 'function') showToast('Không tìm thấy Node #' + targetId, 'error');
    }
}

// --- THUỘC TÍNH QR CODE ---
function showQrProps(qr) {
    // Tạo danh sách dropdown từ tất cả pathNodes hiện có
    var nodeOptions = '<option value="">-- Không gán Node --</option>' +
        (window.pathNodes || []).map(function (n) {
            var selected = (qr.node_id === n.nodeId) ? ' selected' : '';
            return '<option value="' + n.nodeId + '"' + selected + '>' +
                n.nodeId + ' (' + Math.round(n.x) + ',' + Math.round(n.y) + ')' +
                '</option>';
        }).join('');

    propertiesDiv.innerHTML =
        '<div class="prop-group">' +
        '<div class="prop-group-title">🔳 Mốc QR #' + qr.id + '</div>' +
        '<div class="prop-row"><label>Tên:</label>' +
        '<input type="text" value="' + qr.name + '" onchange="updateQrProp(\'name\', this.value)"></div>' +
        '<div class="prop-row"><label>Mã Serial:</label>' +
        '<input type="text" value="' + qr.serial + '" onchange="updateQrProp(\'serial\', this.value)"></div>' +
        '<div class="prop-row"><label>🔗 Gán Node:</label>' +
        '<select onchange="updateQrProp(\'node_id\', this.value || null)" ' +
        'style="width:100%;padding:4px;background:#2a2a3e;color:white;border:1px solid #4a4a6a;border-radius:4px;font-size:12px;">' +
        nodeOptions +
        '</select></div>' +
        '<div style="font-size:10px;color:#888;padding:2px 0 6px 0;"> ← TPF dùng Node này để khởi tạo vị trí khi quét QR</div>' +
        '<div class="prop-row"><label>Tọa độ X:</label>' +
        '<input type="number" value="' + Math.round(qr.x) + '" onchange="updateQrProp(\'x\', Number(this.value))"><span class="unit">px</span></div>' +
        '<div class="prop-row"><label>Tọa độ Y:</label>' +
        '<input type="number" value="' + Math.round(qr.y) + '" onchange="updateQrProp(\'y\', Number(this.value))"><span class="unit">px</span></div>' +
        '</div>' +
        '<div class="prop-group">' +
        '<div class="prop-group-title">Ảnh mã QR để in</div>' +
        '<div id="qrImageContainer" style="text-align:center; padding:10px; background:white; border-radius:4px; margin-bottom:10px;">' +
        '   <p style="font-size:11px; color:#7f8c8d;">Đang tạo mã...</p>' +
        '</div>' +
        '<button id="btnDownloadQr" class="btn-primary" style="width:100%; padding:8px; display:none;">💾 Tải ảnh QR (.png)</button>' +
        '</div>' +
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa đối tượng</button>';

    // Sinh ảnh QR
    if (typeof generateQrImage === 'function') {
        generateQrImage(qr, function (url) {
            var container = document.getElementById('qrImageContainer');
            var btn = document.getElementById('btnDownloadQr');
            if (container) {
                container.innerHTML = '<img src="' + url + '" style="width:100%; max-width:150px; height:auto; display:block; margin:0 auto;">';
            }
            if (btn) {
                btn.style.display = 'block';
                btn.onclick = function () {
                    var link = document.createElement('a');
                    link.download = 'QR_' + qr.serial + '.png';
                    link.href = url;
                    link.click();
                };
            }
        });
    }
}

function updateQrProp(key, val) {
    if (!selectedObject || selectedObject.type !== 'qr') return;
    saveState();
    selectedObject.data[key] = val;
    updateObjectList();
    draw();
}

// === CẬP NHẬT THUỘC TÍNH ===
function updateRoomProp(prop, value) {
    if (!selectedRoom) return;
    applyDefaultRoomLabelStyle(selectedRoom);
    if (prop === 'labelRotation') {
        value = Number.isFinite(value) ? Math.max(-180, Math.min(180, value)) : 0;
    } else if (prop === 'labelFontSize') {
        value = Number.isFinite(value) ? Math.max(8, Math.min(96, value)) : 14;
    } else if (prop === 'labelLineHeight') {
        value = Number.isFinite(value) ? Math.max(1, Math.min(2.5, value)) : 1.2;
    } else if (prop === 'labelAutoScale') {
        value = !!value;
    }
    saveState();
    selectedRoom[prop] = value;
    if (prop === 'name') updateObjectList();
    draw();
}

function updateObjProp(prop, value) {
    if (!selectedObject) return;
    saveState();
    selectedObject.data[prop] = value;
    if (prop === 'name') updateObjectList();
    draw();
}

function changePoiType(index) {
    if (!selectedObject || selectedObject.type !== 'poi') return;
    saveState();
    selectedObject.data.typeIndex = index;
    selectedObject.data.type = poiTypes[index].name;
    updateObjectList();
    draw();
}

// === XÓA ĐỐI TƯỢNG ĐANG CHỌN ===
function deleteSelected() {
    if (!selectedObject && !selectedRoom) return;

    if (!confirm('Bạn có chắc chắn muốn xóa đối tượng này không?')) {
        return;
    }

    if (selectedObject) {
        saveState();
        var type = selectedObject.type;
        var data = selectedObject.data;

        if (type === 'room') {
            rooms = rooms.filter(function (r) { return r.id !== data.id; });
            selectedRoom = null;
        } else if (type === 'door') {
            deleteDoor(data);
        } else if (type === 'wall') {
            deleteWall(data);
        } else if (type === 'poi') {
            deletePoi(data);
        } else if (type === 'qr') {
            deleteQr(data);
        } else if (type === 'node') {
            deleteNode(data);
        }

        selectedObject = null;
    } else if (selectedRoom) {
        saveState();
        rooms = rooms.filter(function (r) { return r.id !== selectedRoom.id; });
        selectedRoom = null;
    }

    if (roomCountSpan) roomCountSpan.textContent = rooms.length + ' Phòng';
    updatePropertiesPanel();
    updateObjectList();
    draw();
}

// === DANH SÁCH TẤT CẢ ĐỐI TƯỢNG ===
function updateObjectList() {
    if (!objectListDiv) return;
    objectListDiv.innerHTML = '';

    var totalItems = rooms.length + doors.length + pois.length + pathNodes.length + (walls ? walls.length : 0);
    if (totalItems === 0) {
        objectListDiv.innerHTML = '<p class="hint-text">Chưa có đối tượng</p>';
        return;
    }

    // Phòng
    rooms.forEach(function (room) {
        var isActive = (selectedObject && selectedObject.type === 'room' && selectedObject.data === room) || (selectedRoom === room);
        addListItem('⬛', room.name, pixelsToMeters(room.width).toFixed(1) + '×' + pixelsToMeters(room.height).toFixed(1) + 'm', room.color, isActive, function () {
            selectedRoom = room;
            selectedObject = { type: 'room', data: room };
            updatePropertiesPanel();
            updateObjectList();
            draw();
        });
    });

    // Cửa
    doors.forEach(function (door) {
        var isActive = (selectedObject && selectedObject.type === 'door' && selectedObject.data === door);
        addListItem('🚪', door.name, door.type, '#e67e22', isActive, function () {
            selectedRoom = null;
            selectedObject = { type: 'door', data: door };
            updatePropertiesPanel();
            updateObjectList();
            draw();
        });
    });

    // Tường
    walls.forEach(function (wall) {
        var isActive = (selectedObject && selectedObject.type === 'wall' && selectedObject.data === wall);
        addListItem('🧱', 'Tường #' + wall.id, (wall.is_outer ? 'Tường bao' : 'Tường thường'), '#111827', isActive, function () {
            selectedRoom = null;
            selectedObject = { type: 'wall', data: wall };
            updatePropertiesPanel();
            updateObjectList();
            draw();
        });
    });

    pois.forEach(function (poi) {
        // Dữ liệu POI cũ có thể thiếu/sai typeIndex, nên fallback để không crash UI.
        var typeInfo = poiTypes[poi.typeIndex] || poiTypes[0];
        var isActive = (selectedObject && selectedObject.type === 'poi' && selectedObject.data === poi);
        addListItem(typeInfo.icon, poi.name, typeInfo.name, typeInfo.color, isActive, function () {
            selectedRoom = null;
            selectedObject = { type: 'poi', data: poi };
            updatePropertiesPanel();
            updateObjectList();
            draw();
        });
    });

    // QR Code
    qrs.forEach(function (qr) {
        var isActive = (selectedObject && selectedObject.type === 'qr' && selectedObject.data === qr);
        addListItem('🔳', qr.name, qr.serial, '#e67e22', isActive, function () {
            selectedRoom = null;
            selectedObject = { type: 'qr', data: qr };
            updatePropertiesPanel();
            updateObjectList();
            draw();
        });
    });

    // Nodes
    pathNodes.forEach(function (node) {
        var isActive = (selectedObject && selectedObject.type === 'node' && selectedObject.data === node);
        addListItem('🔵', 'Node #' + node.id, node.neighbors.length + ' nối', '#3498db', isActive, function () {
            selectedRoom = null;
            selectedObject = { type: 'node', data: node };
            updatePropertiesPanel();
            updateObjectList();
            draw();
        });
    });
}

// Thêm 1 item vào danh sách
function addListItem(icon, name, detail, color, isActive, onClick) {
    var div = document.createElement('div');
    div.className = 'obj-item' + (isActive ? ' selected' : '');
    div.innerHTML =
        '<span class="color-dot" style="background:' + color + '"></span>' +
        '<span>' + icon + ' ' + name + '</span>' +
        '<span style="margin-left:auto;color:#999;font-size:0.7rem">' + detail + '</span>';
    div.addEventListener('click', onClick);
    objectListDiv.appendChild(div);
}

// Cập nhật thuộc tính ảnh nền
window.updateBgProp = function(prop, value) {
    if (prop === 'bgX') window.bgX = value;
    else if (prop === 'bgY') window.bgY = value;
    else if (prop === 'bgScale') {
        if (value > 0) window.bgScale = value;
    }
    else if (prop === 'bgRotation') {
        window.bgRotation = value;
    }
    else if (prop === 'bgOpacity') {
        // Nếu giá trị > 1 (từ thanh trượt 0-100), chia cho 100
        window.bgOpacity = value > 1 ? value / 100 : value;
    }
    
    draw(); // Vẽ lại canvas để cập nhật thay đổi
}
