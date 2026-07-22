// ============================================================
// PDF-IO.JS — Xuất bản vẽ ra PDF & Nhập dữ liệu bản vẽ từ PDF (kiểu AutoCAD)
// - Xuất: "plot" toàn bộ extents của bản vẽ ra 1 trang PDF + khung tên.
// - Nhập: trích các nét vector (path) trong PDF → tạo các đoạn (lines).
//         Nếu PDF không có nét vector (ảnh scan) → đính kèm làm ảnh nền.
// Thư viện jsPDF + pdf.js được nạp lười (CDN) khi dùng lần đầu.
// ============================================================
(function () {
    'use strict';

    var JSPDF_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    var PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    var PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    // ---------- tiện ích chung ----------
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

    // ============================================================
    // 1) XUẤT PDF — plot toàn bộ extents
    // ============================================================
    function computeExtents(includeBg) {
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
        (typeof pois !== 'undefined' ? pois : []).forEach(function (p) { if (p) pt(p.x, p.y); });
        (typeof qrs !== 'undefined' ? qrs : []).forEach(function (q) { if (q) pt(q.x, q.y); });
        (typeof pathNodes !== 'undefined' ? pathNodes : []).forEach(function (n) { if (n) pt(n.x, n.y); });
        (typeof blockInserts !== 'undefined' ? blockInserts : []).forEach(function (b) { if (b) pt(b.x, b.y); });
        (typeof dimensions !== 'undefined' ? dimensions : []).forEach(function (d) {
            if (!d) return; if (d.p1) pt(d.p1.x, d.p1.y); if (d.p2) pt(d.p2.x, d.p2.y);
        });
        if (includeBg && window.bgImage) {
            var fallbackScale = window.bgScale > 0 ? window.bgScale : 1;
            var bw = window.bgImage.width *
                (window.bgScaleX > 0 ? window.bgScaleX : fallbackScale);
            var bh = window.bgImage.height *
                (window.bgScaleY > 0 ? window.bgScaleY : fallbackScale);
            var bx = window.bgX || 0, by = window.bgY || 0;
            // Xấp xỉ theo 4 góc (bỏ qua xoay để đơn giản — vẫn bao trọn phần lớn)
            pt(bx, by); pt(bx + bw, by); pt(bx, by + bh); pt(bx + bw, by + bh);
        }
        if (!has) return null;
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    /** Render toàn bộ bản vẽ ra dataURL PNG (plot extents). */
    function renderPlotDataUrl(options) {
        options = options || {};
        var includeBg = !!options.includeBackground;
        var ext = computeExtents(includeBg);
        if (!ext) return null;

        var margin = 48; // px thế giới quanh bản vẽ
        var wWorld = (ext.maxX - ext.minX) + margin * 2;
        var hWorld = (ext.maxY - ext.minY) + margin * 2;
        if (wWorld <= 0 || hWorld <= 0) return null;

        var targetMax = 2400;
        var scale = Math.min(targetMax / wWorld, targetMax / hWorld, 4);
        if (!isFinite(scale) || scale <= 0) scale = 1;
        var outW = Math.max(2, Math.round(wWorld * scale));
        var outH = Math.max(2, Math.round(hWorld * scale));

        // Lưu trạng thái canvas thật (canvas/ctx là const → chỉ đổi size + zoom/pan)
        var svW = canvas.width, svH = canvas.height;
        var svZoom = zoom, svPanX = panX, svPanY = panY;
        var gridEl = document.getElementById('gridCheck');
        var gridWas = gridEl ? gridEl.checked : false;
        var svSelRoom = selectedRoom, svSelObj = selectedObject;
        var svBg = window.bgImage;

        var dataUrl = null;
        try {
            canvas.width = outW;
            canvas.height = outH;
            zoom = scale;
            panX = (-ext.minX + margin) * scale;
            panY = (-ext.minY + margin) * scale;
            if (gridEl) gridEl.checked = !!options.grid;
            selectedRoom = null;
            selectedObject = null;
            if (!includeBg) window.bgImage = null;
            draw();
            dataUrl = canvas.toDataURL('image/png');
        } finally {
            window.bgImage = svBg;
            if (gridEl) gridEl.checked = gridWas;
            selectedRoom = svSelRoom;
            selectedObject = svSelObj;
            zoom = svZoom; panX = svPanX; panY = svPanY;
            canvas.width = svW; canvas.height = svH;
            if (typeof resizeCanvas === 'function') resizeCanvas(); else draw();
        }
        return {
            dataUrl: dataUrl, outW: outW, outH: outH,
            worldW: ext.maxX - ext.minX, worldH: ext.maxY - ext.minY
        };
    }

    async function exportMapToPdf(options) {
        options = options || {};
        try {
            var jsPDF = await ensureJsPdf();
            var mapNameEl = document.getElementById('mapName');
            var mapName = (mapNameEl && mapNameEl.value) ? mapNameEl.value : 'Ban_ve';

            var includeBg = options.includeBackground !== false && !!window.bgImage;
            var plot = renderPlotDataUrl({ includeBackground: includeBg, grid: !!options.grid });
            if (!plot || !plot.dataUrl) { toast('Bản vẽ trống — không có gì để xuất', 'error'); return; }

            var orientation = plot.outW >= plot.outH ? 'landscape' : 'portrait';
            var pdf = new jsPDF({ orientation: orientation, unit: 'pt', format: 'a4' });
            var pageW = pdf.internal.pageSize.getWidth();
            var pageH = pdf.internal.pageSize.getHeight();

            var pad = 24;
            var tbH = 58; // khung tên
            var availW = pageW - pad * 2;
            var availH = pageH - pad * 2 - tbH;
            var ratio = Math.min(availW / plot.outW, availH / plot.outH);
            if (!isFinite(ratio) || ratio <= 0) ratio = 1;
            var drawW = plot.outW * ratio;
            var drawH = plot.outH * ratio;
            var ox = (pageW - drawW) / 2;
            var oy = pad;

            // Khung bản vẽ
            pdf.setDrawColor(150);
            pdf.setLineWidth(0.6);
            pdf.rect(ox - 2, oy - 2, drawW + 4, drawH + 4);
            pdf.addImage(plot.dataUrl, 'PNG', ox, oy, drawW, drawH);

            // Khung tên (title block)
            var tbY = pageH - pad - tbH;
            pdf.setDrawColor(90);
            pdf.setLineWidth(0.8);
            pdf.rect(pad, tbY, pageW - pad * 2, tbH);
            pdf.line(pageW / 2, tbY, pageW / 2, tbY + tbH);

            var wM = pxToMeters(plot.worldW);
            var hM = pxToMeters(plot.worldH);
            var dateStr = new Date().toLocaleString('vi-VN');

            pdf.setFontSize(13);
            pdf.setTextColor(20);
            pdf.text(String(mapName), pad + 10, tbY + 20);
            pdf.setFontSize(9);
            pdf.setTextColor(70);
            pdf.text('Kích thước: ' + wM.toFixed(2) + ' m x ' + hM.toFixed(2) + ' m', pad + 10, tbY + 38);
            pdf.text('Tỷ lệ lưới: 1 ô = ' + (typeof metersPerGrid === 'number' ? metersPerGrid : 0.5) + ' m',
                pad + 10, tbY + 51);

            pdf.setFontSize(9);
            pdf.setTextColor(70);
            pdf.text('WebMapEditor — Bản vẽ mặt bằng', pageW / 2 + 10, tbY + 20);
            pdf.text('Ngày xuất: ' + dateStr, pageW / 2 + 10, tbY + 38);
            pdf.text('Đơn vị: mét (m)', pageW / 2 + 10, tbY + 51);

            pdf.save(String(mapName).replace(/\s+/g, '_') + '.pdf');
            toast('Đã xuất PDF: ' + mapName, 'success');
        } catch (err) {
            console.error('[PDF] export', err);
            toast('Lỗi xuất PDF: ' + (err && err.message || err), 'error');
        }
    }

    // ============================================================
    // 2) NHẬP PDF — trích nét vector → đoạn (lines)
    // ============================================================
    /** Lấy mảng các polyline (mảng điểm device px) từ operator list của 1 trang. */
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
            if (fn === OPS.save) {
                stack.push(ctm.slice());
            } else if (fn === OPS.restore) {
                if (stack.length) ctm = stack.pop();
            } else if (fn === OPS.transform) {
                ctm = Util.transform(ctm, args);
            } else if (fn === OPS.constructPath) {
                var ops = args[0];
                var coords = args[1];
                var ci = 0;
                var cur = null;        // điểm hiện tại (user space)
                var sub = null;        // polyline device đang dựng
                function flush() {
                    if (sub && sub.length >= 2) polylines.push(sub);
                    sub = null;
                }
                for (var k = 0; k < ops.length; k++) {
                    var op = ops[k];
                    if (op === OPS.moveTo) {
                        flush();
                        cur = { x: coords[ci++], y: coords[ci++] };
                        sub = [dev(cur.x, cur.y)];
                    } else if (op === OPS.lineTo) {
                        var nx = coords[ci++], ny = coords[ci++];
                        if (!sub) sub = [dev(cur ? cur.x : nx, cur ? cur.y : ny)];
                        cur = { x: nx, y: ny };
                        sub.push(dev(nx, ny));
                    } else if (op === OPS.curveTo) {
                        var c1 = { x: coords[ci++], y: coords[ci++] };
                        var c2 = { x: coords[ci++], y: coords[ci++] };
                        var p1 = { x: coords[ci++], y: coords[ci++] };
                        if (!sub) sub = [dev(cur ? cur.x : p1.x, cur ? cur.y : p1.y)];
                        // sample trong device space
                        var d0 = sub[sub.length - 1];
                        sampleBezier(d0, dev(c1.x, c1.y), dev(c2.x, c2.y), dev(p1.x, p1.y), sub, 8);
                        cur = p1;
                    } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
                        // xấp xỉ: nhảy tới điểm cuối (bỏ 2 số điều khiển đầu)
                        ci += 2;
                        var ex = coords[ci++], ey = coords[ci++];
                        var end = { x: ex, y: ey };
                        if (!sub) sub = [dev(cur ? cur.x : end.x, cur ? cur.y : end.y)];
                        sub.push(dev(end.x, end.y));
                        cur = end;
                    } else if (op === OPS.rectangle) {
                        var rx = coords[ci++], ry = coords[ci++], rw = coords[ci++], rh = coords[ci++];
                        polylines.push([
                            dev(rx, ry), dev(rx + rw, ry), dev(rx + rw, ry + rh),
                            dev(rx, ry + rh), dev(rx, ry)
                        ]);
                    } else if (op === OPS.closePath) {
                        if (sub && sub.length >= 2) {
                            sub.push({ x: sub[0].x, y: sub[0].y });
                        }
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
            // Bỏ polyline suy biến
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
                    var a = {
                        x: (pl[i].x - bbox.minX) * sc + OFFSET,
                        y: (pl[i].y - bbox.minY) * sc + OFFSET
                    };
                    var b = {
                        x: (pl[i + 1].x - bbox.minX) * sc + OFFSET,
                        y: (pl[i + 1].y - bbox.minY) * sc + OFFSET
                    };
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
    window.importPdfDrawing = importPdfDrawing;
})();
