import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    buildPublishPayload,
    buildPublishPayloadFromDocument,
    assertPublishSchema,
    PUBLISH_SCHEMA_KEYS
} = require('../core/map-adapter.js');

describe('Map Adapter — schema Phần 17.1', function () {
    it('export đủ key bắt buộc', function () {
        const payload = buildPublishPayload({
            scaleRatio: 0.5,
            mapBearingOffset: 15,
            backgroundImage: 'data:image/png;base64,abc',
            rooms: [],
            doors: [],
            pois: [],
            pathNodes: [],
            pathEdges: [],
            walls: [],
            qrs: []
        });
        expect(assertPublishSchema(payload)).toBe(true);
        PUBLISH_SCHEMA_KEYS.forEach(function (key) {
            expect(payload).toHaveProperty(key);
        });
    });

    it('transform room / node / edge / qr đúng format Backend', function () {
        const payload = buildPublishPayload({
            scaleRatio: 0.5,
            mapBearingOffset: 0,
            backgroundImage: '',
            rooms: [{
                id: 1, name: 'A101', shape: 'rect', color: '#ccc',
                x: 10.4, y: 20.6, width: 100.2, height: 80.7, points: []
            }],
            doors: [{ id: 1, name: 'Cửa', x: 5, y: 5, width: 40, type: 'Đơn', rotation: 90 }],
            pois: [{ id: 1, name: 'WC', x: 1, y: 2, type: 'WC', typeIndex: 0 }],
            pathNodes: [{ id: 10, x: 100, y: 200, neighbors: [11], nodeType: 'elevator' }],
            pathEdges: [{ from: 10, to: 11, distance: 5.5 }],
            walls: [{ id: 1, type: 'segment', thickness: 4, is_outer: true, points: [{ x: 0, y: 0 }] }],
            qrs: [{ id: 3, serial: 'QR-001', name: 'Lobby', x: 50, y: 60, node_id: 10 }]
        });

        expect(payload.scale_ratio).toBe(0.5);
        expect(payload.map_bearing_offset).toBe(0);
        expect(payload.rooms[0].x).toBe(10);
        expect(payload.rooms[0].y).toBe(21);
        expect(payload.nodes[0].is_elevator).toBe(true);
        expect(payload.nodes[0].is_stairs).toBe(false);
        expect(payload.edges[0]).toEqual({ source: '10', target: '11', distance: 5.5 });
        expect(payload.qr_anchors[0]).toEqual({
            qr_id: 'QR-001',
            x: 50,
            y: 60,
            room_name: 'Lobby',
            node_id: 10
        });
    });

    it('Document → publish payload qua buildPublishPayloadFromDocument', function () {
        const { Document } = require('../core/document.js');
        const doc = new Document();
        doc.fromLegacyState({
            mapName: 'Test',
            scaleRatio: 0.25,
            mapBearingOffset: 90,
            backgroundImage: '',
            rooms: [{ id: 1, name: 'R1', x: 0, y: 0, width: 10, height: 10 }],
            doors: [],
            pois: [],
            pathNodes: [],
            pathEdges: [],
            walls: [],
            qrs: []
        });

        const payload = buildPublishPayloadFromDocument(doc);
        expect(payload.scale_ratio).toBe(0.25);
        expect(payload.map_bearing_offset).toBe(90);
        expect(payload.rooms).toHaveLength(1);
        expect(doc.getObjectCount()).toBe(1);
    });

    it('scale_ratio mặc định 0.5 khi invalid', function () {
        const payload = buildPublishPayload({
            scaleRatio: -1,
            rooms: [], doors: [], pois: [],
            pathNodes: [], pathEdges: [], walls: [], qrs: []
        });
        expect(payload.scale_ratio).toBe(0.5);
    });
});
