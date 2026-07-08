import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ValidationConfig = require('../core/validation-config.js');

describe('ValidationConfig — config/validation.json', function () {
    beforeEach(function () {
        ValidationConfig.reset();
    });

    it('NODE_ISOLATED mặc định error + enabled', function () {
        var rule = ValidationConfig.getRule('NODE_ISOLATED');
        expect(rule.enabled).toBe(true);
        expect(rule.severity).toBe('error');
    });

    it('QR_NO_NODE mặc định warning', function () {
        expect(ValidationConfig.getRule('QR_NO_NODE').severity).toBe('warning');
    });

    it('merge tắt rule', function () {
        ValidationConfig.merge({ rules: { NODE_ISOLATED: { enabled: false } } });
        expect(ValidationConfig.getRule('NODE_ISOLATED').enabled).toBe(false);
    });

    it('merge đổi severity', function () {
        ValidationConfig.merge({ rules: { NODE_ISOLATED: { severity: 'warning' } } });
        expect(ValidationConfig.getRule('NODE_ISOLATED').severity).toBe('warning');
    });

    it('threshold polygonMinVertices', function () {
        expect(ValidationConfig.getThreshold('polygonMinVertices', 0)).toBe(3);
        ValidationConfig.merge({ thresholds: { polygonMinVertices: 4 } });
        expect(ValidationConfig.getThreshold('polygonMinVertices', 0)).toBe(4);
    });
});
