// ============================================================
// PROPERTY-SCHEMAS.JS — Schema thuộc tính theo loại đối tượng (§5.11)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PropertySchemas = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var SCHEMAS = {
        room: {
            label: 'Phòng',
            fields: [
                { key: 'name', type: 'string', label: 'Tên' },
                { key: 'type', type: 'enum', label: 'Loại', options: [
                    'Văn phòng', 'Nhà vệ sinh', 'Thang máy', 'Cầu thang',
                    'Sảnh chờ', 'Phòng kỹ thuật', 'Phòng chức năng', 'Khác'
                ]},
                { key: 'color', type: 'color', label: 'Màu' },
                { key: 'shape', type: 'enum', label: 'Hình dạng', options: ['rect', 'polygon', 'circle'] },
                { key: 'x', type: 'number', label: 'Vị trí X' },
                { key: 'y', type: 'number', label: 'Vị trí Y' },
                { key: 'labelRotation', type: 'number', label: 'Xoay chữ', min: -180, max: 180 },
                { key: 'labelFontSize', type: 'number', label: 'Cỡ chữ', min: 8, max: 96 },
                { key: 'labelLineHeight', type: 'number', label: 'Giãn dòng', min: 1, max: 2.5 },
                { key: 'labelAutoScale', type: 'boolean', label: 'Tự co giãn' }
            ]
        },
        wall: {
            label: 'Tường',
            fields: [
                { key: 'name', type: 'string', label: 'Tên' },
                { key: 'thickness', type: 'number', label: 'Độ dày', min: 1, max: 50 },
                { key: 'is_outer', type: 'boolean', label: 'Tường ngoài' }
            ]
        },
        door: {
            label: 'Cửa',
            fields: [
                { key: 'name', type: 'string', label: 'Tên' },
                {
                    key: 'width',
                    type: 'number',
                    label: 'Chiều dài',
                    unit: 'm',
                    valueIn: 'px',
                    min: 0.1,
                    step: 0.1
                }
            ]
        },
        poi: {
            label: 'POI',
            fields: [
                { key: 'name', type: 'string', label: 'Tên' },
                { key: 'category', type: 'string', label: 'Loại' }
            ]
        },
        node: {
            label: 'Node',
            fields: [
                { key: 'name', type: 'string', label: 'Tên' },
                { key: 'radius', type: 'number', label: 'Bán kính', min: 4 }
            ]
        },
        line: {
            label: 'Đoạn thẳng',
            fields: [
                { key: 'color', type: 'color', label: 'Màu' },
                { key: 'lineWeight', type: 'number', label: 'Độ dày', min: 1, max: 8 }
            ]
        },
        qr: {
            label: 'Mốc QR',
            fields: [
                { key: 'name', type: 'string', label: 'Tên' },
                { key: 'serial', type: 'string', label: 'Mã serial' }
            ]
        },
        cad: {
            label: 'CAD Object',
            fields: [
                { key: 'properties.name', type: 'string', label: 'Tên' },
                { key: 'style.color', type: 'color', label: 'Màu' },
                { key: 'properties.navRole', type: 'enum', label: 'Vai trò nav',
                    options: ['room', 'wall', 'door', 'poi', 'qr', 'node', 'edge', null] }
            ]
        }
    };

    function getSchema(type) {
        return SCHEMAS[type] || SCHEMAS.cad;
    }

    function listTypes() {
        return Object.keys(SCHEMAS);
    }

    function getValueByPath(obj, path) {
        if (!obj || !path) return undefined;
        var parts = path.split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null) return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }

    function setValueByPath(obj, path, value) {
        if (!obj || !path) return obj;
        var parts = path.split('.');
        var cur = obj;
        for (var i = 0; i < parts.length - 1; i++) {
            if (cur[parts[i]] == null) cur[parts[i]] = {};
            cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = value;
        return obj;
    }

    return {
        SCHEMAS: SCHEMAS,
        getSchema: getSchema,
        listTypes: listTypes,
        getValueByPath: getValueByPath,
        setValueByPath: setValueByPath
    };
});
