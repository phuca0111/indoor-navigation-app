// Bắt lỗi toàn cục (Giữ lại để chẩn đoán triệt để)
window.onerror = function(msg, url, line) {
    alert("PHÁT HIỆN LỖI MỚI (V3):\n" + msg + "\nFile: " + url + "\nDòng: " + line);
    return false;
};

// ============================================================
// EDITOR.JS - Entry Point (Khởi tạo)
// ============================================================

// === CÀI ĐẶT TỶ LỆ (Phương án A: khóa khi config / load server) ===
var scaleInp = document.getElementById('scaleInput');
if (scaleInp) {
    scaleInp.addEventListener('change', function (e) {
        if (typeof isScaleEditingLocked === 'function' && isScaleEditingLocked()) {
            e.target.value = metersPerGrid.toFixed(2);
            if (typeof showToast === 'function') {
                showToast('Tỷ lệ đã khóa (chuẩn dự án 0.5 m/ô). Dùng thước S chỉ để đo.', 'error');
            }
            return;
        }
        if (!e.target) return;
        var parsed = parseFloat(e.target.value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            parsed = getProjectScaleRatio();
            alert('Tỷ lệ không hợp lệ. Đã đặt về ' + parsed + ' m/ô.');
        }
        metersPerGrid = parsed;
        e.target.value = metersPerGrid.toFixed(2);
        updatePropertiesPanel();
        draw();
    });
}

if (typeof applyScalePolicy === 'function') applyScalePolicy();

var mapBearingInp = document.getElementById('mapBearingInput');
if (mapBearingInp) {
    mapBearingInp.addEventListener('change', function (e) {
        if (!e.target) return;
        var parsed = parseFloat(e.target.value);
        window.mapBearingOffset = Number.isFinite(parsed) ? parsed : 0;
        e.target.value = window.mapBearingOffset;
    });
}

// === CHẾ ĐỘ THƯỚC (S) — chỉ Đo khi tỷ lệ khóa ===
var rulerModeSel = document.getElementById('rulerModeSelect');
if (rulerModeSel) {
    rulerModeSel.addEventListener('change', function (e) {
        if (typeof isScaleEditingLocked === 'function' && isScaleEditingLocked()) {
            setRulerMode('measure');
            return;
        }
        if (typeof setRulerMode === 'function') setRulerMode(e.target.value);
        else rulerMode = e.target.value;
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
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

/** Fit viewport + reset transform ảnh nền (sau khi img đã load). */
function fitViewportToBackgroundImage(img) {
    if (!img || !canvas) return;
    var scaleX = canvas.width / img.width;
    var scaleY = canvas.height / img.height;
    zoom = Math.min(scaleX, scaleY) * 0.9;
    panX = (canvas.width - img.width * zoom) / 2;
    panY = (canvas.height - img.height * zoom) / 2;
    window.bgX = 0;
    window.bgY = 0;
    window.bgScale = 1.0;
    window.bgRotation = 0;
    window.bgOpacity = 0.5;
    window.bgContrast = 1;
    window.bgBrightness = 0;

    var bSli = document.getElementById('bgOpacitySlider');
    if (bSli) bSli.value = 50;
    var bVal = document.getElementById('bgOpacityVal');
    if (bVal) bVal.textContent = '50%';
    var cSli = document.getElementById('bgContrastSlider');
    if (cSli) cSli.value = '1';
    var brSli = document.getElementById('bgBrightnessSlider');
    if (brSli) brSli.value = '0';
    if (typeof setBgContrast === 'function') setBgContrast(1);
    if (typeof setBgBrightness === 'function') setBgBrightness(0);
    if (zoomLevelSpan) zoomLevelSpan.textContent = Math.round(zoom * 100) + '%';
}

/**
 * Gắn ảnh nền vào canvas — LUÔN set window.bgImage (AssetManager chỉ đồng bộ URL/data).
 * Không tự quét phòng: dùng nút «Quét phòng».
 */
function applyBackgroundImageSrc(src, opts) {
    opts = opts || {};
    var img = new Image();
    img.onload = function () {
        window.bgImage = img;
        window.bgImageBase64 = src || '';
        window.bgStorageKey = opts.storageKey || '';
        if (window.EditorCore && EditorCore.AssetManager) {
            if (opts.storageKey && typeof EditorCore.AssetManager.setBackgroundFromUrl === 'function') {
                EditorCore.AssetManager.setBackgroundFromUrl(src, opts.storageKey);
            } else {
                EditorCore.AssetManager.setBackgroundFromDataUrl(src);
            }
        }
        if (opts.fitViewport !== false) fitViewportToBackgroundImage(img);
        if (typeof draw === 'function') draw();
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof opts.onDone === 'function') opts.onDone(img);
    };
    img.onerror = function () {
        if (typeof showToast === 'function') {
            showToast('Không tải được ảnh nền', 'error');
        }
    };
    img.src = src;
}
window.applyBackgroundImageSrc = applyBackgroundImageSrc;

/** WE6: upload Storage → map_data giữ URL (không Base64). */
async function persistBackgroundFileToStorage(file) {
    var bid = window.buildingId;
    var floorEl = document.getElementById('floorSelect');
    var floor = floorEl ? floorEl.value : '0';
    if (!bid || !window.StorageApi || typeof StorageApi.uploadBackground !== 'function') {
        if (typeof showToast === 'function') {
            showToast(bid
                ? 'Ảnh nền tạm (local) — thiếu Storage API'
                : 'Ảnh nền tạm local — mở từ Dashboard (có tòa) để lưu Storage', 'info');
        }
        return { ok: false, skipped: true };
    }
    if (typeof showToast === 'function') showToast('Đang upload ảnh nền…', 'info');
    var result = await StorageApi.uploadBackground(bid, floor, file, apiFetch);
    if (result.unauthorized) {
        if (typeof showToast === 'function') showToast('Hết phiên — đăng nhập lại', 'error');
        return result;
    }
    if (!result.ok) {
        if (typeof showToast === 'function') {
            showToast(result.message || 'Upload ảnh nền thất bại — giữ bản tạm', 'error');
        }
        return result;
    }
    applyBackgroundImageSrc(result.url, {
        storageKey: result.key || '',
        fitViewport: false
    });
    if (typeof showToast === 'function') {
        showToast('Đã lưu ảnh nền lên Storage', 'success');
    }
    return result;
}
window.persistBackgroundFileToStorage = persistBackgroundFileToStorage;

// Upload ảnh → hiện nền ngay; upload Storage nếu có tòa; KHÔNG tự quét phòng
var bInp = document.getElementById('bgInput');
if (bInp) {
    bInp.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function (event) {
            var dataUrl = event.target.result;
            applyBackgroundImageSrc(dataUrl, {
                fitViewport: true,
                onDone: function () {
                    persistBackgroundFileToStorage(file).catch(function (err) {
                        console.warn('[WE6] upload background', err);
                    });
                }
            });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });
}

// Xóa ảnh nền
var bRem = document.getElementById('btnRemoveBg');
if (bRem) {
    bRem.addEventListener('click', function () {
        saveState();
        var bid = window.buildingId;
        var floorEl = document.getElementById('floorSelect');
        var floor = floorEl ? floorEl.value : '0';
        var key = window.bgStorageKey;
        if (bid && key && window.StorageApi && typeof StorageApi.deleteBackground === 'function') {
            StorageApi.deleteBackground(bid, floor, key, apiFetch).catch(function () { /* ignore */ });
        }
        if (window.EditorCore && EditorCore.AssetManager) {
            EditorCore.AssetManager.clearBackground();
        }
        window.bgImage = null;
        window.bgImageBase64 = '';
        window.bgStorageKey = '';
        draw();
    });
}

// Opacity slider
var bSli = document.getElementById('bgOpacitySlider');
if (bSli) {
    bSli.addEventListener('input', function (e) {
        window.bgOpacity = parseInt(e.target.value) / 100;
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

(function initFloorSelectHandler() {
    var floorSelect = document.getElementById('floorSelect');
    if (!floorSelect) return;

    // Tầng đang hiển thị trên canvas (khác với value select khi user vừa đổi rồi bấm Hủy)
    var activeFloor = floorSelect.value;

    floorSelect.addEventListener('change', function () {
        var targetFloor = this.value;
        if (targetFloor === activeFloor) return;

        if (!confirm('⚠️ CẢNH BÁO: Chuyển tầng sẽ xóa các thay đổi chưa lưu trên bản vẽ hiện tại. Bạn có muốn tiếp tục?')) {
            this.value = activeFloor;
            return;
        }

        var previousFloor = activeFloor;
        if (typeof releaseFloorLock === 'function') {
            Promise.resolve(releaseFloorLock(previousFloor)).catch(function () { /* ignore */ });
        }

        if (typeof updateEditorFloorLabel === 'function') updateEditorFloorLabel();
        if (typeof persistEditorFloor === 'function') persistEditorFloor(targetFloor);
        loadMapFromServer().then(function (result) {
            activeFloor = floorSelect.value;
            if (typeof updateEditorMapVersion === 'function') {
                updateEditorMapVersion(result && result.version != null ? result.version : null);
            }
            if (typeof acquireFloorLock === 'function') {
                Promise.resolve(acquireFloorLock(false)).then(function () {
                    if (typeof checkAutoSave === 'function') {
                        checkAutoSave({ serverLoaded: !!(result && result.loaded) });
                    }
                    if (window.editorFloorLockReadOnly) return;
                    if (typeof resumeAutoSave === 'function') resumeAutoSave({ clean: true });
                    if (typeof startAutoSave === 'function') startAutoSave(true, { cleanStart: true });
                }).catch(function () { /* ignore */ });
            } else {
                if (typeof checkAutoSave === 'function') {
                    checkAutoSave({ serverLoaded: !!(result && result.loaded) });
                }
                if (typeof resumeAutoSave === 'function') resumeAutoSave({ clean: true });
                if (typeof startAutoSave === 'function') startAutoSave(true, { cleanStart: true });
            }
        });
    });

    window.syncActiveFloor = function () {
        activeFloor = floorSelect.value;
    };
})();

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

        // Autosave chỉ do initEditor() bật sau load map — không pause ở đây
        // (pause sau resume sẽ khóa vĩnh viễn → không bao giờ ghi nháp).
    }, 200);
});
