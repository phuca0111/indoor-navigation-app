import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const I18n = require('../core/i18n.js');
const previousDocument = globalThis.document;
const previousStorage = globalThis.localStorage;

afterEach(function () {
    globalThis.document = previousDocument;
    globalThis.localStorage = previousStorage;
});

function createDocument() {
    var textNode = { nodeType: 3, nodeValue: ' Chọn ' };
    var iconNode = { nodeType: 1, tagName: 'I' };
    var button = {
        tagName: 'BUTTON',
        childNodes: [iconNode, textNode],
        attrs: { title: 'Toàn màn hình bản vẽ' },
        hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
        getAttribute: function (name) { return this.attrs[name]; },
        setAttribute: function (name, value) { this.attrs[name] = value; }
    };
    var keyed = {
        tagName: 'SPAN',
        textContent: '',
        getAttribute: function () { return 'menu.file'; }
    };
    return {
        button: button,
        textNode: textNode,
        document: {
            documentElement: { lang: '' },
            querySelectorAll: function (selector) {
                return selector === '[data-i18n]' ? [keyed] : [button];
            }
        }
    };
}

describe('I18n toàn UI', function () {
    it('dịch text node/attribute mà không phá icon và đổi ngược về tiếng Việt', function () {
        var fixture = createDocument();
        globalThis.document = fixture.document;
        globalThis.localStorage = { setItem: function () {}, getItem: function () { return null; } };
        I18n.setLocale('en', { persist: false });
        expect(fixture.textNode.nodeValue).toBe(' Select ');
        expect(fixture.button.childNodes[0].tagName).toBe('I');
        expect(fixture.button.attrs.title).toBe('Fullscreen drawing');
        expect(fixture.document.documentElement.lang).toBe('en');

        I18n.setLocale('vi', { persist: false });
        expect(fixture.textNode.nodeValue).toBe(' Chọn ');
        expect(fixture.button.attrs.title).toBe('Toàn màn hình bản vẽ');
    });

    it('dịch nhãn tầng có số động', function () {
        var fixture = createDocument();
        fixture.textNode.nodeValue = 'Tầng 12';
        globalThis.document = fixture.document;
        I18n.setLocale('en', { persist: false });
        expect(fixture.textNode.nodeValue).toBe('Floor 12');
    });
});
