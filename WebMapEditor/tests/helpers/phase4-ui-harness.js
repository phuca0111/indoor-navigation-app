/**
 * Phase 4 UI harness — happy-dom
 * Nạp DOM toolbar/panel + image-tools + image-phase4 để smoke thao tác UI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

export function loadShellHtml() {
    document.body.innerHTML = `
<aside class="toolbar">
  <button class="tool-btn" id="btn-calibrate" type="button">Calibrate</button>
  <button class="tool-btn" id="btn-bg-crop" type="button">Crop</button>
  <button class="tool-btn" id="btn-deskew" type="button">Deskew</button>
  <button class="tool-btn" id="btn-detect" type="button">Detect v2</button>
  <input type="number" id="scaleInput" value="0.5" step="0.01">
  <span id="bgContrastVal">1.00</span>
  <input type="range" id="bgContrastSlider" min="0.2" max="3" step="0.05" value="1">
  <span id="bgBrightnessVal">0</span>
  <input type="range" id="bgBrightnessSlider" min="-100" max="100" step="1" value="0">
  <button id="btnApplyFilter" type="button">Áp filter vào ảnh</button>
  <div id="properties"></div>
  <span id="currentToolStatus"></span>
</aside>
<canvas id="mapCanvas" width="400" height="300"></canvas>
`;
}

function makeSyntheticImageData(w, h) {
    var data = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < data.length; i += 4) {
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = 255;
    }
    // cạnh ngang đen
    for (var x = 0; x < w; x++) {
        var y = Math.floor(h / 2);
        var idx = (y * w + x) * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = 0;
    }
    return { data: data, width: w, height: h };
}

export function makeFakeBgImage(w, h) {
    w = w || 200;
    h = h || 120;
    return {
        width: w,
        height: h,
        complete: true,
        src: 'data:image/png;base64,fake'
    };
}

export function bootPhase4Ui(opts) {
    opts = opts || {};
    loadShellHtml();

    var toasts = [];
    var draws = 0;
    var saves = 0;
    var detects = 0;

    globalThis.showToast = function (msg, type) {
        toasts.push({ msg: String(msg || ''), type: type || 'info' });
    };
    globalThis.draw = function () { draws += 1; };
    globalThis.saveState = function () { saves += 1; };
    globalThis.updatePropertiesPanel = function () {};
    globalThis.pixelsToMeters = function (px) {
        var mpg = globalThis.metersPerGrid != null ? globalThis.metersPerGrid : 0.5;
        var gs = globalThis.GRID_SIZE != null ? globalThis.GRID_SIZE : 40;
        return (px / gs) * mpg;
    };
    globalThis.detectRoomsFromImageV2 = function () {
        detects += 1;
        return 3;
    };
    globalThis.detectRoomsFromImage = function () {
        detects += 1;
        return 1;
    };

    globalThis.GRID_SIZE = 40;
    globalThis.metersPerGrid = opts.metersPerGrid != null ? opts.metersPerGrid : 0.5;
    // image-phase4.js gán bare identifier `metersPerGrid` — đồng bộ với window
    // Trong happy-dom, window === globalThis nên đọc/ghi qua window.metersPerGrid
    globalThis.currentTool = 'select';
    globalThis.zoom = 1;
    globalThis.ctx = {
        save: function () {},
        restore: function () {},
        beginPath: function () {},
        arc: function () {},
        fill: function () {},
        stroke: function () {},
        moveTo: function () {},
        lineTo: function () {},
        fillText: function () {},
        fillRect: function () {},
        strokeRect: function () {},
        setLineDash: function () {}
    };

    globalThis.bgX = 0;
    globalThis.bgY = 0;
    globalThis.bgScale = 1;
    globalThis.bgScaleX = 1;
    globalThis.bgScaleY = 1;
    globalThis.bgRotation = 0;
    globalThis.bgOpacity = 0.5;
    globalThis.bgContrast = 1;
    globalThis.bgBrightness = 0;
    globalThis.bgImageBase64 = '';
    globalThis.bgImage = opts.withBg === false ? null : makeFakeBgImage(200, 120);

    // ImageTools thật + stub hàm phụ thuộc Canvas
    var ImageTools = require(path.join(ROOT, 'core/image-tools.js'));
    globalThis.EditorCore = globalThis.EditorCore || {};
    globalThis.EditorCore.ImageTools = Object.assign({}, ImageTools, {
        getImageDataFromImg: function () {
            return makeSyntheticImageData(80, 80);
        },
        processImageToDataUrl: function () {
            return 'data:image/png;base64,PROCESSED';
        },
        cropImageToDataUrl: function (img, rect) {
            var w = Math.abs((rect.x2 || 0) - (rect.x1 || 0));
            var h = Math.abs((rect.y2 || 0) - (rect.y1 || 0));
            if (w < 4 || h < 4) return null;
            return {
                dataUrl: 'data:image/png;base64,CROPPED',
                width: Math.floor(w),
                height: Math.floor(h),
                sx: 0,
                sy: 0
            };
        }
    });
    globalThis.EditorCore.AssetManager = {
        setBackgroundFromDataUrl: function (url) {
            globalThis.bgImageBase64 = url;
        }
    };

    // Stub Image constructor cho replaceBackgroundFromDataUrl
    globalThis.Image = function FakeImage() {
        var self = this;
        self.width = 100;
        self.height = 80;
        self.onload = null;
        Object.defineProperty(self, 'src', {
            set: function (v) {
                self._src = v;
                self.width = 100;
                self.height = 80;
                if (typeof self.onload === 'function') self.onload();
            },
            get: function () { return self._src; }
        });
    };

    // selectTool tối giản (giống toolbar)
    globalThis.selectTool = function (tool) {
        if (globalThis.currentTool === 'calibrate' && tool !== 'calibrate'
            && typeof globalThis.clearCalibrateSession === 'function') {
            globalThis.clearCalibrateSession();
        }
        if (globalThis.currentTool === 'bg-crop' && tool !== 'bg-crop'
            && typeof globalThis.clearCropSession === 'function') {
            globalThis.clearCropSession();
        }
        globalThis.currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(function (b) {
            b.classList.remove('active');
        });
        var btn = document.getElementById('btn-' + tool);
        if (btn) btn.classList.add('active');
        var st = document.getElementById('currentToolStatus');
        if (st) st.textContent = tool;
    };

    // Wire buttons như HTML
    document.getElementById('btn-calibrate').onclick = function () {
        globalThis.selectTool('calibrate');
    };
    document.getElementById('btn-bg-crop').onclick = function () {
        globalThis.selectTool('bg-crop');
    };
    document.getElementById('btn-deskew').onclick = function () {
        if (typeof globalThis.autoDeskewBackground === 'function') {
            globalThis.autoDeskewBackground();
        }
    };
    document.getElementById('btn-detect').onclick = function () {
        if (typeof globalThis.runAutoDetectV2 === 'function') {
            globalThis.runAutoDetectV2();
        }
    };
    document.getElementById('bgContrastSlider').oninput = function () {
        globalThis.setBgContrast(this.value);
    };
    document.getElementById('bgBrightnessSlider').oninput = function () {
        globalThis.setBgBrightness(this.value);
    };
    document.getElementById('btnApplyFilter').onclick = function () {
        if (typeof globalThis.applyBgFiltersPermanent === 'function') {
            globalThis.applyBgFiltersPermanent();
        }
    };

    // Nạp image-phase4.js vào globalThis (script browser)
    var src = fs.readFileSync(path.join(ROOT, 'js/image-phase4.js'), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);

    return {
        toasts: toasts,
        get draws() { return draws; },
        get saves() { return saves; },
        get detects() { return detects; },
        click: function (id) {
            var el = document.getElementById(id);
            if (!el) throw new Error('Missing #' + id);
            el.click();
        },
        setSlider: function (id, value) {
            var el = document.getElementById(id);
            el.value = String(value);
            if (typeof el.oninput === 'function') el.oninput();
        },
        scaleValue: function () {
            return document.getElementById('scaleInput').value;
        }
    };
}
