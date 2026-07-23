import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Plot = require('../core/plot-page-setup.js');

describe('Plot Page Setup — khổ giấy & printable area', function () {
    it('A3 landscape đúng mm', function () {
        var page = Plot.pageSizeMm('A3', 'landscape');
        expect(page.widthMm).toBe(420);
        expect(page.heightMm).toBe(297);
        expect(page.orientation).toBe('landscape');
    });

    it('A4 portrait đúng mm', function () {
        var page = Plot.pageSizeMm('A4', 'portrait');
        expect(page.widthMm).toBe(210);
        expect(page.heightMm).toBe(297);
    });

    it('printable area trừ margin + title block', function () {
        var area = Plot.printableAreaMm({
            paperId: 'A4',
            orientation: 'portrait',
            marginMm: 10,
            titleBlock: true,
            titleBlockHeightMm: 28
        });
        expect(area.pageWidthMm).toBe(210);
        expect(area.pageHeightMm).toBe(297);
        expect(area.widthMm).toBe(190);
        expect(area.heightMm).toBe(297 - 20 - 28);
    });
});

describe('Plot Page Setup — scale 1:N và Fit', function () {
    it('1:100 — 10 m thực tế cần 100 mm giấy', function () {
        expect(Plot.paperMmForWorldMeters(10, 100)).toBeCloseTo(100, 6);
        expect(Plot.worldMetersForPaperMm(100, 100)).toBeCloseTo(10, 6);
    });

    it('Fit chọn denominator bao phủ cả hai chiều', function () {
        // 40m x 20m trên vùng 200x100 mm → N = max(40000/200, 20000/100) = 200
        var n = Plot.fitScaleDenominator(40, 20, 200, 100);
        expect(n).toBe(200);
    });

    it('fixed scale phát hiện overflow', function () {
        var info = Plot.resolveScale({
            paperId: 'A4',
            orientation: 'portrait',
            scaleMode: 'fixed',
            scaleDenominator: 50,
            marginMm: 10,
            titleBlock: true,
            titleBlockHeightMm: 28
        }, 80, 60);
        expect(info.overflow).toBe(true);
        expect(info.scaleLabel).toBe('1:50');
    });

    it('fit không overflow và có scaleLabel', function () {
        var info = Plot.resolveScale({
            paperId: 'A3',
            orientation: 'landscape',
            scaleMode: 'fit',
            marginMm: 10,
            titleBlock: true
        }, 40, 25);
        expect(info.overflow).toBe(false);
        expect(info.scaleDenominator).toBeGreaterThanOrEqual(1);
        expect(info.drawWidthMm).toBeLessThanOrEqual(info.printable.widthMm + 0.01);
        expect(info.drawHeightMm).toBeLessThanOrEqual(info.printable.heightMm + 0.01);
    });
});

describe('Plot Page Setup — DPI & preset', function () {
    it('rasterPixelSize theo DPI', function () {
        // 25.4 mm = 1 inch → 300 px ở 300 DPI
        var px = Plot.rasterPixelSize(25.4, 25.4, 300);
        expect(px.widthPx).toBe(300);
        expect(px.heightPx).toBe(300);
    });

    it('normalizeSetup mặc định và clamp', function () {
        var s = Plot.normalizeSetup({ paperId: 'a3', scaleDenominator: -5, marginMm: 999, dpi: 999 });
        expect(s.paperId).toBe('A3');
        expect(s.scaleDenominator).toBe(1);
        expect(s.marginMm).toBe(80);
        expect(s.dpi).toBe(300);
    });

    it('buildJsPdfFormat dùng mm + format tùy chỉnh', function () {
        var fmt = Plot.buildJsPdfFormat({ paperId: 'A3', orientation: 'landscape' });
        expect(fmt.unit).toBe('mm');
        expect(fmt.orientation).toBe('landscape');
        expect(fmt.format).toEqual([420, 297]);
    });

    it('resolveEntityStyle CTB khớp wall', function () {
        var st = Plot.resolveEntityStyle({ type: 'wall', thickness: 8 }, { plotStyle: 'ctb' });
        expect(st.lineWeightMm).toBe(0.5);
        expect(st.color).toBe('#111827');
    });

    it('resolveEntityStyle monochrome luôn đen', function () {
        var st = Plot.resolveEntityStyle({ color: '#ff0000' }, { plotStyle: 'monochrome' });
        expect(st.color).toBe('#111111');
    });

    it('buildLegendEntries gộp room type và poi', function () {
        var entries = Plot.buildLegendEntries(
            [{ type: 'WC', color: '#00f' }, { type: 'WC', color: '#00f' }, { type: 'Office', color: '#0f0' }],
            [{ type: 'ATM' }, { type: 'ATM' }]
        );
        expect(entries).toHaveLength(3);
        expect(entries.some(function (e) { return e.kind === 'poi' && e.label === 'ATM'; })).toBe(true);
    });

    it('expandExportJobs floors × layouts', function () {
        var jobs = Plot.expandExportJobs({
            floors: ['0', '1'],
            layouts: [
                { id: 'L1', name: 'Overview', paperId: 'A3' },
                { id: 'L2', name: 'Detail', paperId: 'A4', plotArea: 'display' }
            ]
        });
        expect(jobs).toHaveLength(4);
        expect(jobs[0]._floor).toBe('0');
        expect(jobs[3]._layoutName).toBe('Detail');
    });

    it('savePreset không giữ logo base64', function () {
        var saved = Plot.savePreset({
            paperId: 'A4',
            logoDataUrl: 'data:image/png;base64,aaa'
        });
        expect(saved.logoDataUrl).toContain('data:image');
        var loaded = Plot.loadPreset();
        expect(loaded.logoDataUrl).toBe('');
    });
});
