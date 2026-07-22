function getSvgIO() {
    return (typeof EditorCore !== 'undefined' && EditorCore.SvgIO) ? EditorCore.SvgIO : null;
}

function exportMapToSvg() {
    var io = getSvgIO();
    if (!io) return;
    var text = io.exportSVG({
        walls: typeof walls !== 'undefined' ? walls : [],
        lines: typeof lines !== 'undefined' ? lines : [],
        rooms: typeof rooms !== 'undefined' ? rooms : [],
        cadPoints: typeof cadPoints !== 'undefined' ? cadPoints : []
    });
    var nameEl = document.getElementById('mapName');
    var name = nameEl && nameEl.value ? nameEl.value : 'ban_do';
    var url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name.replace(/\s+/g, '_') + '.svg';
    anchor.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (typeof showToast === 'function') showToast('Đã xuất SVG: ' + anchor.download, 'success');
}

function importSvgDrawing(file) {
    if (!file) return;
    var io = getSvgIO();
    if (!io) return;
    var reader = new FileReader();
    reader.onload = function (event) {
        var parsed = io.parseSVG(String(event.target.result || ''));
        var activeLayer = typeof legacyGetActiveLayerId === 'function' ? legacyGetActiveLayerId() : 'default';
        var made = 0;
        if (typeof saveState === 'function') saveState();
        (parsed.polylines || []).forEach(function (polyline) {
            var points = polyline.points.map(function (p) { return { x: p.x, y: p.y }; });
            if (polyline.kind === 'room' && polyline.closed && typeof createPolygonRoom === 'function') {
                var room = createPolygonRoom(points);
                if (room) { room.layerId = activeLayer; rooms.push(room); made++; }
            } else if (polyline.kind === 'wall') {
                walls.push({
                    id: typeof nextWallId !== 'undefined' ? nextWallId++ : Date.now(),
                    type: 'segment', is_outer: false, thickness: 4,
                    lineStyle: 'solid', layerId: activeLayer,
                    closed: !!polyline.closed, points: points
                });
                made++;
            } else {
                lines.push({
                    id: typeof nextLineId !== 'undefined' ? nextLineId++ : Date.now(),
                    type: 'segment', color: '#3b82f6', lineWeight: 2,
                    lineStyle: 'solid', layerId: activeLayer,
                    closed: !!polyline.closed, points: points
                });
                made++;
            }
        });
        (parsed.circles || []).forEach(function (circle) {
            if (typeof createCircleRoom !== 'function') return;
            var room = createCircleRoom(circle.cx, circle.cy, circle.radius);
            if (room) { room.layerId = activeLayer; rooms.push(room); made++; }
        });
        var ge = typeof EditorCore !== 'undefined' && EditorCore.GeometryEngine;
        (parsed.ellipses || []).forEach(function (ellipse) {
            if (!ge || !ge.ellipsePolyline) return;
            var points = ge.ellipsePolyline(
                ellipse.cx, ellipse.cy, ellipse.rx, ellipse.ry, ellipse.rotation || 0, 48
            );
            lines.push({
                id: typeof nextLineId !== 'undefined' ? nextLineId++ : Date.now(),
                type: 'ellipse', color: '#3b82f6', lineWeight: 2,
                lineStyle: 'solid', layerId: activeLayer, ellipse: ellipse, points: points
            });
            made++;
        });
        (parsed.points || []).forEach(function (point) {
            if (typeof cadPoints === 'undefined') return;
            cadPoints.push({
                id: typeof nextCadPointId !== 'undefined' ? nextCadPointId++ : Date.now(),
                x: point.x, y: point.y, layerId: activeLayer
            });
            made++;
        });
        if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
        if (typeof updateObjectList === 'function') updateObjectList();
        if (typeof flushAutosaveNow === 'function') flushAutosaveNow();
        if (typeof draw === 'function') draw();
        if (typeof showToast === 'function') {
            var diagnostics = parsed.diagnostics || {};
            var issueCount = (diagnostics.invalidElements || 0) +
                (diagnostics.unsupportedCommands || []).length;
            showToast(
                made
                    ? 'Đã nhập ' + made + ' đối tượng SVG' +
                        (issueCount ? '; ' + issueCount + ' cảnh báo tương thích' : '')
                    : 'SVG không có hình học hỗ trợ',
                made ? (issueCount ? 'warning' : 'success') : 'error'
            );
        }
    };
    reader.readAsText(file);
}

window.exportMapToSvg = exportMapToSvg;
window.importSvgDrawing = importSvgDrawing;
