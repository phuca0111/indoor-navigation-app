import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// PluginAPI (Node) trả module.exports nhưng KHÔNG tự gắn vào EditorCore → gắn thủ công
globalThis.EditorCore = globalThis.EditorCore || {};
const PluginAPI = require('../core/plugin-api.js');
globalThis.EditorCore.PluginAPI = PluginAPI;

// ExportPipeline là IIFE, tự gắn vào globalThis.EditorCore.ExportPipeline
require('../core/export-pipeline.js');
const EP = globalThis.EditorCore.ExportPipeline;

const SAMPLE = { scale_ratio: 0.5, rooms: [], doors: [], nodes: [], edges: [], walls: [], qr_anchors: [], pois: [] };

describe('ExportPipeline ↔ plugin validators', function () {
    beforeEach(function () {
        PluginAPI._reset();
        globalThis.EditorCore.validateMapData = function () {
            return { ok: true, errors: [], warnings: [] };
        };
    });

    it('không có plugin validator → ok', function () {
        var r = EP.run({ mapData: SAMPLE });
        expect(r.ok).toBe(true);
        expect(r.validation.errors).toHaveLength(0);
    });

    it('plugin validator trả error → chặn publish (ok=false)', function () {
        PluginAPI.registerValidator(function () {
            return [{ level: 'error', code: 'ORG_RULE', message: 'Vi phạm quy tắc org' }];
        });
        var r = EP.run({ mapData: SAMPLE });
        expect(r.ok).toBe(false);
        expect(r.validation.errors.some(function (e) { return e.code === 'ORG_RULE'; })).toBe(true);
    });

    it('plugin validator chỉ warning → vẫn ok, có cảnh báo', function () {
        PluginAPI.registerValidator(function () {
            return [{ level: 'warning', code: 'ORG_WARN', message: 'Nên xem lại' }];
        });
        var r = EP.run({ mapData: SAMPLE });
        expect(r.ok).toBe(true);
        expect(r.validation.warnings.some(function (w) { return w.code === 'ORG_WARN'; })).toBe(true);
    });

    it('gộp lỗi engine gốc + cảnh báo plugin', function () {
        globalThis.EditorCore.validateMapData = function () {
            return { ok: false, errors: [{ level: 'error', code: 'BASE_ERR', message: 'base' }], warnings: [] };
        };
        PluginAPI.registerValidator(function () {
            return [{ level: 'warning', code: 'ORG_WARN', message: 'w' }];
        });
        var r = EP.run({ mapData: SAMPLE });
        expect(r.ok).toBe(false);
        expect(r.validation.errors.some(function (e) { return e.code === 'BASE_ERR'; })).toBe(true);
        expect(r.validation.warnings.some(function (w) { return w.code === 'ORG_WARN'; })).toBe(true);
    });

    it('skipValidation → KHÔNG chạy plugin validator', function () {
        var called = false;
        PluginAPI.registerValidator(function () { called = true; return [{ level: 'error', code: 'X', message: 'x' }]; });
        var r = EP.run({ mapData: SAMPLE, skipValidation: true });
        expect(r.ok).toBe(true);
        expect(called).toBe(false);
    });

    it('validator ném lỗi → gói lại và chặn publish', function () {
        PluginAPI.registerValidator(function () { throw new Error('crash'); });
        var r = EP.run({ mapData: SAMPLE });
        expect(r.ok).toBe(false);
        expect(r.validation.errors.some(function (e) { return e.code === 'plugin_validator_error'; })).toBe(true);
    });
});
