// ============================================================
// QRS.JS - Logic QR Code (Mốc định vị)
// ============================================================

const QR_SIZE = 14; // Kích thước hiển thị trên canvas

// Tạo QR mới
function createQr(x, y) {
    var serial = 'QR-' + String(nextQrId).padStart(3, '0');
    var qr = {
        id: nextQrId++,
        name: 'Mốc QR ' + (qrs.length + 1),
        serial: serial, // Mã định danh để in ra giấy
        layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default',
        x: x,           // QR thường không snap để đặt chính xác vị trí dán
        y: y
    };
    qrs.push(qr);
    return qr;
}

// Tìm QR tại vị trí click
function findQrAt(wx, wy) {
    var threshold = QR_SIZE / zoom;
    for (var i = qrs.length - 1; i >= 0; i--) {
        var q = qrs[i];
        if (typeof legacyIsObjectVisible === 'function' && !legacyIsObjectVisible(q)) continue;
        if (Math.abs(wx - q.x) <= threshold && Math.abs(wy - q.y) <= threshold) {
            return q;
        }
    }
    return null;
}

// Vẽ mốc QR lên canvas — delegate QrRenderer
function drawQr(qr, isSelected) {
    var options = { qrSize: QR_SIZE };
    if (window.EditorCore && EditorCore.QrRenderer) {
        EditorCore.QrRenderer.renderQr(ctx, { zoom: zoom }, qr, isSelected, options);
        return;
    }
    if (window.EditorCore && EditorCore.RenderingEngine) {
        EditorCore.RenderingEngine.renderQr(ctx, { zoom: zoom }, qr, isSelected, options);
    }
}

// Xóa QR
function deleteQr(qr) {
    qrs = qrs.filter(function (q) { return q.id !== qr.id; });
}

// Hàm sinh mã QR thực tế (Dùng thư viện qrcode.js)
function generateQrImage(qr, callback) {
    if (typeof QRCode === 'undefined') {
        console.error('Lỗi: Thư viện QRCode chưa được tải!');
        return;
    }

    // Định dạng chuỗi: MAP_NAV|BUILDING_ID|FLOOR|X|Y|SERIAL
    // App Android sẽ parse chuỗi này để định vị
    var bId = urlParams.get('buildingId') || 'unknown';
    var floor = document.getElementById('floorSelect').value;
    var qrContent = `MAP_NAV|${bId}|${floor}|${Math.round(qr.x)}|${Math.round(qr.y)}|${qr.serial}`;

    QRCode.toDataURL(qrContent, {
        width: 300,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    }, function (err, url) {
        if (err) console.error(err);
        callback(url);
    });
}
