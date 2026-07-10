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
        { id: 'ruler', name: 'Thước đo', shortcut: 's', category: 'annotate', buttonId: null }
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
