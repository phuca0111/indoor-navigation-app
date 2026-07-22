// ============================================================
// ASSET-MANAGER.JS — Icon / texture / block refs (Phase 0.5 — §5.8)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.AssetManager = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var _registry = {};
    var _blobUrls = {};

    function register(id, meta) {
        if (!id) return false;
        _registry[id] = Object.assign({
            id: id,
            type: 'image',
            url: null,
            mime: null,
            data: null
        }, meta || {});
        return true;
    }

    function get(id) {
        return _registry[id] ? Object.assign({}, _registry[id]) : null;
    }

    function list() {
        return Object.keys(_registry).map(function (id) { return get(id); });
    }

    function unregister(id) {
        if (_blobUrls[id] && typeof URL !== 'undefined' && URL.revokeObjectURL) {
            URL.revokeObjectURL(_blobUrls[id]);
            delete _blobUrls[id];
        }
        delete _registry[id];
    }

    function createBlobUrl(id, blob) {
        if (typeof URL === 'undefined' || !URL.createObjectURL) return null;
        if (_blobUrls[id]) URL.revokeObjectURL(_blobUrls[id]);
        var url = URL.createObjectURL(blob);
        _blobUrls[id] = url;
        register(id, { url: url, mime: blob.type, type: 'blob' });
        return url;
    }

    function clear() {
        Object.keys(_registry).forEach(unregister);
    }

    /** Background map — đồng bộ với window.bgImageBase64 (legacy) */
    function getBackgroundDataUrl() {
        if (typeof globalThis !== 'undefined' && globalThis.bgImageBase64) {
            return globalThis.bgImageBase64;
        }
        if (typeof window !== 'undefined' && window.bgImageBase64) {
            return window.bgImageBase64;
        }
        var bg = get('background');
        return (bg && (bg.data || bg.url)) || '';
    }

    function setBackgroundFromDataUrl(dataUrl) {
        if (typeof globalThis !== 'undefined') globalThis.bgImageBase64 = dataUrl || '';
        if (typeof window !== 'undefined') window.bgImageBase64 = dataUrl || '';
        if (dataUrl) {
            register('background', { type: 'image', data: dataUrl, url: dataUrl });
        } else {
            unregister('background');
            if (typeof globalThis !== 'undefined') globalThis.bgStorageKey = '';
            if (typeof window !== 'undefined') window.bgStorageKey = '';
        }
        return true;
    }

    /** WE6: URL Object Storage (/uploads/...) — không Base64 */
    function setBackgroundFromUrl(url, storageKey) {
        if (typeof globalThis !== 'undefined') {
            globalThis.bgImageBase64 = url || '';
            globalThis.bgStorageKey = storageKey || '';
        }
        if (typeof window !== 'undefined') {
            window.bgImageBase64 = url || '';
            window.bgStorageKey = storageKey || '';
        }
        if (url) {
            register('background', {
                type: 'image',
                url: url,
                data: url,
                storageKey: storageKey || null
            });
        } else {
            unregister('background');
        }
        return true;
    }

    function clearBackground() {
        return setBackgroundFromDataUrl('');
    }

    return {
        register: register,
        get: get,
        list: list,
        unregister: unregister,
        createBlobUrl: createBlobUrl,
        clear: clear,
        getBackgroundDataUrl: getBackgroundDataUrl,
        setBackgroundFromDataUrl: setBackgroundFromDataUrl,
        setBackgroundFromUrl: setBackgroundFromUrl,
        clearBackground: clearBackground
    };
});
