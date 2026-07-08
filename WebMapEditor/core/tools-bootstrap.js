// ============================================================
// TOOLS-BOOTSTRAP.JS — Đăng ký tool hiện có vào Tool Registry
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
})(typeof globalThis !== 'undefined' ? globalThis : this);
