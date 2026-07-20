// AD7–AD9 — Toast, loading progress, skeleton & empty-state helpers.
// Load sau dashboard.js để bọc switchTab và bridge alert.
(function () {
  'use strict';

  const TOAST_DEFAULT_MS = 4200;
  const region = document.getElementById('adminToastRegion');
  const progressRoot = document.getElementById('adminPageProgress');
  let progressTimer = null;
  let progressActive = false;
  const nativeAlert = window.alert.bind(window);

  const ICONS = {
    inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H5.17L4 17.17V4zm0-2a2 2 0 0 0-2 2v14l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4z" fill="currentColor"/></svg>',
    table: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm2 0v3h14V5H5zm0 5v4h6v-4H5zm8 0v4h6v-4h-6zM5 16v3h6v-3H5zm8 0v3h6v-3h-6z" fill="currentColor"/></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h2v8H3v-8zm4-6h2v14H7V7zm4 4h2v10h-2V11zm4-8h2v18h-2V3zm4 10h2v8h-2v-8z" fill="currentColor"/></svg>',
    invoice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 2l5 5h-5V4zM8 13h8v2H8v-2zm0 4h8v2H8v-2z" fill="currentColor"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v1h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6zm3-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5h-2a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2V6a1 1 0 0 0-1-1H6zm13 4h-1v3h1V9z" fill="currentColor"/></svg>',
    error: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm0 4.5 7.5 13h-15L12 6.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" fill="currentColor"/></svg>'
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inferToastType(message) {
    const text = String(message || '').trim();
    const lower = text.toLowerCase();
    if (/^lỗi|^error|không (thể|mở|lưu|xóa|tạo|export)|thất bại|invalid|failed/i.test(text)) {
      return 'error';
    }
    if (/thành công|đã (lưu|tạo|cập nhật|xóa|duyệt|từ chối|khôi phục|thu)|đặt lại mật khẩu thành công/i.test(lower)) {
      return 'success';
    }
    if (/vui lòng|chọn |chỉ super|không có quyền|phải có ít nhất/i.test(lower)) {
      return 'warning';
    }
    return 'info';
  }

  function showToast(message, type, options) {
    if (!region || !message) return;
    const opts = options || {};
    const toastType = type || inferToastType(message);
    const toast = document.createElement('div');
    toast.className = 'admin-toast admin-toast--' + toastType;
    toast.setAttribute('role', toastType === 'error' ? 'alert' : 'status');
    toast.innerHTML =
      '<span class="admin-toast__icon" aria-hidden="true"></span>' +
      '<span class="admin-toast__body">' + escapeHtml(message) + '</span>' +
      '<button type="button" class="admin-toast__close" aria-label="Đóng thông báo">×</button>';
    region.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));

    const remove = () => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 220);
    };

    const timeoutMs = Number.isFinite(opts.duration) ? opts.duration : TOAST_DEFAULT_MS;
    const timer = window.setTimeout(remove, timeoutMs);
    toast.querySelector('.admin-toast__close')?.addEventListener('click', () => {
      window.clearTimeout(timer);
      remove();
    });
    return remove;
  }

  function startPageLoad() {
    if (!progressRoot) return;
    progressActive = true;
    progressRoot.classList.add('is-active');
    progressRoot.setAttribute('aria-hidden', 'false');
    const bar = progressRoot.querySelector('span');
    if (bar) {
      bar.style.width = '0%';
      window.requestAnimationFrame(() => {
        bar.style.width = '38%';
      });
    }
    window.clearTimeout(progressTimer);
    progressTimer = window.setTimeout(() => {
      if (!progressActive) return;
      const inner = progressRoot.querySelector('span');
      if (inner) inner.style.width = '72%';
    }, 320);
  }

  function stopPageLoad() {
    if (!progressRoot) return;
    progressActive = false;
    window.clearTimeout(progressTimer);
    const bar = progressRoot.querySelector('span');
    if (bar) bar.style.width = '100%';
    window.setTimeout(() => {
      progressRoot.classList.remove('is-active');
      progressRoot.setAttribute('aria-hidden', 'true');
      if (bar) bar.style.width = '0%';
    }, 260);
  }

  function skeletonCards(count) {
    const n = Math.max(1, Math.min(Number(count) || 3, 6));
    let html = '<div class="admin-skeleton-cards">';
    for (let i = 0; i < n; i += 1) {
      html +=
        '<div class="admin-skeleton-card">' +
          '<span class="admin-skeleton-line admin-skeleton-line--sm"></span>' +
          '<span class="admin-skeleton-line admin-skeleton-line--lg"></span>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  function skeletonTable(rows, cols) {
    const rowCount = Math.max(2, Math.min(Number(rows) || 4, 8));
    const colCount = Math.max(2, Math.min(Number(cols) || 5, 8));
    let html = '<div class="admin-skeleton-table-wrap"><table class="admin-skeleton-table"><tbody>';
    for (let r = 0; r < rowCount; r += 1) {
      html += '<tr>';
      for (let c = 0; c < colCount; c += 1) {
        const wide = c === 0 ? ' admin-skeleton-cell--wide' : '';
        html += '<td><span class="admin-skeleton-line' + wide + '"></span></td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  function loadingMarkup(variant, meta) {
    const kind = variant || 'text';
    if (kind === 'cards') return skeletonCards(meta && meta.count);
    if (kind === 'table') return skeletonTable(meta && meta.rows, meta && meta.cols);
    const label = (meta && meta.label) || 'Đang tải…';
    return '<p class="admin-state admin-state--loading"><span class="admin-spinner" aria-hidden="true"></span>' +
      escapeHtml(label) + '</p>';
  }

  function emptyMarkup(meta) {
    const opts = meta || {};
    const icon = ICONS[opts.icon] || ICONS.inbox;
    const title = opts.title || 'Chưa có dữ liệu';
    const hint = opts.hint || '';
    return (
      '<div class="admin-empty-state">' +
        '<div class="admin-empty-state__icon">' + icon + '</div>' +
        '<p class="admin-empty-state__title">' + escapeHtml(title) + '</p>' +
        (hint ? '<p class="admin-empty-state__hint">' + escapeHtml(hint) + '</p>' : '') +
      '</div>'
    );
  }

  function errorMarkup(message) {
    return (
      '<div class="admin-empty-state admin-empty-state--error">' +
        '<div class="admin-empty-state__icon">' + ICONS.error + '</div>' +
        '<p class="admin-empty-state__title">' + escapeHtml(message || 'Đã xảy ra lỗi') + '</p>' +
      '</div>'
    );
  }

  function bridgeAlert(message) {
    const text = String(message == null ? '' : message);
    if (!text) return;
    showToast(text, inferToastType(text));
  }

  function wrapSwitchTab() {
    if (typeof window.switchTab !== 'function' || window.switchTab.__adminUiWrapped) return;
    const original = window.switchTab;
    const wrapped = async function adminUiSwitchTab(name, options) {
      startPageLoad();
      try {
        await original(name, options);
      } finally {
        stopPageLoad();
      }
    };
    wrapped.__adminUiWrapped = true;
    window.switchTab = wrapped;
  }

  window.AdminUi = {
    showToast,
    startPageLoad,
    stopPageLoad,
    loadingMarkup,
    emptyMarkup,
    errorMarkup,
    skeletonCards,
    skeletonTable
  };

  window.alert = bridgeAlert;
  wrapSwitchTab();
})();
