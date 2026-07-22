/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WebEditor accessibility helpers', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = `
      <span id="autosaveStatus"></span>
      <span id="editorVersionLifecycle"></span>
      <div class="ribbon-tabs">
        <button class="ribbon-tab active" data-tab="draw">Vẽ</button>
        <button class="ribbon-tab" data-tab="edit">Sửa</button>
      </div>
      <div class="ribbon-panel active" data-panel="draw"></div>
      <div class="ribbon-panel" data-panel="edit"></div>
      <aside id="shellLeft"><div class="sidebar-tabs"></div></aside>
      <aside id="shellRight"><div class="right-tabs"></div></aside>
      <canvas id="mapCanvas"></canvas>
    `;
    await import('../js/accessibility-ui.js?' + Date.now());
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  it('đặt accessible name và fallback cho canvas', () => {
    const canvas = document.getElementById('mapCanvas');
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toContain('Bản vẽ tầng');
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.textContent).toContain('không hỗ trợ canvas');
  });

  it('hỗ trợ tab semantics và phím mũi tên', () => {
    const tabs = [...document.querySelectorAll('.ribbon-tab')];
    expect(tabs[0].getAttribute('role')).toBe('tab');
    expect(document.querySelector('[data-panel="draw"]').getAttribute('role')).toBe('tabpanel');
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('autosave và publish là live region', () => {
    expect(document.getElementById('autosaveStatus').getAttribute('aria-live')).toBe('polite');
    expect(document.getElementById('editorVersionLifecycle').getAttribute('role')).toBe('status');
  });
});

describe('Admin modal manager trong happy-dom', () => {
  it('trap focus, Escape và trả focus về trigger', async () => {
    vi.resetModules();
    document.body.innerHTML = `
      <button id="trigger">Mở</button>
      <div id="dialog" class="modal" style="display:block">
        <h2>Chỉnh sửa</h2>
        <button id="first">Đầu</button>
        <button id="last">Cuối</button>
      </div>
    `;
    await import('../../Backend_server/js/dashboard-accessibility.js');
    const trigger = document.getElementById('trigger');
    const dialog = document.getElementById('dialog');
    trigger.focus();
    window.DashboardA11y.init();
    window.DashboardA11y.open(dialog, trigger);
    await Promise.resolve();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    document.getElementById('last').focus();
    document.getElementById('last').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    );
    expect(document.activeElement).toBe(document.getElementById('first'));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(trigger);
  });
});
