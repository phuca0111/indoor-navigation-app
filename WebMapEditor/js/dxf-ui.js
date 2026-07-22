// ============================================================
// DXF-UI.JS — Nút Xuất/Nhập DXF, nối core/dxf-io.js với canvas hiện tại.
// ============================================================

function getDxfIO() {
    return (typeof EditorCore !== 'undefined' && EditorCore.DxfIO) ? EditorCore.DxfIO : null;
}

function exportMapToDxf() {
    var DX = getDxfIO();
    if (!DX) {
        if (typeof showToast === 'function') showToast('Chưa nạp module DXF', 'error');
        return;
    }
    var data = {
        walls: (typeof walls !== 'undefined') ? walls : [],
        lines: (typeof lines !== 'undefined') ? lines : [],
        rooms: (typeof rooms !== 'undefined') ? rooms : [],
        cadPoints: (typeof cadPoints !== 'undefined') ? cadPoints : []
    };
    var text = DX.exportDXF(data);
    var mapNameEl = document.getElementById('mapName');
    var mapName = (mapNameEl && mapNameEl.value) ? mapNameEl.value : 'ban_do';
    var blob = new Blob([text], { type: 'application/dxf' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = mapName.replace(/\s+/g, '_') + '.dxf';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (typeof showToast === 'function') showToast('Đã xuất DXF: ' + a.download, 'success');
}

function importDxfDrawing(file) {
    if (!file) return;
    var DX = getDxfIO();
    if (!DX) {
        if (typeof showToast === 'function') showToast('Chưa nạp module DXF', 'error');
        return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
        var parsed;
        try {
            parsed = DX.parseDXF(String(e.target.result || ''));
        } catch (err) {
            console.error('[DXF] parse lỗi:', err);
            if (typeof showToast === 'function') showToast('Không đọc được file DXF', 'error');
            return;
        }
        var nWall = 0, nLine = 0, nRoom = 0, nPoint = 0;
        if (typeof saveState === 'function') saveState();
        var activeLayer = (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default';

        (parsed.polylines || []).forEach(function (pl) {
            var layer = (pl.layer || '').toUpperCase();
            var pts = pl.points.map(function (p) { return { x: p.x, y: p.y }; });
            if (layer === 'WALLS') {
                walls.push({
                    id: (typeof nextWallId !== 'undefined') ? nextWallId++ : Date.now(),
                    type: 'segment', is_outer: false, thickness: 4,
                    lineStyle: 'solid', layerId: activeLayer, points: pts, closed: !!pl.closed
                });
                nWall++;
            } else if (layer === 'ROOMS' && pl.closed && pts.length >= 3 && typeof createPolygonRoom === 'function') {
                var room = createPolygonRoom(pts);
                if (room) { room.layerId = activeLayer; rooms.push(room); nRoom++; }
            } else {
                lines.push({
                    id: (typeof nextLineId !== 'undefined') ? nextLineId++ : Date.now(),
                    type: 'segment', color: '#3b82f6', lineWeight: 2,
                    lineStyle: 'solid', layerId: activeLayer, points: pts, closed: !!pl.closed
                });
                nLine++;
            }
        });

        (parsed.circles || []).forEach(function (c) {
            if (typeof createCircleRoom === 'function') {
                var room = createCircleRoom(c.cx, c.cy, c.radius);
                if (room) { room.layerId = activeLayer; rooms.push(room); nRoom++; }
            }
        });

        var ge = (typeof EditorCore !== 'undefined') && EditorCore.GeometryEngine;
        (parsed.arcs || []).forEach(function (arc) {
            if (!ge || !ge.arcToPolyline) return;
            var pts = ge.arcToPolyline(arc, 32);
            if (pts.length < 2) return;
            lines.push({
                id: (typeof nextLineId !== 'undefined') ? nextLineId++ : Date.now(),
                type: 'arc', color: '#3b82f6', lineWeight: 2, lineStyle: 'solid',
                layerId: activeLayer,
                arc: { cx: arc.cx, cy: arc.cy, radius: arc.radius },
                points: pts
            });
            nLine++;
        });

        (parsed.ellipses || []).forEach(function (ellipse) {
            if (!ge || !ge.ellipsePolyline) return;
            var pts = ge.ellipsePolyline(
                ellipse.cx, ellipse.cy, ellipse.rx, ellipse.ry, ellipse.rotation, 48
            );
            if (pts.length < 3) return;
            lines.push({
                id: (typeof nextLineId !== 'undefined') ? nextLineId++ : Date.now(),
                type: 'ellipse', color: '#3b82f6', lineWeight: 2, lineStyle: 'solid',
                layerId: activeLayer,
                ellipse: {
                    cx: ellipse.cx, cy: ellipse.cy, rx: ellipse.rx,
                    ry: ellipse.ry, rotation: ellipse.rotation
                },
                points: pts
            });
            nLine++;
        });

        (parsed.points || []).forEach(function (point) {
            if (typeof cadPoints === 'undefined') return;
            cadPoints.push({
                id: (typeof nextCadPointId !== 'undefined') ? nextCadPointId++ : Date.now(),
                x: point.x, y: point.y, layerId: activeLayer
            });
            nPoint++;
        });

        if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
        if (typeof updateObjectList === 'function') updateObjectList();
        if (typeof roomCountSpan !== 'undefined' && roomCountSpan) roomCountSpan.textContent = 'Phòng: ' + rooms.length;
        if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
        if (typeof draw === 'function') draw();

        var total = nWall + nLine + nRoom + nPoint;
        var diagnostics = parsed.diagnostics || {};
        var warningCount = (diagnostics.invalidEntities || 0) +
            (diagnostics.unsupportedEntities || []).length +
            (parsed.texts || []).length;
        var diagnosticSuffix = warningCount
            ? '; ' + warningCount + ' mục không ánh xạ được (xem diagnostics)'
            : '';
        if (total > 0) {
            if (typeof showToast === 'function') {
                showToast('Đã nhập DXF: ' + nWall + ' tường, ' + nLine + ' đoạn, ' +
                    nRoom + ' phòng, ' + nPoint + ' điểm' + diagnosticSuffix,
                    warningCount ? 'warning' : 'success');
            }
        } else if (typeof showToast === 'function') {
            showToast('File DXF không có entity hỗ trợ', 'error');
        }
    };
    reader.readAsText(file);
}

window.exportMapToDxf = exportMapToDxf;
window.importDxfDrawing = importDxfDrawing;
