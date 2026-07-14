// ============================================================
// MAP-ADAPTER.JS — Document/Legacy → map_data JSON (Phần 17.1)
// Hợp đồng Backend: không thêm field mới ngoài spec đã thống nhất
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        Object.assign(root.EditorCore, factory());
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function roundCoord(n) {
        return Math.round(n || 0);
    }

    function mapRooms(rooms) {
        return (rooms || []).filter(function (r) { return typeof r === 'object'; }).map(function (r) {
            return {
                id: r.id,
                name: r.name || 'Phòng mới',
                shape: r.shape || 'rect',
                color: r.color || '#ccc',
                labelRotation: Number.isFinite(r.labelRotation) ? r.labelRotation : 0,
                labelFontSize: Number.isFinite(r.labelFontSize) ? r.labelFontSize : 14,
                labelAutoScale: typeof r.labelAutoScale === 'boolean' ? r.labelAutoScale : true,
                labelLineHeight: Number.isFinite(r.labelLineHeight) ? r.labelLineHeight : 1.2,
                x: roundCoord(r.x),
                y: roundCoord(r.y),
                width: roundCoord(r.width),
                height: roundCoord(r.height),
                points: Array.isArray(r.points)
                    ? r.points.map(function (p) { return { x: roundCoord(p.x), y: roundCoord(p.y) }; })
                    : [],
                cx: r.cx ? roundCoord(r.cx) : undefined,
                cy: r.cy ? roundCoord(r.cy) : undefined,
                radius: r.radius ? roundCoord(r.radius) : undefined
            };
        });
    }

    function mapDoors(doors) {
        return (doors || []).filter(function (d) { return typeof d === 'object'; }).map(function (d) {
            return {
                id: d.id,
                name: d.name || 'Cửa',
                x: roundCoord(d.x),
                y: roundCoord(d.y),
                width: d.width || 40,
                type: d.type || 'Đơn',
                rotation: d.rotation || 0
            };
        });
    }

    function mapPois(pois) {
        return (pois || []).filter(function (p) { return typeof p === 'object'; }).map(function (p) {
            return {
                id: p.id,
                name: p.name || 'P.O.I',
                x: roundCoord(p.x),
                y: roundCoord(p.y),
                type: p.type || 'Điểm mốc',
                typeIndex: p.typeIndex || 0
            };
        });
    }

    function mapNodes(pathNodes) {
        return (pathNodes || []).filter(function (n) { return typeof n === 'object'; }).map(function (n) {
            return {
                id: n.id,
                x: roundCoord(n.x),
                y: roundCoord(n.y),
                neighbors: Array.isArray(n.neighbors) ? n.neighbors : [],
                is_elevator: n.nodeType === 'elevator',
                is_stairs: n.nodeType === 'stairs'
            };
        });
    }

    function mapEdges(pathEdges) {
        return (pathEdges || []).filter(function (e) { return typeof e === 'object'; }).map(function (e) {
            return {
                source: String(e.from),
                target: String(e.to),
                distance: e.distance || 0
            };
        });
    }

    function mapWalls(walls) {
        return (walls || []).filter(function (w) { return typeof w === 'object'; }).map(function (w) {
            return {
                id: w.id,
                type: w.type || 'segment',
                thickness: w.thickness || 4,
                is_outer: !!w.is_outer,
                points: Array.isArray(w.points)
                    ? w.points.map(function (p) { return { x: roundCoord(p.x), y: roundCoord(p.y) }; })
                    : []
            };
        });
    }

    function mapQrAnchors(qrs) {
        return (qrs || []).filter(function (q) { return typeof q === 'object'; }).map(function (q) {
            return {
                qr_id: q.serial || String(q.id),
                x: roundCoord(q.x),
                y: roundCoord(q.y),
                room_name: q.name || 'Vị trí QR',
                node_id: q.node_id != null ? q.node_id : null
            };
        });
    }

    /**
     * @param {object} source — legacy state hoặc { metadata, collections }
     * @returns {object} map_data theo Phần 17.1
     */
    function buildPublishPayload(source) {
        var meta = source.metadata || source;
        var collections = source.collections || source;

        var scaleRatio = meta.scaleRatio != null ? meta.scaleRatio : meta.scale_ratio;
        if (!Number.isFinite(scaleRatio) || scaleRatio <= 0) scaleRatio = 0.5;

        var bearing = meta.mapBearingOffset != null ? meta.mapBearingOffset : meta.map_bearing_offset;
        if (!Number.isFinite(bearing)) bearing = 0;

        var bg = meta.backgroundImage != null ? meta.backgroundImage : meta.background_image;
        if (bg == null) bg = '';

        return {
            scale_ratio: scaleRatio,
            map_bearing_offset: bearing,
            background_image: bg || '',
            rooms: mapRooms(collections.rooms),
            doors: mapDoors(collections.doors),
            pois: mapPois(collections.pois),
            nodes: mapNodes(collections.pathNodes || collections.nodes),
            edges: mapEdges(collections.pathEdges || collections.edges),
            walls: mapWalls(collections.walls),
            qr_anchors: mapQrAnchors(collections.qrs || collections.qr_anchors),
            // Editor-only CAD (Android bỏ qua) — round-trip WebMapEditor
            blocks: Array.isArray(collections.blocks) ? collections.blocks : [],
            blockInserts: Array.isArray(collections.blockInserts) ? collections.blockInserts : [],
            lines: Array.isArray(collections.lines) ? collections.lines : [],
            dimensions: Array.isArray(collections.dimensions) ? collections.dimensions : []
        };
    }

    /**
     * @param {import('./document.js')} document — EditorCore Document instance
     */
    function buildPublishPayloadFromDocument(document) {
        if (!document) throw new Error('Document required');
        var collections = document.toLegacyCollections();
        return buildPublishPayload({
            metadata: {
                scaleRatio: document.metadata.scaleRatio,
                mapBearingOffset: document.metadata.mapBearingOffset,
                backgroundImage: document.metadata.backgroundImage
            },
            collections: collections
        });
    }

    /** Schema keys bắt buộc (Phần 17.1) */
    var PUBLISH_SCHEMA_KEYS = [
        'scale_ratio', 'map_bearing_offset', 'background_image',
        'rooms', 'doors', 'pois', 'nodes', 'edges', 'walls', 'qr_anchors'
    ];

    function assertPublishSchema(mapData) {
        var missing = PUBLISH_SCHEMA_KEYS.filter(function (k) { return !(k in mapData); });
        if (missing.length) {
            throw new Error('Map Adapter: thiếu key schema: ' + missing.join(', '));
        }
        return true;
    }

    return {
        buildPublishPayload: buildPublishPayload,
        buildPublishPayloadFromDocument: buildPublishPayloadFromDocument,
        assertPublishSchema: assertPublishSchema,
        PUBLISH_SCHEMA_KEYS: PUBLISH_SCHEMA_KEYS
    };
});
