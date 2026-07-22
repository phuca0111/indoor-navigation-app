/* A11y helpers dùng chung Admin: modal, tabs, route focus và live status. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DashboardA11y = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  let activeModal = null;
  let restoreTarget = null;

  const focusableSelector = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function focusables(container) {
    return Array.from(container?.querySelectorAll(focusableSelector) || [])
      .filter((el) => !el.hidden && el.getAttribute('aria-hidden') !== 'true');
  }

  function labelModal(modal) {
    if (!modal) return;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const heading = modal.querySelector('h1,h2,h3,h4,[data-modal-title]');
    if (heading) {
      if (!heading.id) heading.id = modal.id + '-title';
      modal.setAttribute('aria-labelledby', heading.id);
    } else if (!modal.hasAttribute('aria-label')) {
      modal.setAttribute('aria-label', 'Hộp thoại');
    }
  }

  function open(modal, trigger) {
    modal = typeof modal === 'string' ? root.document?.querySelector(modal) : modal;
    if (!modal) return false;
    labelModal(modal);
    activeModal = modal;
    restoreTarget = trigger || root.document.activeElement;
    modal.removeAttribute('aria-hidden');
    const first = focusables(modal)[0] || modal;
    if (!modal.hasAttribute('tabindex')) modal.tabIndex = -1;
    setTimeout(() => first.focus(), 0);
    return true;
  }

  function close(modal) {
    modal = modal || activeModal;
    if (!modal) return false;
    modal.setAttribute('aria-hidden', 'true');
    activeModal = null;
    if (restoreTarget?.isConnected) restoreTarget.focus();
    restoreTarget = null;
    return true;
  }

  function onKeydown(event) {
    if (!activeModal) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      const closeButton = activeModal.querySelector('[data-modal-close],.modal-close,.close');
      if (closeButton) closeButton.click();
      else close(activeModal);
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables(activeModal);
    if (!items.length) {
      event.preventDefault();
      activeModal.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && root.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && root.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function initModals() {
    root.document.querySelectorAll('.modal,[data-modal]').forEach(labelModal);
    root.document.addEventListener('keydown', onKeydown);
    const observer = new root.MutationObserver(() => {
      root.document.querySelectorAll('.modal,[data-modal]').forEach((modal) => {
        labelModal(modal);
        const style = root.getComputedStyle(modal);
        const visible = !modal.hidden && style.display !== 'none' && style.visibility !== 'hidden';
        if (visible && activeModal !== modal) open(modal);
        if (!visible && activeModal === modal) close(modal);
      });
    });
    observer.observe(root.document.body, { subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
  }

  function initTabs(container, tabSelector, panelSelector, keyName) {
    if (!container) return;
    const tabs = Array.from(container.querySelectorAll(tabSelector));
    const panels = Array.from(root.document.querySelectorAll(panelSelector));
    if (!tabs.length) return;
    container.setAttribute('role', 'tablist');
    tabs.forEach((tab, index) => {
      const key = tab.getAttribute(keyName);
      const panel = panels.find((item) => item.getAttribute(keyName.replace('data-', 'data-').replace('-sub', '-panel')) === key);
      tab.setAttribute('role', 'tab');
      tab.tabIndex = tab.classList.contains('active') ? 0 : -1;
      if (panel) {
        if (!panel.id) panel.id = 'tabpanel-' + key;
        tab.setAttribute('aria-controls', panel.id);
        panel.setAttribute('role', 'tabpanel');
      }
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        tabs[next].focus();
        tabs[next].click();
      });
    });
  }

  function focusRouteHeading(panel) {
    const heading = panel?.querySelector('h1,h2,h3');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  function announce(message, politeness) {
    let region = root.document.getElementById('adminRouteStatus');
    if (!region) {
      region = root.document.createElement('div');
      region.id = 'adminRouteStatus';
      region.className = 'sr-only';
      root.document.body.appendChild(region);
    }
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', politeness || 'polite');
    region.textContent = '';
    setTimeout(() => { region.textContent = String(message || ''); }, 0);
  }

  function init() {
    initModals();
    root.document.querySelectorAll('[role="tablist"]').forEach((list) => {
      const tabs = Array.from(list.querySelectorAll(':scope > button'));
      tabs.forEach((tab, index) => {
        tab.setAttribute('role', 'tab');
        const selected = tab.classList.contains('active') || tab.classList.contains('is-active');
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.tabIndex = selected || (!tabs.some((item) => item.classList.contains('active') || item.classList.contains('is-active')) && index === 0) ? 0 : -1;
      });
    });
    root.document.querySelectorAll('input,select,textarea').forEach((control) => {
      if (control.labels?.length || control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) return;
      const label = control.getAttribute('title') || control.getAttribute('placeholder');
      if (label) control.setAttribute('aria-label', label);
    });
    const websiteNav = root.document.querySelector('[data-nav-group="website"] .admin-nav-group-items');
    initTabs(websiteNav, '.website-tab-btn', '[data-website-panel]', 'data-website-sub');
  }

  return Object.freeze({ init, open, close, focusRouteHeading, announce, labelModal });
});
