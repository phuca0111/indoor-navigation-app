// AD1/AD10 — App Shell: sidebar, theme, nhóm menu xổ xuống.
(function () {
  'use strict';

  const body = document.body;
  const sidebar = document.getElementById('adminSidebar');
  const openButton = document.getElementById('btnOpenSidebar');
  const closeButton = document.getElementById('btnCloseSidebar');
  const overlay = document.getElementById('adminSidebarOverlay');
  const tabNav = document.getElementById('tabNav');
  const pageTitle = document.getElementById('adminPageTitle');
  const themeButton = document.getElementById('btnAdminTheme');
  const mobileQuery = window.matchMedia('(max-width: 1024px)');
  const themeStorageKey = 'indoorNavAdminTheme';
  const groupStorageKey = 'indoorNavAdminNavGroups';

  if (!body || !sidebar) return;

  function setSidebarOpen(open) {
    const nextOpen = Boolean(open) && mobileQuery.matches;
    body.classList.toggle('admin-sidebar-open', nextOpen);
    openButton?.setAttribute('aria-expanded', String(nextOpen));
  }

  function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    body.dataset.adminTheme = next;
    document.documentElement.setAttribute('data-admin-theme', next);
    if (themeButton) {
      themeButton.setAttribute('aria-pressed', String(next === 'dark'));
      themeButton.setAttribute(
        'aria-label',
        next === 'dark' ? 'Bật giao diện sáng' : 'Bật giao diện tối'
      );
      themeButton.title = next === 'dark' ? 'Giao diện sáng' : 'Giao diện tối';
    }
  }

  function getInitialTheme() {
    try {
      const saved = localStorage.getItem(themeStorageKey);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (_) {
      // ignore
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function loadGroupState() {
    try {
      return JSON.parse(localStorage.getItem(groupStorageKey) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function saveGroupState(state) {
    try {
      localStorage.setItem(groupStorageKey, JSON.stringify(state || {}));
    } catch (_) {
      // ignore
    }
  }

  function setGroupOpen(group, open) {
    if (!group) return;
    const nextOpen = Boolean(open);
    const changed = group.classList.contains('is-open') !== nextOpen;
    group.classList.toggle('is-open', nextOpen);
    const toggle = group.querySelector('.admin-nav-group-toggle');
    toggle?.setAttribute('aria-expanded', String(nextOpen));
    if (!changed) return;
    const key = group.getAttribute('data-nav-group');
    if (!key) return;
    const state = loadGroupState();
    state[key] = nextOpen;
    saveGroupState(state);
  }

  function restoreGroupState() {
    const state = loadGroupState();
    tabNav?.querySelectorAll('.admin-nav-group').forEach((group) => {
      const key = group.getAttribute('data-nav-group');
      if (key && Object.prototype.hasOwnProperty.call(state, key)) {
        setGroupOpen(group, Boolean(state[key]));
      }
    });
  }

  function isTabBtnRoleVisible(btn) {
    if (!btn || btn.hasAttribute('hidden')) return false;
    // Role gating dùng style.display — KHÔNG dùng visibility
    // (submenu đang thu gọn cũng có visibility:hidden nên sẽ ẩn nhầm cả nhóm).
    if (btn.style.display === 'none') return false;
    const display = window.getComputedStyle(btn).display;
    return display !== 'none';
  }

  function syncNavGroupVisibility() {
    tabNav?.querySelectorAll('.admin-nav-group').forEach((group) => {
      // Nhóm bị ẩn trực tiếp theo role (vd. super-admin-only)
      if (group.style.display === 'none') {
        group.hidden = true;
        return;
      }
      const items = Array.from(group.querySelectorAll('.tab-btn'));
      const visible = items.some(isTabBtnRoleVisible);
      group.hidden = !visible;
      if (visible && group.style.display === 'none') {
        group.style.display = '';
      }
    });
  }

  function expandGroupForActiveTab() {
    const active = tabNav?.querySelector('.tab-btn.active');
    const group = active?.closest('.admin-nav-group');
    if (group) setGroupOpen(group, true);
  }

  function syncActiveNavigation() {
    const buttons = tabNav?.querySelectorAll('.tab-btn') || [];
    let activeLabel = '';

    buttons.forEach((button) => {
      const isActive = button.classList.contains('active');
      if (isActive) {
        button.setAttribute('aria-current', 'page');
        if (!activeLabel) {
          activeLabel = button.querySelector('span:not(.admin-menu-icon)')?.textContent?.trim()
            || button.textContent.trim();
        }
      } else {
        button.removeAttribute('aria-current');
      }
    });

    if (pageTitle && activeLabel) pageTitle.textContent = activeLabel;
    expandGroupForActiveTab();
    syncNavGroupVisibility();
  }

  themeButton?.addEventListener('click', () => {
    const nextTheme = body.dataset.adminTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    try {
      localStorage.setItem(themeStorageKey, nextTheme);
    } catch (_) {
      // ignore
    }
  });

  openButton?.setAttribute('aria-controls', 'adminSidebar');
  openButton?.setAttribute('aria-expanded', 'false');
  openButton?.addEventListener('click', () => setSidebarOpen(true));
  closeButton?.addEventListener('click', () => setSidebarOpen(false));
  overlay?.addEventListener('click', () => setSidebarOpen(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSidebarOpen(false);
  });

  tabNav?.addEventListener('click', (event) => {
    const toggle = event.target.closest('.admin-nav-group-toggle');
    if (toggle) {
      const group = toggle.closest('.admin-nav-group');
      setGroupOpen(group, !group?.classList.contains('is-open'));
      return;
    }
    if (event.target.closest('.tab-btn')) {
      setSidebarOpen(false);
      queueMicrotask(syncActiveNavigation);
    }
  });

  if (tabNav) {
    let syncQueued = false;
    new MutationObserver((mutations) => {
      const tabStateChanged = mutations.some((mutation) =>
        mutation.target instanceof Element &&
        mutation.target.classList.contains('tab-btn')
      );
      if (!tabStateChanged || syncQueued) return;
      syncQueued = true;
      queueMicrotask(() => {
        syncQueued = false;
        syncActiveNavigation();
      });
    }).observe(tabNav, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  mobileQuery.addEventListener?.('change', () => setSidebarOpen(false));
  applyTheme(getInitialTheme());
  restoreGroupState();
  syncActiveNavigation();

  window.AdminShell = {
    syncNavGroupVisibility,
    syncActiveNavigation
  };
})();
