// ============================================================

// ASSET-MANAGER.JS — Quản lý ảnh nền, symbol, QR template (Phase 0.5 skeleton)

// Spec: webedit_nangcap.md §5.16 — background qua AssetManager thay scatter Base64

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



    var rootRef = typeof globalThis !== 'undefined' ? globalThis : this;



    var ASSET_TYPE = {

        IMAGE: 'images',

        SYMBOL: 'symbols',

        QR_TEMPLATE: 'qr-templates'

    };



    var store = Object.create(null);

    var backgroundAssetId = null;

    var idCounter = 0;

    var backgroundReady = Promise.resolve();



    function emitChanged(detail) {

        if (rootRef.EditorCore && rootRef.EditorCore.eventBus) {

            rootRef.EditorCore.eventBus.emit('ASSET_CHANGED', detail || {});

        }

    }



    function nextId(prefix) {

        idCounter += 1;

        return (prefix || 'asset') + '_' + idCounter;

    }



    function register(type, asset) {

        asset = asset || {};

        var id = asset.id || nextId(type);

        var entry = {

            id: id,

            type: type || ASSET_TYPE.IMAGE,

            dataUrl: asset.dataUrl || asset.data || '',

            mime: asset.mime || guessMime(asset.dataUrl || asset.data),

            meta: asset.meta || {}

        };

        store[id] = entry;

        emitChanged({ action: 'register', asset: entry });

        return entry;

    }



    function guessMime(dataUrl) {

        if (!dataUrl || typeof dataUrl !== 'string') return '';

        var m = dataUrl.match(/^data:([^;]+);/);

        return m ? m[1] : '';

    }



    function get(id) {

        return store[id] ? Object.assign({}, store[id]) : null;

    }



    function unregister(id) {

        if (!store[id]) return false;

        if (id === backgroundAssetId) backgroundAssetId = null;

        delete store[id];

        emitChanged({ action: 'unregister', id: id });

        return true;

    }



    function listByType(type) {

        return Object.keys(store)

            .filter(function (id) { return store[id].type === type; })

            .map(function (id) { return Object.assign({}, store[id]); });

    }



    function loadBackgroundImageElement(dataUrl) {

        if (!dataUrl || typeof Image === 'undefined') {

            return Promise.resolve(null);

        }

        return new Promise(function (resolve) {

            var img = new Image();

            img.onload = function () {

                rootRef.bgImage = img;

                resolve(img);

            };

            img.onerror = function () { resolve(null); };

            img.src = dataUrl;

        });

    }



    function syncLegacyGlobals(dataUrl) {

        rootRef.bgImageBase64 = dataUrl || '';

        if (!dataUrl) rootRef.bgImage = null;

    }



    /**

     * Đặt ảnh nền từ data URL — đồng bộ window.bgImageBase64 / bgImage (legacy).

     * @param {string} dataUrl

     * @param {object} [meta]

     * @returns {string} asset id

     */

    function setBackgroundFromDataUrl(dataUrl, meta) {

        if (backgroundAssetId) unregister(backgroundAssetId);

        if (!dataUrl) {

            backgroundAssetId = null;

            backgroundReady = Promise.resolve();

            syncLegacyGlobals('');

            emitChanged({ action: 'background-cleared' });

            return null;

        }

        var entry = register(ASSET_TYPE.IMAGE, {

            dataUrl: dataUrl,

            meta: Object.assign({ role: 'background' }, meta || {})

        });

        backgroundAssetId = entry.id;

        syncLegacyGlobals(dataUrl);

        backgroundReady = loadBackgroundImageElement(dataUrl);

        emitChanged({ action: 'background-set', id: entry.id });

        return entry.id;

    }



    function whenBackgroundReady() {

        return backgroundReady;

    }



    function clearBackground() {

        return setBackgroundFromDataUrl('');

    }



    function getBackgroundAsset() {

        return backgroundAssetId ? get(backgroundAssetId) : null;

    }



    function getBackgroundDataUrl() {

        var asset = getBackgroundAsset();

        if (asset && asset.dataUrl) return asset.dataUrl;

        return rootRef.bgImageBase64 || '';

    }



    function getBackgroundId() {

        return backgroundAssetId;

    }



    /** Đọc từ legacy globals vào store (khi init editor cũ). */

    function syncFromLegacyWindow() {

        var dataUrl = rootRef.bgImageBase64 || '';

        if (!dataUrl) {

            backgroundAssetId = null;

            return null;

        }

        if (backgroundAssetId && store[backgroundAssetId] && store[backgroundAssetId].dataUrl === dataUrl) {

            return backgroundAssetId;

        }

        return setBackgroundFromDataUrl(dataUrl, { source: 'legacy-sync' });

    }



    function reset() {

        store = Object.create(null);

        backgroundAssetId = null;

        idCounter = 0;

        emitChanged({ action: 'reset' });

    }



    return {

        ASSET_TYPE: ASSET_TYPE,

        register: register,

        get: get,

        unregister: unregister,

        listByType: listByType,

        setBackgroundFromDataUrl: setBackgroundFromDataUrl,

        clearBackground: clearBackground,

        getBackgroundAsset: getBackgroundAsset,

        getBackgroundDataUrl: getBackgroundDataUrl,

        getBackgroundId: getBackgroundId,

        whenBackgroundReady: whenBackgroundReady,

        syncFromLegacyWindow: syncFromLegacyWindow,

        reset: reset

    };

});


