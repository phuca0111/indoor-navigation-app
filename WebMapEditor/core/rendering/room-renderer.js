// ============================================================
// ROOM-RENDERER.JS — Vẽ phòng rect / circle / polygon (Phase 0)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.RoomRenderer = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function splitLabelLines(text) {
        return String(text || '').replace(/\r\n/g, '\n').split('\n');
    }

    function wrapSingleLine(ctx, line, maxWidth) {
        if (!line) return [''];
        var words = line.trim().split(/\s+/);
        if (!words.length) return [''];

        var wrapped = [];
        var current = '';
        for (var i = 0; i < words.length; i++) {
            var test = current ? (current + ' ' + words[i]) : words[i];
            if (ctx.measureText(test).width <= maxWidth) {
                current = test;
                continue;
            }
            if (current) {
                wrapped.push(current);
                current = '';
            }
            if (ctx.measureText(words[i]).width <= maxWidth) {
                current = words[i];
                continue;
            }
            var chunk = '';
            for (var c = 0; c < words[i].length; c++) {
                var charTest = chunk + words[i][c];
                if (ctx.measureText(charTest).width <= maxWidth) {
                    chunk = charTest;
                } else {
                    if (chunk) wrapped.push(chunk);
                    chunk = words[i][c];
                }
            }
            current = chunk;
        }
        if (current) wrapped.push(current);
        return wrapped.length ? wrapped : [''];
    }

    function wrapRoomLabelText(ctx, text, maxWidth) {
        var explicitLines = splitLabelLines(text);
        var finalLines = [];
        explicitLines.forEach(function (line) {
            wrapSingleLine(ctx, line, maxWidth).forEach(function (w) { finalLines.push(w); });
        });
        return finalLines.length ? finalLines : [''];
    }

    function calcLabelAutoScale(ctx, lines, fontSize, lineHeight, maxWidth, maxHeight) {
        var widest = 0;
        lines.forEach(function (line) {
            widest = Math.max(widest, ctx.measureText(line).width);
        });
        var totalHeight = lines.length * fontSize * lineHeight;
        var widthScale = widest > 0 ? (maxWidth / widest) : 1;
        var heightScale = totalHeight > 0 ? (maxHeight / totalHeight) : 1;
        return Math.max(0.35, Math.min(3, Math.min(widthScale, heightScale)));
    }

    function drawRoomLabel(ctx, viewport, room, centerX, centerY, maxWidth, maxHeight) {
        var zoom = viewport.zoom || 1;
        var text = String(room.name || '');
        if (!text.trim()) return;

        var padding = 12 / zoom;
        var safeWidth = Math.max(20 / zoom, maxWidth - padding * 2);
        var safeHeight = Math.max(20 / zoom, maxHeight - padding * 2);
        var baseFont = Math.max(8 / zoom, (room.labelFontSize || 14) / zoom);
        var lineHeight = Math.max(1, room.labelLineHeight || 1.2);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((room.labelRotation || 0) * Math.PI / 180);
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var fontSize = baseFont;
        ctx.font = fontSize + 'px Segoe UI';
        var lines = wrapRoomLabelText(ctx, text, safeWidth);

        if (room.labelAutoScale) {
            var autoScale = calcLabelAutoScale(ctx, lines, fontSize, lineHeight, safeWidth, safeHeight);
            fontSize = fontSize * autoScale;
            ctx.font = fontSize + 'px Segoe UI';
            lines = wrapRoomLabelText(ctx, text, safeWidth);
            var secondPass = calcLabelAutoScale(ctx, lines, fontSize, lineHeight, safeWidth, safeHeight);
            if (secondPass < 1) {
                fontSize = fontSize * secondPass;
                ctx.font = fontSize + 'px Segoe UI';
                lines = wrapRoomLabelText(ctx, text, safeWidth);
            }
        }

        var totalHeight = lines.length * fontSize * lineHeight;
        for (var i = 0; i < lines.length; i++) {
            var y = -totalHeight / 2 + (i + 0.5) * fontSize * lineHeight;
            ctx.fillText(lines[i], 0, y);
        }
        ctx.restore();
    }

    function renderRectRoom(ctx, viewport, room, isSelected, hooks) {
        var zoom = viewport.zoom || 1;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = room.color;
        ctx.fillRect(room.x, room.y, room.width, room.height);
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = isSelected ? '#3498db' : '#555';
        ctx.lineWidth = isSelected ? 2.5 / zoom : 1.5 / zoom;
        ctx.strokeRect(room.x, room.y, room.width, room.height);
        drawRoomLabel(ctx, viewport, room, room.x + room.width / 2, room.y + room.height / 2, room.width, room.height);
        if (hooks.isDimVisible && hooks.isDimVisible() && hooks.drawDimensions) {
            hooks.drawDimensions(room);
        }
        if (isSelected && hooks.drawResizeHandles) hooks.drawResizeHandles(room);
    }

    function renderCircleRoom(ctx, viewport, room, isSelected, hooks) {
        var zoom = viewport.zoom || 1;
        ctx.beginPath();
        ctx.arc(room.cx, room.cy, room.radius, 0, Math.PI * 2);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = room.color;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = isSelected ? '#3498db' : '#555';
        ctx.lineWidth = isSelected ? 2.5 / zoom : 1.5 / zoom;
        ctx.stroke();

        var diameterInSquare = room.radius * Math.sqrt(2);
        drawRoomLabel(ctx, viewport, room, room.cx, room.cy, diameterInSquare, diameterInSquare);

        if (hooks.isDimVisible && hooks.isDimVisible() && hooks.pixelsToMeters) {
            var dimFontSize = Math.max(8, 10 / zoom);
            ctx.fillStyle = '#e74c3c';
            ctx.font = 'bold ' + dimFontSize + 'px Consolas';
            ctx.textBaseline = 'top';
            ctx.fillText('r=' + hooks.pixelsToMeters(room.radius).toFixed(1) + 'm', room.cx, room.cy + room.radius + 3 / zoom);
        }
        if (isSelected && hooks.drawResizeHandles) hooks.drawResizeHandles(room);
    }

    function renderPolygonRoom(ctx, viewport, room, isSelected) {
        var zoom = viewport.zoom || 1;
        var pts = room.points || room.vertices;
        if (!pts || pts.length < 3) return;

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = room.color;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = isSelected ? '#3498db' : '#555';
        ctx.lineWidth = isSelected ? 2.5 / zoom : 1.5 / zoom;
        ctx.stroke();

        var cx = room.x + room.width / 2;
        var cy = room.y + room.height / 2;
        drawRoomLabel(ctx, viewport, room, cx, cy, room.width, room.height);

        if (isSelected && room.points) {
            var size = 5 / zoom;
            for (var v = 0; v < room.points.length; v++) {
                ctx.fillStyle = '#3498db';
                ctx.fillRect(room.points[v].x - size / 2, room.points[v].y - size / 2, size, size);
            }
        }
    }

    function renderRoom(ctx, viewport, room, isSelected, hooks) {
        hooks = hooks || {};
        if (!room) return;
        if (hooks.applyDefaultRoomLabelStyle) hooks.applyDefaultRoomLabelStyle(room);
        if (room.shape === 'circle') {
            renderCircleRoom(ctx, viewport, room, isSelected, hooks);
        } else if (room.shape === 'polygon') {
            renderPolygonRoom(ctx, viewport, room, isSelected);
        } else {
            renderRectRoom(ctx, viewport, room, isSelected, hooks);
        }
    }

    return {
        renderRoom: renderRoom,
        drawRoomLabel: drawRoomLabel
    };
});
