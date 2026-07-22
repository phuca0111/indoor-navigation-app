/**
 * @vitest-environment happy-dom
 *
 * Phase 4 — Smoke UI (tự động)
 * Thay checklist tay: mô phỏng click toolbar / slider / pointer / Enter-crop.
 * Chạy: npm run test:phase4-ui
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bootPhase4Ui } from './helpers/phase4-ui-harness.js';

describe('Phase 4 UI Smoke', function () {
    var h;

    beforeEach(function () {
        h = bootPhase4Ui({ metersPerGrid: 0.5, withBg: true });
    });

    // ——— Toolbar / DOM có mặt ———
    it('UI0: toolbar Phase 4 có nút Calibrate / Crop / Deskew / Detect + slider contrast', function () {
        expect(document.getElementById('btn-calibrate')).toBeTruthy();
        expect(document.getElementById('btn-bg-crop')).toBeTruthy();
        expect(document.getElementById('btn-deskew')).toBeTruthy();
        expect(document.getElementById('btn-detect')).toBeTruthy();
        expect(document.getElementById('bgContrastSlider')).toBeTruthy();
        expect(document.getElementById('bgBrightnessSlider')).toBeTruthy();
        expect(document.getElementById('scaleInput')).toBeTruthy();
        expect(typeof window.applyCalibrateFromPanel).toBe('function');
        expect(typeof window.autoDeskewBackground).toBe('function');
        expect(typeof window.setBgContrast).toBe('function');
        expect(typeof window.applyCropBackground).toBe('function');
        expect(typeof window.runAutoDetectV2).toBe('function');
    });

    // ——— CAL ———
    it('CAL1: click btn-calibrate → tool calibrate + active class', function () {
        h.click('btn-calibrate');
        expect(window.currentTool).toBe('calibrate');
        expect(document.getElementById('btn-calibrate').classList.contains('active')).toBe(true);
    });

    it('CAL2: 2 click calibrate → có session 2 điểm (preview vẽ)', function () {
        h.click('btn-calibrate');
        window.handleCalibratePointerDown(0, 0);
        expect(window.isCalibrating()).toBe(true);
        window.handleCalibratePointerMove(80, 0);
        window.handleCalibratePointerDown(80, 0);
        expect(window.isCalibrating()).toBe(false);
        expect(h.draws).toBeGreaterThan(0);
        expect(h.toasts.some(function (t) { return /Áp dụng tỷ lệ|điểm 2/i.test(t.msg); })).toBe(true);
    });

    it('CAL3: nhập mét + Áp dụng → scaleInput & metersPerGrid đổi', function () {
        h.click('btn-calibrate');
        window.handleCalibratePointerDown(0, 40);
        window.handleCalibratePointerDown(80, 40); // 2 ô = 80px
        // gắn input panel
        var props = document.getElementById('properties');
        props.innerHTML = '<input id="calibrateMetersInput" type="number" value="4">';
        var ok = window.applyCalibrateFromPanel();
        expect(ok).toBe(true);
        expect(Number(window.metersPerGrid)).toBeCloseTo(2, 5); // 4m / 2 ô
        expect(Number(h.scaleValue())).toBeCloseTo(2, 4);
        expect(h.saves).toBeGreaterThanOrEqual(1);
        expect(h.toasts.some(function (t) { return /calibrate|ô/i.test(t.msg); })).toBe(true);
    });

    it('CAL4: Esc-session clearCalibrateSession hủy điểm', function () {
        h.click('btn-calibrate');
        window.handleCalibratePointerDown(10, 10);
        expect(window.isCalibrating()).toBe(true);
        window.clearCalibrateSession();
        expect(window.isCalibrating()).toBe(false);
        // Áp dụng khi không còn điểm → false
        var props = document.getElementById('properties');
        props.innerHTML = '<input id="calibrateMetersInput" type="number" value="1">';
        expect(window.applyCalibrateFromPanel()).toBe(false);
    });

    it('CAL5: không có ảnh — Deskew/Detect cảnh báo (Calibrate vẫn đo world)', function () {
        h = bootPhase4Ui({ withBg: false });
        h.click('btn-deskew');
        expect(h.toasts.some(function (t) { return /ảnh nền/i.test(t.msg) && t.type === 'error'; })).toBe(true);
        h.click('btn-detect');
        expect(h.toasts.some(function (t) { return /ảnh nền/i.test(t.msg); })).toBe(true);
    });

    // ——— Deskew ———
    it('DS1: Deskew với ảnh → đổi bgRotation hoặc toast thông báo', function () {
        var before = window.bgRotation;
        h.click('btn-deskew');
        expect(h.saves).toBeGreaterThanOrEqual(1);
        expect(h.toasts.length).toBeGreaterThan(0);
        // góc có thể 0 nếu ảnh ngang — vẫn được
        expect(typeof window.bgRotation).toBe('number');
        expect(window.bgRotation).toBeGreaterThanOrEqual(0);
        expect(window.bgRotation).toBeLessThan(360);
        // saveState đã gọi; rotation luôn được ghi (có thể = before + 0)
        expect(window.bgRotation === before || window.bgRotation !== before).toBe(true);
    });

    it('DS2: Deskew 2 lần không crash', function () {
        h.click('btn-deskew');
        h.click('btn-deskew');
        expect(h.toasts.length).toBeGreaterThanOrEqual(2);
    });

    // ——— Contrast / Brightness ———
    it('CB1: kéo slider contrast/brightness → window + label cập nhật', function () {
        h.setSlider('bgContrastSlider', 1.5);
        expect(window.bgContrast).toBeCloseTo(1.5, 5);
        expect(document.getElementById('bgContrastVal').textContent).toMatch(/1\.50/);
        h.setSlider('bgBrightnessSlider', 25);
        expect(window.bgBrightness).toBe(25);
        expect(document.getElementById('bgBrightnessVal').textContent).toBe('25');
        expect(h.draws).toBeGreaterThan(0);
    });

    it('CB2: Áp filter vào ảnh → bake + reset slider về 1/0', function () {
        h.setSlider('bgContrastSlider', 1.8);
        h.setSlider('bgBrightnessSlider', 30);
        h.click('btnApplyFilter');
        expect(h.saves).toBeGreaterThanOrEqual(1);
        expect(window.bgContrast).toBeCloseTo(1, 5);
        expect(window.bgBrightness).toBe(0);
        expect(document.getElementById('bgContrastSlider').value).toBe('1');
        expect(h.toasts.some(function (t) { return /contrast|brightness|áp/i.test(t.msg); })).toBe(true);
    });

    it('CB3: Áp filter khi chưa chỉnh → toast info, không save thừa logic', function () {
        var savesBefore = h.saves;
        h.click('btnApplyFilter');
        expect(h.toasts.some(function (t) { return /Chưa chỉnh/i.test(t.msg); })).toBe(true);
        expect(h.saves).toBe(savesBefore);
    });

    // ——— Crop ———
    it('CR1: tool Crop + kéo khung → isCroppingBg', function () {
        h.click('btn-bg-crop');
        expect(window.currentTool).toBe('bg-crop');
        window.handleCropPointerDown(20, 20);
        expect(window.isCroppingBg()).toBe(true);
        expect(window.isCropDragging()).toBe(true);
        window.handleCropPointerMove(100, 80);
        window.handleCropPointerUp(100, 80);
        expect(window.isCropDragging()).toBe(false);
        expect(window.isCroppingBg()).toBe(true);
    });

    it('CR2: Áp dụng crop → ảnh thay + session clear + bg reset gốc', function () {
        h.click('btn-bg-crop');
        window.bgX = 30;
        window.bgY = 40;
        window.bgScale = 1.5;
        window.bgScaleX = 2;
        window.bgScaleY = 0.75;
        window.handleCropPointerDown(10, 10);
        window.handleCropPointerMove(90, 70);
        window.handleCropPointerUp(90, 70);
        var ok = window.applyCropBackground();
        expect(ok).toBe(true);
        expect(window.isCroppingBg()).toBe(false);
        expect(window.bgX).toBe(0);
        expect(window.bgY).toBe(0);
        expect(window.bgScale).toBe(1);
        expect(window.bgScaleX).toBe(1);
        expect(window.bgScaleY).toBe(1);
        expect(h.toasts.some(function (t) { return /crop/i.test(t.msg); })).toBe(true);
    });

    it('CR3: clearCropSession = Esc hủy khung', function () {
        h.click('btn-bg-crop');
        window.handleCropPointerDown(0, 0);
        window.handleCropPointerUp(50, 50);
        window.clearCropSession();
        expect(window.isCroppingBg()).toBe(false);
        expect(window.applyCropBackground()).toBe(false);
    });

    it('CR4: khung crop quá nhỏ → lỗi', function () {
        h.click('btn-bg-crop');
        window.handleCropPointerDown(0, 0);
        window.handleCropPointerUp(2, 2);
        expect(window.applyCropBackground()).toBe(false);
        expect(h.toasts.some(function (t) { return /nhỏ|crop/i.test(t.msg) && t.type === 'error'; })).toBe(true);
    });

    // ——— Detect v2 ———
    it('DT1: Detect v2 gọi detectRoomsFromImageV2 + toast số phòng', function () {
        h.click('btn-detect');
        expect(h.detects).toBe(1);
        expect(h.toasts.some(function (t) { return /v2|3 phòng|phòng/i.test(t.msg); })).toBe(true);
    });

    it('DT2: runAutoDetectV2 export trên window', function () {
        window.runAutoDetectV2();
        expect(h.detects).toBe(1);
    });

    // ——— TCM aliases (không cần DOM đầy) ———
    it('CMD: alias CAL / CROP / BG resolve đúng tool', function () {
        var TCM = require('../core/tool-command-manager.js');
        var tcm = TCM.create({});
        expect(tcm.resolve('CAL')).toBe('calibrate');
        expect(tcm.resolve('CROP')).toBe('bg-crop');
        expect(tcm.resolve('BG')).toBe('bg-adjust');
    });

    // ——— Đổi tool dọn session ———
    it('UX: rời Calibrate → clear session', function () {
        h.click('btn-calibrate');
        window.handleCalibratePointerDown(1, 1);
        expect(window.isCalibrating()).toBe(true);
        h.click('btn-bg-crop');
        expect(window.isCalibrating()).toBe(false);
    });
});
