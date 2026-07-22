import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { create } = require('../core/tool-command-manager.js');

describe('Tool Command Manager', function () {
    var tcm;
    var activated;

    beforeEach(function () {
        activated = [];
        tcm = create({
            onActivate: function (toolId) { activated.push(toolId); },
            onCancel: vi.fn()
        });
    });

    it('resolve alias PL → wall', function () {
        expect(tcm.resolve('PL')).toBe('wall');
        expect(tcm.resolve('pline')).toBe('wall');
    });

    it('resolve alias L/LN → line', function () {
        expect(tcm.resolve('L')).toBe('line');
        expect(tcm.resolve('ln')).toBe('line');
    });

    it('execute gọi onActivate với tool đúng', function () {
        var r = tcm.execute('PL');
        expect(r.ok).toBe(true);
        expect(r.toolId).toBe('wall');
        expect(activated).toEqual(['wall']);
    });

    it('execute lệnh không rõ trả UNKNOWN_COMMAND', function () {
        var r = tcm.execute('ZZZ');
        expect(r.ok).toBe(false);
        expect(r.error).toBe('UNKNOWN_COMMAND');
        expect(activated).toHaveLength(0);
    });

    it('repeat lặp lệnh cuối', function () {
        tcm.execute('line');
        activated = [];
        var r = tcm.repeat();
        expect(r.ok).toBe(true);
        expect(r.toolId).toBe('line');
        expect(activated).toEqual(['line']);
    });

    it('repeat khi chưa có lệnh → NO_LAST_COMMAND', function () {
        var r = tcm.repeat();
        expect(r.ok).toBe(false);
        expect(r.error).toBe('NO_LAST_COMMAND');
    });

    it('register alias tùy chỉnh', function () {
        tcm.register('foo', 'select');
        expect(tcm.resolve('foo')).toBe('select');
        tcm.execute('foo');
        expect(activated).toContain('select');
    });

    it('getHistory ghi lệnh gần đây', function () {
        tcm.execute('w');
        tcm.execute('l');
        var h = tcm.getHistory();
        expect(h[0].toolId).toBe('line');
        expect(h[1].toolId).toBe('wall');
    });

    it('resolve alias Phase 2 M/CO/TR/ML', function () {
        expect(tcm.resolve('M')).toBe('move');
        expect(tcm.resolve('CO')).toBe('copy');
        expect(tcm.resolve('TR')).toBe('trim');
        expect(tcm.resolve('ML')).toBe('mline');
        expect(tcm.resolve('PE')).toBe('pedit');
        expect(tcm.resolve('AR')).toBe('array');
        expect(tcm.resolve('MA')).toBe('matchprop');
        expect(tcm.resolve('B')).toBe('block');
        expect(tcm.resolve('I')).toBe('insert');
        expect(tcm.resolve('LTS')).toBe('ltscale');
        expect(tcm.resolve('HE')).toBe('hatchedit');
        expect(tcm.resolve('REG')).toBe('region');
        expect(tcm.resolve('RE')).toBe('redraw');
        expect(tcm.resolve('R')).toBe('redraw');
        expect(tcm.resolve('RM')).toBe('room');
    });
});
