// ============================================================
// TOOLS-BOOTSTRAP.JS — Đăng ký tool; Polyline = engine cho Wall
// ============================================================
(function (root) {
    'use strict';

    if (!root.EditorCore || !root.EditorCore.ToolRegistry) return;

    var R = root.EditorCore.ToolRegistry;

    R.clear();

    var defs = [
        { id: 'select', name: 'Chọn', shortcut: 'v', category: 'modify', cursor: 'default' },
        { id: 'room', name: 'Phòng', shortcut: 'r', category: 'draw' },
        { id: 'circle', name: 'Tròn', shortcut: 'c', category: 'draw' },
        { id: 'polygon', name: 'Đa giác', shortcut: 'g', category: 'draw' },
        { id: 'door', name: 'Cửa', shortcut: 'd', category: 'draw' },
        { id: 'wall', name: 'Tường', shortcut: 'w', category: 'draw' },
        { id: 'poi', name: 'POI', shortcut: 'p', category: 'nav' },
        { id: 'qr', name: 'QR Code', shortcut: 'q', category: 'nav' },
        { id: 'path', name: 'Đường đi', shortcut: 'n', category: 'nav' },
        { id: 'ruler', name: 'Dist', shortcut: 'di', category: 'annotate', buttonId: 'btn-dist' },
        { id: 'area', name: 'Area', shortcut: 'aa', category: 'annotate', buttonId: 'btn-area' },
        { id: 'hatch', name: 'Hatch', shortcut: 'h', category: 'annotate', buttonId: 'btn-hatch' },
        // Phase 2 Editing
        { id: 'move', name: 'Di chuyển', shortcut: 'm', category: 'modify', buttonId: 'btn-move' },
        { id: 'copy', name: 'Sao chép', shortcut: 'co', category: 'modify', buttonId: 'btn-copy' },
        { id: 'rotate', name: 'Xoay', shortcut: 'ro', category: 'modify', buttonId: 'btn-rotate' },
        { id: 'scale', name: 'Tỷ lệ', shortcut: 'sc', category: 'modify', buttonId: 'btn-scale' },
        { id: 'mirror', name: 'Lật gương', shortcut: 'mi', category: 'modify', buttonId: 'btn-mirror' },
        { id: 'trim', name: 'Cắt xén', shortcut: 'tr', category: 'modify', buttonId: 'btn-trim' },
        { id: 'extend', name: 'Kéo dài', shortcut: 'ex', category: 'modify', buttonId: 'btn-extend' },
        { id: 'pedit', name: 'Sửa polyline', shortcut: 'pe', category: 'modify', buttonId: 'btn-pedit' },
        { id: 'mline', name: 'Tường dày', shortcut: 'ml', category: 'draw', buttonId: 'btn-mline' },
        { id: 'array', name: 'Hàng loạt', shortcut: 'ar', category: 'modify', buttonId: 'btn-array' },
        { id: 'matchprop', name: 'Sao thuộc tính', shortcut: 'ma', category: 'modify', buttonId: 'btn-matchprop' },
        { id: 'block', name: 'Block', shortcut: 'b', category: 'block', buttonId: 'btn-block' },
        { id: 'insert', name: 'Insert', shortcut: 'i', category: 'block', buttonId: 'btn-insert' },
        { id: 'dimlinear', name: 'Dimlinear', shortcut: 'dli', category: 'annotate', buttonId: 'btn-dimlinear' },
        { id: 'dimaligned', name: 'Dimaligned', shortcut: 'dal', category: 'annotate', buttonId: 'btn-dimaligned' },
        { id: 'dimedit', name: 'DIMEdit', shortcut: 'ded', category: 'annotate', buttonId: 'btn-dimedit' }
    ];

    defs.forEach(function (d) {
        R.registerTool(d);
    });

    // LineTool (LN) — skeleton: 2 click → 1 đoạn rồi về idle (chưa gắn UI)
    if (root.EditorCore.LineTool) {
        R.registerTool(root.EditorCore.LineTool.toToolDefinition());
    }

    // Alias: Polyline (PL) → cùng Wall; engine PolylineTool chạy khi chọn wall
    if (root.EditorCore.PolylineTool) {
        var pl = root.EditorCore.PolylineTool.toToolDefinition();
        R.registerTool({
            id: 'polyline',
            name: 'Tường (Polyline engine)',
            shortcut: 'pl',
            category: 'draw',
            icon: 'wall',
            buttonId: 'btn-wall',
            cursor: 'crosshair',
            onActivate: function (ctx) {
                if (typeof selectTool === 'function') selectTool('wall');
                else if (pl.onActivate) pl.onActivate(ctx);
            },
            onDeactivate: pl.onDeactivate,
            onPointerDown: pl.onPointerDown,
            onPointerMove: pl.onPointerMove,
            onPointerUp: pl.onPointerUp,
            onKeyDown: pl.onKeyDown
        });
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
