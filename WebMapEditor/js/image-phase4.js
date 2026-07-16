// ============================================================
// IMAGE-PHASE4.JS — Wire Calibrate / Deskew / Contrast / Crop / Detect v2
// ============================================================

window.bgContrast = window.bgContrast != null ? window.bgContrast : 1;
window.bgBrightness = window.bgBrightness != null ? window.bgBrightness : 0;

var calibrateP1 = null;
var calibrateP2 = null;
var calibrateActive = false;

var cropStart = null;
var cropEnd = null;
var cropSessionActive = false;
var cropDragging = false;

function getImageToolsApi() {
    return (typeof EditorCore !== 'undefined' && EditorCore.ImageTools) ? EditorCore.ImageTools : null;
}

function requireBgImage() {
    if (!window.bgImage) {
        if (typeof showToast === 'function') showToast('Cần tải ảnh nền trước', 'error');
        return false;
    }
    return true;
}

function syncScaleInputUI() {
    var el = document.getElementById('scaleInput');
    if (el && typeof metersPerGrid !== 'undefined') {
        el.value = Number(metersPerGrid).toFixed(4);
    }
}

function clearCalibrateSession() {
    calibrateActive = false;
    calibrateP1 = null;
    calibrateP2 = null;
}

function clearCropSession() {
    cropSessionActive = false;
    cropDragging = false;
    cropStart = null;
    cropEnd = null;
}

function handleCalibratePointerDown(x, y) {
    if (!calibrateP1 || (calibrateP1 && calibrateP2 && !calibrateActive)) {
        calibrateP1 = { x: x, y: y };
        calibrateP2 = null;
        calibrateActive = true;
        if (typeof showToast === 'function') showToast('Calibrate: chọn điểm 2', 'info');
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof draw === 'function') draw();
        return;
    }
    calibrateP2 = { x: x, y: y };
    calibrateActive = false;
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof draw === 'function') draw();
    if (typeof showToast === 'function') {
        showToast('Nhập khoảng cách thật (m) rồi bấm Áp dụng tỷ lệ', 'success');
    }
}

function handleCalibratePointerMove(x, y) {
    if (!calibrateActive || !calibrateP1) return;
    calibrateP2 = { x: x, y: y };
}

function applyCalibrateFromPanel() {
    var api = getImageToolsApi();
    if (!api || !calibrateP1 || !calibrateP2) {
        if (typeof showToast === 'function') showToast('Chọn đủ 2 điểm calibrate', 'error');
        return false;
    }
    var inp = document.getElementById('calibrateMetersInput');
    var meters = inp ? Number(inp.value) : NaN;
    var gs = typeof GRID_SIZE !== 'undefined' ? GRID_SIZE : 40;
    var result = api.calibrateMetersPerGrid(calibrateP1, calibrateP2, meters, gs);
    if (!result) {
        if (typeof showToast === 'function') showToast('Khoảng cách mét không hợp lệ hoặc 2 điểm quá gần', 'error');
        return false;
    }
    if (typeof saveState === 'function') saveState();
    metersPerGrid = result.metersPerGrid;
    if (typeof window !== 'undefined') window.metersPerGrid = metersPerGrid;
    syncScaleInputUI();
    if (typeof showToast === 'function') {
        showToast('Đã calibrate: 1 ô = ' + metersPerGrid.toFixed(4) + ' m', 'success');
    }
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof draw === 'function') draw();
    return true;
}
window.applyCalibrateFromPanel = applyCalibrateFromPanel;

function autoDeskewBackground() {
    if (!requireBgImage()) return;
    var api = getImageToolsApi();
    if (!api) return;
    var id = api.getImageDataFromImg(window.bgImage);
    var delta = api.estimateDeskewAngleDeg(id);
    if (typeof saveState === 'function') saveState();
    window.bgRotation = ((window.bgRotation || 0) + delta + 360) % 360;
    if (typeof showToast === 'function') {
        showToast(
            Math.abs(delta) < 0.25
                ? 'Ảnh gần thẳng — không cần deskew'
                : ('Deskew: xoay thêm ' + delta.toFixed(2) + '° → nền ' + window.bgRotation.toFixed(1) + '°'),
            'success'
        );
    }
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof draw === 'function') draw();
}
window.autoDeskewBackground = autoDeskewBackground;

function setBgContrast(v) {
    window.bgContrast = Math.max(0.2, Math.min(3, Number(v) || 1));
    var el = document.getElementById('bgContrastVal');
    if (el) el.textContent = window.bgContrast.toFixed(2);
    if (typeof draw === 'function') draw();
}
window.setBgContrast = setBgContrast;

function setBgBrightness(v) {
    window.bgBrightness = Math.max(-100, Math.min(100, Number(v) || 0));
    var el = document.getElementById('bgBrightnessVal');
    if (el) el.textContent = String(Math.round(window.bgBrightness));
    if (typeof draw === 'function') draw();
}
window.setBgBrightness = setBgBrightness;

function applyBgFiltersPermanent() {
    if (!requireBgImage()) return;
    var api = getImageToolsApi();
    if (!api) return;
    var c = window.bgContrast != null ? window.bgContrast : 1;
    var b = window.bgBrightness != null ? window.bgBrightness : 0;
    if (Math.abs(c - 1) < 1e-6 && Math.abs(b) < 1e-6) {
        if (typeof showToast === 'function') showToast('Chưa chỉnh contrast/brightness', 'info');
        return;
    }
    if (typeof saveState === 'function') saveState();
    var dataUrl = api.processImageToDataUrl(window.bgImage, c, b);
    if (!dataUrl) return;
    replaceBackgroundFromDataUrl(dataUrl, { keepTransform: true, resetFilters: true });
    if (typeof showToast === 'function') showToast('Đã áp contrast/brightness vào ảnh nền', 'success');
}
window.applyBgFiltersPermanent = applyBgFiltersPermanent;

function replaceBackgroundFromDataUrl(dataUrl, opts) {
    opts = opts || {};
    var keep = !!opts.keepTransform;

    function finishWithUrl(src, storageKey) {
        var img = new Image();
        img.onload = function () {
            window.bgImage = img;
            window.bgImageBase64 = src;
            window.bgStorageKey = storageKey || '';
            if (window.EditorCore && EditorCore.AssetManager) {
                if (storageKey && typeof EditorCore.AssetManager.setBackgroundFromUrl === 'function') {
                    EditorCore.AssetManager.setBackgroundFromUrl(src, storageKey);
                } else {
                    EditorCore.AssetManager.setBackgroundFromDataUrl(src);
                }
            }
            if (!keep) {
                window.bgX = 0;
                window.bgY = 0;
                window.bgScale = 1;
                window.bgRotation = 0;
            }
            if (opts.resetFilters) {
                window.bgContrast = 1;
                window.bgBrightness = 0;
                var cs = document.getElementById('bgContrastSlider');
                var bs = document.getElementById('bgBrightnessSlider');
                if (cs) cs.value = '1';
                if (bs) bs.value = '0';
                setBgContrast(1);
                setBgBrightness(0);
            }
            if (typeof draw === 'function') draw();
            if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        };
        img.onerror = function () {
            if (typeof showToast === 'function') showToast('Không tải được ảnh nền sau chỉnh sửa', 'error');
        };
        img.src = src;
    }

    finishWithUrl(dataUrl, '');

    var bid = window.buildingId;
    var floorEl = document.getElementById('floorSelect');
    var floor = floorEl ? floorEl.value : '0';
    if (bid && window.StorageApi && typeof StorageApi.uploadBackgroundDataUrl === 'function' &&
        typeof apiFetch === 'function') {
        StorageApi.uploadBackgroundDataUrl(bid, floor, dataUrl, apiFetch).then(function (result) {
            if (result && result.ok && result.url) {
                finishWithUrl(result.url, result.key || '');
            }
        }).catch(function (err) {
            console.warn('[WE6] re-upload after edit', err);
        });
    }
}

function handleCropPointerDown(x, y) {
    if (!requireBgImage()) return;
    cropStart = { x: x, y: y };
    cropEnd = { x: x, y: y };
    cropSessionActive = true;
    cropDragging = true;
    if (typeof showToast === 'function') showToast('Crop: kéo khung rồi Enter / nút Áp dụng', 'info');
}

function handleCropPointerMove(x, y) {
    if (!cropDragging || !cropStart) return;
    cropEnd = { x: x, y: y };
}

function handleCropPointerUp(x, y) {
    if (!cropDragging || !cropStart) return;
    cropEnd = { x: x, y: y };
    cropDragging = false;
    if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
    if (typeof draw === 'function') draw();
}

function applyCropBackground() {
    if (!requireBgImage()) return false;
    var api = getImageToolsApi();
    if (!api || !cropStart || !cropEnd) {
        if (typeof showToast === 'function') showToast('Kéo khung crop trên ảnh trước', 'error');
        return false;
    }
    var bg = {
        width: window.bgImage.width,
        height: window.bgImage.height,
        bgX: window.bgX || 0,
        bgY: window.bgY || 0,
        bgScale: window.bgScale || 1,
        bgRotation: window.bgRotation || 0
    };
    var a = api.worldToImagePixel(cropStart.x, cropStart.y, bg);
    var b = api.worldToImagePixel(cropEnd.x, cropEnd.y, bg);
    if (!a || !b) return false;
    var cropped = api.cropImageToDataUrl(window.bgImage, { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    if (!cropped) {
        if (typeof showToast === 'function') showToast('Khung crop quá nhỏ', 'error');
        return false;
    }
    if (typeof saveState === 'function') saveState();
    clearCropSession();
    replaceBackgroundFromDataUrl(cropped.dataUrl, { keepTransform: false, resetFilters: false });
    if (typeof showToast === 'function') {
        showToast('Đã crop ảnh nền (' + cropped.width + '×' + cropped.height + ')', 'success');
    }
    return true;
}
window.applyCropBackground = applyCropBackground;

function runAutoDetectV2() {
    if (!requireBgImage()) return;
    if (typeof detectRoomsFromImageV2 === 'function') {
        var n = detectRoomsFromImageV2(window.bgImage);
        if (typeof showToast === 'function') showToast('Đã quét: ' + n + ' phòng', 'success');
    } else if (typeof detectRoomsFromImage === 'function') {
        var n1 = detectRoomsFromImage(window.bgImage);
        if (typeof showToast === 'function') showToast('Đã quét: ' + n1 + ' phòng', 'success');
    }
}
window.runAutoDetectV2 = runAutoDetectV2;

function drawCalibratePreview() {
    if (!calibrateP1 || typeof ctx === 'undefined') return;
    var z = typeof zoom !== 'undefined' && zoom > 0 ? zoom : 1;
    ctx.save();
    ctx.strokeStyle = '#0ea5e9';
    ctx.fillStyle = '#0ea5e9';
    ctx.lineWidth = 2 / z;
    ctx.beginPath();
    ctx.arc(calibrateP1.x, calibrateP1.y, 4 / z, 0, Math.PI * 2);
    ctx.fill();
    if (calibrateP2) {
        ctx.beginPath();
        ctx.moveTo(calibrateP1.x, calibrateP1.y);
        ctx.lineTo(calibrateP2.x, calibrateP2.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(calibrateP2.x, calibrateP2.y, 4 / z, 0, Math.PI * 2);
        ctx.fill();
        var dPx = Math.hypot(calibrateP2.x - calibrateP1.x, calibrateP2.y - calibrateP1.y);
        var dM = typeof pixelsToMeters === 'function' ? pixelsToMeters(dPx) : dPx;
        ctx.font = 'bold ' + (12 / z) + 'px Consolas, monospace';
        ctx.fillStyle = '#0369a1';
        ctx.fillText(
            dM.toFixed(2) + ' m (tỷ lệ hiện tại)',
            (calibrateP1.x + calibrateP2.x) / 2,
            (calibrateP1.y + calibrateP2.y) / 2 - 8 / z
        );
    }
    ctx.restore();
}

function drawCropPreview() {
    if (!cropStart || !cropEnd || typeof ctx === 'undefined') return;
    var z = typeof zoom !== 'undefined' && zoom > 0 ? zoom : 1;
    var x = Math.min(cropStart.x, cropEnd.x);
    var y = Math.min(cropStart.y, cropEnd.y);
    var w = Math.abs(cropEnd.x - cropStart.x);
    var h = Math.abs(cropEnd.y - cropStart.y);
    ctx.save();
    ctx.strokeStyle = '#f97316';
    ctx.fillStyle = 'rgba(249, 115, 22, 0.12)';
    ctx.lineWidth = 2 / z;
    ctx.setLineDash([6 / z, 4 / z]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
}

window.drawCalibratePreview = drawCalibratePreview;
window.drawCropPreview = drawCropPreview;
window.clearCalibrateSession = clearCalibrateSession;
window.clearCropSession = clearCropSession;
window.handleCalibratePointerDown = handleCalibratePointerDown;
window.handleCalibratePointerMove = handleCalibratePointerMove;
window.handleCropPointerDown = handleCropPointerDown;
window.handleCropPointerMove = handleCropPointerMove;
window.handleCropPointerUp = handleCropPointerUp;
window.isCalibrating = function () { return calibrateActive; };
window.isCroppingBg = function () { return cropSessionActive; };
window.isCropDragging = function () { return cropDragging; };
