(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(root);
    else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.ThemeManager = factory(root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    var KEY = 'webmapeditor.theme';
    var current = 'auto';

    function normalize(value) {
        return ['light', 'dark', 'auto'].indexOf(value) >= 0 ? value : 'auto';
    }
    function resolve(value) {
        value = normalize(value);
        if (value !== 'auto') return value;
        return root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function apply(value) {
        current = normalize(value);
        var resolved = resolve(current);
        if (root.document && root.document.documentElement) {
            root.document.documentElement.setAttribute('data-theme', resolved);
            root.document.documentElement.setAttribute('data-theme-mode', current);
        }
        return resolved;
    }
    function setTheme(value, options) {
        value = normalize(value);
        if (!options || options.persist !== false) {
            try { root.localStorage && root.localStorage.setItem(KEY, value); } catch (_) {}
        }
        return apply(value);
    }
    function init() {
        var saved = 'auto';
        try { saved = root.localStorage && root.localStorage.getItem(KEY) || 'auto'; } catch (_) {}
        var resolved = apply(saved);
        if (root.matchMedia) {
            var media = root.matchMedia('(prefers-color-scheme: dark)');
            var listener = function () { if (current === 'auto') apply('auto'); };
            if (media.addEventListener) media.addEventListener('change', listener);
            else if (media.addListener) media.addListener(listener);
        }
        return resolved;
    }
    return {
        init: init, setTheme: setTheme, getTheme: function () { return current; },
        resolveTheme: resolve, normalizeTheme: normalize
    };
});
