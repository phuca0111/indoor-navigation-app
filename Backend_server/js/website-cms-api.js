/* WebsiteCmsApi — lớp HTTP nhỏ, facade WebsiteCms vẫn là API công khai. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WebsiteCmsApi = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  async function request(path, options) {
    if (typeof root.apiFetch !== 'function') throw new Error('apiFetch chưa sẵn sàng');
    const response = await root.apiFetch('/website' + path, options || {});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || ('HTTP ' + response.status));
    return body;
  }

  function upload(path, form, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new root.XMLHttpRequest();
      xhr.open('POST', '/api/website' + path);
      const token = root.localStorage?.getItem('token');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && typeof onProgress === 'function') {
          onProgress(Math.round(event.loaded * 100 / event.total));
        }
      };
      xhr.onload = () => {
        let body = {};
        try { body = JSON.parse(xhr.responseText || '{}'); } catch (_) { /* empty body */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.message || ('HTTP ' + xhr.status)));
      };
      xhr.onerror = () => reject(new Error('Mất kết nối khi upload.'));
      xhr.send(form);
    });
  }

  return Object.freeze({ request, upload });
});
