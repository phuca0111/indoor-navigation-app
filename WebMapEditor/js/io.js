// ============================================================
// IO.JS - Export/Import JSON & Snapshots
// ============================================================

// === LẤY DỮ LIỆU HIỆN TẠI (SNAPSHOT) ===
function getMapSnapshot() {
    var mapNameEl = document.getElementById('mapName');
    var mapName = (mapNameEl && mapNameEl.value) ? mapNameEl.value : 'Bản đồ mới';
    function withLayer(obj, base) {
        base.layerId = (obj && obj.layerId != null) ? obj.layerId : 'default';
        return base;
    }
    var activeLayerId = (typeof legacyGetActiveLayerId === 'function')
        ? legacyGetActiveLayerId()
        : 'default';
    return {
        mapName: mapName,
        metersPerGrid: metersPerGrid,
        layers: (typeof getLayersSnapshot === 'function') ? getLayersSnapshot() : [],
        activeLayerId: activeLayerId,
        rooms: rooms.map(function (r) {
            var item = withLayer(r, {
                id: r.id, name: r.name, shape: r.shape || 'rect',
                type: r.type || 'Văn phòng', color: r.color,
                labelRotation: Number.isFinite(r.labelRotation) ? r.labelRotation : 0,
                labelFontSize: Number.isFinite(r.labelFontSize) ? r.labelFontSize : 14,
                labelAutoScale: typeof r.labelAutoScale === 'boolean' ? r.labelAutoScale : true,
                labelLineHeight: Number.isFinite(r.labelLineHeight) ? r.labelLineHeight : 1.2,
                x: Math.round(r.x), y: Math.round(r.y),
                width: Math.round(r.width), height: Math.round(r.height),
                widthMeters: parseFloat(pixelsToMeters(r.width).toFixed(1)),
                heightMeters: parseFloat(pixelsToMeters(r.height).toFixed(1))
            });
            if (r.shape === 'polygon' && r.points) item.points = r.points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
            else if (r.shape === 'circle') { item.cx = Math.round(r.cx); item.cy = Math.round(r.cy); item.radius = Math.round(r.radius); }
            return item;
        }),
        doors: doors.map(d => withLayer(d, { id: d.id, name: d.name, x: Math.round(d.x), y: Math.round(d.y), width: d.width, type: d.type, rotation: d.rotation })),
        pois: pois.map(p => withLayer(p, { id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y), type: p.type, typeIndex: p.typeIndex })),
        pathNodes: pathNodes.map(n => withLayer(n, { id: n.id, nodeType: n.nodeType || 'normal', x: Math.round(n.x), y: Math.round(n.y), neighbors: n.neighbors })),
        pathEdges: pathEdges,
        walls: walls.map(w => withLayer(w, {
            id: w.id,
            type: w.type || 'segment',
            thickness: w.thickness || 4,
            is_outer: !!w.is_outer,
            points: Array.isArray(w.points) ? w.points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })) : []
        })),
        lines: (lines || []).map(function (ln) {
            return withLayer(ln, {
                id: ln.id,
                type: ln.type || 'segment',
                color: ln.color || '#3b82f6',
                lineWeight: ln.lineWeight || 2,
                points: Array.isArray(ln.points) ? ln.points.map(function (p) {
                    return { x: Math.round(p.x), y: Math.round(p.y) };
                }) : []
            });
        }),
        qrs: qrs.map(q => withLayer(q, { id: q.id, name: q.name, serial: q.serial, x: Math.round(q.x), y: Math.round(q.y), node_id: q.node_id != null ? q.node_id : null })),
        blocks: (blocks || []).map(function (b) {
            return JSON.parse(JSON.stringify(b));
        }),
        blockInserts: (blockInserts || []).map(function (bi) {
            return withLayer(bi, {
                id: bi.id,
                blockId: bi.blockId,
                name: bi.name,
                x: Math.round(bi.x),
                y: Math.round(bi.y),
                rotation: bi.rotation || 0,
                scale: bi.scale != null ? bi.scale : 1
            });
        }),
        // Ảnh nền
        bgX: window.bgX || 0,
        bgY: window.bgY || 0,
        bgScale: window.bgScale || 1.0,
        bgRotation: window.bgRotation || 0,
        bgOpacity: window.bgOpacity || 0.5,
        bgImageBase64: window.bgImageBase64 || ''
    };
}

// === ĐỔ DỮ LIỆU VÀO EDITOR ===
function applyMapSnapshot(data) {
    if (!data) return;
    if (data.mapName) document.getElementById('mapName').value = data.mapName;
    if (data.metersPerGrid) {
        metersPerGrid = data.metersPerGrid;
        document.getElementById('scaleInput').value = metersPerGrid;
    }

    rooms = data.rooms || [];
    rooms.forEach(function (r) { applyDefaultRoomLabelStyle(r); });
    nextRoomId = 1; rooms.forEach(r => { if (r.id >= nextRoomId) nextRoomId = r.id + 1; });

    doors = data.doors || [];
    nextDoorId = 1; doors.forEach(d => { if (d.id >= nextDoorId) nextDoorId = d.id + 1; });

    pois = data.pois || [];
    nextPoiId = 1; pois.forEach(p => { if (p.id >= nextPoiId) nextPoiId = p.id + 1; });

    pathNodes = data.pathNodes || [];
    pathEdges = data.pathEdges || [];
    nextNodeId = 1; pathNodes.forEach(n => { if (n.id >= nextNodeId) nextNodeId = n.id + 1; });

    walls = data.walls || [];
    nextWallId = 1; walls.forEach(w => { if (w.id && w.id >= nextWallId) nextWallId = w.id + 1; });

    lines = data.lines || [];
    nextLineId = 1; lines.forEach(function (ln) { if (ln.id && ln.id >= nextLineId) nextLineId = ln.id + 1; });

    qrs = data.qrs || [];
    nextQrId = 1; qrs.forEach(q => { if (q.id >= nextQrId) nextQrId = q.id + 1; });

    // Block library + inserts (luôn gán từ snapshot)
    blocks = Array.isArray(data.blocks) ? data.blocks : [];
    blockInserts = Array.isArray(data.blockInserts) ? data.blockInserts : [];
    nextBlockDefId = 1;
    blocks.forEach(function (b) {
        var m = String(b.id || '').match(/blk_(\d+)/);
        if (m) {
            var n = parseInt(m[1], 10);
            if (n >= nextBlockDefId) nextBlockDefId = n + 1;
        }
    });
    nextBlockInsertId = 1;
    blockInserts.forEach(function (bi) {
        if (bi.id && bi.id >= nextBlockInsertId) nextBlockInsertId = bi.id + 1;
    });

    if (typeof applyLayersSnapshot === 'function') {
        applyLayersSnapshot(data.layers, data.activeLayerId);
    }

    // Load ảnh nền
    window.bgX = data.bgX || 0;
    window.bgY = data.bgY || 0;
    window.bgScale = data.bgScale || 1.0;
    window.bgRotation = data.bgRotation || 0;
    window.bgOpacity = data.bgOpacity || 0.5;
    window.bgImageBase64 = data.bgImageBase64 || '';
    
    if (window.bgImageBase64) {
        var img = new Image();
        img.onload = function() {
            window.bgImage = img;
            draw();
        };
        img.src = window.bgImageBase64;
    } else {
        window.bgImage = null;
    }

    roomCountSpan.textContent = 'Phòng: ' + rooms.length;
    updatePropertiesPanel();
    updateObjectList();
    draw();
}

// === EXPORT JSON ===
function exportJSON() {
    console.log("💾 [V3] Đang thực hiện Export bản đồ với hỗ trợ Đa giác & Hình tròn...");
    var mapName = document.getElementById('mapName').value || 'Bản đồ mới';

    var data = {
        mapName: mapName,
        metersPerGrid: metersPerGrid,
        rooms: rooms.map(function (r) {
            var exportItem = {
                id: r.id,
                name: r.name,
                shape: r.shape || 'rect', // Lưu loại hình dạng
                labelRotation: Number.isFinite(r.labelRotation) ? r.labelRotation : 0,
                labelFontSize: Number.isFinite(r.labelFontSize) ? r.labelFontSize : 14,
                labelAutoScale: typeof r.labelAutoScale === 'boolean' ? r.labelAutoScale : true,
                labelLineHeight: Number.isFinite(r.labelLineHeight) ? r.labelLineHeight : 1.2,
                x: Math.round(r.x),
                y: Math.round(r.y),
                width: Math.round(r.width),
                height: Math.round(r.height),
                type: r.type || 'Văn phòng', // Thêm loại phòng
                color: r.color,
                // Tính toán mét để hiển thị (không bắt buộc nhưng nên có)
                widthMeters: parseFloat(pixelsToMeters(r.width).toFixed(1)),
                heightMeters: parseFloat(pixelsToMeters(r.height).toFixed(1))
            };

            // Nếu là Đa giác -> Lưu danh sách các điểm chóp
            if (r.shape === 'polygon' && r.points) {
                exportItem.points = r.points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
            }
            // Nếu là Hình tròn -> Lưu tâm và bán kính
            else if (r.shape === 'circle') {
                exportItem.cx = Math.round(r.cx);
                exportItem.cy = Math.round(r.cy);
                exportItem.radius = Math.round(r.radius);
            }

            return exportItem;
        }),
        doors: doors.map(function (d) {
            return {
                id: d.id,
                name: d.name,
                x: Math.round(d.x),
                y: Math.round(d.y),
                width: d.width,
                type: d.type,
                rotation: d.rotation
            };
        }),
        pois: pois.map(function (p) {
            return {
                id: p.id,
                name: p.name,
                x: Math.round(p.x),
                y: Math.round(p.y),
                type: p.type,
                typeIndex: p.typeIndex
            };
        }),
        pathNodes: pathNodes.map(function (n) {
            return {
                id: n.id,
                nodeType: n.nodeType || 'normal', // Lưu loại node
                x: Math.round(n.x),
                y: Math.round(n.y),
                neighbors: n.neighbors
            };
        }),
        pathEdges: pathEdges,
        walls: walls.map(function (w) {
            return {
                id: w.id,
                type: w.type || 'segment',
                thickness: w.thickness || 4,
                is_outer: !!w.is_outer,
                points: (w.points || []).map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y) }; })
            };
        }),
        qrs: qrs.map(function (q) {
            return {
                id: q.id,
                name: q.name,
                serial: q.serial,
                x: Math.round(q.x),
                y: Math.round(q.y)
            };
        }),
        blocks: (typeof blocks !== 'undefined' ? blocks : []).map(function (b) {
            return JSON.parse(JSON.stringify(b));
        }),
        blockInserts: (typeof blockInserts !== 'undefined' ? blockInserts : []).map(function (bi) {
            return {
                id: bi.id,
                blockId: bi.blockId,
                name: bi.name,
                x: Math.round(bi.x),
                y: Math.round(bi.y),
                rotation: bi.rotation || 0,
                scale: bi.scale != null ? bi.scale : 1,
                layerId: bi.layerId || 'default'
            };
        }),
        bgX: window.bgX,
        bgY: window.bgY,
        bgScale: window.bgScale,
        bgRotation: window.bgRotation,
        bgOpacity: window.bgOpacity,
        bgImageBase64: window.bgImageBase64
    };

    // Download file
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = mapName.replace(/\s+/g, '_') + '.json';
    a.click();
    URL.revokeObjectURL(url);

    console.log('💾 Đã export: ' + a.download);
}

// === IMPORT JSON ===
function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
        try {
            var data = JSON.parse(e.target.result);

            // Load map name
            if (data.mapName) {
                document.getElementById('mapName').value = data.mapName;
            }
            if (data.metersPerGrid) {
                metersPerGrid = data.metersPerGrid;
                document.getElementById('scaleInput').value = metersPerGrid;
            }

            // Load rooms
            rooms = data.rooms || [];
            nextRoomId = 1;
            rooms.forEach(function (r) {
                applyDefaultRoomLabelStyle(r);
                if (r.id >= nextRoomId) nextRoomId = r.id + 1;
            });

            // Load doors
            doors = data.doors || [];
            nextDoorId = 1;
            doors.forEach(function (d) {
                if (d.id >= nextDoorId) nextDoorId = d.id + 1;
            });

            // Load POIs
            pois = data.pois || [];
            nextPoiId = 1;
            pois.forEach(function (p) {
                if (p.id >= nextPoiId) nextPoiId = p.id + 1;
            });

            // Load path
            pathNodes = data.pathNodes || [];
            pathEdges = data.pathEdges || [];
            nextNodeId = 1;
            pathNodes.forEach(function (n) {
                if (!n.nodeType) n.nodeType = 'normal'; // Fix dữ liệu cũ
                if (n.id >= nextNodeId) nextNodeId = n.id + 1;
            });

            // Load walls
            walls = data.walls || [];
            nextWallId = 1;
            walls.forEach(function (w, index) {
                if (!w.id || isNaN(w.id)) w.id = index + 1;
                if (w.id >= nextWallId) nextWallId = w.id + 1;
            });
            
            // Load QR Codes
            qrs = data.qrs || [];
            nextQrId = 1;
            qrs.forEach(function (q) {
                if (q.id >= nextQrId) nextQrId = q.id + 1;
            });
            
            // Load background properties
            window.bgX = data.bgX || 0;
            window.bgY = data.bgY || 0;
            window.bgScale = data.bgScale || 1.0;
            window.bgRotation = data.bgRotation || 0;
            window.bgOpacity = data.bgOpacity || 0.5;
            window.bgImageBase64 = data.bgImageBase64 || '';
            
            if (window.bgImageBase64) {
                var img = new Image();
                img.onload = function() {
                    window.bgImage = img;
                    draw();
                };
                img.src = window.bgImageBase64;
            } else {
                window.bgImage = null;
            }

            clearEditorSelection({ skipUi: true });

            // Redraw
            roomCountSpan.textContent = 'Phòng: ' + rooms.length;
            updatePropertiesPanel();
            updateObjectList();
            draw();

            // Reset history
            undoStack = [];
            redoStack = [];

            console.log('📂 Đã import: ' + (data.mapName || 'file'));
        } catch (err) {
            alert('Lỗi đọc file JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
}

// === EXPORT IMAGE (PNG) KHÔNG NỀN ===
function exportImage() {
    var mapName = document.getElementById('mapName').value || 'Mat_bang';

    // Lưu các trạng thái hiển thị hiện tại
    var oldBg = bgImage;
    var oldGrid = document.getElementById('gridCheck').checked;
    var oldSelection = selectedRoom;
    var oldObjSelection = selectedObject;

    // Tạm thời tắt ảnh nền, lưới, và bỏ chọn đối tượng để xuất ảnh sạch
    bgImage = null;
    document.getElementById('gridCheck').checked = false;
    selectedRoom = null;
    selectedObject = null;

    // Vẽ lại canvas sạch (chỉ có phòng, cửa, POI, đường đi)
    draw();

    // Lấy data URL của canvas
    var dataURL = canvas.toDataURL('image/png');

    // Khôi phục lại trạng thái
    bgImage = oldBg;
    document.getElementById('gridCheck').checked = oldGrid;
    selectedRoom = oldSelection;
    selectedObject = oldObjSelection;
    draw();

    // Tạo link tải
    var a = document.createElement('a');
    a.href = dataURL;
    a.download = mapName.replace(/\s+/g, '_') + '.png';
    a.click();

    console.log('🖼️ Đã xuất ảnh: ' + a.download);
}
