// ============================================================
// IMAGE-TOOLS.JS — Phase 4: Calibrate / Deskew / Contrast / Crop
// Spec: webedit_nangcap.md §4.4 + Bước 6 (Image)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.ImageTools = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * Calibrate: 2 điểm trên map (world px) + khoảng cách thực (mét)
     * → metersPerGrid mới.
     */
    function calibrateMetersPerGrid(p1, p2, realMeters, gridSize) {
        if (!p1 || !p2) return null;
        var meters = Number(realMeters);
        var gs = gridSize != null ? gridSize : 40;
        if (!(meters > 0) || !Number.isFinite(meters)) return null;
        var distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (distPx < 2) return null;
        // distPx / gs * metersPerGrid = meters  →  mpg = meters * gs / distPx
        var mpg = (meters * gs) / distPx;
        if (!(mpg > 0) || !Number.isFinite(mpg)) return null;
        return {
            metersPerGrid: mpg,
            distPx: distPx,
            distM: meters,
            gridSize: gs
        };
    }

    /** Áp contrast (0.5–2) + brightness (-100…100) lên ImageData (in-place). */
    function applyContrastBrightness(imageData, contrast, brightness) {
        if (!imageData || !imageData.data) return imageData;
        var c = Number(contrast);
        var b = Number(brightness);
        if (!Number.isFinite(c)) c = 1;
        if (!Number.isFinite(b)) b = 0;
        c = Math.max(0.2, Math.min(3, c));
        b = Math.max(-100, Math.min(100, b));
        var data = imageData.data;
        var factor = c;
        var intercept = b;
        for (var i = 0; i < data.length; i += 4) {
            data[i] = clampByte((data[i] - 128) * factor + 128 + intercept);
            data[i + 1] = clampByte((data[i + 1] - 128) * factor + 128 + intercept);
            data[i + 2] = clampByte((data[i + 2] - 128) * factor + 128 + intercept);
        }
        return imageData;
    }

    function clampByte(v) {
        if (v < 0) return 0;
        if (v > 255) return 255;
        return v | 0;
    }

    /**
     * Ước lượng góc nghiêng (độ) từ ảnh — sampling gradient hướng cạnh gần ngang/dọc.
     * Trả về góc deskew gợi ý (âm = xoay ngược kim đồng hồ trên canvas).
     */
    function estimateDeskewAngleDeg(imageData, sampleStep) {
        if (!imageData || !imageData.data) return 0;
        var w = imageData.width;
        var h = imageData.height;
        var data = imageData.data;
        var step = sampleStep != null ? sampleStep : Math.max(2, Math.floor(Math.min(w, h) / 200));
        var hist = {}; // bucket 0.5°
        var count = 0;

        for (var y = 1; y < h - 1; y += step) {
            for (var x = 1; x < w - 1; x += step) {
                var i = (y * w + x) * 4;
                var gx =
                    -data[i - 4] + data[i + 4] +
                    -2 * data[i - 4 + w * 4] + 2 * data[i + 4 + w * 4] +
                    -data[i - 4 - w * 4] + data[i + 4 - w * 4];
                // approx using R channel only for speed-ish — use luminance
                var yl = (y * w + x);
                var lum = function (ox, oy) {
                    var j = ((y + oy) * w + (x + ox)) * 4;
                    return 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
                };
                var gxx = -lum(-1, -1) - 2 * lum(-1, 0) - lum(-1, 1) + lum(1, -1) + 2 * lum(1, 0) + lum(1, 1);
                var gyy = -lum(-1, -1) - 2 * lum(0, -1) - lum(1, -1) + lum(-1, 1) + 2 * lum(0, 1) + lum(1, 1);
                var mag = Math.abs(gxx) + Math.abs(gyy);
                if (mag < 40) continue;
                var ang = Math.atan2(gyy, gxx) * 180 / Math.PI; // normal angle
                // Edge orientation perpendicular to gradient
                var edge = ang + 90;
                // Normalize to [-45, 45] around nearest axis
                while (edge > 90) edge -= 180;
                while (edge <= -90) edge += 180;
                if (edge > 45) edge -= 90;
                if (edge <= -45) edge += 90;
                var key = Math.round(edge * 2) / 2; // 0.5° buckets
                hist[key] = (hist[key] || 0) + mag;
                count++;
            }
        }
        if (!count) return 0;
        var bestKey = 0;
        var bestVal = -1;
        for (var k in hist) {
            if (hist[k] > bestVal) {
                bestVal = hist[k];
                bestKey = parseFloat(k);
            }
        }
        // Deskew rotate opposite to skew
        var skew = bestKey;
        if (Math.abs(skew) < 0.25) return 0;
        if (Math.abs(skew) > 20) return 0; // too large — unreliable
        return -skew;
    }

    function getBackgroundTransform(bg) {
        bg = bg || {};
        var scale = bg.bgScale != null ? bg.bgScale : 1;
        var imgW = bg.width || 0;
        var imgH = bg.height || 0;
        var bw = imgW * scale;
        var bh = imgH * scale;
        return {
            cx: (bg.bgX || 0) + bw / 2,
            cy: (bg.bgY || 0) + bh / 2,
            bw: bw,
            bh: bh,
            scale: scale,
            rotationDeg: bg.bgRotation || 0,
            imgW: imgW,
            imgH: imgH
        };
    }

    /** World → pixel trên ảnh gốc. */
    function worldToImagePixel(wx, wy, bg) {
        var t = getBackgroundTransform(bg);
        if (!(t.imgW > 0 && t.imgH > 0)) return null;
        var dx = wx - t.cx;
        var dy = wy - t.cy;
        var rad = -t.rotationDeg * Math.PI / 180;
        var cos = Math.cos(rad);
        var sin = Math.sin(rad);
        var lx = dx * cos - dy * sin;
        var ly = dx * sin + dy * cos;
        var px = (lx + t.bw / 2) / t.scale;
        var py = (ly + t.bh / 2) / t.scale;
        return { x: px, y: py };
    }

    /** Crop image từ pixel rect → dataURL PNG. */
    function cropImageToDataUrl(img, rect, qualityCanvas) {
        if (!img || !rect) return null;
        var x = Math.max(0, Math.floor(Math.min(rect.x1, rect.x2)));
        var y = Math.max(0, Math.floor(Math.min(rect.y1, rect.y2)));
        var x2 = Math.min(img.width, Math.ceil(Math.max(rect.x1, rect.x2)));
        var y2 = Math.min(img.height, Math.ceil(Math.max(rect.y1, rect.y2)));
        var w = x2 - x;
        var h = y2 - y;
        if (w < 4 || h < 4) return null;
        var c = qualityCanvas || document.createElement('canvas');
        c.width = w;
        c.height = h;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        return {
            dataUrl: c.toDataURL('image/png'),
            width: w,
            height: h,
            sx: x,
            sy: y
        };
    }

    /** Xử lý contrast/brightness → dataURL mới. */
    function processImageToDataUrl(img, contrast, brightness) {
        if (!img) return null;
        var c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var id = ctx.getImageData(0, 0, c.width, c.height);
        applyContrastBrightness(id, contrast, brightness);
        ctx.putImageData(id, 0, 0);
        return c.toDataURL('image/png');
    }

    /** Đọc ImageData từ HTMLImageElement. */
    function getImageDataFromImg(img) {
        if (!img) return null;
        var c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
    }

    return {
        calibrateMetersPerGrid: calibrateMetersPerGrid,
        applyContrastBrightness: applyContrastBrightness,
        estimateDeskewAngleDeg: estimateDeskewAngleDeg,
        worldToImagePixel: worldToImagePixel,
        getBackgroundTransform: getBackgroundTransform,
        cropImageToDataUrl: cropImageToDataUrl,
        processImageToDataUrl: processImageToDataUrl,
        getImageDataFromImg: getImageDataFromImg
    };
});
