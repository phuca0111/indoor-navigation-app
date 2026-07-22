/* Accessibility UI additive — không thay đổi engine/canvas rendering. */
(function (root) {
  'use strict';

  function initTabSet(tabList, tabs, panels, tabKey, panelKey) {
    if (!tabList || !tabs.length) return;
    tabList.setAttribute('role', 'tablist');
    tabs.forEach(function (tab, index) {
      var key = tab.getAttribute(tabKey);
      var panel = panels.find(function (item) { return item.getAttribute(panelKey) === key; });
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
      tab.tabIndex = tab.classList.contains('active') ? 0 : -1;
      if (panel) {
        if (!panel.id) panel.id = 'editor-panel-' + key;
        tab.setAttribute('aria-controls', panel.id);
        panel.setAttribute('role', 'tabpanel');
      }
      tab.addEventListener('click', function () {
        tabs.forEach(function (item) {
          var active = item === tab;
          item.setAttribute('aria-selected', active ? 'true' : 'false');
          item.tabIndex = active ? 0 : -1;
        });
      });
      tab.addEventListener('keydown', function (event) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        var next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        tabs[next].focus();
        tabs[next].click();
      });
    });
  }

  function init() {
    var canvas = document.getElementById('mapCanvas');
    if (canvas) {
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Bản vẽ tầng. Dùng ribbon công cụ và bảng thuộc tính để chỉnh sửa.');
      canvas.tabIndex = 0;
      if (!canvas.textContent.trim()) {
        canvas.textContent = 'Trình duyệt không hỗ trợ canvas. Hãy dùng trình duyệt hiện đại để chỉnh sửa bản đồ.';
      }
    }

    var autosave = document.getElementById('autosaveStatus');
    if (autosave) {
      autosave.setAttribute('role', 'status');
      autosave.setAttribute('aria-live', 'polite');
      autosave.setAttribute('aria-atomic', 'true');
    }
    ['editorVersionLifecycle', 'statusPublishPill'].forEach(function (id) {
      var status = document.getElementById(id);
      if (status) {
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
      }
    });

    initTabSet(
      document.querySelector('.ribbon-tabs'),
      Array.from(document.querySelectorAll('.ribbon-tab')),
      Array.from(document.querySelectorAll('.ribbon-panel')),
      'data-tab',
      'data-panel'
    );
    initTabSet(
      document.querySelector('.sidebar-tabs'),
      Array.from(document.querySelectorAll('.sidebar-tab')),
      Array.from(document.querySelectorAll('.sidebar-panel')),
      'data-stab',
      'data-stab'
    );
    initTabSet(
      document.querySelector('.right-tabs'),
      Array.from(document.querySelectorAll('.right-tab')),
      Array.from(document.querySelectorAll('.right-panel')),
      'data-rtab',
      'data-rtab'
    );

    var left = document.getElementById('shellLeft');
    var right = document.getElementById('shellRight');
    if (left) left.setAttribute('aria-label', 'Điều hướng dự án và lớp');
    if (right) right.setAttribute('aria-label', 'Thuộc tính và kiểm tra bản đồ');
    var workspace = document.querySelector('.shell-workspace');
    var command = document.querySelector('.shell-command-row');
    var statusBar = document.querySelector('.shell-status-bar');
    if (workspace) workspace.setAttribute('role', 'main');
    if (command) {
      command.setAttribute('role', 'region');
      command.setAttribute('aria-label', 'Dòng lệnh trình soạn');
    }
    if (statusBar) statusBar.setAttribute('role', 'contentinfo');

    function normalizeDynamicA11y(rootElement) {
      (rootElement || document).querySelectorAll('input,select,textarea').forEach(function (control) {
        if ((control.labels && control.labels.length) ||
            control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) return;
        var label = control.getAttribute('title') || control.getAttribute('placeholder');
        if (label) control.setAttribute('aria-label', label);
      });
      (rootElement || document).querySelectorAll('[role="tabpanel"][aria-selected]').forEach(function (panel) {
        panel.removeAttribute('aria-selected');
      });
    }
    normalizeDynamicA11y(document);
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) normalizeDynamicA11y(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
