// ============================================================
// UI-SHELL.JS — Phase UI: ribbon, sidebar tabs, focus, collapse
// ============================================================
(function () {
    'use strict';

    var STORAGE_KEY = 'wme_ui_shell_v2';

    function layoutReflow() {
        function run() {
            if (typeof resizeCanvas === 'function') {
                resizeCanvas();
                if (typeof draw === 'function') draw();
            }
        }
        requestAnimationFrame(function () {
            run();
            /* Chờ CSS transition panel (0.2s) rồi resize lại để canvas đầy ngang */
            setTimeout(run, 220);
        });
    }

    function loadPrefs() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function savePrefs(p) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
        } catch (e) { /* ignore */ }
    }

    function qs(sel, root) {
        return (root || document).querySelector(sel);
    }

    function qsa(sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }

    function setActive(els, activeEl, attr) {
        els.forEach(function (el) {
            el.classList.toggle('active', el === activeEl);
            if (attr && el.dataset) {
                el.setAttribute('aria-selected', el === activeEl ? 'true' : 'false');
            }
        });
    }

    function initRibbon() {
        var tabs = qsa('.ribbon-tab');
        var panels = qsa('.ribbon-panel');
        if (!tabs.length) return;

        function show(tabId) {
            var panel = panels.find(function (p) { return p.dataset.panel === tabId; });
            var tab = tabs.find(function (t) { return t.dataset.tab === tabId; });
            if (!panel || !tab) return;
            setActive(tabs, tab, true);
            setActive(panels, panel, false);
            var prefs = loadPrefs();
            prefs.ribbonTab = tabId;
            savePrefs(prefs);
        }

        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                show(tab.dataset.tab);
            });
        });

        var prefs = loadPrefs();
        show(prefs.ribbonTab || 'draw');
    }

    function initSidebarTabs(sidebarSel, tabSel, panelSel, prefKey, defaultTab) {
        var root = qs(sidebarSel);
        if (!root) return;
        var tabs = qsa(tabSel, root);
        var panels = qsa(panelSel, root);
        if (!tabs.length) return;

        function show(tabId) {
            var panel = panels.find(function (p) { return p.dataset.stab === tabId || p.dataset.rtab === tabId; });
            var tab = tabs.find(function (t) { return t.dataset.stab === tabId || t.dataset.rtab === tabId; });
            if (!panel || !tab) return;
            setActive(tabs, tab, true);
            setActive(panels, panel, false);
            var prefs = loadPrefs();
            prefs[prefKey] = tabId;
            savePrefs(prefs);
        }

        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                show(tab.dataset.stab || tab.dataset.rtab);
            });
        });

        var prefs = loadPrefs();
        show(prefs[prefKey] || defaultTab);
    }

    function applyBodyClass(cls, on) {
        document.body.classList.toggle(cls, !!on);
        var prefs = loadPrefs();
        prefs[cls] = !!on;
        savePrefs(prefs);
        refreshCollapseButtons();
    }

    function refreshCollapseButtons() {
        var leftBtn = qs('#btnCollapseLeft');
        var rightBtn = qs('#btnCollapseRight');
        var body = document.body;
        if (leftBtn) {
            leftBtn.textContent = body.classList.contains('left-collapsed') ? '›' : '‹';
            leftBtn.title = body.classList.contains('left-collapsed') ? 'Hiện panel trái' : 'Ẩn panel trái';
        }
        if (rightBtn) {
            rightBtn.textContent = body.classList.contains('right-collapsed') ? '‹' : '›';
            rightBtn.title = body.classList.contains('right-collapsed') ? 'Hiện panel phải' : 'Ẩn panel phải';
        }
        var focusBtn = qs('#btnFocusCanvas');
        if (focusBtn) {
            focusBtn.classList.toggle('active', body.classList.contains('focus-mode'));
            focusBtn.textContent = body.classList.contains('focus-mode')
                ? 'Thoát toàn màn hình'
                : 'Toàn màn hình bản vẽ';
            focusBtn.title = body.classList.contains('focus-mode')
                ? 'Hiện lại panel trái/phải'
                : 'Ẩn panel hai bên — bản vẽ rộng hết';
        }
    }

    function initCollapseAndFocus() {
        var prefs = loadPrefs();
        /* v2: mặc định hiện panel trái/phải — không restore collapse cũ từ wireframe v1 */
        if (prefs['focus-mode']) document.body.classList.add('focus-mode');
        if (prefs['ribbon-collapsed']) document.body.classList.add('ribbon-collapsed');
        if (prefs['left-collapsed'] === true) document.body.classList.add('left-collapsed');
        if (prefs['right-collapsed'] === true) document.body.classList.add('right-collapsed');

        var leftBtn = qs('#btnCollapseLeft');
        var rightBtn = qs('#btnCollapseRight');
        var focusBtn = qs('#btnFocusCanvas');
        var ribbonBtn = qs('#btnCollapseRibbon');

        if (leftBtn) {
            leftBtn.addEventListener('click', function () {
                applyBodyClass('left-collapsed', !document.body.classList.contains('left-collapsed'));
                layoutReflow();
            });
        }
        if (rightBtn) {
            rightBtn.addEventListener('click', function () {
                applyBodyClass('right-collapsed', !document.body.classList.contains('right-collapsed'));
                layoutReflow();
            });
        }
        if (focusBtn) {
            focusBtn.addEventListener('click', function () {
                var on = !document.body.classList.contains('focus-mode');
                document.body.classList.toggle('focus-mode', on);
                var p = loadPrefs();
                p['focus-mode'] = on;
                savePrefs(p);
                refreshCollapseButtons();
                layoutReflow();
            });
        }
        if (ribbonBtn) {
            ribbonBtn.addEventListener('click', function () {
                applyBodyClass('ribbon-collapsed', !document.body.classList.contains('ribbon-collapsed'));
                layoutReflow();
            });
        }

        refreshCollapseButtons();
    }

    function syncExplorerMirrors() {
        var map = [
            ['#editorProjectName', '#explorerProjectMirror'],
            ['#editorBuildingName', '#explorerBuildingMirror'],
            ['#editorFloorLabel', '#explorerFloorMirror'],
            ['#editorMapVersion', '#explorerVersionMirror']
        ];
        map.forEach(function (pair) {
            var src = qs(pair[0]);
            var dst = qs(pair[1]);
            if (src && dst) dst.textContent = src.textContent || '—';
        });
    }

    function syncProjectCrumb() {
        var building = qs('#editorBuildingName');
        var project = qs('#editorProjectName');
        if (project && building) {
            project.textContent = building.textContent || '—';
        }
        syncExplorerMirrors();
    }

    function initStatusPills() {
        var snapCheck = qs('#snapCheck');
        var gridCheck = qs('#gridCheck');
        var snapPill = qs('#statusSnapPill');
        var gridPill = qs('#statusGridPill');
        var publishPill = qs('#statusPublishPill');

        function refreshSnapGrid() {
            if (snapPill && snapCheck) {
                snapPill.textContent = 'Hút lưới: ' + (snapCheck.checked ? 'Bật' : 'Tắt');
                snapPill.classList.toggle('on', snapCheck.checked);
            }
            if (gridPill && gridCheck) {
                gridPill.textContent = 'Lưới: ' + (gridCheck.checked ? 'Bật' : 'Tắt');
                gridPill.classList.toggle('on', gridCheck.checked);
            }
        }

        if (snapCheck) snapCheck.addEventListener('change', refreshSnapGrid);
        if (gridCheck) gridCheck.addEventListener('change', refreshSnapGrid);
        refreshSnapGrid();

        function refreshPublish() {
            if (!publishPill) return;
            var el = qs('#editorVersionLifecycle');
            var t = el ? el.textContent : 'Draft';
            publishPill.textContent = t.length > 24 ? t.slice(0, 22) + '…' : t;
            publishPill.classList.toggle('on', el && el.classList.contains('editor-status-published'));
        }

        refreshPublish();
        if (window.EditorCore && EditorCore.eventBus && typeof EditorCore.eventBus.on === 'function') {
            EditorCore.eventBus.on('version:changed', refreshPublish);
        }
        setInterval(refreshPublish, 2000);
    }

    function wireProjectBarActions() {
        var draftBtn = qs('#btnProjectDraft');
        var pubBtn = qs('#btnProjectPublish');
        var validateBtn = qs('#btnProjectValidate');
        if (draftBtn) {
            draftBtn.addEventListener('click', function () {
                if (typeof saveDraftToServer === 'function') saveDraftToServer();
            });
        }
        if (validateBtn) {
            validateBtn.addEventListener('click', function () {
                if (window.ValidationUI && typeof ValidationUI.runFull === 'function') {
                    ValidationUI.runFull();
                }
            });
        }
        if (pubBtn) {
            pubBtn.addEventListener('click', function () {
                if (typeof saveMapToServer === 'function') saveMapToServer();
            });
        }
    }

    var LEFT_MIN = 200;
    var LEFT_MAX = 560;

    function readShellPrefs() {
        try {
            var raw = localStorage.getItem('wme_ui_shell_v2');
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }

    function writeShellPref(key, value) {
        try {
            var prefs = readShellPrefs();
            prefs[key] = value;
            localStorage.setItem('wme_ui_shell_v2', JSON.stringify(prefs));
        } catch (e) { /* ignore */ }
    }

    function applyLeftWidth(px) {
        var w = Math.max(LEFT_MIN, Math.min(LEFT_MAX, Math.round(px)));
        document.body.style.setProperty('--left-width', w + 'px');
        return w;
    }

    function initLeftResize() {
        var left = qs('#shellLeft');
        if (!left) return;
        var prefs = readShellPrefs();
        if (prefs.leftWidth) applyLeftWidth(prefs.leftWidth);

        var handle = document.createElement('div');
        handle.className = 'shell-left-resizer';
        handle.title = 'Kéo để đổi rộng panel (nhấp đúp để đặt lại)';
        left.appendChild(handle);

        var dragging = false;

        handle.addEventListener('pointerdown', function (e) {
            dragging = true;
            handle.classList.add('dragging');
            try { handle.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
            e.preventDefault();
        });

        window.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var rect = left.getBoundingClientRect();
            applyLeftWidth(e.clientX - rect.left);
            layoutReflow();
        });

        window.addEventListener('pointerup', function () {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove('dragging');
            var cur = getComputedStyle(document.body).getPropertyValue('--left-width');
            writeShellPref('leftWidth', parseInt(cur, 10) || 260);
        });

        handle.addEventListener('dblclick', function () {
            applyLeftWidth(260);
            writeShellPref('leftWidth', 260);
            layoutReflow();
        });
    }

    function initUiShell() {
        if (!document.body.classList.contains('phase-ui')) return;
        initRibbon();
        initSidebarTabs('#shellLeft', '.sidebar-tab', '.sidebar-panel', 'leftTab', 'layers');
        initSidebarTabs('#shellRight', '.right-tab', '.right-panel', 'rightTab', 'properties');
        initCollapseAndFocus();
        initLeftResize();
        wireProjectBarActions();
        syncProjectCrumb();
        initStatusPills();

        var obs = new MutationObserver(syncProjectCrumb);
        ['#editorBuildingName', '#editorFloorLabel', '#editorMapVersion'].forEach(function (sel) {
            var el = qs(sel);
            if (el) obs.observe(el, { childList: true, characterData: true, subtree: true });
        });

        window.addEventListener('resize', layoutReflow);

        layoutReflow();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUiShell);
    } else {
        initUiShell();
    }

    window.initUiShell = initUiShell;
    window.refreshUiShellCollapse = refreshCollapseButtons;
    window.uiShellLayoutReflow = layoutReflow;
})();
