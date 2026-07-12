import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AssetManager = require('../core/asset-manager.js');

describe('AssetManager', function () {
    beforeEach(function () {
        AssetManager.clear();
    });

    it('register + get', function () {
        expect(AssetManager.register('icon-wc', { url: '/icons/wc.svg', type: 'image' })).toBe(true);
        var a = AssetManager.get('icon-wc');
        expect(a.url).toContain('wc');
        expect(a.type).toBe('image');
    });

    it('list trả tất cả asset', function () {
        AssetManager.register('a', { url: '/a' });
        AssetManager.register('b', { url: '/b' });
        expect(AssetManager.list()).toHaveLength(2);
    });

    it('unregister xóa asset', function () {
        AssetManager.register('tmp', { url: '/tmp' });
        AssetManager.unregister('tmp');
        expect(AssetManager.get('tmp')).toBeNull();
    });

    it('register id rỗng thất bại', function () {
        expect(AssetManager.register('', { url: '/x' })).toBe(false);
    });

    it('clear xóa hết', function () {
        AssetManager.register('x', { url: '/x' });
        AssetManager.clear();
        expect(AssetManager.list()).toHaveLength(0);
    });

    it('getBackgroundDataUrl / setBackgroundFromDataUrl', function () {
        globalThis.bgImageBase64 = '';
        AssetManager.setBackgroundFromDataUrl('data:image/png;base64,abc');
        expect(AssetManager.getBackgroundDataUrl()).toContain('abc');
        expect(globalThis.bgImageBase64).toContain('abc');
        AssetManager.clearBackground();
        expect(AssetManager.getBackgroundDataUrl()).toBe('');
    });
});
