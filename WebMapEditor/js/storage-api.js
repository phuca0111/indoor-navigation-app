// ============================================================
// STORAGE-API.JS — WE6: Upload ảnh nền → Object Storage (URL)
// POST/DELETE /api/v1/buildings/:id/floors/:floor/assets/background
// ============================================================

var STORAGE_V1_PREFIX = '/api/v1';

function buildBackgroundAssetUrl(buildingId, floor) {
    return STORAGE_V1_PREFIX + '/buildings/' + encodeURIComponent(buildingId) +
        '/floors/' + encodeURIComponent(floor) + '/assets/background';
}

async function parseJsonResponse(resp) {
    try {
        return await resp.json();
    } catch (e) {
        return {};
    }
}

/** Ưu tiên đường dẫn /uploads/... để map_data không phụ thuộc host. */
function toRelativeUploadUrl(url) {
    if (!url || typeof url !== 'string') return '';
    var idx = url.indexOf('/uploads/');
    if (idx >= 0) return url.slice(idx);
    return url;
}

function isBase64DataUrl(value) {
    return typeof value === 'string' &&
        /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value.trim());
}

function isHttpOrUploadUrl(value) {
    if (!value || typeof value !== 'string') return false;
    var v = value.trim();
    if (isBase64DataUrl(v)) return false;
    return /^https?:\/\//i.test(v) || v.indexOf('/uploads/') === 0;
}

/**
 * POST multipart field "file"
 * @param {File|Blob} file
 * @param {function} apiFetchFn — apiFetch (có Bearer); không set Content-Type
 */
async function uploadBackground(buildingId, floor, file, apiFetchFn, options) {
    options = options || {};
    if (!buildingId || floor == null || floor === '') {
        return { ok: false, skipped: true, error: 'Thiếu buildingId/floor' };
    }
    if (!file) {
        return { ok: false, error: 'Thiếu file', code: 'STORAGE_NO_FILE' };
    }
    if (typeof apiFetchFn !== 'function') {
        return { ok: false, error: 'apiFetch không có' };
    }

    var form = new FormData();
    var filename = options.filename ||
        (file && file.name) ||
        'background.png';
    form.append('file', file, filename);

    var resp = await apiFetchFn(buildBackgroundAssetUrl(buildingId, floor), {
        method: 'POST',
        body: form
    });
    var data = await parseJsonResponse(resp);

    if (resp.status === 401) return { unauthorized: true, data: data, resp: resp };
    if (resp.status === 403) {
        return { forbidden: true, message: data.message, data: data, resp: resp };
    }
    if (resp.status === 201 || resp.ok) {
        var url = toRelativeUploadUrl(data.url || '');
        return {
            ok: true,
            key: data.key,
            url: url,
            absoluteUrl: data.url,
            bytes: data.bytes,
            mime: data.mime,
            backend: data.backend,
            data: data,
            resp: resp
        };
    }
    return {
        ok: false,
        status: resp.status,
        code: data.code,
        message: data.message || ('Upload thất bại (HTTP ' + resp.status + ')'),
        data: data,
        resp: resp
    };
}

/** DELETE body: { key } */
async function deleteBackground(buildingId, floor, key, apiFetchFn) {
    if (!buildingId || floor == null || floor === '' || !key) {
        return { ok: false, skipped: true };
    }
    if (typeof apiFetchFn !== 'function') {
        return { ok: false, error: 'apiFetch không có' };
    }

    var resp = await apiFetchFn(buildBackgroundAssetUrl(buildingId, floor), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key })
    });
    var data = await parseJsonResponse(resp);
    if (resp.ok) return { ok: true, data: data, resp: resp };
    return {
        ok: false,
        status: resp.status,
        message: data.message,
        code: data.code,
        data: data,
        resp: resp
    };
}

/** dataURL → Blob (để upload lại sau Crop/Deskew) */
function dataUrlToBlob(dataUrl) {
    if (!isBase64DataUrl(dataUrl)) return null;
    var parts = dataUrl.split(',');
    var mimeMatch = parts[0].match(/data:([^;]+)/);
    var mime = mimeMatch ? mimeMatch[1] : 'image/png';
    var bin = atob(parts[1] || '');
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
}

async function uploadBackgroundDataUrl(buildingId, floor, dataUrl, apiFetchFn, options) {
    var blob = dataUrlToBlob(dataUrl);
    if (!blob) {
        return { ok: false, error: 'Không phải data URL ảnh' };
    }
    var ext = (blob.type || '').indexOf('jpeg') >= 0 ? 'jpg' :
        ((blob.type || '').indexOf('webp') >= 0 ? 'webp' :
            ((blob.type || '').indexOf('gif') >= 0 ? 'gif' : 'png'));
    return uploadBackground(buildingId, floor, blob, apiFetchFn, {
        filename: (options && options.filename) || ('background.' + ext)
    });
}

var StorageApi = {
    STORAGE_V1_PREFIX: STORAGE_V1_PREFIX,
    buildBackgroundAssetUrl: buildBackgroundAssetUrl,
    toRelativeUploadUrl: toRelativeUploadUrl,
    isBase64DataUrl: isBase64DataUrl,
    isHttpOrUploadUrl: isHttpOrUploadUrl,
    uploadBackground: uploadBackground,
    deleteBackground: deleteBackground,
    dataUrlToBlob: dataUrlToBlob,
    uploadBackgroundDataUrl: uploadBackgroundDataUrl
};

if (typeof window !== 'undefined') {
    window.StorageApi = StorageApi;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageApi;
}
