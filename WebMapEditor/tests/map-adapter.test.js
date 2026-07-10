import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MapAdapter = require('../core/map-adapter.js');

describe('Map Adapter', function () {
    it('buildPublishPayload đủ schema keys Phần 17.1', function () {
        var payload = MapAdapter.buildPublishPayload({
            scaleRatio: 0.5,
            mapBearingOffset: 15,
            backgroundImage: 'data:image/png;base64,abc',
            rooms: [{ id: 1, name: 'A', shape: 'rect', x: 0, y: 0, width: 100, height: 80 }],
            doors: [],
            pois: [],
            pathNodes: [],
            pathEdges: [],
            walls: [{ id: 10, points: [{ x: 1.2, y: 2.7 }, { x: 50.4, y: 60.1 }] }],
            qrs: [{ id: 1, serial: 'QR1', x: 10, y: 20, node_id: 5 }]
        });
        MapAdapter.assertPublishSchema(payload);
        expect(payload.scale_ratio).toBe(0.5);
        expect(payload.map_bearing_offset).toBe(15);
        expect(payload.rooms).toHaveLength(1);
        expect(payload.walls[0].points[0]).toEqual({ x: 1, y: 3 });
        expect(payload.qr_anchors[0].qr_id).toBe('QR1');
        expect(payload.qr_anchors[0].node_id).toBe(5);
    });

    it('buildPublishPayload mặc định scale khi thiếu', function () {
        var payload = MapAdapter.buildPublishPayload({
            rooms: [], doors: [], pois: [], pathNodes: [], pathEdges: [], walls: [], qrs: []
        });
        expect(payload.scale_ratio).toBe(0.5);
        expect(payload.map_bearing_offset).toBe(0);
    });

    it('assertPublishSchema throw khi thiếu key', function () {
        expect(function () {
            MapAdapter.assertPublishSchema({ rooms: [] });
        }).toThrow(/thiếu key schema/);
    });

    it('PUBLISH_SCHEMA_KEYS khớp assert', function () {
        var payload = MapAdapter.buildPublishPayload({
            rooms: [], doors: [], pois: [], pathNodes: [], pathEdges: [], walls: [], qrs: []
        });
        MapAdapter.PUBLISH_SCHEMA_KEYS.forEach(function (k) {
            expect(k in payload).toBe(true);
        });
    });
});
