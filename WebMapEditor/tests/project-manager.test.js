import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ProjectManager = require('../core/project-manager.js');

describe('ProjectManager', function () {
    beforeEach(function () {
        ProjectManager.resolveContext({
            userId: 'u1',
            buildingId: 'default',
            floor: '1',
            projectId: null,
            mapName: '',
            role: 'editor',
            search: ''
        });
    });

    it('parseQuery đọc buildingId và floor', function () {
        var q = ProjectManager.parseQuery('?buildingId=towerA&floor=3');
        expect(q.buildingId).toBe('towerA');
        expect(q.floor).toBe('3');
    });

    it('resolveContext từ opts.search', function () {
        var ctx = ProjectManager.resolveContext({
            userId: 'u9',
            search: '?buildingId=b1&floor=2&mapName=Lobby'
        });
        expect(ctx.buildingId).toBe('b1');
        expect(ctx.floor).toBe('2');
        expect(ctx.mapName).toBe('Lobby');
        expect(ctx.userId).toBe('u9');
    });

    it('setFloor cập nhật context', function () {
        ProjectManager.resolveContext({ userId: 'u1', buildingId: 'x', floor: '1', search: '' });
        var ctx = ProjectManager.setFloor(5);
        expect(ctx.floor).toBe('5');
        expect(ProjectManager.getContext().floor).toBe('5');
    });

    it('storageNamespace = userId_buildingId_floor', function () {
        ProjectManager.resolveContext({ userId: 'alice', buildingId: 'mall', floor: 'B1', search: '' });
        expect(ProjectManager.storageNamespace()).toBe('alice_mall_B1');
    });

    it('setUserId / setBuildingId tách nháp theo tài khoản', function () {
        ProjectManager.resolveContext({ userId: 'a', buildingId: 'b1', floor: '1', search: '' });
        expect(ProjectManager.storageNamespace()).toBe('a_b1_1');
        ProjectManager.setUserId('b');
        expect(ProjectManager.storageNamespace()).toBe('b_b1_1');
        ProjectManager.setBuildingId('b2');
        expect(ProjectManager.storageNamespace()).toBe('b_b2_1');
    });

    it('storageNamespace giữ floor 0 (tầng trệt) — không bị || thành 1', function () {
        ProjectManager.resolveContext({ userId: 'u', buildingId: 'b', floor: '0', search: '' });
        expect(ProjectManager.getContext().floor).toBe('0');
        expect(ProjectManager.storageNamespace()).toBe('u_b_0');
        ProjectManager.setFloor(0);
        expect(ProjectManager.storageNamespace()).toBe('u_b_0');
    });

    it('resolveContext đọc floor=0 từ query', function () {
        var ctx = ProjectManager.resolveContext({
            userId: 'u',
            search: '?buildingId=b&floor=0'
        });
        expect(ctx.floor).toBe('0');
        expect(ProjectManager.storageNamespace()).toBe('u_b_0');
    });
});
