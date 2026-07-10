import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ValidationEngine = require('../core/validation-engine.js');

function baseMap(overrides) {
    return Object.assign({
        scale_ratio: 0.5,
        map_bearing_offset: 0,
        background_image: '',
        rooms: [],
        doors: [],
        pois: [],
        nodes: [],
        edges: [],
        walls: [],
        qr_anchors: []
    }, overrides || {});
}

describe('Validation Engine', function () {
    it('map hợp lệ tối thiểu → ok', function () {
        var r = ValidationEngine.validateMapData(baseMap());
        expect(r.ok).toBe(true);
        expect(r.errors).toHaveLength(0);
    });

    it('scale_ratio <= 0 → SCALE_INVALID', function () {
        var r = ValidationEngine.validateMapData(baseMap({ scale_ratio: 0 }));
        expect(r.ok).toBe(false);
        expect(r.errors.some(function (e) { return e.code === 'SCALE_INVALID'; })).toBe(true);
    });

    it('trùng room id → DUPLICATE_ROOM_ID', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            rooms: [
                { id: 1, name: 'A', shape: 'rect', x: 0, y: 0, width: 10, height: 10 },
                { id: 1, name: 'B', shape: 'rect', x: 20, y: 0, width: 10, height: 10 }
            ]
        }));
        expect(r.ok).toBe(false);
        expect(r.errors.some(function (e) { return e.code === 'DUPLICATE_ROOM_ID'; })).toBe(true);
    });

    it('polygon room < 3 đỉnh → ROOM_NOT_CLOSED', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            rooms: [{ id: 2, name: 'Poly', shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }]
        }));
        expect(r.ok).toBe(false);
        expect(r.errors.some(function (e) { return e.code === 'ROOM_NOT_CLOSED'; })).toBe(true);
    });

    it('node cô lập → NODE_ISOLATED', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            nodes: [{ id: 1, x: 0, y: 0, neighbors: [] }, { id: 2, x: 100, y: 0, neighbors: [] }],
            edges: []
        }));
        expect(r.ok).toBe(false);
        expect(r.errors.some(function (e) { return e.code === 'NODE_ISOLATED'; })).toBe(true);
    });

    it('đồ thị rời → GRAPH_DISCONNECTED warning', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            nodes: [
                { id: 1, x: 0, y: 0, neighbors: [2] },
                { id: 2, x: 10, y: 0, neighbors: [1] },
                { id: 3, x: 100, y: 0, neighbors: [4] },
                { id: 4, x: 110, y: 0, neighbors: [3] }
            ],
            edges: [
                { source: '1', target: '2', distance: 10 },
                { source: '3', target: '4', distance: 10 }
            ]
        }));
        expect(r.ok).toBe(true);
        expect(r.warnings.some(function (w) { return w.code === 'GRAPH_DISCONNECTED'; })).toBe(true);
    });

    it('QR chưa gán node → QR_NO_NODE warning', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            qr_anchors: [{ qr_id: 'X1', x: 5, y: 5, node_id: null }]
        }));
        expect(r.warnings.some(function (w) { return w.code === 'QR_NO_NODE'; })).toBe(true);
    });
});
