import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AM = require('../core/asset-manager.js');

describe('AssetManager — Phase 0.5 skeleton', function () {
    beforeEach(function () {
        AM.reset();
        globalThis.bgImageBase64 = '';
        globalThis.bgImage = null;
    });

    it('setBackgroundFromDataUrl lưu asset và sync legacy', function () {
        var dataUrl = 'data:image/png;base64,abc';
        var id = AM.setBackgroundFromDataUrl(dataUrl, { name: 'floor-plan' });
        expect(id).toBeTruthy();
        expect(AM.getBackgroundDataUrl()).toBe(dataUrl);
        expect(globalThis.bgImageBase64).toBe(dataUrl);
        var asset = AM.getBackgroundAsset();
        expect(asset.type).toBe('images');
        expect(asset.meta.role).toBe('background');
    });

    it('clearBackground xóa asset và legacy', function () {
        AM.setBackgroundFromDataUrl('data:image/png;base64,xyz');
        AM.clearBackground();
        expect(AM.getBackgroundId()).toBeNull();
        expect(AM.getBackgroundDataUrl()).toBe('');
        expect(globalThis.bgImageBase64).toBe('');
        expect(globalThis.bgImage).toBeNull();
    });

    it('listByType chỉ trả assets đúng loại', function () {
        AM.register('symbols', { dataUrl: '', meta: { id: 'door-block' } });
        AM.setBackgroundFromDataUrl('data:image/png;base64,bg');
        var images = AM.listByType('images');
        var symbols = AM.listByType('symbols');
        expect(images.length).toBe(1);
        expect(symbols.length).toBe(1);
    });

    it('syncFromLegacyWindow đọc bgImageBase64', function () {
        globalThis.bgImageBase64 = 'data:image/png;base64,legacy';
        var id = AM.syncFromLegacyWindow();
        expect(id).toBeTruthy();
        expect(AM.getBackgroundDataUrl()).toBe('data:image/png;base64,legacy');
    });

    it('unregister xóa asset khỏi store', function () {
        var entry = AM.register('symbols', { dataUrl: 'x' });
        expect(AM.unregister(entry.id)).toBe(true);
        expect(AM.get(entry.id)).toBeNull();
    });
});
