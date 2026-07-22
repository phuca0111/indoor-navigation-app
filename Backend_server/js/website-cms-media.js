/* WebsiteCmsMedia — helpers render/pagination thuần cho facade. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WebsiteCmsMedia = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function pagination(page, totalPages) {
    const current = Math.max(1, Number(page) || 1);
    const total = Math.max(1, Number(totalPages) || 1);
    return Object.freeze({
      page: Math.min(current, total),
      totalPages: total,
      previous: Math.max(1, current - 1),
      next: Math.min(total, current + 1),
      hasPrevious: current > 1,
      hasNext: current < total
    });
  }

  function isImage(item) {
    return String(item?.mime || '').startsWith('image/');
  }

  return Object.freeze({ pagination, isImage });
});
