import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const Models = require('../core/models.js');
const Geometry = require('../core/geometry/geometry-engine.js');
const Selection = require('../core/selection-manager.js');
const Config = require('../core/config.js');
const Schemas = require('../core/property-schemas.js');
const DocumentMod = require('../core/document.js');
const CrashRecovery = require('../core/crash-recovery.js');
const PerfMonitor = require('../core/perf-monitor.js');
const ProjectManager = require('../core/project-manager.js');
const VersionManager = require('../core/version-manager.js');
const AssetManager = require('../core/asset-manager.js');

describe('Phase 0 — Models', function () {
    it('createCadObject có id, geometry, style', function () {
        var obj = Models.createCadObject({ type: 'polyline' });
        expect(obj.id).toBeTruthy();
        expect(obj.geometry.kind).toBe('polyline');
        expect(obj.style.color).toBe('#111827');
    });

    it('fromLegacyWall map đúng points', function () {
        var cad = Models.fromLegacyWall({
            id: 5,
            points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
            thickness: 6
        });
        expect(cad.id).toBe('wall-5');
        expect(cad.geometry.points).toHaveLength(2);
        expect(cad.properties.navRole).toBe('wall');
    });

    it('validateCadObject báo lỗi khi thiếu id', function () {
        var r = Models.validateCadObject({ type: 'line' });
        expect(r.ok).toBe(false);
        expect(r.errors).toContain('missing_id');
    });
});

describe('Phase 0 — GeometryEngine', function () {
    it('segmentIntersection giao điểm trong đoạn', function () {
        var hit = Geometry.segmentIntersection(
            { x: 0, y: 0 }, { x: 100, y: 0 },
            { x: 50, y: -50 }, { x: 50, y: 50 }
        );
        expect(hit).not.toBeNull();
        expect(hit.x).toBeCloseTo(50, 5);
        expect(hit.y).toBeCloseTo(0, 5);
    });

    it('pointInPolygon trong hình chữ nhật', function () {
        var poly = [
            { x: 0, y: 0 }, { x: 100, y: 0 },
            { x: 100, y: 100 }, { x: 0, y: 100 }
        ];
        expect(Geometry.pointInPolygon({ x: 50, y: 50 }, poly)).toBe(true);
        expect(Geometry.pointInPolygon({ x: 150, y: 50 }, poly)).toBe(false);
    });
});

describe('Phase 0 — SelectionManager', function () {
    beforeEach(function () {
        Selection.init();
    });

    it('select / clear / isSelected', function () {
        Selection.select({ id: 'wall-1', type: 'wall' });
        expect(Selection.isSelected({ id: 'wall-1' })).toBe(true);
        Selection.clear();
        expect(Selection.getSelected()).toHaveLength(0);
    });

    it('selectInRect lọc candidates', function () {
        var hits = Selection.selectInRect(
            { x: 0, y: 0, width: 50, height: 50 },
            [{ id: 1, x: 10, y: 10 }, { id: 2, x: 200, y: 200 }]
        );
        expect(hits).toHaveLength(1);
        expect(Selection.getPrimary().id).toBe(1);
    });
});

describe('Phase 0 — Config', function () {
    it('load merge defaults', function () {
        Config.load({ grid: { size: 20 } });
        expect(Config.get('grid.size')).toBe(20);
        expect(Config.get('snap.tolerancePx')).toBe(12);
    });
});

describe('Phase 0 — Document toJSON/fromJSON', function () {
    it('round-trip metadata và objects', function () {
        var doc = DocumentMod.createDocument();
        doc.metadata.mapName = 'Test';
        doc.objects.push({ id: 'room-1', type: 'room', data: { id: 1, name: 'A' } });
        var json = doc.toJSON();
        var doc2 = DocumentMod.createDocument();
        doc2.fromJSON(json);
        expect(doc2.metadata.mapName).toBe('Test');
        expect(doc2.objects).toHaveLength(1);
    });
});

describe('Phase 0 — CrashRecovery', function () {
    it('buildSnapshot gồm legacy', function () {
        var snap = CrashRecovery.buildSnapshot({ mapName: 'X' }, { buildingId: 'b1', floor: '2' });
        expect(snap.legacy.mapName).toBe('X');
        expect(snap.buildingId).toBe('b1');
        expect(snap.version).toBe(1);
    });
});

describe('Phase 0 — ProjectManager', function () {
    it('resolveContext từ query string', function () {
        var ctx = ProjectManager.resolveContext({
            search: '?buildingId=towerA&floor=3'
        });
        expect(ctx.buildingId).toBe('towerA');
        expect(ctx.floor).toBe('3');
    });
});

describe('Phase 0 — VersionManager', function () {
    beforeEach(function () {
        VersionManager.init({ state: 'draft' });
    });

    it('draft → published tăng revision', function () {
        var r = VersionManager.transition('published');
        expect(r.ok).toBe(true);
        expect(VersionManager.getState().revision).toBe(1);
        expect(VersionManager.getState().publishedAt).toBeTruthy();
    });
});

describe('Phase 0 — AssetManager', function () {
    it('register và get asset', function () {
        AssetManager.register('icon-restroom', { url: '/icons/restroom.svg', type: 'image' });
        var a = AssetManager.get('icon-restroom');
        expect(a.url).toContain('restroom');
    });
});

describe('Phase 0 — PropertySchemas', function () {
    it('getSchema wall có thickness', function () {
        var s = Schemas.getSchema('wall');
        var keys = s.fields.map(function (f) { return f.key; });
        expect(keys).toContain('thickness');
    });
});
