import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ValidationConfig = require('../core/validation-config.js');
const { validateMapData } = require('../core/validation-engine.js');

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
    }, overrides);
}

describe('Validation Engine — pre-publish', function () {
    beforeEach(function () {
        ValidationConfig.reset();
    });

    it('pass map hợp lệ tối thiểu', function () {
        var result = validateMapData(baseMap({
            nodes: [
                { id: 1, x: 0, y: 0, neighbors: [2] },
                { id: 2, x: 10, y: 0, neighbors: [1] }
            ],
            edges: [{ source: '1', target: '2', distance: 10 }]
        }));
        expect(result.ok).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('block scale_ratio invalid', function () {
        var result = validateMapData(baseMap({ scale_ratio: 0 }));
        expect(result.ok).toBe(false);
        expect(result.errors.some(function (e) { return e.code === 'SCALE_INVALID'; })).toBe(true);
    });

    it('block duplicate node id', function () {
        var result = validateMapData(baseMap({
            nodes: [
                { id: 1, x: 0, y: 0, neighbors: [] },
                { id: 1, x: 5, y: 5, neighbors: [] }
            ]
        }));
        expect(result.ok).toBe(false);
        expect(result.errors.some(function (e) { return e.code === 'DUPLICATE_NODE_ID'; })).toBe(true);
    });

    it('block node cô lập khi có >1 node', function () {
        var result = validateMapData(baseMap({
            nodes: [
                { id: 1, x: 0, y: 0, neighbors: [2] },
                { id: 2, x: 10, y: 0, neighbors: [1] },
                { id: 3, x: 50, y: 50, neighbors: [] }
            ],
            edges: [{ source: '1', target: '2', distance: 10 }]
        }));
        expect(result.ok).toBe(false);
        expect(result.errors.some(function (e) { return e.code === 'NODE_ISOLATED'; })).toBe(true);
    });

    it('block node cô lập duy nhất trên map (V2 smoke)', function () {
        var result = validateMapData(baseMap({
            nodes: [{ id: 1, x: 0, y: 0, neighbors: [] }],
            edges: []
        }));
        expect(result.ok).toBe(false);
        expect(result.errors.some(function (e) { return e.code === 'NODE_ISOLATED'; })).toBe(true);
    });

    it('warning QR chưa gán node', function () {
        var result = validateMapData(baseMap({
            qr_anchors: [{ qr_id: 'QR-001', x: 1, y: 2, room_name: 'A', node_id: null }]
        }));
        expect(result.ok).toBe(true);
        expect(result.warnings.some(function (w) { return w.code === 'QR_NO_NODE'; })).toBe(true);
    });

    it('warning graph disconnected', function () {
        var result = validateMapData(baseMap({
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
        expect(result.ok).toBe(true);
        expect(result.warnings.some(function (w) { return w.code === 'GRAPH_DISCONNECTED'; })).toBe(true);
    });

    it('block polygon room < 3 đỉnh', function () {
        var result = validateMapData(baseMap({
            rooms: [{ id: 1, name: 'P', shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }]
        }));
        expect(result.ok).toBe(false);
        expect(result.errors.some(function (e) { return e.code === 'ROOM_NOT_CLOSED'; })).toBe(true);
    });

    it('tắt NODE_ISOLATED trong config → không block', function () {
        ValidationConfig.merge({ rules: { NODE_ISOLATED: { enabled: false } } });
        var result = validateMapData(baseMap({
            nodes: [{ id: 1, x: 0, y: 0, neighbors: [] }],
            edges: []
        }));
        expect(result.ok).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('NODE_ISOLATED severity warning → không block publish', function () {
        ValidationConfig.merge({ rules: { NODE_ISOLATED: { severity: 'warning' } } });
        var result = validateMapData(baseMap({
            nodes: [{ id: 1, x: 0, y: 0, neighbors: [] }],
            edges: []
        }));
        expect(result.ok).toBe(true);
        expect(result.warnings.some(function (w) { return w.code === 'NODE_ISOLATED'; })).toBe(true);
    });
});
