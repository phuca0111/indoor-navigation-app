/* DashboardSession — truy cập storage phòng lỗi, giữ API globals cũ. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DashboardSession = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  function get(key, fallback) {
    try {
      const value = root.localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      root.localStorage.setItem(key, String(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function remove(keys) {
    try {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => root.localStorage.removeItem(key));
      return true;
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ get, set, remove });
});
