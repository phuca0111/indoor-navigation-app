/* WebsiteCmsAudit — định dạng audit tách khỏi facade DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WebsiteCmsAudit = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function actor(item) {
    return item?.actor_id?.full_name || item?.actor_id?.email || item?.actor_id?._id || '—';
  }

  function canRestore(item) {
    return Boolean(item && (item.after || item.before));
  }

  function date(value, locale) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(locale || 'vi-VN');
  }

  return Object.freeze({ actor, canRestore, date });
});
