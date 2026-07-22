import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Theme = require('../core/theme-manager.js');
const I18n = require('../core/i18n.js');

describe('ThemeManager và I18n', function () {
    var values;
    beforeEach(function () {
        values = {};
        globalThis.localStorage = {
            getItem: function (key) { return values[key] || null; },
            setItem: function (key, value) { values[key] = value; }
        };
        globalThis.document = {
            documentElement: {
                attrs: {},
                setAttribute: function (key, value) { this.attrs[key] = value; }
            },
            querySelectorAll: function () { return []; }
        };
        globalThis.matchMedia = function () {
            return { matches: true, addEventListener: function () {} };
        };
    });
    afterEach(function () {
        delete globalThis.localStorage;
        delete globalThis.document;
        delete globalThis.matchMedia;
    });

    it('theme auto theo hệ điều hành và lưu lựa chọn', function () {
        expect(Theme.init()).toBe('dark');
        expect(globalThis.document.documentElement.attrs['data-theme']).toBe('dark');
        expect(Theme.setTheme('light')).toBe('light');
        expect(values['webmapeditor.theme']).toBe('light');
        expect(Theme.normalizeTheme('invalid')).toBe('auto');
    });

    it('dịch VI/EN và nội suy biến', function () {
        I18n.register('en', { greeting: 'Hello {name}' });
        I18n.setLocale('en');
        expect(I18n.t('file.exportSvg')).toBe('Export SVG');
        expect(I18n.t('greeting', { name: 'CAD' })).toBe('Hello CAD');
        expect(values['webmapeditor.locale']).toBe('en');
    });

    it('applyToDom cập nhật text và placeholder', function () {
        var textNode = {
            tagName: 'SPAN',
            getAttribute: function () { return 'menu.file'; },
            textContent: ''
        };
        var input = {
            tagName: 'INPUT',
            getAttribute: function () { return 'status.ready'; },
            hasAttribute: function () { return true; },
            placeholder: ''
        };
        globalThis.document.querySelectorAll = function () { return [textNode, input]; };
        I18n.setLocale('vi', { persist: false });
        expect(textNode.textContent).toBe('Tệp');
        expect(input.placeholder).toBe('Sẵn sàng');
        expect(globalThis.document.documentElement.lang).toBe('vi');
    });
});
