// ============================================================
// HATCH.JS — BHatch (H) phân loại phòng (Phase 3 Annotation)
// Spec: webedit_nangcap.md §3.5 — BHatch
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.Hatch = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var PATTERNS = ['none', 'solid', 'lines', 'cross', 'dots'];

    var DEFAULT_BY_TYPE = {
        'Nhà vệ sinh': { pattern: 'cross', color: '#7dd3fc', spacing: 10, angle: 45 },
        'Thang máy': { pattern: 'lines', color: '#fbbf24', spacing: 12, angle: 0 },
        'Cầu thang': { pattern: 'lines', color: '#fb923c', spacing: 10, angle: 45 },
        'Sảnh chờ': { pattern: 'dots', color: '#a78bfa', spacing: 14, angle: 0 },
        'Phòng kỹ thuật': { pattern: 'cross', color: '#94a3b8', spacing: 12, angle: 45 },
        'Văn phòng': { pattern: 'lines', color: '#60a5fa', spacing: 14, angle: 45 },
        'Phòng chức năng': { pattern: 'lines', color: '#34d399', spacing: 12, angle: 30 },
        'Khác': { pattern: 'lines', color: '#94a3b8', spacing: 12, angle: 45 }
    };

    function clamp(n, lo, hi) {
        n = Number(n);
        if (!Number.isFinite(n)) return lo;
        return Math.max(lo, Math.min(hi, n));
    }

    function normalize(style) {
        style = style || {};
        var pattern = String(style.pattern || 'lines').toLowerCase();
        if (PATTERNS.indexOf(pattern) < 0) pattern = 'lines';
        return {
            pattern: pattern,
            color: style.color || '#64748b',
            spacing: clamp(style.spacing != null ? style.spacing : 12, 4, 48),
            angle: clamp(style.angle != null ? style.angle : 45, 0, 179)
        };
    }

    function defaultForRoomType(type) {
        var base = DEFAULT_BY_TYPE[type] || DEFAULT_BY_TYPE['Khác'];
        return normalize(base);
    }

    function applyToRoom(room, style) {
        if (!room) return null;
        var h = normalize(style);
        if (h.pattern === 'none') {
            delete room.hatch;
            return null;
        }
        room.hatch = h;
        return h;
    }

    function clearFromRoom(room) {
        if (!room) return;
        delete room.hatch;
    }

    function hasHatch(room) {
        return !!(room && room.hatch && room.hatch.pattern && room.hatch.pattern !== 'none');
    }

    function roomBounds(room) {
        if (!room) return null;
        if (room.shape === 'circle' && room.radius > 0) {
            return {
                minX: room.cx - room.radius,
                minY: room.cy - room.radius,
                maxX: room.cx + room.radius,
                maxY: room.cy + room.radius
            };
        }
        if (room.shape === 'polygon' && room.points && room.points.length) {
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (var i = 0; i < room.points.length; i++) {
                var p = room.points[i];
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            }
            return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
        }
        return {
            minX: room.x || 0,
            minY: room.y || 0,
            maxX: (room.x || 0) + (room.width || 0),
            maxY: (room.y || 0) + (room.height || 0)
        };
    }

    function beginRoomClip(ctx, room) {
        ctx.beginPath();
        if (room.shape === 'circle') {
            ctx.arc(room.cx, room.cy, room.radius, 0, Math.PI * 2);
        } else if (room.shape === 'polygon' && room.points && room.points.length >= 3) {
            ctx.moveTo(room.points[0].x, room.points[0].y);
            for (var i = 1; i < room.points.length; i++) {
                ctx.lineTo(room.points[i].x, room.points[i].y);
            }
            ctx.closePath();
        } else {
            ctx.rect(room.x, room.y, room.width, room.height);
        }
        ctx.clip();
    }

    function drawLines(ctx, bounds, spacing, angleDeg, color, zoom) {
        var ang = (angleDeg || 0) * Math.PI / 180;
        var cos = Math.cos(ang);
        var sin = Math.sin(ang);
        var cx = (bounds.minX + bounds.maxX) / 2;
        var cy = (bounds.minY + bounds.maxY) / 2;
        var w = bounds.maxX - bounds.minX;
        var h = bounds.maxY - bounds.minY;
        var diag = Math.sqrt(w * w + h * h) + spacing * 2;
        var step = Math.max(4, spacing);

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.75 / (zoom || 1), 0.5);
        ctx.beginPath();
        for (var t = -diag; t <= diag; t += step) {
            var ox = -sin * t;
            var oy = cos * t;
            var x0 = cx + ox - cos * diag;
            var y0 = cy + oy - sin * diag;
            var x1 = cx + ox + cos * diag;
            var y1 = cy + oy + sin * diag;
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
        }
        ctx.stroke();
    }

    function drawDots(ctx, bounds, spacing, color, zoom) {
        var step = Math.max(6, spacing);
        var r = Math.max(1.2 / (zoom || 1), 1);
        ctx.fillStyle = color;
        for (var y = bounds.minY; y <= bounds.maxY; y += step) {
            for (var x = bounds.minX; x <= bounds.maxX; x += step) {
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /**
     * Vẽ hatch vào ctx (đã translate/scale world).
     */
    function draw(ctx, room, zoom) {
        if (!ctx || !hasHatch(room)) return;
        var h = normalize(room.hatch);
        var bounds = roomBounds(room);
        if (!bounds) return;

        ctx.save();
        beginRoomClip(ctx, room);

        if (h.pattern === 'solid') {
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = h.color;
            ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        } else if (h.pattern === 'lines') {
            ctx.globalAlpha = 0.85;
            drawLines(ctx, bounds, h.spacing, h.angle, h.color, zoom);
        } else if (h.pattern === 'cross') {
            ctx.globalAlpha = 0.85;
            drawLines(ctx, bounds, h.spacing, h.angle, h.color, zoom);
            drawLines(ctx, bounds, h.spacing, h.angle + 90, h.color, zoom);
        } else if (h.pattern === 'dots') {
            ctx.globalAlpha = 0.9;
            drawDots(ctx, bounds, h.spacing, h.color, zoom);
        }

        ctx.restore();
    }

    function cloneForPersist(hatch) {
        if (!hatch || hatch.pattern === 'none') return undefined;
        return normalize(hatch);
    }

    return {
        PATTERNS: PATTERNS,
        DEFAULT_BY_TYPE: DEFAULT_BY_TYPE,
        normalize: normalize,
        defaultForRoomType: defaultForRoomType,
        applyToRoom: applyToRoom,
        clearFromRoom: clearFromRoom,
        hasHatch: hasHatch,
        roomBounds: roomBounds,
        draw: draw,
        cloneForPersist: cloneForPersist
    };
});
