// ============================================================
// PDF-IO.JS — Xuất/Nhập PDF kiểu AutoCAD Page Setup
// Xuất: khổ giấy ISO/ANSI, scale Fit|1:N, plot area, title block,
//       scale bar, north arrow, DPI, raster/vector/hybrid.
// Nhập: trích vector / ảnh nền (giữ logic cũ).
// ============================================================
(function () {
    'use strict';

    var JSPDF_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    var PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    var PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    var Plot = null;
    function getPlot() {
        if (Plot) return Plot;
        Plot = (window.EditorCore && EditorCore.PlotPageSetup) || null;
        return Plot;
    }

    function toast(msg, type) {
        if (typeof showToast === 'function') showToast(msg, type || 'info');
        else console.log('[PDF]', msg);
    }

    var _scriptCache = {};
    function loadScriptOnce(src) {
        if (_scriptCache[src]) return _scriptCache[src];
        _scriptCache[src] = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('Không tải được thư viện: ' + src)); };
            document.head.appendChild(s);
        });
        return _scriptCache[src];
    }

    async function ensureJsPdf() {
        if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
        await loadScriptOnce(JSPDF_URL);
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF chưa sẵn sàng');
        return window.jspdf.jsPDF;
    }

    async function ensurePdfJs() {
        if (window.pdfjsLib) {
            if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
            }
            return window.pdfjsLib;
        }
        await loadScriptOnce(PDFJS_URL);
        if (!window.pdfjsLib) throw new Error('pdf.js chưa sẵn sàng');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return window.pdfjsLib;
    }

    function pxToMeters(px) {
        if (typeof pixelsToMeters === 'function') return pixelsToMeters(px);
        var mpg = (typeof metersPerGrid === 'number') ? metersPerGrid : 0.5;
        var grid = (typeof GRID_SIZE === 'number') ? GRID_SIZE : 40;
        return px / grid * mpg;
    }

    function ensurePlotStyles() {
        if (document.getElementById('plotPageSetupStyles')) return;
        var css = document.createElement('style');
        css.id = 'plotPageSetupStyles';
        css.textContent = [
            '.plot-overlay{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;',
            'background:rgba(2,6,23,.55);padding:16px}',
            '.plot-modal{width:min(720px,96vw);max-height:92vh;overflow:auto;background:#0f172a;color:#e2e8f0;',
            'border:1px solid rgba(148,163,184,.35);border-radius:14px;box-shadow:0 24px 48px rgba(0,0,0,.45);padding:18px 20px}',
            '.plot-modal h2{margin:0 0 12px;font-size:1.15rem}',
            '.plot-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}',
            '.plot-grid label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#94a3b8}',
            '.plot-grid input,.plot-grid select{background:#1e293b;border:1px solid #334155;color:#f8fafc;',
            'border-radius:8px;padding:7px 8px;font-size:13px}',
            '.plot-checks{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-top:10px}',
            '.plot-checks label{display:flex;align-items:center;gap:8px;font-size:13px;color:#cbd5e1}',
            '.plot-preview{margin-top:12px;padding:10px 12px;border-radius:10px;background:#1e293b;border:1px solid #334155;font-size:12px;line-height:1.5}',
            '.plot-preview.warn{border-color:#f59e0b;color:#fde68a}',
            '.plot-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px}',
            '.plot-actions button{border:0;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:13px}',
            '.plot-btn-secondary{background:#334155;color:#e2e8f0}',
            '.plot-btn-primary{background:#2563eb;color:#fff}',
            '.plot-btn-danger{background:#7f1d1d;color:#fecaca}',
            '@media (max-width:640px){.plot-grid,.plot-checks{grid-template-columns:1fr}}'
        ].join('');
        document.head.appendChild(css);
    }

    // ============================================================
    // Extents / plot area
    // ============================================================
    function computeExtents(options) {
        options = options || {};
        var includeBg = !!options.includeBackground;
        var includePois = options.includePois !== false;
        var includeQrs = options.includeQrs !== false;
        var includePathNodes = options.includePathNodes !== false;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, has = false;
        function pt(x, y) {
            if (!isFinite(x) || !isFinite(y)) return;
            has = true;
            if (x < minX) minX = x; if (y < minY) minY = y;
            if (x > maxX) maxX = x; if (y > maxY) maxY = y;
        }
        (typeof rooms !== 'undefined' ? rooms : []).forEach(function (r) {
            if (!r) return;
            if (r.shape === 'polygon' && r.points) r.points.forEach(function (p) { pt(p.x, p.y); });
            else if (r.shape === 'circle') { pt(r.cx - r.radius, r.cy - r.radius); pt(r.cx + r.radius, r.cy + r.radius); }
            else { pt(r.x, r.y); pt(r.x + r.width, r.y + r.height); }
        });
        [typeof walls !== 'undefined' ? walls : [], typeof lines !== 'undefined' ? lines : []]
            .forEach(function (arr) {
                (arr || []).forEach(function (o) { (o && o.points || []).forEach(function (p) { pt(p.x, p.y); }); });
            });
        (typeof doors !== 'undefined' ? doors : []).forEach(function (d) {
            if (!d) return; var w = (d.width || 40); pt(d.x - w, d.y - w); pt(d.x + w, d.y + w);
        });
        if (includePois) (typeof pois !== 'undefined' ? pois : []).forEach(function (p) { if (p) pt(p.x, p.y); });
        if (includeQrs) (typeof qrs !== 'undefined' ? qrs : []).forEach(function (q) { if (q) pt(q.x, q.y); });
        if (includePathNodes) (typeof pathNodes !== 'undefined' ? pathNodes : []).forEach(function (n) { if (n) pt(n.x, n.y); });
        (typeof blockInserts !== 'undefined' ? blockInserts : []).forEach(function (b) { if (b) pt(b.x, b.y); });
        (typeof dimensions !== 'undefined' ? dimensions : []).forEach(function (d) {
            if (!d) return; if (d.p1) pt(d.p1.x, d.p1.y); if (d.p2) pt(d.p2.x, d.p2.y);
        });
        if (includeBg && window.bgImage) {
            var fallbackScale = window.bgScale > 0 ? window.bgScale : 1;
            var bw = window.bgImage.width * (window.bgScaleX > 0 ? window.bgScaleX : fallbackScale);
            var bh = window.bgImage.height * (window.bgScaleY > 0 ? window.bgScaleY : fallbackScale);
            var bx = window.bgX || 0, by = window.bgY || 0;
            pt(bx, by); pt(bx + bw, by); pt(bx, by + bh); pt(bx + bw, by + bh);
        }
        if (!has) return null;
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    function computeDisplayExtents() {
        if (typeof canvas === 'undefined' || !canvas) return null;
        var tl = typeof screenToWorld === 'function' ? screenToWorld(0, 0) : null;
        var br = typeof screenToWorld === 'function' ? screenToWorld(canvas.width, canvas.height) : null;
        if (!tl || !br) return null;
        return {
            minX: Math.min(tl.x, br.x),
            minY: Math.min(tl.y, br.y),
            maxX: Math.max(tl.x, br.x),
            maxY: Math.max(tl.y, br.y)
        };
    }

    function resolvePlotExtents(setup) {
        setup = getPlot().normalizeSetup(setup);
        if (setup.plotArea === 'window' && setup.window) {
            return {
                minX: setup.window.minX, minY: setup.window.minY,
                maxX: setup.window.maxX, maxY: setup.window.maxY
            };
        }
        if (setup.plotArea === 'display') {
            var disp = computeDisplayExtents();
            if (disp) return disp;
        }
        return computeExtents({
            includeBackground: setup.includeBackground,
            includePois: setup.includePois,
            includeQrs: setup.includeQrs,
            includePathNodes: setup.includePathNodes
        });
    }

    function colorForPdf(hex, monochrome) {
        if (monochrome) return [30, 30, 30];
        var PlotAPI = getPlot();
        if (PlotAPI && PlotAPI.hexToRgb) return PlotAPI.hexToRgb(hex);
        var m = String(hex || '#334155').replace('#', '');
        if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
        if (m.length !== 6) return [51, 65, 85];
        return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
    }

    function lookupLayerInfo(layerId) {
        if (typeof legacyGetLayerManager === 'function') {
            var lm = legacyGetLayerManager();
            if (lm && typeof lm.get === 'function') return lm.get(layerId) || null;
        }
        if (window.EditorCore && EditorCore.LayerManager && typeof EditorCore.LayerManager.get === 'function') {
            return EditorCore.LayerManager.get(layerId);
        }
        return null;
    }

    function styleForEntity(entity, setup) {
        var PlotAPI = getPlot();
        if (PlotAPI && PlotAPI.resolveEntityStyle) {
            return PlotAPI.resolveEntityStyle(entity, setup, lookupLayerInfo(entity && entity.layerId));
        }
        return {
            color: (entity && entity.color) || '#1e293b',
            lineWeightMm: 0.25,
            rgb: colorForPdf((entity && entity.color) || '#1e293b', setup.monochrome)
        };
    }

    /** Render vùng world → PNG theo kích thước px đích. */
    function renderPlotDataUrl(options) {
        options = options || {};
        var ext = options.extents;
        if (!ext) return null;
        var outW = Math.max(2, Math.round(options.outW || 1200));
        var outH = Math.max(2, Math.round(options.outH || 800));
        var padWorld = Number(options.padWorld) || 0;
        var wWorld = (ext.maxX - ext.minX) + padWorld * 2;
        var hWorld = (ext.maxY - ext.minY) + padWorld * 2;
        if (wWorld <= 0 || hWorld <= 0) return null;
        var scaleX = outW / wWorld;
        var scaleY = outH / hWorld;
        var scale = Math.min(scaleX, scaleY);
        if (!isFinite(scale) || scale <= 0) scale = 1;

        var svW = canvas.width, svH = canvas.height;
        var svZoom = zoom, svPanX = panX, svPanY = panY;
        var gridEl = document.getElementById('gridCheck');
        var gridWas = gridEl ? gridEl.checked : false;
        var svSelRoom = selectedRoom, svSelObj = selectedObject;
        var svBg = window.bgImage;
        var svPois = typeof pois !== 'undefined' ? pois : null;
        var svQrs = typeof qrs !== 'undefined' ? qrs : null;
        var svNodes = typeof pathNodes !== 'undefined' ? pathNodes : null;
        var dataUrl = null;
        try {
            canvas.width = outW;
            canvas.height = outH;
            zoom = scale;
            panX = (-ext.minX + padWorld) * scale + (outW - wWorld * scale) / 2;
            panY = (-ext.minY + padWorld) * scale + (outH - hWorld * scale) / 2;
            if (gridEl) gridEl.checked = !!options.grid;
            selectedRoom = null;
            selectedObject = null;
            if (!options.includeBackground) window.bgImage = null;
            if (options.includePois === false && typeof pois !== 'undefined') pois = [];
            if (options.includeQrs === false && typeof qrs !== 'undefined') qrs = [];
            if (options.includePathNodes === false && typeof pathNodes !== 'undefined') pathNodes = [];
            draw();
            dataUrl = canvas.toDataURL('image/png');
        } finally {
            window.bgImage = svBg;
            if (svPois && typeof pois !== 'undefined') pois = svPois;
            if (svQrs && typeof qrs !== 'undefined') qrs = svQrs;
            if (svNodes && typeof pathNodes !== 'undefined') pathNodes = svNodes;
            if (gridEl) gridEl.checked = gridWas;
            selectedRoom = svSelRoom;
            selectedObject = svSelObj;
            zoom = svZoom; panX = svPanX; panY = svPanY;
            canvas.width = svW; canvas.height = svH;
            if (typeof resizeCanvas === 'function') resizeCanvas(); else draw();
        }
        return {
            dataUrl: dataUrl, outW: outW, outH: outH,
            worldW: ext.maxX - ext.minX, worldH: ext.maxY - ext.minY,
            extents: ext
        };
    }

    function worldToPdfMm(x, y, ext, ox, oy, drawW, drawH) {
        var u = (x - ext.minX) / Math.max(1e-9, ext.maxX - ext.minX);
        var v = (y - ext.minY) / Math.max(1e-9, ext.maxY - ext.minY);
        return { x: ox + u * drawW, y: oy + v * drawH };
    }

    function drawVectorEntities(pdf, setup, ext, ox, oy, drawW, drawH) {
        function mapPt(p) { return worldToPdfMm(p.x, p.y, ext, ox, oy, drawW, drawH); }
        function strokePoly(points, closed, rgb, lw) {
            if (!points || points.length < 2) return;
            pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
            pdf.setLineWidth(lw || 0.25);
            var mapped = points.map(mapPt);
            for (var i = 1; i < mapped.length; i++) {
                pdf.line(mapped[i - 1].x, mapped[i - 1].y, mapped[i].x, mapped[i].y);
            }
            if (closed && mapped.length >= 2) {
                pdf.line(mapped[mapped.length - 1].x, mapped[mapped.length - 1].y, mapped[0].x, mapped[0].y);
            }
        }

        (typeof rooms !== 'undefined' ? rooms : []).forEach(function (r) {
            if (!r) return;
            var st = styleForEntity({ type: 'room', layerId: r.layerId, color: r.color || '#94a3b8' }, setup);
            var rgb = st.rgb;
            if (r.shape === 'polygon' && r.points && r.points.length >= 3) {
                if (setup.renderMode !== 'vector') {
                    strokePoly(r.points, true, rgb, st.lineWeightMm);
                } else {
                    pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
                    pdf.setDrawColor(40, 40, 40);
                    var pts = r.points.map(mapPt);
                    if (pts.length >= 3 && pdf.lines) {
                        var rel = [];
                        for (var i = 1; i < pts.length; i++) {
                            rel.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]);
                        }
                        rel.push([pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y]);
                        pdf.lines(rel, pts[0].x, pts[0].y, [1, 1], 'FD', true);
                    } else {
                        strokePoly(r.points, true, rgb, st.lineWeightMm);
                    }
                }
            } else if (r.shape === 'circle' && r.cx != null) {
                var c = mapPt({ x: r.cx, y: r.cy });
                var rx = (r.radius / Math.max(1e-9, ext.maxX - ext.minX)) * drawW;
                pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
                pdf.setLineWidth(st.lineWeightMm);
                pdf.circle(c.x, c.y, rx, 'S');
            } else if (r.width != null) {
                var a = mapPt({ x: r.x, y: r.y });
                var b = mapPt({ x: r.x + r.width, y: r.y + r.height });
                pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
                pdf.setLineWidth(st.lineWeightMm);
                pdf.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
            }
        });

        (typeof walls !== 'undefined' ? walls : []).forEach(function (w) {
            if (!w || !w.points) return;
            var st = styleForEntity({ type: 'wall', layerId: w.layerId, thickness: w.thickness }, setup);
            strokePoly(w.points, false, st.rgb, st.lineWeightMm);
        });
        (typeof lines !== 'undefined' ? lines : []).forEach(function (ln) {
            if (!ln || !ln.points) return;
            var st = styleForEntity({ type: 'line', layerId: ln.layerId, color: ln.color }, setup);
            strokePoly(ln.points, !!ln.closed, st.rgb, st.lineWeightMm);
        });
        (typeof doors !== 'undefined' ? doors : []).forEach(function (d) {
            if (!d) return;
            var half = (d.width || 40) / 2;
            var st = styleForEntity({ type: 'door', layerId: d.layerId, color: '#b45309' }, setup);
            strokePoly([
                { x: d.x - half, y: d.y },
                { x: d.x + half, y: d.y }
            ], false, st.rgb, st.lineWeightMm);
        });
    }

    function drawTitleBlock(pdf, setup, pageW, pageH, scaleInfo, worldW, worldH) {
        if (!setup.titleBlock) return;
        var m = setup.marginMm;
        var tbH = Math.max(setup.titleBlockHeightMm, setup.logoDataUrl ? 32 : 28);
        var tbY = pageH - m - tbH;
        var tbW = pageW - m * 2;
        var logoW = setup.logoDataUrl ? Math.min(22, tbH - 4) : 0;
        var textLeft = m + 3 + (logoW ? logoW + 3 : 0);

        pdf.setDrawColor(60);
        pdf.setLineWidth(0.35);
        pdf.rect(m, tbY, tbW, tbH);
        pdf.line(m + tbW * 0.55, tbY, m + tbW * 0.55, tbY + tbH);
        pdf.line(m + tbW * 0.78, tbY, m + tbW * 0.78, tbY + tbH);

        if (setup.logoDataUrl) {
            try {
                pdf.addImage(setup.logoDataUrl, 'PNG', m + 2, tbY + 2, logoW, logoW);
            } catch (e1) {
                try { pdf.addImage(setup.logoDataUrl, 'JPEG', m + 2, tbY + 2, logoW, logoW); } catch (e2) { /* ignore */ }
            }
        }

        var mapName = setup.mapName || 'Bản vẽ';
        var dateStr = new Date().toLocaleString('vi-VN');
        var wM = pxToMeters(worldW);
        var hM = pxToMeters(worldH);
        var floorVal = setup.floorLabel || setup._floor || '';
        if (!floorVal) {
            var floorEl = document.getElementById('floorSelect') || document.getElementById('currentFloor');
            floorVal = floorEl && (floorEl.value || floorEl.textContent) ? (floorEl.value || floorEl.textContent) : '';
        }
        if (floorVal === '0') floorVal = 'Trệt';

        pdf.setFontSize(11);
        pdf.setTextColor(20);
        pdf.text(String(mapName), textLeft, tbY + 7);
        pdf.setFontSize(8);
        pdf.setTextColor(60);
        if (setup.orgName) pdf.text(String(setup.orgName), textLeft, tbY + 12);
        pdf.text('Kích thước: ' + wM.toFixed(2) + ' m × ' + hM.toFixed(2) + ' m', textLeft, tbY + (setup.orgName ? 17 : 14));
        pdf.text('Tỷ lệ: ' + scaleInfo.scaleLabel + (scaleInfo.scaleMode === 'fit' ? ' (Fit)' : ''), textLeft, tbY + (setup.orgName ? 22 : 20));
        if (floorVal) pdf.text('Tầng: ' + String(floorVal).trim(), textLeft, tbY + (setup.orgName ? 27 : 26));

        pdf.text('Khổ: ' + setup.paperId + ' · ' + setup.orientation, m + tbW * 0.55 + 3, tbY + 7);
        pdf.text('Người vẽ: ' + (setup.drawnBy || '—'), m + tbW * 0.55 + 3, tbY + 14);
        pdf.text('Ngày: ' + dateStr, m + tbW * 0.55 + 3, tbY + 20);
        pdf.text('Đơn vị: mét (m)' + (setup._layoutName ? ' · ' + setup._layoutName : ''), m + tbW * 0.55 + 3, tbY + 26);

        pdf.text('Số hiệu', m + tbW * 0.78 + 3, tbY + 7);
        pdf.setFontSize(14);
        pdf.text(String(setup.sheetNumber || '01'), m + tbW * 0.78 + 3, tbY + 18);
        pdf.setFontSize(7);
        pdf.text('WebMapEditor', m + tbW * 0.78 + 3, tbY + 25);
    }

    function drawLegend(pdf, setup, x, y, maxH) {
        if (!setup.showLegend) return 0;
        var PlotAPI = getPlot();
        if (!PlotAPI || !PlotAPI.buildLegendEntries) return 0;
        var entries = PlotAPI.buildLegendEntries(
            typeof rooms !== 'undefined' ? rooms : [],
            typeof pois !== 'undefined' ? pois : [],
            { includePois: setup.includePois, max: 12 }
        );
        if (!entries.length) return 0;
        var rowH = 4.2;
        var box = 3;
        var used = 0;
        pdf.setFontSize(7);
        pdf.setTextColor(40);
        pdf.text('Chú thích', x, y);
        used = 4;
        entries.forEach(function (e, idx) {
            if (used + rowH > maxH) return;
            var yy = y + 2 + idx * rowH;
            var rgb = colorForPdf(e.color, setup.monochrome || setup.plotStyle === 'monochrome');
            pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
            pdf.setDrawColor(80);
            if (e.kind === 'poi') {
                pdf.circle(x + box / 2, yy + box / 2, box / 2, 'FD');
            } else {
                pdf.rect(x, yy, box, box, 'FD');
            }
            pdf.setTextColor(50);
            pdf.text(String(e.label).slice(0, 28), x + box + 1.5, yy + 2.6);
            used += rowH;
        });
        return used;
    }

    function drawScaleBar(pdf, setup, scaleInfo, x, y) {
        if (!setup.showScaleBar) return;
        var seg = getPlot().scaleBarSegments(scaleInfo.scaleDenominator);
        var barH = 2.2;
        pdf.setFillColor(20);
        pdf.rect(x, y, seg.paperMm / 2, barH, 'F');
        pdf.setDrawColor(20);
        pdf.rect(x + seg.paperMm / 2, y, seg.paperMm / 2, barH);
        pdf.setFontSize(7);
        pdf.setTextColor(30);
        pdf.text('0', x, y + barH + 3.2);
        pdf.text(String(seg.meters / 2), x + seg.paperMm / 2 - 2, y + barH + 3.2);
        pdf.text(seg.label, x + seg.paperMm - 1, y + barH + 3.2);
    }

    function drawNorthArrow(pdf, setup, x, y) {
        if (!setup.showNorthArrow) return;
        var bearing = Number(window.mapBearingOffset || 0) || 0;
        pdf.setDrawColor(30);
        pdf.setFillColor(30);
        pdf.setLineWidth(0.3);
        // mũi tên đơn giản + chữ N (bearing chỉ ghi chú)
        pdf.line(x, y + 6, x, y);
        pdf.line(x, y, x - 1.5, y + 2.5);
        pdf.line(x, y, x + 1.5, y + 2.5);
        pdf.setFontSize(8);
        pdf.text('N', x - 1.2, y - 1);
        if (bearing) {
            pdf.setFontSize(6);
            pdf.text(bearing.toFixed(0) + '°', x + 3, y + 2);
        }
    }

    async function exportSheetToPdfDoc(jsPDF, setup, sheetIndex, totalSheets) {
        var PlotAPI = getPlot();
        setup = PlotAPI.normalizeSetup(setup);
        var ext = resolvePlotExtents(setup);
        if (!ext) throw new Error('Bản vẽ trống — không có gì để xuất');

        var worldW = ext.maxX - ext.minX;
        var worldH = ext.maxY - ext.minY;
        var worldWm = pxToMeters(worldW);
        var worldHm = pxToMeters(worldH);
        var scaleInfo = PlotAPI.resolveScale(setup, worldWm, worldHm);
        var fmt = PlotAPI.buildJsPdfFormat(setup);
        var pdf = new jsPDF(fmt);
        var pageW = pdf.internal.pageSize.getWidth();
        var pageH = pdf.internal.pageSize.getHeight();
        var area = scaleInfo.printable;
        var drawW = scaleInfo.drawWidthMm;
        var drawH = scaleInfo.drawHeightMm;
        var ox = area.contentXMm + (area.widthMm - drawW) / 2;
        var oy = area.contentYMm + (area.heightMm - drawH) / 2;

        pdf.setDrawColor(160);
        pdf.setLineWidth(0.2);
        pdf.rect(ox - 0.5, oy - 0.5, drawW + 1, drawH + 1);

        var wantRaster = setup.renderMode === 'raster' || setup.renderMode === 'hybrid' || setup.includeBackground;
        if (wantRaster) {
            var pxSize = PlotAPI.rasterPixelSize(drawW, drawH, setup.dpi);
            var plot = renderPlotDataUrl({
                extents: ext,
                outW: pxSize.widthPx,
                outH: pxSize.heightPx,
                includeBackground: setup.includeBackground,
                grid: setup.includeGrid,
                includePois: setup.includePois,
                includeQrs: setup.includeQrs,
                includePathNodes: setup.includePathNodes,
                padWorld: 0
            });
            if (plot && plot.dataUrl) {
                pdf.addImage(plot.dataUrl, 'PNG', ox, oy, drawW, drawH);
            }
        }

        if (setup.renderMode === 'vector' || setup.renderMode === 'hybrid') {
            drawVectorEntities(pdf, setup, ext, ox, oy, drawW, drawH);
        }

        drawTitleBlock(pdf, setup, pageW, pageH, scaleInfo, worldW, worldH);
        drawScaleBar(pdf, setup, scaleInfo, ox + 2, oy + drawH - 8);
        drawNorthArrow(pdf, setup, ox + drawW - 8, oy + 10);
        drawLegend(pdf, setup, ox + 2, oy + 4, Math.max(20, drawH - 16));

        if (totalSheets > 1) {
            pdf.setFontSize(7);
            pdf.setTextColor(100);
            pdf.text('Trang ' + (sheetIndex + 1) + '/' + totalSheets, pageW - setup.marginMm - 18, setup.marginMm - 2);
        }

        return { pdf: pdf, scaleInfo: scaleInfo, extents: ext };
    }

    async function fetchFloorPayload(buildingId, floor) {
        // Ưu tiên draft có nội dung; fallback published map_data
        try {
            if (window.DraftApi && typeof DraftApi.fetchDraft === 'function' && typeof apiFetch === 'function') {
                var draftRes = await DraftApi.fetchDraft(buildingId, floor, apiFetch);
                var payload = draftRes && draftRes.ok ? draftRes.payload : null;
                if (payload && typeof DraftApi.isDraftPayloadMeaningful === 'function'
                    ? DraftApi.isDraftPayloadMeaningful(payload)
                    : !!(payload && (payload.rooms || payload.walls || payload.nodes))) {
                    return payload;
                }
            }
        } catch (e) { /* fallback published */ }
        try {
            if (typeof apiFetch !== 'function' || !window.BASE_API_URL) return null;
            var resp = await apiFetch(window.BASE_API_URL + '/maps/' + buildingId + '/' + floor);
            if (!resp.ok) return null;
            var data = await resp.json().catch(function () { return null; });
            return data && data.map_data ? data.map_data : null;
        } catch (e2) {
            return null;
        }
    }

    async function withFloorSnapshot(floor, fn) {
        var restore = typeof getMapSnapshot === 'function' ? getMapSnapshot() : null;
        var floorEl = document.getElementById('floorSelect');
        var prevFloor = floorEl ? floorEl.value : null;
        try {
            if (floor != null && window.buildingId) {
                var payload = await fetchFloorPayload(window.buildingId, floor);
                if (!payload) throw new Error('Không tải được dữ liệu tầng ' + floor);
                if (typeof applyMapSnapshot === 'function' && payload.rooms != null) {
                    applyMapSnapshot(payload);
                } else if (typeof applyMapData === 'function') {
                    applyMapData(payload);
                }
                if (floorEl) floorEl.value = String(floor);
            }
            return await fn();
        } finally {
            if (restore && typeof applyMapSnapshot === 'function') {
                applyMapSnapshot(restore);
            }
            if (floorEl && prevFloor != null) floorEl.value = prevFloor;
            if (typeof draw === 'function') draw();
        }
    }

    async function exportMapToPdfWithSetup(setup) {
        var PlotAPI = getPlot();
        if (!PlotAPI) throw new Error('PlotPageSetup chưa tải');
        setup = PlotAPI.normalizeSetup(setup);
        PlotAPI.savePreset(setup);

        var jsPDF = await ensureJsPdf();
        var jobs = PlotAPI.expandExportJobs(setup);
        if (!jobs.length) throw new Error('Không có trang để xuất');

        toast('Đang xuất ' + jobs.length + ' trang PDF…', 'info');

        var firstPdf = null;
        var firstInfo = null;
        var pageCount = 0;

        for (var i = 0; i < jobs.length; i++) {
            var job = jobs[i];
            var run = async function () {
                if (!firstPdf) {
                    var first = await exportSheetToPdfDoc(jsPDF, job, pageCount, jobs.length);
                    firstPdf = first.pdf;
                    firstInfo = first;
                    pageCount++;
                } else {
                    var fmt = PlotAPI.buildJsPdfFormat(job);
                    firstPdf.addPage(fmt.format, fmt.orientation);
                    await drawOntoExistingPdf(firstPdf, job, pageCount, jobs.length);
                    pageCount++;
                }
            };
            if (job._floor != null && String(job._floor) !== String(
                (document.getElementById('floorSelect') || {}).value
            )) {
                await withFloorSnapshot(job._floor, run);
            } else {
                if (job._floor != null) job.floorLabel = job._floor === '0' ? 'Trệt' : job._floor;
                await run();
            }
        }

        var mapName = setup.mapName || 'Ban_ve';
        firstPdf.save(String(mapName).replace(/\s+/g, '_') + '.pdf');
        var warn = firstInfo && firstInfo.scaleInfo && firstInfo.scaleInfo.overflow
            ? ' (cảnh báo: có trang tràn khổ)' : '';
        toast('Đã xuất PDF ' + pageCount + ' trang · ' + setup.paperId + warn, warn ? 'warning' : 'success');
        return firstInfo;
    }

    async function drawOntoExistingPdf(pdf, setup, sheetIndex, totalSheets) {
        var PlotAPI = getPlot();
        setup = PlotAPI.normalizeSetup(setup);
        var ext = resolvePlotExtents(setup);
        if (!ext) return;
        var worldW = ext.maxX - ext.minX;
        var worldH = ext.maxY - ext.minY;
        var scaleInfo = PlotAPI.resolveScale(setup, pxToMeters(worldW), pxToMeters(worldH));
        var pageW = pdf.internal.pageSize.getWidth();
        var pageH = pdf.internal.pageSize.getHeight();
        var area = scaleInfo.printable;
        var drawW = scaleInfo.drawWidthMm;
        var drawH = scaleInfo.drawHeightMm;
        var ox = area.contentXMm + (area.widthMm - drawW) / 2;
        var oy = area.contentYMm + (area.heightMm - drawH) / 2;

        pdf.setDrawColor(160);
        pdf.rect(ox - 0.5, oy - 0.5, drawW + 1, drawH + 1);

        if (setup.renderMode === 'raster' || setup.renderMode === 'hybrid' || setup.includeBackground) {
            var pxSize = PlotAPI.rasterPixelSize(drawW, drawH, setup.dpi);
            var plot = renderPlotDataUrl({
                extents: ext, outW: pxSize.widthPx, outH: pxSize.heightPx,
                includeBackground: setup.includeBackground, grid: setup.includeGrid,
                includePois: setup.includePois, includeQrs: setup.includeQrs,
                includePathNodes: setup.includePathNodes, padWorld: 0
            });
            if (plot && plot.dataUrl) pdf.addImage(plot.dataUrl, 'PNG', ox, oy, drawW, drawH);
        }
        if (setup.renderMode === 'vector' || setup.renderMode === 'hybrid') {
            drawVectorEntities(pdf, setup, ext, ox, oy, drawW, drawH);
        }
        drawTitleBlock(pdf, setup, pageW, pageH, scaleInfo, worldW, worldH);
        drawScaleBar(pdf, setup, scaleInfo, ox + 2, oy + drawH - 8);
        drawNorthArrow(pdf, setup, ox + drawW - 8, oy + 10);
        drawLegend(pdf, setup, ox + 2, oy + 4, Math.max(20, drawH - 16));
        if (totalSheets > 1) {
            pdf.setFontSize(7);
            pdf.setTextColor(100);
            pdf.text('Trang ' + (sheetIndex + 1) + '/' + totalSheets, pageW - setup.marginMm - 18, setup.marginMm - 2);
        }
    }

    // ============================================================
    // Dialog Page Setup
    // ============================================================
    var _pendingWindowSetup = null;
    var _windowPick = null;

    function closePlotDialog() {
        var el = document.getElementById('plotPageSetupOverlay');
        if (el) el.remove();
    }

    function readDialogSetup(root) {
        var PlotAPI = getPlot();
        var scaleMode = root.querySelector('[name=scaleMode]:checked');
        var plotStyle = root.querySelector('#plotStyle').value;
        var floorChecks = root.querySelectorAll('[data-plot-floor]:checked');
        var floors = [];
        floorChecks.forEach(function (c) { floors.push(c.getAttribute('data-plot-floor')); });

        var layouts = null;
        if (root.querySelector('#plotDetailLayout').checked) {
            layouts = [
                {
                    id: 'overview',
                    name: 'Tổng mặt bằng',
                    paperId: root.querySelector('#plotPaper').value,
                    orientation: root.querySelector('#plotOrientation').value,
                    scaleMode: scaleMode ? scaleMode.value : 'fit',
                    scaleDenominator: Number(root.querySelector('#plotScaleDenom').value) || 100,
                    plotArea: 'extents'
                },
                {
                    id: 'detail',
                    name: 'Chi tiết (Display)',
                    paperId: 'A4',
                    orientation: 'portrait',
                    scaleMode: 'fit',
                    plotArea: 'display',
                    sheetNumber: String(root.querySelector('#plotSheetNo').value || '01') + 'b'
                }
            ];
        }

        var setup = PlotAPI.normalizeSetup({
            paperId: root.querySelector('#plotPaper').value,
            orientation: root.querySelector('#plotOrientation').value,
            scaleMode: scaleMode ? scaleMode.value : 'fit',
            scaleDenominator: Number(root.querySelector('#plotScaleDenom').value) || 100,
            plotArea: root.querySelector('#plotArea').value,
            marginMm: Number(root.querySelector('#plotMargin').value) || 10,
            titleBlock: root.querySelector('#plotTitleBlock').checked,
            dpi: Number(root.querySelector('#plotDpi').value) || 300,
            renderMode: root.querySelector('#plotRenderMode').value,
            includeBackground: root.querySelector('#plotBg').checked,
            includeGrid: root.querySelector('#plotGrid').checked,
            includePois: root.querySelector('#plotPois').checked,
            includeQrs: root.querySelector('#plotQrs').checked,
            includePathNodes: root.querySelector('#plotNodes').checked,
            showScaleBar: root.querySelector('#plotScaleBar').checked,
            showNorthArrow: root.querySelector('#plotNorth').checked,
            showLegend: root.querySelector('#plotLegend').checked,
            plotStyle: plotStyle,
            monochrome: plotStyle === 'monochrome',
            mapName: root.querySelector('#plotMapName').value,
            drawnBy: root.querySelector('#plotDrawnBy').value,
            orgName: root.querySelector('#plotOrgName').value,
            sheetNumber: root.querySelector('#plotSheetNo').value,
            logoDataUrl: root.querySelector('#plotLogoData').value || '',
            window: _pendingWindowSetup && _pendingWindowSetup.window || null,
            floors: floors.length ? floors : null,
            layouts: layouts,
            sheets: root.querySelector('#plotExtraA4').checked ? [{
                paperId: 'A4',
                orientation: 'portrait',
                scaleMode: 'fit',
                sheetNumber: String(root.querySelector('#plotSheetNo').value || '01') + 'x'
            }] : null
        });
        return setup;
    }

    function updateDialogPreview(root) {
        var PlotAPI = getPlot();
        var setup = readDialogSetup(root);
        var ext = resolvePlotExtents(setup);
        var box = root.querySelector('#plotPreview');
        if (!ext) {
            box.className = 'plot-preview warn';
            box.textContent = 'Bản vẽ trống — chưa có đối tượng để xuất.';
            return setup;
        }
        var info = PlotAPI.resolveScale(setup, pxToMeters(ext.maxX - ext.minX), pxToMeters(ext.maxY - ext.minY));
        var page = PlotAPI.pageSizeMm(setup.paperId, setup.orientation);
        var jobs = PlotAPI.expandExportJobs(setup);
        var lines = [
            'Trang: ' + page.widthMm.toFixed(1) + ' × ' + page.heightMm.toFixed(1) + ' mm (' + setup.paperId + ', ' + setup.orientation + ')',
            'Vùng in: ' + info.printable.widthMm.toFixed(1) + ' × ' + info.printable.heightMm.toFixed(1) + ' mm',
            'Tỷ lệ: ' + info.scaleLabel + (setup.scaleMode === 'fit' ? ' (Fit to paper)' : ''),
            'Style: ' + setup.plotStyle + (setup.showLegend ? ' · có legend' : ''),
            'Bản vẽ: ' + pxToMeters(ext.maxX - ext.minX).toFixed(2) + ' × ' + pxToMeters(ext.maxY - ext.minY).toFixed(2) + ' m',
            'Cần giấy: ' + info.neededWidthMm.toFixed(1) + ' × ' + info.neededHeightMm.toFixed(1) + ' mm',
            '1 mm giấy ≈ ' + (info.metersPerPaperMm * 1000).toFixed(0) + ' mm thực tế',
            'Số trang sẽ xuất: ' + jobs.length
        ];
        if (setup.logoDataUrl) lines.push('Logo: đã gắn');
        if (setup.plotArea === 'window' && !setup.window) {
            lines.push('⚠ Chưa chọn cửa sổ Window — sẽ fallback Extents.');
        }
        box.className = 'plot-preview' + (info.overflow ? ' warn' : '');
        if (info.overflow) lines.push('⚠ Bản vẽ TRÀN khổ ở tỷ lệ cố định — nội dung sẽ bị cắt/co.');
        box.textContent = lines.join('\n');
        return setup;
    }

    function openPlotPageSetupDialog(initial) {
        var PlotAPI = getPlot();
        if (!PlotAPI) {
            toast('Module PlotPageSetup chưa sẵn sàng', 'error');
            return;
        }
        ensurePlotStyles();
        closePlotDialog();
        var setup = PlotAPI.normalizeSetup(Object.assign({}, PlotAPI.loadPreset(), initial || {}, _pendingWindowSetup || {}));
        if (_pendingWindowSetup && _pendingWindowSetup.window) setup.window = _pendingWindowSetup.window;
        var mapNameEl = document.getElementById('mapName');
        if (!setup.mapName && mapNameEl && mapNameEl.value) setup.mapName = mapNameEl.value;

        var paperOpts = Object.keys(PlotAPI.PAPER_SIZES).map(function (id) {
            var p = PlotAPI.PAPER_SIZES[id];
            return '<option value="' + id + '"' + (setup.paperId === id ? ' selected' : '') + '>' +
                p.label + ' (' + p.widthMm + '×' + p.heightMm + ' mm)</option>';
        }).join('');

        var overlay = document.createElement('div');
        overlay.id = 'plotPageSetupOverlay';
        overlay.className = 'plot-overlay';
        overlay.innerHTML =
            '<div class="plot-modal" role="dialog" aria-modal="true" aria-label="Page Setup PDF">' +
            '<h2>Page Setup — Xuất PDF</h2>' +
            '<div class="plot-grid">' +
            '<label>Khổ giấy<select id="plotPaper">' + paperOpts + '</select></label>' +
            '<label>Hướng<select id="plotOrientation">' +
            '<option value="portrait"' + (setup.orientation === 'portrait' ? ' selected' : '') + '>Dọc (Portrait)</option>' +
            '<option value="landscape"' + (setup.orientation === 'landscape' ? ' selected' : '') + '>Ngang (Landscape)</option>' +
            '</select></label>' +
            '<label>Vùng xuất<select id="plotArea">' +
            '<option value="extents"' + (setup.plotArea === 'extents' ? ' selected' : '') + '>Extents (toàn bộ)</option>' +
            '<option value="display"' + (setup.plotArea === 'display' ? ' selected' : '') + '>Display (viewport hiện tại)</option>' +
            '<option value="window"' + (setup.plotArea === 'window' ? ' selected' : '') + '>Window (2 góc)</option>' +
            '</select></label>' +
            '<label>Lề (mm)<input id="plotMargin" type="number" min="0" max="80" step="1" value="' + setup.marginMm + '"></label>' +
            '<label>Tỷ lệ<select id="plotScaleDenom">' +
            PlotAPI.SCALE_PRESETS.map(function (n) {
                return '<option value="' + n + '"' + (setup.scaleDenominator === n ? ' selected' : '') + '>1:' + n + '</option>';
            }).join('') +
            '<option value="' + setup.scaleDenominator + '"' +
            (PlotAPI.SCALE_PRESETS.indexOf(setup.scaleDenominator) < 0 ? ' selected' : '') +
            '>Tùy chỉnh 1:' + setup.scaleDenominator + '</option>' +
            '</select></label>' +
            '<label>DPI<select id="plotDpi">' +
            PlotAPI.DPI_PRESETS.map(function (d) {
                return '<option value="' + d + '"' + (setup.dpi === d ? ' selected' : '') + '>' + d + '</option>';
            }).join('') +
            '</select></label>' +
            '<label>Kiểu render<select id="plotRenderMode">' +
            '<option value="hybrid"' + (setup.renderMode === 'hybrid' ? ' selected' : '') + '>Hybrid (ảnh + vector)</option>' +
            '<option value="raster"' + (setup.renderMode === 'raster' ? ' selected' : '') + '>Raster (PNG)</option>' +
            '<option value="vector"' + (setup.renderMode === 'vector' ? ' selected' : '') + '>Vector (nét)</option>' +
            '</select></label>' +
            '<label>Tên bản vẽ<input id="plotMapName" type="text" value="' + String(setup.mapName || '').replace(/"/g, '&quot;') + '"></label>' +
            '<label>Tổ chức<input id="plotOrgName" type="text" value="' + String(setup.orgName || '').replace(/"/g, '&quot;') + '"></label>' +
            '<label>Người vẽ<input id="plotDrawnBy" type="text" value="' + String(setup.drawnBy || '').replace(/"/g, '&quot;') + '"></label>' +
            '<label>Số hiệu<input id="plotSheetNo" type="text" value="' + String(setup.sheetNumber || '01').replace(/"/g, '&quot;') + '"></label>' +
            '<label>Tỷ lệ tùy chỉnh<input id="plotScaleCustom" type="number" min="1" step="1" placeholder="vd 75" value=""></label>' +
            '<label>Plot style<select id="plotStyle">' +
            '<option value="color"' + (setup.plotStyle === 'color' ? ' selected' : '') + '>Màu gốc</option>' +
            '<option value="monochrome"' + (setup.plotStyle === 'monochrome' ? ' selected' : '') + '>Monochrome</option>' +
            '<option value="ctb"' + (setup.plotStyle === 'ctb' ? ' selected' : '') + '>CTB theo layer/loại</option>' +
            '</select></label>' +
            '</div>' +
            '<div class="plot-checks" style="margin-top:8px">' +
            '<label><input type="radio" name="scaleMode" value="fit"' + (setup.scaleMode === 'fit' ? ' checked' : '') + '> Fit to paper</label>' +
            '<label><input type="radio" name="scaleMode" value="fixed"' + (setup.scaleMode === 'fixed' ? ' checked' : '') + '> Scale cố định 1:N</label>' +
            '</div>' +
            '<div class="plot-checks">' +
            '<label><input id="plotTitleBlock" type="checkbox"' + (setup.titleBlock ? ' checked' : '') + '> Khung tên</label>' +
            '<label><input id="plotScaleBar" type="checkbox"' + (setup.showScaleBar ? ' checked' : '') + '> Thước tỷ lệ</label>' +
            '<label><input id="plotNorth" type="checkbox"' + (setup.showNorthArrow ? ' checked' : '') + '> Mũi tên Bắc</label>' +
            '<label><input id="plotLegend" type="checkbox"' + (setup.showLegend ? ' checked' : '') + '> Chú thích (legend)</label>' +
            '<label><input id="plotBg" type="checkbox"' + (setup.includeBackground ? ' checked' : '') + '> Ảnh nền</label>' +
            '<label><input id="plotGrid" type="checkbox"' + (setup.includeGrid ? ' checked' : '') + '> Lưới</label>' +
            '<label><input id="plotPois" type="checkbox"' + (setup.includePois ? ' checked' : '') + '> POI</label>' +
            '<label><input id="plotQrs" type="checkbox"' + (setup.includeQrs ? ' checked' : '') + '> QR</label>' +
            '<label><input id="plotNodes" type="checkbox"' + (setup.includePathNodes ? ' checked' : '') + '> Path node</label>' +
            '<label><input id="plotExtraA4" type="checkbox"> Thêm trang A4 (Fit)</label>' +
            '<label><input id="plotDetailLayout" type="checkbox"> Paper Space: Tổng + Chi tiết</label>' +
            '</div>' +
            '<div class="plot-checks" id="plotFloorBox" style="margin-top:8px;border-top:1px solid #334155;padding-top:8px"></div>' +
            '<div class="plot-checks" style="margin-top:4px">' +
            '<label>Logo khung tên<input id="plotLogoFile" type="file" accept="image/*"></label>' +
            '<input type="hidden" id="plotLogoData" value="">' +
            '</div>' +
            '<pre id="plotPreview" class="plot-preview"></pre>' +
            '<div class="plot-actions">' +
            '<button type="button" class="plot-btn-secondary" id="plotPickWindow">Chọn Window…</button>' +
            '<button type="button" class="plot-btn-danger" id="plotCancel">Hủy</button>' +
            '<button type="button" class="plot-btn-primary" id="plotExport">Xuất PDF</button>' +
            '</div></div>';

        document.body.appendChild(overlay);
        var modal = overlay.querySelector('.plot-modal');

        // Floor checkboxes
        var floorBox = modal.querySelector('#plotFloorBox');
        var sel = document.getElementById('floorSelect');
        if (sel && sel.options && sel.options.length) {
            floorBox.innerHTML = '<div style="grid-column:1/-1;font-size:12px;color:#94a3b8;margin-bottom:4px">Xuất nhiều tầng (để trống = chỉ tầng hiện tại):</div>';
            Array.prototype.forEach.call(sel.options, function (opt) {
                var lab = document.createElement('label');
                var checked = setup.floors && setup.floors.indexOf(String(opt.value)) >= 0;
                lab.innerHTML = '<input type="checkbox" data-plot-floor="' + opt.value + '"' +
                    (checked ? ' checked' : '') + '> ' + (opt.textContent || ('Tầng ' + opt.value));
                floorBox.appendChild(lab);
            });
        } else {
            floorBox.style.display = 'none';
        }

        if (setup.logoDataUrl) modal.querySelector('#plotLogoData').value = setup.logoDataUrl;
        modal.querySelector('#plotLogoFile').addEventListener('change', function (ev) {
            var file = ev.target.files && ev.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                modal.querySelector('#plotLogoData').value = String(reader.result || '');
                refresh();
            };
            reader.readAsDataURL(file);
        });

        function refresh() {
            var custom = Number(modal.querySelector('#plotScaleCustom').value);
            if (custom >= 1) modal.querySelector('#plotScaleDenom').value = String(Math.round(custom));
            updateDialogPreview(modal);
        }

        modal.querySelectorAll('input,select').forEach(function (el) {
            el.addEventListener('change', refresh);
            el.addEventListener('input', refresh);
        });
        modal.querySelector('#plotCancel').onclick = function () { closePlotDialog(); };
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closePlotDialog(); });
        modal.querySelector('#plotExport').onclick = async function () {
            try {
                var s = updateDialogPreview(modal);
                closePlotDialog();
                await exportMapToPdfWithSetup(s);
                _pendingWindowSetup = null;
            } catch (err) {
                console.error('[PDF] export', err);
                toast('Lỗi xuất PDF: ' + (err && err.message || err), 'error');
            }
        };
        modal.querySelector('#plotPickWindow').onclick = function () {
            var s = readDialogSetup(modal);
            closePlotDialog();
            beginWindowPick(s);
        };
        refresh();
    }

    function beginWindowPick(setup) {
        toast('Click góc 1, rồi góc 2 để chọn Window plot', 'info');
        _windowPick = { setup: setup, p1: null };
        function onDown(e) {
            if (typeof screenToWorld !== 'function' || typeof canvas === 'undefined') return;
            var rect = canvas.getBoundingClientRect();
            var sx = (e.clientX - rect.left) * (canvas.width / rect.width);
            var sy = (e.clientY - rect.top) * (canvas.height / rect.height);
            var w = screenToWorld(sx, sy);
            if (!_windowPick.p1) {
                _windowPick.p1 = w;
                toast('Đã chọn góc 1 — click góc 2', 'info');
                return;
            }
            var p1 = _windowPick.p1;
            var p2 = w;
            canvas.removeEventListener('pointerdown', onDown, true);
            _pendingWindowSetup = {
                plotArea: 'window',
                window: {
                    minX: Math.min(p1.x, p2.x),
                    minY: Math.min(p1.y, p2.y),
                    maxX: Math.max(p1.x, p2.x),
                    maxY: Math.max(p1.y, p2.y)
                }
            };
            _windowPick = null;
            toast('Đã chọn Window — mở lại Page Setup', 'success');
            openPlotPageSetupDialog(Object.assign({}, setup, _pendingWindowSetup));
        }
        canvas.addEventListener('pointerdown', onDown, true);
    }

    function exportMapToPdf(options) {
        // Mở dialog Page Setup (chuẩn AutoCAD). options có thể prefill.
        if (options && options.quick === true) {
            var PlotAPI = getPlot();
            var setup = PlotAPI
                ? PlotAPI.normalizeSetup(Object.assign({}, PlotAPI.loadPreset(), options))
                : options;
            return exportMapToPdfWithSetup(setup).catch(function (err) {
                console.error('[PDF] export', err);
                toast('Lỗi xuất PDF: ' + (err && err.message || err), 'error');
            });
        }
        openPlotPageSetupDialog(options || {});
    }

    // ============================================================
    // Nhập PDF (giữ logic cũ)
    // ============================================================
    function extractPolylines(opList, viewport, OPS, Util) {
        var polylines = [];
        var ctm = viewport.transform.slice();
        var stack = [];
        function dev(x, y) {
            var p = Util.applyTransform([x, y], ctm);
            return { x: p[0], y: p[1] };
        }
        function sampleBezier(p0, c1, c2, p1, out, steps) {
            steps = steps || 8;
            for (var s = 1; s <= steps; s++) {
                var t = s / steps, mt = 1 - t;
                var x = mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p1.x;
                var y = mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p1.y;
                out.push({ x: x, y: y });
            }
        }
        var fnArray = opList.fnArray, argsArray = opList.argsArray;
        for (var i = 0; i < fnArray.length; i++) {
            var fn = fnArray[i], args = argsArray[i];
            if (fn === OPS.save) stack.push(ctm.slice());
            else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
            else if (fn === OPS.transform) ctm = Util.transform(ctm, args);
            else if (fn === OPS.constructPath) {
                var ops = args[0], coords = args[1], ci = 0, cur = null, sub = null;
                function flush() { if (sub && sub.length >= 2) polylines.push(sub); sub = null; }
                for (var k = 0; k < ops.length; k++) {
                    var op = ops[k];
                    if (op === OPS.moveTo) {
                        flush(); cur = { x: coords[ci++], y: coords[ci++] }; sub = [dev(cur.x, cur.y)];
                    } else if (op === OPS.lineTo) {
                        var nx = coords[ci++], ny = coords[ci++];
                        if (!sub) sub = [dev(cur ? cur.x : nx, cur ? cur.y : ny)];
                        cur = { x: nx, y: ny }; sub.push(dev(nx, ny));
                    } else if (op === OPS.curveTo) {
                        var c1 = { x: coords[ci++], y: coords[ci++] };
                        var c2 = { x: coords[ci++], y: coords[ci++] };
                        var p1 = { x: coords[ci++], y: coords[ci++] };
                        if (!sub) sub = [dev(cur ? cur.x : p1.x, cur ? cur.y : p1.y)];
                        sampleBezier(sub[sub.length - 1], dev(c1.x, c1.y), dev(c2.x, c2.y), dev(p1.x, p1.y), sub, 8);
                        cur = p1;
                    } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
                        ci += 2; var ex = coords[ci++], ey = coords[ci++];
                        var end = { x: ex, y: ey };
                        if (!sub) sub = [dev(cur ? cur.x : end.x, cur ? cur.y : end.y)];
                        sub.push(dev(end.x, end.y)); cur = end;
                    } else if (op === OPS.rectangle) {
                        var rx = coords[ci++], ry = coords[ci++], rw = coords[ci++], rh = coords[ci++];
                        polylines.push([dev(rx, ry), dev(rx + rw, ry), dev(rx + rw, ry + rh), dev(rx, ry + rh), dev(rx, ry)]);
                    } else if (op === OPS.closePath) {
                        if (sub && sub.length >= 2) sub.push({ x: sub[0].x, y: sub[0].y });
                    }
                }
                flush();
            }
        }
        return polylines;
    }

    function polyBBox(polylines) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        polylines.forEach(function (pl) {
            pl.forEach(function (p) {
                if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
            });
        });
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
    }

    async function attachPdfAsBackground(page) {
        var vp = page.getViewport({ scale: 2 });
        var c = document.createElement('canvas');
        c.width = Math.max(2, Math.round(vp.width));
        c.height = Math.max(2, Math.round(vp.height));
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        var url = c.toDataURL('image/png');
        if (typeof applyBackgroundImageSrc === 'function') {
            applyBackgroundImageSrc(url, { fitViewport: true });
        } else {
            window.bgImageBase64 = url;
            var img = new Image();
            img.onload = function () { window.bgImage = img; if (typeof draw === 'function') draw(); };
            img.src = url;
        }
        toast('PDF không có nét vector — đã đính kèm làm ảnh nền để đồ lại', 'info');
    }

    async function importPdfDrawing(file) {
        if (!file) return;
        try {
            var pdfjsLib = await ensurePdfJs();
            toast('Đang đọc PDF…', 'info');
            var buf = await file.arrayBuffer();
            var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
            var firstPage = await pdf.getPage(1);
            var polylines = [];
            var pageOffsetY = 0;
            var pageLimit = Math.min(Number(pdf.numPages) || 1, 20);
            var vectorUtils = window.EditorCore && EditorCore.PdfVectorUtils;
            var pdfDiagnostics = { invalidOperators: 0, restoreUnderflow: 0, unbalancedSave: 0, truncated: false };
            for (var pageNo = 1; pageNo <= pageLimit; pageNo++) {
                var page = pageNo === 1 ? firstPage : await pdf.getPage(pageNo);
                var viewport = page.getViewport({ scale: 1 });
                var opList = await page.getOperatorList();
                if (pageNo === 1 && vectorUtils && vectorUtils.classifyPage) {
                    var classification = vectorUtils.classifyPage(opList, pdfjsLib.OPS);
                    var useBackground = classification.mode === 'raster';
                    if (classification.mode === 'mixed') {
                        useBackground = typeof confirm !== 'function' || confirm(
                            'PDF có cả ảnh và nét vector. Chọn OK để giữ nguyên trang làm ảnh nền; ' +
                            'chọn Cancel để chỉ trích các nét vector.'
                        );
                    }
                    if (useBackground) {
                        await attachPdfAsBackground(firstPage);
                        return;
                    }
                }
                var detailed = vectorUtils && vectorUtils.extractPolylinesDetailed
                    ? vectorUtils.extractPolylinesDetailed(
                        opList, viewport, pdfjsLib.OPS, pdfjsLib.Util,
                        { curveSteps: 12, maxPolylines: 50000 }
                    )
                    : null;
                var pageLines = detailed
                    ? detailed.polylines
                    : (vectorUtils
                        ? vectorUtils.extractPolylines(opList, viewport, pdfjsLib.OPS, pdfjsLib.Util)
                        : extractPolylines(opList, viewport, pdfjsLib.OPS, pdfjsLib.Util));
                if (detailed) {
                    pdfDiagnostics.invalidOperators += detailed.diagnostics.invalidOperators;
                    pdfDiagnostics.restoreUnderflow += detailed.diagnostics.restoreUnderflow;
                    pdfDiagnostics.unbalancedSave += detailed.diagnostics.unbalancedSave;
                    pdfDiagnostics.truncated = pdfDiagnostics.truncated || detailed.diagnostics.truncated;
                }
                pageLines.forEach(function (line) {
                    polylines.push(line.map(function (point) {
                        return { x: point.x, y: point.y + pageOffsetY };
                    }));
                });
                pageOffsetY += viewport.height + 24;
            }
            polylines = polylines.filter(function (pl) { return pl && pl.length >= 2; });
            if (!polylines.length) {
                await attachPdfAsBackground(firstPage);
                return;
            }
            var bbox = vectorUtils ? vectorUtils.polyBBox(polylines) : polyBBox(polylines);
            if (!bbox) throw new Error('Không xác định được phạm vi hình học PDF');
            var targetMax = 1600;
            var sc = Math.min(targetMax / (bbox.w || 1), targetMax / (bbox.h || 1));
            if (!isFinite(sc) || sc <= 0) sc = 1;
            var OFFSET = 120;
            if (typeof saveState === 'function') saveState();
            var made = 0;
            var CAP = 8000;
            for (var pi = 0; pi < polylines.length && made < CAP; pi++) {
                var pl = polylines[pi];
                for (var i = 0; i < pl.length - 1 && made < CAP; i++) {
                    var a = { x: (pl[i].x - bbox.minX) * sc + OFFSET, y: (pl[i].y - bbox.minY) * sc + OFFSET };
                    var b = { x: (pl[i + 1].x - bbox.minX) * sc + OFFSET, y: (pl[i + 1].y - bbox.minY) * sc + OFFSET };
                    if (typeof createLineSegment === 'function') {
                        if (createLineSegment(a, b, { color: '#334155', lineWeight: 1.5 })) made++;
                    }
                }
            }
            if (typeof updateObjectList === 'function') updateObjectList();
            if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
            if (typeof draw === 'function') draw();
            if (typeof markAutosaveDirty === 'function') markAutosaveDirty();
            var capped = made >= CAP ? ' (đã giới hạn ' + CAP + ' đoạn)' : '';
            var diagnosticCount = pdfDiagnostics.invalidOperators +
                pdfDiagnostics.restoreUnderflow + pdfDiagnostics.unbalancedSave +
                (pdfDiagnostics.truncated ? 1 : 0) +
                ((Number(pdf.numPages) || 1) > pageLimit ? 1 : 0);
            toast('Đã nhập ' + made + ' đoạn vẽ từ PDF' + capped +
                (pageLimit > 1 ? ' từ ' + pageLimit + ' trang' : '') +
                (diagnosticCount ? ' (' + diagnosticCount + ' cảnh báo tương thích).' : '.') +
                ' Dùng «Hiệu chỉnh» để chỉnh tỷ lệ nếu cần.',
                diagnosticCount ? 'warning' : 'success');
        } catch (err) {
            console.error('[PDF] import', err);
            toast('Lỗi nhập PDF: ' + (err && err.message || err), 'error');
        }
    }

    window.exportMapToPdf = exportMapToPdf;
    window.exportMapToPdfWithSetup = exportMapToPdfWithSetup;
    window.openPlotPageSetupDialog = openPlotPageSetupDialog;
    window.importPdfDrawing = importPdfDrawing;
})();
