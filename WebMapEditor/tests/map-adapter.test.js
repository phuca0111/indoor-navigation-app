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
            bgX: 12,
            bgY: 24,
            bgScale: 1,
            bgScaleX: 2,
            bgScaleY: 0.75,
            bgRotation: 10,
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
        expect(payload).toMatchObject({
            bgX: 12, bgY: 24, bgScaleX: 2, bgScaleY: 0.75, bgRotation: 10
        });
        expect(payload.rooms).toHaveLength(1);
        expect(payload.walls[0].points[0]).toEqual({ x: 1, y: 3 });
        expect(payload.qr_anchors[0].qr_id).toBe('QR1');
        expect(payload.qr_anchors[0].node_id).toBe(5);
        expect(MapAdapter.toNavigationPayload(payload)).toMatchObject({
            bgScaleX: 2, bgScaleY: 0.75
        });
    });

    it('buildPublishPayload mặc định scale khi thiếu', function () {
        var payload = MapAdapter.buildPublishPayload({
            rooms: [], doors: [], pois: [], pathNodes: [], pathEdges: [], walls: [], qrs: []
        });
        expect(payload.scale_ratio).toBe(0.5);
        expect(payload.map_bearing_offset).toBe(0);
    });

    it('giữ loại chuẩn và giới hạn kích thước POI khi publish', function () {
        var payload = MapAdapter.buildPublishPayload({
            rooms: [], doors: [], pathNodes: [], pathEdges: [], walls: [], qrs: [],
            pois: [
                { id: 1, name: 'Y tế', x: 10, y: 20, type: 'Phòng y tế', poiType: 'MEDICAL', typeIndex: 11, size: 64 },
                { id: 2, name: 'Cũ', x: 30, y: 40, typeIndex: 0 }
            ]
        });
        expect(payload.pois[0]).toMatchObject({ poiType: 'MEDICAL', typeIndex: 11, size: 64 });
        expect(payload.pois[1].size).toBe(24);
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

    it('editor extras round-trip nhưng navigation payload loại sạch', function () {
        var payload = MapAdapter.buildPublishPayload({
            rooms: [], doors: [], pois: [], pathNodes: [], pathEdges: [], walls: [], qrs: [],
            blocks: [{ id: 'b1' }],
            blockInserts: [{ id: 1 }],
            lines: [{ id: 2 }],
            dimensions: [{ id: 3 }],
            cadPoints: [{ id: 4, x: 1, y: 2 }],
            advancedFeatures: { constraints: [{ id: 'c1' }] }
        });
        var extras = MapAdapter.extractEditorExtras(payload);
        expect(extras.cadPoints).toHaveLength(1);
        expect(extras.advancedFeatures.constraints).toHaveLength(1);
        var navigation = MapAdapter.toNavigationPayload(payload);
        MapAdapter.EDITOR_ONLY_KEYS.forEach(function (key) {
            expect(navigation[key]).toBeUndefined();
        });
    });
});
