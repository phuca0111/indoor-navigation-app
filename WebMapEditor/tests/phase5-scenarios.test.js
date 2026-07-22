import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MapAdapter = require('../core/map-adapter.js');
const VersionManager = require('../core/version-manager.js');

function emptyCollections(extra) {
    return Object.assign({
        rooms: [], doors: [], pois: [], pathNodes: [], pathEdges: [], walls: [], qrs: []
    }, extra || {});
}

describe('Phase 5 scenarios — Map Adapter biên', function () {
    it('S1: map trống vẫn đủ schema + nav không editor-only', function () {
        var full = MapAdapter.buildPublishPayload(emptyCollections());
        var nav = MapAdapter.toNavigationPayload(full);
        MapAdapter.assertPublishSchema(nav);
        expect(nav.rooms).toEqual([]);
        expect(nav.nodes).toEqual([]);
        MapAdapter.EDITOR_ONLY_KEYS.forEach(function (k) {
            expect(k in nav).toBe(false);
        });
    });

    it('S2: scale/bearing lạ → fallback an toàn', function () {
        var p1 = MapAdapter.buildPublishPayload(emptyCollections({ scaleRatio: -1 }));
        expect(p1.scale_ratio).toBe(0.5);
        var p2 = MapAdapter.buildPublishPayload(emptyCollections({ scaleRatio: NaN, mapBearingOffset: 'x' }));
        expect(p2.scale_ratio).toBe(0.5);
        expect(p2.map_bearing_offset).toBe(0);
    });

    it('S3: tọa độ làm tròn (1.6→2) trên room/wall/qr', function () {
        var p = MapAdapter.buildPublishPayload({
            rooms: [{ id: 1, name: 'R', x: 1.6, y: 2.4, width: 10.2, height: 9.8 }],
            doors: [], pois: [], pathNodes: [], pathEdges: [],
            walls: [{ id: 1, points: [{ x: 1.4, y: 2.6 }] }],
            qrs: [{ id: 1, serial: 'Q', x: 3.5, y: 4.5, node_id: 9 }]
        });
        expect(p.rooms[0].x).toBe(2);
        expect(p.rooms[0].y).toBe(2);
        expect(p.walls[0].points[0]).toEqual({ x: 1, y: 3 });
        expect(p.qr_anchors[0].x).toBe(4);
        expect(p.qr_anchors[0].y).toBe(5);
    });

    it('S4: lọc phần tử null/không phải object trong mảng', function () {
        var p = MapAdapter.buildPublishPayload({
            rooms: [null, { id: 2, name: 'OK', x: 0, y: 0, width: 1, height: 1 }, 'x'],
            doors: [undefined, { id: 1, x: 0, y: 0 }],
            pois: [], pathNodes: [{ id: 1, x: 0, y: 0 }], pathEdges: [], walls: [], qrs: []
        });
        expect(p.rooms).toHaveLength(1);
        expect(p.rooms[0].id).toBe(2);
        expect(p.doors).toHaveLength(1);
    });

    it('S5: QR thiếu serial → dùng String(id)', function () {
        var p = MapAdapter.buildPublishPayload({
            rooms: [], doors: [], pois: [], pathNodes: [], pathEdges: [], walls: [],
            qrs: [{ id: 77, x: 1, y: 2 }]
        });
        expect(p.qr_anchors[0].qr_id).toBe('77');
        expect(p.qr_anchors[0].node_id).toBeNull();
    });

    it('S6: polygon room points được round + giữ shape', function () {
        var p = MapAdapter.buildPublishPayload({
            rooms: [{
                id: 1, name: 'P', shape: 'polygon',
                points: [{ x: 0.4, y: 0.6 }, { x: 10.6, y: 0.4 }, { x: 10.2, y: 10.8 }],
                x: 0, y: 0, width: 11, height: 11
            }],
            doors: [], pois: [], pathNodes: [], pathEdges: [], walls: [], qrs: []
        });
        expect(p.rooms[0].shape).toBe('polygon');
        expect(p.rooms[0].points[0]).toEqual({ x: 0, y: 1 });
        expect(p.rooms[0].points[1]).toEqual({ x: 11, y: 0 });
    });

    it('S7: nav không lộ hatch dù full có hatch', function () {
        var full = MapAdapter.buildPublishPayload({
            rooms: [{
                id: 1, name: 'H', x: 0, y: 0, width: 20, height: 20,
                hatch: { pattern: 'cross', color: '#0f0', spacing: 8 }
            }],
            doors: [], pois: [], pathNodes: [], pathEdges: [], walls: [], qrs: []
        });
        expect(full.rooms[0].hatch).toBeTruthy();
        var nav = MapAdapter.toNavigationPayload(full);
        expect(nav.rooms[0].hatch).toBeUndefined();
        expect(nav.rooms[0].name).toBe('H');
    });

    it('S8: extractEditorExtras khi thiếu extras → mảng rỗng', function () {
        var full = MapAdapter.buildPublishPayload(emptyCollections());
        var ex = MapAdapter.extractEditorExtras(full);
        expect(ex.blocks).toEqual([]);
        expect(ex.dimensions).toEqual([]);
        expect(ex.lines).toEqual([]);
        expect(ex.blockInserts).toEqual([]);
    });

    it('S9: round-trip 2 lần không mất nav counts', function () {
        var full = MapAdapter.buildPublishPayload({
            rooms: [{ id: 1, name: 'A', x: 0, y: 0, width: 40, height: 40 }],
            doors: [{ id: 1, x: 1, y: 1 }],
            pois: [{ id: 1, x: 2, y: 2 }],
            pathNodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 10, y: 0 }],
            pathEdges: [{ from: 1, to: 2, distance: 10 }],
            walls: [{ id: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }],
            qrs: [{ id: 1, serial: 'S', x: 3, y: 3, node_id: 1 }],
            dimensions: [{ id: 9, type: 'dimaligned' }],
            blocks: [{ id: 1, name: 'Blk' }]
        });
        var nav1 = MapAdapter.toNavigationPayload(full);
        var restored = Object.assign({}, nav1, MapAdapter.extractEditorExtras(full));
        var nav2 = MapAdapter.toNavigationPayload(restored);
        expect(nav2.rooms).toHaveLength(1);
        expect(nav2.doors).toHaveLength(1);
        expect(nav2.nodes).toHaveLength(2);
        expect(nav2.edges).toHaveLength(1);
        expect(nav2.qr_anchors[0].node_id).toBe(1);
        expect('dimensions' in nav2).toBe(false);
    });

    it('S10: elevator/stairs flag trên node', function () {
        var p = MapAdapter.buildPublishPayload({
            rooms: [], doors: [], pois: [], walls: [], qrs: [], pathEdges: [],
            pathNodes: [
                { id: 1, x: 0, y: 0, nodeType: 'elevator' },
                { id: 2, x: 1, y: 1, nodeType: 'stairs' },
                { id: 3, x: 2, y: 2, nodeType: 'normal' }
            ]
        });
        expect(p.nodes[0].is_elevator).toBe(true);
        expect(p.nodes[1].is_stairs).toBe(true);
        expect(p.nodes[2].is_elevator).toBe(false);
        expect(p.nodes[2].is_stairs).toBe(false);
    });

    it('S11: toNavigationPayload(null) throw', function () {
        expect(function () { MapAdapter.toNavigationPayload(null); }).toThrow();
        expect(function () { MapAdapter.toNavigationPayload(undefined); }).toThrow();
    });

    it('S12: edge from/to → source/target string', function () {
        var p = MapAdapter.buildPublishPayload({
            rooms: [], doors: [], pois: [], walls: [], qrs: [], pathNodes: [],
            pathEdges: [{ from: 10, to: 20, distance: 5.5 }]
        });
        expect(p.edges[0]).toEqual({ source: '10', target: '20', distance: 5.5 });
    });
});

describe('Phase 5 scenarios — VersionManager chuỗi nghiệp vụ', function () {
    beforeEach(function () {
        VersionManager.init({ state: 'draft', revision: 0 });
    });

    it('V1: draft→published→draft(dirty)→published lại (số version server)', function () {
        VersionManager.syncAfterPublish(1);
        VersionManager.markDirty();
        expect(VersionManager.getState().state).toBe('draft');
        VersionManager.syncAfterPublish(2);
        var s = VersionManager.getState();
        expect(s.state).toBe('published');
        expect(s.revision).toBe(2);
        expect(s.dirtySincePublish).toBe(false);
    });

    it('V2: publish rồi rollback → version mới, sạch dirty', function () {
        VersionManager.syncAfterPublish(4);
        VersionManager.markDirty();
        VersionManager.syncAfterRollback(5);
        expect(VersionManager.getState().revision).toBe(5);
        expect(VersionManager.getState().dirtySincePublish).toBe(false);
        expect(VersionManager.getState().state).toBe('published');
    });

    it('V3: syncFromServer DRAFT → luôn draft local', function () {
        VersionManager.syncAfterPublish(3);
        VersionManager.syncFromServer({ serverVersion: 3, buildingStatus: 'DRAFT' });
        expect(VersionManager.getState().state).toBe('draft');
        expect(VersionManager.getState().serverVersion).toBe(3);
    });

    it('V4: markDirty khi đang draft (đã có serverVer) chỉ bật dirty flag', function () {
        VersionManager.syncFromServer({ serverVersion: 2, buildingStatus: 'DRAFT' });
        VersionManager.markDirty();
        expect(VersionManager.getState().state).toBe('draft');
        expect(VersionManager.getState().dirtySincePublish).toBe(true);
    });

    it('V5: transition published→archived rồi không quay draft', function () {
        VersionManager.transition('published');
        expect(VersionManager.transition('archived').ok).toBe(true);
        expect(VersionManager.canTransition('draft')).toBe(false);
        expect(VersionManager.canTransition('published')).toBe(false);
        expect(VersionManager.transition('published').ok).toBe(false);
    });

    it('V6: syncAfterPublish với version null vẫn tăng revision local', function () {
        VersionManager.init({ state: 'draft', revision: 3 });
        var s = VersionManager.syncAfterPublish(null);
        expect(s.state).toBe('published');
        expect(s.revision).toBe(4);
        expect(s.serverVersion).toBe(4);
    });

    it('V7: syncAfterPublish với version string số', function () {
        var s = VersionManager.syncAfterPublish('12');
        expect(s.revision).toBe(12);
        expect(s.serverVersion).toBe(12);
    });

    it('V8: double markDirty sau publish không lỗi', function () {
        VersionManager.syncAfterPublish(1);
        VersionManager.markDirty();
        VersionManager.markDirty();
        expect(VersionManager.getState().state).toBe('draft');
        expect(VersionManager.getState().dirtySincePublish).toBe(true);
    });

    it('V9: từ chối transition vô nghĩa draft→draft', function () {
        expect(VersionManager.canTransition('draft')).toBe(false);
        expect(VersionManager.transition('draft').ok).toBe(false);
        expect(VersionManager.transition('zzz').ok).toBe(false);
    });

    it('V10: chuỗi lifecycle giống Admin vẽ → publish → sửa → publish', function () {
        // Draft vẽ
        expect(VersionManager.getState().state).toBe('draft');
        // Publish v1
        VersionManager.syncAfterPublish(1);
        expect(VersionManager.getState().labelVi).toMatch(/xuất bản/i);
        // Sửa tiếp
        VersionManager.markDirty();
        expect(VersionManager.getState().labelVi).toMatch(/Nháp|Draft/i);
        expect(VersionManager.getState().dirtySincePublish).toBe(true);
        // Publish v2
        VersionManager.syncAfterPublish(2);
        expect(VersionManager.getState().revision).toBe(2);
        expect(VersionManager.getState().dirtySincePublish).toBe(false);
    });
});

describe('Phase 5 scenarios — hợp đồng Android (nav graph tối thiểu)', function () {
    it('A1: map chỉ rooms không path — nav vẫn hợp lệ (A* có thể fail runtime, schema OK)', function () {
        var full = MapAdapter.buildPublishPayload({
            rooms: [{ id: 1, name: 'R1', x: 0, y: 0, width: 50, height: 50 }],
            doors: [], pois: [], pathNodes: [], pathEdges: [], walls: [], qrs: []
        });
        var nav = MapAdapter.toNavigationPayload(full);
        expect(nav.rooms).toHaveLength(1);
        expect(nav.nodes).toHaveLength(0);
        expect(nav.edges).toHaveLength(0);
        MapAdapter.assertPublishSchema(nav);
    });

    it('A2: QR gắn node_id tồn tại trong nodes', function () {
        var full = MapAdapter.buildPublishPayload({
            rooms: [], doors: [], pois: [], walls: [],
            pathNodes: [{ id: 5, x: 10, y: 10 }],
            pathEdges: [],
            qrs: [{ id: 1, serial: 'ANCHOR', x: 10, y: 10, node_id: 5 }]
        });
        var nav = MapAdapter.toNavigationPayload(full);
        var nodeIds = nav.nodes.map(function (n) { return n.id; });
        expect(nodeIds).toContain(nav.qr_anchors[0].node_id);
    });

    it('A3: background_image rỗng vẫn publish được', function () {
        var full = MapAdapter.buildPublishPayload(emptyCollections({ backgroundImage: '' }));
        expect(full.background_image).toBe('');
        MapAdapter.assertPublishSchema(MapAdapter.toNavigationPayload(full));
    });
});
