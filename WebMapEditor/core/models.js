// ============================================================
// MODELS.JS — Unified CAD Data Model (Phase 0 — §5.3)
// Factory + chuẩn hóa object trong Document.objects[]
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.Models = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var GEOMETRY_KINDS = ['point', 'line', 'polyline', 'circle', 'polygon', 'arc'];
    var NAV_ROLES = ['room', 'wall', 'door', 'poi', 'qr', 'node', 'edge', null];

    var _seq = 1;

    function nextId(prefix) {
        prefix = prefix || 'obj';
        return prefix + '_' + Date.now().toString(36) + '_' + (_seq++);
    }

    /**
     * @param {object} partial
     * @returns {object} CAD object chuẩn §5.3
     */
    function createCadObject(partial) {
        partial = partial || {};
        var now = new Date().toISOString();
        var type = partial.type || 'polyline';
        return {
            id: partial.id || nextId(type),
            type: type,
            layerId: partial.layerId || 'default',
            geometry: partial.geometry || { kind: type, points: [], closed: false },
            style: Object.assign({
                color: '#111827',
                lineWeight: 4,
                linetype: 'solid',
                fillColor: null,
                opacity: 1
            }, partial.style || {}),
            properties: Object.assign({
                name: '',
                roomType: null,
                navRole: null,
                blockRef: null,
                custom: {}
            }, partial.properties || {}),
            visible: partial.visible !== false,
            locked: !!partial.locked,
            version: partial.version || 1,
            createdAt: partial.createdAt || now,
            updatedAt: partial.updatedAt || now,
            data: partial.data
        };
    }

    /** Legacy wall segment → CAD object */
    function fromLegacyWall(wall) {
        if (!wall) return null;
        return createCadObject({
            id: 'wall-' + wall.id,
            type: 'polyline',
            layerId: wall.layerId || 'default',
            geometry: {
                kind: 'polyline',
                points: (wall.points || []).map(function (p) { return { x: p.x, y: p.y }; }),
                closed: false
            },
            style: { lineWeight: wall.thickness || 4 },
            properties: {
                name: wall.name || '',
                navRole: 'wall',
                custom: { is_outer: !!wall.is_outer }
            },
            data: wall
        });
    }

    function validateCadObject(obj) {
        if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not_object'] };
        var errors = [];
        if (!obj.id) errors.push('missing_id');
        if (!obj.type) errors.push('missing_type');
        if (!obj.geometry || !obj.geometry.kind) errors.push('missing_geometry');
        return { ok: errors.length === 0, errors: errors };
    }

    return {
        GEOMETRY_KINDS: GEOMETRY_KINDS,
        NAV_ROLES: NAV_ROLES,
        createCadObject: createCadObject,
        fromLegacyWall: fromLegacyWall,
        validateCadObject: validateCadObject,
        nextId: nextId
    };
});
