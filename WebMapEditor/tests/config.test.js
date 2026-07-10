import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Config = require('../core/config.js');

describe('Config — mở rộng', function () {
    beforeEach(function () {
        Config.load();
    });

    it('getAll trả defaults đầy đủ nhóm chính', function () {
        var all = Config.getAll();
        expect(all.grid).toBeTruthy();
        expect(all.snap).toBeTruthy();
        expect(all.zoom).toBeTruthy();
        expect(all.autosave.intervalMs).toBe(30000);
    });

    it('merge sâu snap.modes không ghi đè toàn bộ', function () {
        Config.load({ snap: { modes: { grid: false } } });
        expect(Config.get('snap.modes.grid')).toBe(false);
        expect(Config.get('snap.modes.endpoint')).toBe(true);
    });

    it('applyToLegacy không throw khi thiếu DOM', function () {
        expect(function () {
            Config.applyToLegacy();
        }).not.toThrow();
    });

    it('units.metersPerGrid đọc được', function () {
        Config.load({ units: { metersPerGrid: 0.25 } });
        expect(Config.get('units.metersPerGrid')).toBe(0.25);
    });
});
