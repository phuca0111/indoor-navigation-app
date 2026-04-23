// Bắt lỗi toàn cục (Giữ lại để chẩn đoán triệt để)
window.onerror = function(msg, url, line) {
    alert("PHÁT HIỆN LỖI MỚI (V3):\n" + msg + "\nFile: " + url + "\nDòng: " + line);
    return false;
};

// ============================================================
// EDITOR.JS - Entry Point (Khởi tạo)
// ============================================================

// === CÀI ĐẶT TỶ LỆ ===
var scaleInp = document.getElementById('scaleInput');
if (scaleInp) {
    scaleInp.addEventListener('change', function (e) {
        if (!e.target) return;
        var parsed = parseFloat(e.target.value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            parsed = 0.5;
            alert('Tỷ lệ không hợp lệ. Hệ thống đã đặt về mặc định: 1m = 80px (0.50m/ô).');
        }
        metersPerGrid = parsed;
        e.target.value = metersPerGrid.toFixed(2);
        updatePropertiesPanel();
        draw();
    });
}

// === TOGGLE LƯỚI & KÍCH THƯỚC ===
if (document.getElementById('gridCheck')) document.getElementById('gridCheck').addEventListener('change', draw);
if (document.getElementById('dimCheck')) document.getElementById('dimCheck').addEventListener('change', draw);

// === ẢNH NỀN ===
var bImport = document.getElementById('btnImportBg');
if (bImport) {
    bImport.addEventListener('click', function () {
        document.getElementById('bgInput').click();
    });
}

// Upload ảnh → hiện nền
var bInp = document.getElementById('bgInput');
if (bInp) {
    bInp.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function (event) {
            bgImageBase64 = event.target.result;
            var img = new Image();
            img.onload = function () {
                bgImage = img;
                var scaleX = canvas.width / img.width;
                var scaleY = canvas.height / img.height;
                zoom = Math.min(scaleX, scaleY) * 0.9;
                panX = (canvas.width - img.width * zoom) / 2;
                panY = (canvas.height - img.height * zoom) / 2;
                bgOpacity = 0.5;
                
                var bSli = document.getElementById('bgOpacitySlider');
                if (bSli) bSli.value = 50;
                var bVal = document.getElementById('bgOpacityVal');
                if (bVal) bVal.textContent = '50%';
                if (zoomLevelSpan) zoomLevelSpan.textContent = Math.round(zoom * 100) + '%';

                draw();
                detectRoomsFromImage(img);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Xóa ảnh nền
var bRem = document.getElementById('btnRemoveBg');
if (bRem) {
    bRem.addEventListener('click', function () {
        saveState();
        bgImage = null;
        bgImageBase64 = '';
        draw();
    });
}

// Opacity slider
var bSli = document.getElementById('bgOpacitySlider');
if (bSli) {
    bSli.addEventListener('input', function (e) {
        bgOpacity = parseInt(e.target.value) / 100;
        var bVal = document.getElementById('bgOpacityVal');
        if (bVal) bVal.textContent = e.target.value + '%';
        draw();
    });
}

// Nút Lưu/Mở File đã được gán trực tiếp qua onclick trong HTML

        // Không có nút btnExportImg nữa, đã gộp vào logic khác hoặc bỏ qua

        // Không có nút btnLoad nữa, đã gộp vào Mở File trong HTML

// === SERVER SYNC ===
// Nút Publish đã có onclick trong HTML

if (document.getElementById('floorSelect')) {
    document.getElementById('floorSelect').addEventListener('change', function () {
        if (confirm('⚠️ CẢNH BÁO: Chuyển tầng sẽ xóa các thay đổi chưa lưu trên Canvas hiện tại. Bạn có muốn tiếp tục?')) {
            loadMapFromServer();
        }
    });
}

// === RESIZE CANVAS ===
window.addEventListener('resize', resizeCanvas);

// === KHỞI TẠO ===
window.addEventListener('load', function() {
    // Đợi một chút để CSS Layout hoàn tất
    setTimeout(function() {
        resizeCanvas();
        updateObjectList();
        
        // Khởi tạo icon Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        draw();

        // Ưu tiên dữ liệu từ Server cho tòa nhà/tầng hiện tại.
        // Chỉ hỏi khôi phục Auto-save khi tầng đó chưa có map trên Server.
        if (typeof loadMapFromServer === 'function' && window.buildingId) {
            loadMapFromServer()
                .then(function(result) {
                    if (result && result.notFound && typeof checkAutoSave === 'function') {
                        checkAutoSave();
                    }
                })
                .finally(function() {
                    if (typeof startAutoSave === 'function') startAutoSave();
                });
        } else {
            if (typeof checkAutoSave === 'function') checkAutoSave();
            if (typeof startAutoSave === 'function') startAutoSave();
        }
    }, 200);
});
