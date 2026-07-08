import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Config = require('../core/config.js');

describe('EditorCore Config', function () {
    beforeEach(function () {
        Config.reset();
    });

    it('get trả default grid.size', function () {
        expect(Config.get('grid.size')).toBe(40);
    });

    it('merge override snap flags', function () {
        Config.merge({ snap: { gridEnabled: true } });
        expect(Config.get('snap.gridEnabled')).toBe(true);
        expect(Config.get('snap.edgeEnabled')).toBe(false);
    });

    it('init reset về default', function () {
        Config.merge({ grid: { size: 80 } });
        Config.init();
        expect(Config.get('grid.size')).toBe(40);
    });

    it('scale locked và ratio 0.5', function () {
        expect(Config.get('scale.ratio')).toBe(0.5);
        expect(Config.get('scale.locked')).toBe(true);
    });
});
