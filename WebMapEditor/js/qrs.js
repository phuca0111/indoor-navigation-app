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

// Vẽ mốc QR lên canvas
function drawQr(qr, isSelected) {
    var size = QR_SIZE / zoom;
    
    ctx.save();
    
    // Vẽ bóng đổ nhẹ
    ctx.shadowBlur = 4 / zoom;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';

    // Vẽ hình vuông nền (Màu cam đặc trưng cho QR)
    ctx.fillStyle = isSelected ? '#f39c12' : '#e67e22';
    ctx.beginPath();
    ctx.roundRect(qr.x - size, qr.y - size, size * 2, size * 2, 4 / zoom);
    ctx.fill();
    
    // Vẽ viền
    ctx.strokeStyle = isSelected ? '#e74c3c' : '#d35400';
    ctx.lineWidth = isSelected ? 2.5 / zoom : 1.5 / zoom;
    ctx.stroke();

    // Vẽ biểu tượng QR giả lập (3 ô vuông nhỏ ở góc)
    ctx.fillStyle = 'white';
    var dotSize = size * 0.4;
    ctx.fillRect(qr.x - size + 2/zoom, qr.y - size + 2/zoom, dotSize, dotSize);
    ctx.fillRect(qr.x + size - dotSize - 2/zoom, qr.y - size + 2/zoom, dotSize, dotSize);
    ctx.fillRect(qr.x - size + 2/zoom, qr.y + size - dotSize - 2/zoom, dotSize, dotSize);
    
    ctx.restore();

    // Vẽ mã Serial bên dưới
    var labelSize = Math.max(7, 9 / zoom);
    ctx.font = 'bold ' + labelSize + 'px Arial';
    ctx.fillStyle = isSelected ? '#e74c3c' : '#555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(qr.serial, qr.x, qr.y + size + 2 / zoom);
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
