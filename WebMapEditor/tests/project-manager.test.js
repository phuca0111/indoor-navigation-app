import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PM = require('../core/project-manager.js');

describe('ProjectManager — Phase 0.5 skeleton', function () {
    beforeEach(function () {
        PM.setContext(null);
    });

    it('parse URL buildingId + floor + version', function () {
        var ctx = PM.parseFromSearchParams('?buildingId=abc123&floor=2&version=draft');
        expect(ctx.buildingId).toBe('abc123');
        expect(ctx.floor).toBe('2');
        expect(ctx.version).toBe('draft');
        expect(ctx.documentId).toBe('bld:abc123/floor:2/ver:draft');
    });

    it('mặc định floor=0 version=draft khi URL rỗng', function () {
        var ctx = PM.resolveContext({});
        expect(ctx.floor).toBe('0');
        expect(ctx.version).toBe('draft');
    });

    it('documentId gồm org và project khi có', function () {
        var ctx = PM.resolveContext({
            orgId: 'org1',
            projectId: 'p1',
            buildingId: 'b1',
            floor: 1,
            version: 'published'
        });
        expect(ctx.documentId).toBe('org:org1/proj:p1/bld:b1/floor:1/ver:published');
    });

    it('getAutosaveKey theo building + floor', function () {
        PM.resolveContext({ buildingId: 'b99', floor: 0, version: 'draft' });
        expect(PM.getAutosaveKey()).toBe('floorplan_autosave_b99_0');
    });

    it('getMapApiPath', function () {
        PM.resolveContext({ buildingId: 'b1', floor: 3, version: 'draft' });
        expect(PM.getMapApiPath('/api')).toBe('/api/maps/b1/3');
    });

    it('updateFloor cập nhật documentId', function () {
        PM.resolveContext({ buildingId: 'b1', floor: 0, version: 'draft' });
        PM.updateFloor(5);
        var ctx = PM.getContext();
        expect(ctx.floor).toBe('5');
        expect(ctx.documentId).toContain('floor:5');
    });
});
