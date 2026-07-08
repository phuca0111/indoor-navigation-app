import { describe, it, expect, beforeEach } from 'vitest';

import { createRequire } from 'node:module';



const require = createRequire(import.meta.url);

const VM = require('../core/version-manager.js');

const PM = require('../core/project-manager.js');

globalThis.EditorCore = globalThis.EditorCore || {};
globalThis.EditorCore.ProjectManager = PM;

describe('VersionManager — Phase 0.5 skeleton', function () {

    beforeEach(function () {

        VM.reset();

        PM.setContext(null);

    });



    it('mặc định là Draft, chưa có serverVersion', function () {

        var s = VM.getState();

        expect(s.status).toBe('draft');

        expect(s.serverVersion).toBeNull();

        expect(s.isDirty).toBe(false);

        expect(VM.getDisplayLabel()).toBe('Draft');

    });



    it('applyServerLoad(version) → Published', function () {

        VM.applyServerLoad(4);

        var s = VM.getState();

        expect(s.status).toBe('published');

        expect(s.serverVersion).toBe(4);

        expect(VM.getDisplayLabel()).toBe('v4 (Published)');

        expect(VM.isEditingDraft()).toBe(false);

    });



    it('applyServerLoad(null) → Draft tầng trống', function () {

        VM.applyServerLoad(null);

        expect(VM.getState().status).toBe('draft');

        expect(VM.getState().serverVersion).toBeNull();

    });



    it('applyPublishSuccess cập nhật version và ProjectManager', function () {

        PM.resolveContext({ buildingId: 'b1', floor: 0, version: 'draft' });

        VM.applyPublishSuccess(7);

        var s = VM.getState();

        expect(s.status).toBe('published');

        expect(s.serverVersion).toBe(7);

        expect(PM.getContext().version).toBe('7');

    });



    it('beginDraftFork từ published', function () {

        VM.applyServerLoad(3);

        VM.beginDraftFork();

        var s = VM.getState();

        expect(s.status).toBe('draft');

        expect(s.forkedFromVersion).toBe(3);

        expect(s.isDirty).toBe(true);

        expect(VM.getDisplayLabel()).toContain('fork từ v3');

    });



    it('markDirty chuyển published → draft fork', function () {

        VM.applyServerLoad(2);

        VM.markDirty();

        expect(VM.getState().status).toBe('draft');

        expect(VM.getState().forkedFromVersion).toBe(2);

    });



    it('getVersionsListUrl và getRollbackUrl', function () {

        PM.resolveContext({ buildingId: 'abc', floor: 1, version: 'draft' });

        expect(VM.getVersionsListUrl()).toBe('/api/map-versions/abc/1');

        expect(VM.getRollbackUrl(null, null, 5)).toBe('/api/map-versions/abc/1/5/rollback');

    });



    it('syncFromProjectManager đọc version draft vs số', function () {

        PM.resolveContext({ buildingId: 'b1', floor: 0, version: 'draft' });

        VM.syncFromProjectManager();

        expect(VM.getState().status).toBe('draft');



        PM.updateVersion('9');

        VM.syncFromProjectManager();

        expect(VM.getState().status).toBe('published');

        expect(VM.getState().serverVersion).toBe(9);

    });

});


