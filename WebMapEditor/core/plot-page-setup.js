// ============================================================
// PLOT-PAGE-SETUP.JS — Chuẩn Page Setup / Plot (kiểu AutoCAD)
// Khổ giấy ISO/ANSI, scale Fit|1:N, printable area, overflow.
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PlotPageSetup = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var PAPER_SIZES = {
        A4: { id: 'A4', label: 'A4', widthMm: 210, heightMm: 297, family: 'ISO' },
        A3: { id: 'A3', label: 'A3', widthMm: 297, heightMm: 420, family: 'ISO' },
        A2: { id: 'A2', label: 'A2', widthMm: 420, heightMm: 594, family: 'ISO' },
        A1: { id: 'A1', label: 'A1', widthMm: 594, heightMm: 841, family: 'ISO' },
        A0: { id: 'A0', label: 'A0', widthMm: 841, heightMm: 1189, family: 'ISO' },
        LETTER: { id: 'LETTER', label: 'Letter', widthMm: 215.9, heightMm: 279.4, family: 'ANSI' },
        TABLOID: { id: 'TABLOID', label: 'Tabloid', widthMm: 279.4, heightMm: 431.8, family: 'ANSI' },
        ARCH_C: { id: 'ARCH_C', label: 'Arch C', widthMm: 457.2, heightMm: 609.6, family: 'ANSI' },
        ARCH_D: { id: 'ARCH_D', label: 'Arch D', widthMm: 609.6, heightMm: 914.4, family: 'ANSI' }
    };

    var SCALE_PRESETS = [50, 100, 200, 500];
    var DPI_PRESETS = [150, 300, 600];
    var PRESET_STORAGE_KEY = 'webeditor.plotPageSetup.v1';

    /** CTB mặc định (đơn giản): nét theo loại/layer. */
    var DEFAULT_CTB_RULES = [
        { match: 'wall|tuong|tường', color: '#111827', lineWeightMm: 0.5 },
        { match: 'door|cua|cửa', color: '#b45309', lineWeightMm: 0.4 },
        { match: 'line|duong|đường', color: '#334155', lineWeightMm: 0.25 },
        { match: 'room|phong|phòng', color: '#64748b', lineWeightMm: 0.3 },
        { match: 'default|0', color: '#1e293b', lineWeightMm: 0.25 }
    ];

    function clamp(n, lo, hi) {
        n = Number(n);
        if (!Number.isFinite(n)) return lo;
        return Math.max(lo, Math.min(hi, n));
    }

    function isDataUrlImage(value) {
        return typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value.trim());
    }

    function normalizePaperId(id) {
        var key = String(id || 'A4').toUpperCase().replace(/[\s-]+/g, '_');
        if (key === 'ARCHC') key = 'ARCH_C';
        if (key === 'ARCHD') key = 'ARCH_D';
        return PAPER_SIZES[key] ? key : 'A4';
    }

    function getPaper(id) {
        return PAPER_SIZES[normalizePaperId(id)];
    }

    function pageSizeMm(paperId, orientation) {
        var paper = getPaper(paperId);
        var landscape = String(orientation || 'portrait').toLowerCase() === 'landscape';
        if (landscape) {
            return { widthMm: paper.heightMm, heightMm: paper.widthMm, orientation: 'landscape', paper: paper };
        }
        return { widthMm: paper.widthMm, heightMm: paper.heightMm, orientation: 'portrait', paper: paper };
    }

    function defaultSetup() {
        return {
            paperId: 'A3',
            orientation: 'landscape',
            scaleMode: 'fit', // fit | fixed
            scaleDenominator: 100,
            plotArea: 'extents', // extents | display | window
            marginMm: 10,
            titleBlock: true,
            titleBlockHeightMm: 28,
            dpi: 300,
            renderMode: 'hybrid', // raster | vector | hybrid
            includeBackground: true,
            includeGrid: false,
            includePois: true,
            includeQrs: true,
            includePathNodes: true,
            showScaleBar: true,
            showNorthArrow: true,
            showLegend: true,
            monochrome: false,
            plotStyle: 'color', // color | monochrome | ctb
            ctbRules: DEFAULT_CTB_RULES.slice(),
            logoDataUrl: '',
            orgName: '',
            window: null, // { minX, minY, maxX, maxY } world px
            sheets: null, // optional extra sheet overrides
            layouts: null, // Paper Space sheets: [{ id, name, paperId, ... }]
            floors: null, // ['0','1',...] — xuất nhiều tầng
            mapName: '',
            drawnBy: '',
            sheetNumber: '01',
            floorLabel: ''
        };
    }

    function normalizeWindow(win) {
        if (win && Number.isFinite(win.minX) && Number.isFinite(win.maxX)
            && Number.isFinite(win.minY) && Number.isFinite(win.maxY)
            && win.maxX > win.minX && win.maxY > win.minY) {
            return {
                minX: win.minX, minY: win.minY,
                maxX: win.maxX, maxY: win.maxY
            };
        }
        return null;
    }

    function normalizeCtbRules(rules) {
        if (!Array.isArray(rules) || !rules.length) return DEFAULT_CTB_RULES.slice();
        return rules.map(function (r) {
            return {
                match: String((r && r.match) || 'default'),
                color: (r && r.color) || '#1e293b',
                lineWeightMm: clamp((r && r.lineWeightMm) != null ? r.lineWeightMm : 0.25, 0.05, 2)
            };
        });
    }

    function normalizeLayout(layout, index) {
        layout = layout && typeof layout === 'object' ? layout : {};
        var base = normalizeSetup(Object.assign({}, layout, { layouts: null, sheets: null, floors: null }));
        return Object.assign({}, base, {
            id: layout.id || ('L' + (index + 1)),
            name: String(layout.name || ('Sheet ' + (index + 1))),
            layouts: null,
            sheets: null,
            floors: null
        });
    }

    function normalizeSetup(input) {
        var base = defaultSetup();
        var src = input && typeof input === 'object' ? input : {};
        var out = Object.assign({}, base, src);
        out.paperId = normalizePaperId(out.paperId);
        out.orientation = String(out.orientation || 'portrait').toLowerCase() === 'landscape'
            ? 'landscape' : 'portrait';
        out.scaleMode = String(out.scaleMode || 'fit').toLowerCase() === 'fixed' ? 'fixed' : 'fit';
        out.scaleDenominator = Math.max(1, Math.round(Number(out.scaleDenominator) || 100));
        var area = String(out.plotArea || 'extents').toLowerCase();
        out.plotArea = (area === 'display' || area === 'window') ? area : 'extents';
        out.marginMm = clamp(out.marginMm, 0, 80);
        out.titleBlock = out.titleBlock !== false;
        out.titleBlockHeightMm = clamp(out.titleBlockHeightMm, 16, 80);
        out.dpi = DPI_PRESETS.indexOf(Number(out.dpi)) >= 0 ? Number(out.dpi) : 300;
        var mode = String(out.renderMode || 'hybrid').toLowerCase();
        out.renderMode = (mode === 'raster' || mode === 'vector') ? mode : 'hybrid';
        out.includeBackground = out.includeBackground !== false;
        out.includeGrid = !!out.includeGrid;
        out.includePois = out.includePois !== false;
        out.includeQrs = out.includeQrs !== false;
        out.includePathNodes = out.includePathNodes !== false;
        out.showScaleBar = out.showScaleBar !== false;
        out.showNorthArrow = out.showNorthArrow !== false;
        out.showLegend = out.showLegend !== false;
        out.monochrome = !!out.monochrome;
        var style = String(out.plotStyle || (out.monochrome ? 'monochrome' : 'color')).toLowerCase();
        if (style === 'mono') style = 'monochrome';
        out.plotStyle = (style === 'monochrome' || style === 'ctb') ? style : 'color';
        if (out.plotStyle === 'monochrome') out.monochrome = true;
        out.ctbRules = normalizeCtbRules(out.ctbRules);
        out.logoDataUrl = isDataUrlImage(out.logoDataUrl) ? out.logoDataUrl.trim() : '';
        out.orgName = String(out.orgName || '').slice(0, 80);
        out.floorLabel = String(out.floorLabel || '');
        out.window = normalizeWindow(out.window);
        if (Array.isArray(out.layouts) && out.layouts.length) {
            out.layouts = out.layouts.map(normalizeLayout);
        } else {
            out.layouts = null;
        }
        if (Array.isArray(out.floors) && out.floors.length) {
            out.floors = out.floors.map(function (f) { return String(f); })
                .filter(function (f, i, arr) { return f !== '' && arr.indexOf(f) === i; });
        } else {
            out.floors = null;
        }
        // Không lưu logo lớn vào localStorage ở savePreset — strip khi save
        return out;
    }

    /**
     * Resolve màu + bề dày nét theo plotStyle / CTB / layer.
     * @param {object} entity — { type, layerId, color, thickness }
     * @param {object} setup
     * @param {object} [layerInfo] — { id, name, color }
     */
    function resolveEntityStyle(entity, setup, layerInfo) {
        setup = normalizeSetup(setup);
        entity = entity || {};
        layerInfo = layerInfo || {};
        var fallbackColor = entity.color || layerInfo.color || '#1e293b';
        var fallbackLw = entity.thickness != null
            ? clamp(Number(entity.thickness) * 0.05, 0.15, 1.2)
            : 0.25;

        if (setup.plotStyle === 'monochrome' || setup.monochrome) {
            return { color: '#111111', lineWeightMm: fallbackLw, rgb: [17, 17, 17] };
        }

        if (setup.plotStyle === 'ctb') {
            var hay = [
                entity.type || '',
                entity.layerId || '',
                layerInfo.id || '',
                layerInfo.name || ''
            ].join(' ').toLowerCase();
            var rules = setup.ctbRules || DEFAULT_CTB_RULES;
            for (var i = 0; i < rules.length; i++) {
                var rule = rules[i];
                try {
                    if (new RegExp(rule.match, 'i').test(hay)) {
                        return {
                            color: rule.color,
                            lineWeightMm: rule.lineWeightMm,
                            rgb: hexToRgb(rule.color)
                        };
                    }
                } catch (e) { /* ignore bad regex */ }
            }
        }

        return {
            color: fallbackColor,
            lineWeightMm: fallbackLw,
            rgb: hexToRgb(fallbackColor)
        };
    }

    function hexToRgb(hex) {
        var m = String(hex || '#334155').replace('#', '');
        if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
        if (m.length !== 6) return [51, 65, 85];
        return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
    }

    /**
     * Legend từ rooms (theo type/color) + pois (theo type).
     */
    function buildLegendEntries(rooms, pois, options) {
        options = options || {};
        var entries = [];
        var seen = {};
        function add(key, label, color, kind) {
            var k = kind + ':' + key;
            if (seen[k]) return;
            seen[k] = true;
            entries.push({ key: key, label: label, color: color || '#64748b', kind: kind });
        }
        (rooms || []).forEach(function (r) {
            if (!r) return;
            var label = r.type || r.name || 'Phòng';
            add(String(label), String(label), r.color || '#94a3b8', 'room');
        });
        if (options.includePois !== false) {
            (pois || []).forEach(function (p) {
                if (!p) return;
                var label = p.type || p.poiType || 'POI';
                add(String(label), String(label), '#0ea5e9', 'poi');
            });
        }
        return entries.slice(0, options.max || 16);
    }

    /** Sinh danh sách trang xuất: floors × layouts (hoặc 1 sheet hiện tại). */
    function expandExportJobs(setup) {
        setup = normalizeSetup(setup);
        var floors = setup.floors && setup.floors.length ? setup.floors : [null];
        var layouts = setup.layouts && setup.layouts.length
            ? setup.layouts
            : [Object.assign({}, setup, { id: 'current', name: setup.mapName || 'Sheet', layouts: null, floors: null })];
        var jobs = [];
        floors.forEach(function (floor) {
            layouts.forEach(function (layout, idx) {
                var sheet = normalizeSetup(Object.assign({}, setup, layout, {
                    layouts: null,
                    floors: null,
                    sheets: null,
                    floorLabel: floor != null ? String(floor) : (setup.floorLabel || '')
                }));
                if (floor != null) sheet._floor = String(floor);
                sheet._layoutId = layout.id || ('L' + (idx + 1));
                sheet._layoutName = layout.name || sheet._layoutId;
                jobs.push(sheet);
            });
        });
        // Tuỳ chọn thêm trang A4 fit (giữ tương thích)
        if (Array.isArray(setup.sheets) && setup.sheets.length) {
            setup.sheets.forEach(function (s, i) {
                jobs.push(normalizeSetup(Object.assign({}, setup, s, {
                    layouts: null, floors: null, sheets: null,
                    _layoutId: 'extra-' + i,
                    _layoutName: 'Extra ' + (i + 1)
                })));
            });
        }
        return jobs;
    }

    function printableAreaMm(setup) {
        setup = normalizeSetup(setup);
        var page = pageSizeMm(setup.paperId, setup.orientation);
        var m = setup.marginMm;
        var tb = setup.titleBlock ? setup.titleBlockHeightMm : 0;
        var widthMm = Math.max(1, page.widthMm - m * 2);
        var heightMm = Math.max(1, page.heightMm - m * 2 - tb);
        return {
            pageWidthMm: page.widthMm,
            pageHeightMm: page.heightMm,
            marginMm: m,
            titleBlockHeightMm: tb,
            widthMm: widthMm,
            heightMm: heightMm,
            contentXMm: m,
            contentYMm: m,
            titleBlockYMm: page.heightMm - m - tb
        };
    }

    /**
     * Tỷ lệ 1:N — 1 mm giấy = N mm thực tế = N/1000 m.
     * Trả về số mét thực tế vừa trên 1 mm giấy.
     */
    function metersPerPaperMm(scaleDenominator) {
        return Math.max(1, Number(scaleDenominator) || 100) / 1000;
    }

    /** Chiều dài mét thế giới ứng với chiều dài mm trên giấy ở scale 1:N. */
    function worldMetersForPaperMm(paperMm, scaleDenominator) {
        return paperMm * metersPerPaperMm(scaleDenominator);
    }

    /** Chiều dài mm giấy cần để vẽ worldMeters ở scale 1:N. */
    function paperMmForWorldMeters(worldMeters, scaleDenominator) {
        var mpm = metersPerPaperMm(scaleDenominator);
        return worldMeters / mpm;
    }

    function fitScaleDenominator(worldWidthM, worldHeightM, availWidthMm, availHeightMm) {
        var w = Math.max(1e-9, Number(worldWidthM) || 0);
        var h = Math.max(1e-9, Number(worldHeightM) || 0);
        var aw = Math.max(1e-9, Number(availWidthMm) || 1);
        var ah = Math.max(1e-9, Number(availHeightMm) || 1);
        // N = world_mm / paper_mm
        var nW = (w * 1000) / aw;
        var nH = (h * 1000) / ah;
        return Math.max(1, Math.ceil(Math.max(nW, nH)));
    }

    function resolveScale(setup, worldWidthM, worldHeightM) {
        setup = normalizeSetup(setup);
        var area = printableAreaMm(setup);
        var denom;
        if (setup.scaleMode === 'fixed') {
            denom = setup.scaleDenominator;
        } else {
            denom = fitScaleDenominator(worldWidthM, worldHeightM, area.widthMm, area.heightMm);
        }
        var neededW = paperMmForWorldMeters(worldWidthM, denom);
        var neededH = paperMmForWorldMeters(worldHeightM, denom);
        var overflow = neededW > area.widthMm + 0.05 || neededH > area.heightMm + 0.05;
        var drawW = Math.min(neededW, area.widthMm);
        var drawH = Math.min(neededH, area.heightMm);
        // Fit luôn co vừa; fixed có thể overflow → vẫn clamp để vẽ phần giữa
        if (setup.scaleMode === 'fit' || overflow) {
            var ratio = Math.min(area.widthMm / neededW, area.heightMm / neededH, 1);
            if (setup.scaleMode === 'fit') {
                drawW = neededW * Math.min(area.widthMm / neededW, area.heightMm / neededH);
                drawH = neededH * Math.min(area.widthMm / neededW, area.heightMm / neededH);
            } else {
                drawW = neededW * ratio;
                drawH = neededH * ratio;
            }
        }
        return {
            scaleMode: setup.scaleMode,
            scaleDenominator: denom,
            scaleLabel: '1:' + denom,
            overflow: overflow && setup.scaleMode === 'fixed',
            neededWidthMm: neededW,
            neededHeightMm: neededH,
            drawWidthMm: drawW,
            drawHeightMm: drawH,
            metersPerPaperMm: metersPerPaperMm(denom),
            printable: area
        };
    }

    function mmToPx(mm, dpi) {
        return (Number(mm) / 25.4) * (Number(dpi) || 300);
    }

    function rasterPixelSize(drawWidthMm, drawHeightMm, dpi) {
        return {
            widthPx: Math.max(2, Math.round(mmToPx(drawWidthMm, dpi))),
            heightPx: Math.max(2, Math.round(mmToPx(drawHeightMm, dpi)))
        };
    }

    function scaleBarSegments(scaleDenominator) {
        // Chọn bước mét đẹp: 1, 2, 5, 10, 20, 50…
        var denom = Math.max(1, Number(scaleDenominator) || 100);
        var targetPaperMm = 40;
        var meters = worldMetersForPaperMm(targetPaperMm, denom);
        var nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
        var pick = nice[0];
        for (var i = 0; i < nice.length; i++) {
            if (nice[i] <= meters * 1.2) pick = nice[i];
        }
        var paperMm = paperMmForWorldMeters(pick, denom);
        return { meters: pick, paperMm: paperMm, label: pick + ' m' };
    }

    function loadPreset() {
        try {
            if (typeof localStorage === 'undefined') return defaultSetup();
            var raw = localStorage.getItem(PRESET_STORAGE_KEY);
            if (!raw) return defaultSetup();
            return normalizeSetup(JSON.parse(raw));
        } catch (e) {
            return defaultSetup();
        }
    }

    function savePreset(setup) {
        var normalized = normalizeSetup(setup);
        // Tránh phình localStorage vì logo base64
        var toStore = Object.assign({}, normalized, { logoDataUrl: '' });
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(toStore));
            }
        } catch (e) { /* ignore */ }
        return normalized;
    }

    function buildJsPdfFormat(setup) {
        var page = pageSizeMm(setup.paperId, setup.orientation);
        return {
            orientation: page.orientation,
            unit: 'mm',
            format: [page.widthMm, page.heightMm]
        };
    }

    return {
        PAPER_SIZES: PAPER_SIZES,
        SCALE_PRESETS: SCALE_PRESETS,
        DPI_PRESETS: DPI_PRESETS,
        DEFAULT_CTB_RULES: DEFAULT_CTB_RULES,
        PRESET_STORAGE_KEY: PRESET_STORAGE_KEY,
        defaultSetup: defaultSetup,
        normalizeSetup: normalizeSetup,
        normalizePaperId: normalizePaperId,
        getPaper: getPaper,
        pageSizeMm: pageSizeMm,
        printableAreaMm: printableAreaMm,
        metersPerPaperMm: metersPerPaperMm,
        worldMetersForPaperMm: worldMetersForPaperMm,
        paperMmForWorldMeters: paperMmForWorldMeters,
        fitScaleDenominator: fitScaleDenominator,
        resolveScale: resolveScale,
        mmToPx: mmToPx,
        rasterPixelSize: rasterPixelSize,
        scaleBarSegments: scaleBarSegments,
        loadPreset: loadPreset,
        savePreset: savePreset,
        buildJsPdfFormat: buildJsPdfFormat,
        resolveEntityStyle: resolveEntityStyle,
        buildLegendEntries: buildLegendEntries,
        expandExportJobs: expandExportJobs,
        hexToRgb: hexToRgb,
        isDataUrlImage: isDataUrlImage
    };
});
