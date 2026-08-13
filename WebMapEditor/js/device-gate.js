// ============================================================
// DEVICE-GATE.JS — Điện thoại / iPad hẹp: không biên tập trên canvas
// Máy tính: đầy đủ. iPad ngang (>= 900px): vào Editor, thu panel.
// ============================================================
(function () {
    'use strict';

    var TABLET_COLLAPSE_FLAG = 'wme_tablet_panels_collapsed';

    function classify() {
        var w = window.innerWidth || 0;
        var h = window.innerHeight || 0;
        var minSide = Math.min(w, h);
        var coarse = false;
        try {
            coarse = window.matchMedia('(pointer: coarse)').matches ||
                window.matchMedia('(hover: none)').matches;
        } catch (e) { /* ignore */ }
        var touchPoints = Number(navigator.maxTouchPoints || 0);
        var isTouch = coarse || touchPoints > 1;

        if (!isTouch) return 'desktop';
        if (minSide < 600) return 'phone';
        if (w >= 900) return 'tablet';
        return 'tablet-portrait';
    }

    function qs(sel) {
        return document.querySelector(sel);
    }

    function setBlocked(on, mode) {
        document.documentElement.classList.toggle('editor-device-blocked', !!on);
        document.body.classList.toggle('editor-device-blocked', !!on);
        var gate = qs('#editorDeviceGate');
        if (gate) {
            gate.hidden = !on;
            gate.setAttribute('aria-hidden', on ? 'false' : 'true');
        }
        var title = qs('#editorDeviceGateTitle');
        var body = qs('#editorDeviceGateBody');
        if (mode === 'phone') {
            if (title) title.textContent = 'Dùng máy tính để biên tập bản đồ';
            if (body) {
                body.textContent = 'Web Map Editor cần màn hình lớn, chuột và bàn phím. ' +
                    'Điện thoại không phù hợp để vẽ phòng, đường đi hay mốc QR. ' +
                    'Hãy mở Editor trên máy tính. Ứng dụng Android dùng để dẫn đường, không phải để vẽ bản đồ.';
            }
        } else if (mode === 'tablet-portrait') {
            if (title) title.textContent = 'Xoay ngang máy hoặc dùng máy tính';
            if (body) {
                body.textContent = 'iPad / máy tính bảng đang ở chế độ dọc, vùng vẽ quá hẹp. ' +
                    'Xoay ngang (chiều rộng khoảng 900px trở lên) để xem và chỉnh nhẹ, ' +
                    'hoặc mở trên máy tính để biên tập đầy đủ.';
            }
        }
        var app = qs('.app-container');
        if (app) app.setAttribute('aria-hidden', on ? 'true' : 'false');
    }

    function applyTabletLayout(on) {
        document.body.classList.toggle('editor-tablet', !!on);
        var banner = qs('#editorTabletBanner');
        if (banner) banner.hidden = !on;
        if (!on) {
            try { sessionStorage.removeItem(TABLET_COLLAPSE_FLAG); } catch (e) { /* ignore */ }
            return;
        }
        var already = false;
        try { already = sessionStorage.getItem(TABLET_COLLAPSE_FLAG) === '1'; } catch (e) { /* ignore */ }
        if (!already) {
            document.body.classList.add('left-collapsed');
            document.body.classList.add('right-collapsed');
            try { sessionStorage.setItem(TABLET_COLLAPSE_FLAG, '1'); } catch (e) { /* ignore */ }
        }
        if (typeof window.refreshUiShellCollapse === 'function') {
            window.refreshUiShellCollapse();
        }
        if (typeof window.uiShellLayoutReflow === 'function') {
            window.uiShellLayoutReflow();
        }
    }

    function apply() {
        var mode = classify();
        if (mode === 'phone' || mode === 'tablet-portrait') {
            setBlocked(true, mode);
            applyTabletLayout(false);
            return;
        }
        setBlocked(false, mode);
        applyTabletLayout(mode === 'tablet');
    }

    function init() {
        var dash = qs('#btnDeviceGateDashboard');
        if (dash) {
            dash.addEventListener('click', function () {
                window.location.href = '/admin/dashboard.html';
            });
        }
        var dismissBanner = qs('#btnDismissTabletBanner');
        if (dismissBanner) {
            dismissBanner.addEventListener('click', function () {
                var banner = qs('#editorTabletBanner');
                if (banner) banner.hidden = true;
            });
        }
        apply();
        window.addEventListener('resize', apply);
        window.addEventListener('orientationchange', function () {
            setTimeout(apply, 250);
        });
    }

    window.EditorDeviceGate = {
        classify: classify,
        apply: apply
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
