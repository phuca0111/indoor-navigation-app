import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MapAdapter = require('../core/map-adapter.js');
const VersionManager = require('../core/version-manager.js');

function sampleFullPayload() {
    return MapAdapter.buildPublishPayload({
        scaleRatio: 0.5,
        mapBearingOffset: 10,
        backgroundImage: 'data:image/png;base64,xx',
        rooms: [{
            id: 1, name: 'A', shape: 'rect', x: 0, y: 0, width: 40, height: 40,
            hatch: { pattern: 'lines', color: '#f00' }
        }],
        doors: [{ id: 1, x: 10, y: 10, width: 40 }],
        pois: [{ id: 1, name: 'WC', x: 5, y: 5 }],
        pathNodes: [{ id: 1, x: 0, y: 0, neighbors: [2] }, { id: 2, x: 40, y: 0, neighbors: [1] }],
        pathEdges: [{ from: 1, to: 2, distance: 40 }],
        walls: [{ id: 1, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] }],
        qrs: [{ id: 1, serial: 'QR-1', x: 8, y: 8, node_id: 1 }],
        blocks: [{ id: 1, name: 'B1' }],
        blockInserts: [{ id: 1, blockId: 1, x: 0, y: 0 }],
        lines: [{ id: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }],
        dimensions: [{ id: 1, type: 'dimlinear', p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 } }]
    });
}

describe('Phase 5 — Map Adapter nav + round-trip', function () {
    it('toNavigationPayload đủ schema Android và bỏ editor-only', function () {
        var full = sampleFullPayload();
        expect(full.dimensions).toHaveLength(1);
        expect(full.blocks).toHaveLength(1);
        var nav = MapAdapter.toNavigationPayload(full);
        MapAdapter.assertPublishSchema(nav);
        MapAdapter.EDITOR_ONLY_KEYS.forEach(function (k) {
            expect(k in nav).toBe(false);
        });
        expect(nav.rooms[0].hatch).toBeUndefined();
        expect(nav.rooms).toHaveLength(1);
        expect(nav.nodes).toHaveLength(2);
        expect(nav.edges).toHaveLength(1);
        expect(nav.qr_anchors[0].qr_id).toBe('QR-1');
    });

    it('round-trip: extractEditorExtras giữ dim/block sau khi tách nav', function () {
        var full = sampleFullPayload();
        var extras = MapAdapter.extractEditorExtras(full);
        var nav = MapAdapter.toNavigationPayload(full);
        expect(extras.dimensions).toHaveLength(1);
        expect(extras.blocks).toHaveLength(1);
        expect(extras.lines).toHaveLength(1);
        // Merge lại như F5 Web: nav + extras
        var restored = Object.assign({}, nav, extras);
        expect(restored.dimensions[0].type).toBe('dimlinear');
        expect(restored.rooms[0].name).toBe('A');
        MapAdapter.assertPublishSchema(restored);
    });

    it('toNavigationPayload throw khi thiếu schema', function () {
        expect(function () {
            MapAdapter.toNavigationPayload({ rooms: [] });
        }).toThrow(/thiếu key schema|invalid/i);
    });
});

describe('Phase 5 — VersionManager sync', function () {
    beforeEach(function () {
        VersionManager.init({ state: 'draft', revision: 0 });
    });

    it('syncAfterPublish gán server version + published', function () {
        var s = VersionManager.syncAfterPublish(7, '2026-07-16T00:00:00.000Z');
        expect(s.state).toBe('published');
        expect(s.revision).toBe(7);
        expect(s.serverVersion).toBe(7);
        expect(s.dirtySincePublish).toBe(false);
    });

    it('markDirty sau publish → draft + dirty', function () {
        VersionManager.syncAfterPublish(3);
        VersionManager.markDirty();
        var s = VersionManager.getState();
        expect(s.state).toBe('draft');
        expect(s.dirtySincePublish).toBe(true);
        expect(s.serverVersion).toBe(3);
    });

    it('syncFromServer PUBLISHED → published local', function () {
        VersionManager.syncFromServer({ serverVersion: 4, buildingStatus: 'PUBLISHED' });
        expect(VersionManager.getState().state).toBe('published');
        expect(VersionManager.getState().revision).toBe(4);
    });

    it('syncAfterRollback cập nhật version', function () {
        VersionManager.syncAfterPublish(5);
        VersionManager.markDirty();
        VersionManager.syncAfterRollback(6);
        var s = VersionManager.getState();
        expect(s.state).toBe('published');
        expect(s.revision).toBe(6);
        expect(s.dirtySincePublish).toBe(false);
    });

    it('labelVi có tiếng Việt', function () {
        expect(VersionManager.getState().labelVi).toMatch(/Nháp|Draft/i);
        VersionManager.syncAfterPublish(1);
        expect(VersionManager.getState().labelVi).toMatch(/xuất bản/i);
    });
});
