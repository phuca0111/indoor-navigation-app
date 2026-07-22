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

function has(list, code) {
    return list.some(function (x) { return x.code === code; });
}

describe('Validation Engine — rule mở rộng (Đợt)', function () {
    // ---- DOOR_OFF_WALL ----
    it('cửa xa mọi tường/cạnh phòng → DOOR_OFF_WALL warning', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            walls: [{ id: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }],
            doors: [{ id: 1, name: 'D', x: 50, y: 60 }]
        }));
        expect(has(r.warnings, 'DOOR_OFF_WALL')).toBe(true);
    });

    it('cửa nằm trên tường → không DOOR_OFF_WALL', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            walls: [{ id: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }],
            doors: [{ id: 1, name: 'D', x: 50, y: 2 }]
        }));
        expect(has(r.warnings, 'DOOR_OFF_WALL')).toBe(false);
    });

    it('cửa nằm trên cạnh phòng (không có tường) → không DOOR_OFF_WALL', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            rooms: [{ id: 1, name: 'P', shape: 'rect', x: 0, y: 0, width: 100, height: 50 }],
            doors: [{ id: 1, name: 'D', x: 50, y: 1 }]
        }));
        expect(has(r.warnings, 'DOOR_OFF_WALL')).toBe(false);
    });

    it('không có tường lẫn phòng → bỏ qua kiểm tra cửa', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            doors: [{ id: 1, name: 'D', x: 999, y: 999 }]
        }));
        expect(has(r.warnings, 'DOOR_OFF_WALL')).toBe(false);
    });

    // ---- WALL_OVERLAP ----
    it('2 đoạn tường trùng phủ cùng phương → WALL_OVERLAP warning', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            walls: [
                { id: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
                { id: 2, points: [{ x: 20, y: 0 }, { x: 60, y: 0 }] }
            ]
        }));
        expect(has(r.warnings, 'WALL_OVERLAP')).toBe(true);
    });

    it('2 tường song song cách nhau → không WALL_OVERLAP', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            walls: [
                { id: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
                { id: 2, points: [{ x: 0, y: 10 }, { x: 100, y: 10 }] }
            ]
        }));
        expect(has(r.warnings, 'WALL_OVERLAP')).toBe(false);
    });

    it('2 tường vuông góc (giao 1 điểm) → không WALL_OVERLAP', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            walls: [
                { id: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
                { id: 2, points: [{ x: 50, y: -50 }, { x: 50, y: 50 }] }
            ]
        }));
        expect(has(r.warnings, 'WALL_OVERLAP')).toBe(false);
    });

    it('tường chạm đầu-đuôi (không phủ) → không WALL_OVERLAP', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            walls: [
                { id: 1, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] },
                { id: 2, points: [{ x: 50, y: 0 }, { x: 100, y: 0 }] }
            ]
        }));
        expect(has(r.warnings, 'WALL_OVERLAP')).toBe(false);
    });

    // ---- Integrity: node references ----
    it('cạnh trỏ node không tồn tại → EDGE_DANGLING error', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            nodes: [{ id: 1, x: 0, y: 0, neighbors: [2] }, { id: 2, x: 10, y: 0, neighbors: [1] }],
            edges: [{ source: '1', target: '99', distance: 5 }]
        }));
        expect(r.ok).toBe(false);
        expect(has(r.errors, 'EDGE_DANGLING')).toBe(true);
    });

    it('neighbor trỏ node không tồn tại → NODE_NEIGHBOR_MISSING warning', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            nodes: [{ id: 1, x: 0, y: 0, neighbors: [2, 77] }, { id: 2, x: 10, y: 0, neighbors: [1] }],
            edges: [{ source: '1', target: '2', distance: 10 }]
        }));
        expect(has(r.warnings, 'NODE_NEIGHBOR_MISSING')).toBe(true);
    });

    it('QR gán node không tồn tại → QR_NODE_MISSING warning', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            nodes: [{ id: 1, x: 0, y: 0, neighbors: [] }],
            qr_anchors: [{ qr_id: 'Q1', x: 0, y: 0, node_id: 42 }]
        }));
        expect(has(r.warnings, 'QR_NODE_MISSING')).toBe(true);
        expect(has(r.warnings, 'QR_NO_NODE')).toBe(false); // có node_id nên không phải "chưa gán"
    });

    // ---- POI trong phòng đa giác / tròn (sửa false-positive) ----
    it('POI trong phòng đa giác → không POI_OUTSIDE_ROOM', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            rooms: [{ id: 1, name: 'Poly', shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }],
            pois: [{ id: 1, name: 'P', x: 50, y: 50 }]
        }));
        expect(has(r.warnings, 'POI_OUTSIDE_ROOM')).toBe(false);
    });

    it('POI trong phòng tròn → không POI_OUTSIDE_ROOM', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            rooms: [{ id: 1, name: 'Circle', shape: 'circle', cx: 50, cy: 50, radius: 40 }],
            pois: [{ id: 1, name: 'P', x: 55, y: 55 }]
        }));
        expect(has(r.warnings, 'POI_OUTSIDE_ROOM')).toBe(false);
    });

    it('POI ngoài mọi phòng → POI_OUTSIDE_ROOM warning', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            rooms: [{ id: 1, name: 'P', shape: 'rect', x: 0, y: 0, width: 10, height: 10 }],
            pois: [{ id: 1, name: 'P', x: 500, y: 500 }]
        }));
        expect(has(r.warnings, 'POI_OUTSIDE_ROOM')).toBe(true);
    });

    // ---- Regression: adjacency 2 chiều đúng (bug push(b) → push(a)) ----
    it('node nối nhau CHỈ qua edges (neighbors rỗng) → không cô lập, 1 mảnh', function () {
        var r = ValidationEngine.validateMapData(baseMap({
            nodes: [{ id: 1, x: 0, y: 0, neighbors: [] }, { id: 2, x: 10, y: 0, neighbors: [] }],
            edges: [{ source: '1', target: '2', distance: 10 }]
        }));
        expect(has(r.errors, 'NODE_ISOLATED')).toBe(false);
        expect(has(r.warnings, 'GRAPH_DISCONNECTED')).toBe(false);
    });
});
