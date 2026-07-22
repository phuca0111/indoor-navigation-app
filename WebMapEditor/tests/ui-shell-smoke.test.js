/**
 * @vitest-environment happy-dom
 * Phase UI shell smoke — kiểm tra DOM toggles (Focus/collapse) + tabs active
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('UI-Shell Smoke', function () {
  beforeEach(async function () {
    // reset localStorage giữa test
    window.localStorage.clear();
    vi.useFakeTimers();

    document.body.innerHTML = `
      <div class="shell-header"></div>

      <div class="shell-ribbon" id="shellRibbon">
        <button type="button" class="ribbon-tab" data-tab="draw" id="tabDraw">Draw</button>
        <button type="button" class="ribbon-tab" data-tab="home" id="tabHome">Home</button>
        <div class="ribbon-body">
          <div class="ribbon-panel" data-panel="draw"><button class="tool-btn" id="btnA"></button></div>
          <div class="ribbon-panel" data-panel="home"><button class="tool-btn" id="btnB"></button></div>
        </div>
      </div>

      <div class="shell-workspace">
        <aside class="shell-left" id="shellLeft">
          <div class="sidebar-tabs">
            <button type="button" class="sidebar-tab" data-stab="layers" id="stLayers">Layers</button>
            <button type="button" class="sidebar-tab" data-stab="explorer" id="stExplorer">Explorer</button>
          </div>
          <div class="sidebar-body">
            <div class="sidebar-panel active" data-stab="layers" id="spLayers"></div>
            <div class="sidebar-panel" data-stab="explorer" id="spExplorer"></div>
          </div>
        </aside>

        <div class="canvas-container">
          <div class="canvas-chrome">
            <button type="button" id="btnFocusCanvas">Focus</button>
            <button type="button" id="btnCollapseRibbon">Thu ribbon</button>
            <button type="button" id="btnCollapseLeft">‹</button>
            <button type="button" id="btnCollapseRight">›</button>
            <span class="ribbon-hint" id="currentToolStatus"></span>
          </div>
          <div class="canvas-wrapper">
            <canvas id="mapCanvas"></canvas>
          </div>
        </div>

        <aside class="shell-right properties-panel" id="shellRight">
          <div class="right-tabs">
            <button type="button" class="right-tab active" data-rtab="properties">Properties</button>
            <button type="button" class="right-tab" data-rtab="objects">Objects</button>
          </div>
          <div class="right-body">
            <div class="right-panel active" data-rtab="properties" id="rpProps"></div>
            <div class="right-panel" data-rtab="objects" id="rpObj"></div>
          </div>
        </aside>
      </div>

      <div class="shell-command-row"></div>
      <div class="shell-status-bar">
        <input id="autosaveStatus" />
        <input id="mousePos" />
        <span id="roomCount"></span>
        <input id="statusPublishPill" />
        <span id="statusSnapPill"></span>
        <span id="statusGridPill"></span>
        <input type="checkbox" id="snapCheck" checked />
        <input type="checkbox" id="gridCheck" checked />
      </div>

      <span id="editorVersionLifecycle" class="editor-status-badge editor-status-draft">Nháp</span>

      <button id="btnProjectDraft"></button>
      <button id="btnProjectPublish"></button>

      <span id="editorProjectName">—</span>
      <span id="editorBuildingName">—</span>
      <span id="editorFloorLabel">0</span>
      <span id="editorMapVersion">1</span>
    `;

    // class phase-ui để init chạy
    document.body.classList.add('phase-ui');

    // Stub resizeCanvas/draw để không crash (ui-shell.js gọi khi toggles)
    globalThis.resizeCanvas = function () { /* noop */ };
    globalThis.draw = function () { /* noop */ };
    globalThis.saveDraftToServer = function () { /* noop */ };
    globalThis.saveMapToServer = function () { /* noop */ };

    // import script (ui-shell.js tự gắn window.initUiShell)
    await import('../js/ui-shell.js');

    if (typeof window.initUiShell === 'function') window.initUiShell();

    // chạy timers để tránh setInterval ảnh hưởng
    vi.advanceTimersByTime(10);
  });

  it('UI shell initializes: panels active', function () {
    const leftActive = document.querySelector('#shellLeft .sidebar-panel.active');
    expect(leftActive).toBeTruthy();
    expect(leftActive.dataset.stab).toBe('layers');

    const rightActive = document.querySelector('#shellRight .right-panel.active');
    expect(rightActive).toBeTruthy();
    expect(rightActive.dataset.rtab).toBe('properties');
  });

  it('collapse left/right toggles classes', function () {
    const leftBtn = document.getElementById('btnCollapseLeft');
    const rightBtn = document.getElementById('btnCollapseRight');

    expect(document.body.classList.contains('left-collapsed')).toBe(false);
    leftBtn.click();
    expect(document.body.classList.contains('left-collapsed')).toBe(true);

    expect(document.body.classList.contains('right-collapsed')).toBe(false);
    rightBtn.click();
    expect(document.body.classList.contains('right-collapsed')).toBe(true);
  });

  it('focus mode toggle adds focus-mode class', function () {
    const focusBtn = document.getElementById('btnFocusCanvas');
    expect(document.body.classList.contains('focus-mode')).toBe(false);
    focusBtn.click();
    expect(document.body.classList.contains('focus-mode')).toBe(true);
  });
});

