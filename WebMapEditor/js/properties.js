// ============================================================
// PROPERTIES.JS - Panel thuộc tính & Danh sách đối tượng
// ============================================================

const roomTypes = ['Văn phòng', 'Nhà vệ sinh', 'Thang máy', 'Cầu thang', 'Sảnh chờ', 'Phòng kỹ thuật', 'Phòng chức năng', 'Khác'];

// === CẬP NHẬT PANEL THUỘC TÍNH ===
function updatePropertiesPanel() {
    if (!propertiesDiv) return;

    // Không có gì được chọn
    if (!selectedObject && !selectedRoom) {
        propertiesDiv.innerHTML = '<p class="hint-text">Chọn một đối tượng để xem thuộc tính</p>';
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
        '<button onclick="deleteSelected()" style="width:100%;padding:6px;background:#e74c3c;color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>';
}

function updateWallProp(prop, value) {
    if (!selectedObject || selectedObject.type !== 'wall') return;
    saveState();
    selectedObject.data[prop] = value;
    draw();
}

// --- PHÒNG ---
function showRoomProps(r) {
    var wm = pixelsToMeters(r.width).toFixed(1);
    var hm = pixelsToMeters(r.height).toFixed(1);
    var area = (pixelsToMeters(r.width) * pixelsToMeters(r.height)).toFixed(1);

    var typeOptions = '';
    roomTypes.forEach(function (t) {
        var sel = (r.type === t) ? ' selected' : '';
        typeOptions += '<option' + sel + '>' + t + '</option>';
    });

    propertiesDiv.innerHTML =
        '<div class="prop-group">' +
        '<div class="prop-group-title">Phòng #' + r.id + '</div>' +
        '<div class="prop-row"><label>Tên:</label>' +
        '<input type="text" value="' + r.name + '" onchange="updateRoomProp(\'name\', this.value)"></div>' +
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
        '<input type="text" value="' + d.name + '" onchange="updateObjProp(\'name\', this.value)"></div>' +
        '<div class="prop-row"><label>Loại:</label>' +
        '<select onchange="updateObjProp(\'type\', this.value)">' + typeOptions + '</select></div>' +
        '<div class="prop-row"><label>Ngang:</label>' +
        '<input type="number" value="' + d.width + '" onchange="updateObjProp(\'width\', Number(this.value))"><span class="unit">px</span></div>' +
        '<div class="prop-row"><label>Xoay:</label>' +
        '<select onchange="updateObjProp(\'rotation\', Number(this.value))">' +
        '<option value="0"' + (d.rotation === 0 ? ' selected' : '') + '>Ngang (0°)</option>' +
        '<option value="90"' + (d.rotation === 90 ? ' selected' : '') + '>Dọc (90°)</option>' +
        '</select></div>' +
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
        '<input type="text" value="' + p.name + '" onchange="updateObjProp(\'name\', this.value)"></div>' +
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
        (window.pathNodes || []).map(function(n) {
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
        var typeInfo = poiTypes[poi.typeIndex];
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
