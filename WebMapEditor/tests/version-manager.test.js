import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const VersionManager = require('../core/version-manager.js');

describe('VersionManager', function () {
    beforeEach(function () {
        VersionManager.init({ state: 'draft', revision: 0 });
    });

    it('getState mặc định draft', function () {
        var s = VersionManager.getState();
        expect(s.state).toBe('draft');
        expect(s.revision).toBe(0);
    });

    it('draft → published tăng revision + publishedAt', function () {
        var r = VersionManager.transition('published');
        expect(r.ok).toBe(true);
        expect(VersionManager.getState().revision).toBe(1);
        expect(VersionManager.getState().publishedAt).toBeTruthy();
    });

    it('canTransition từ chối archived → bất kỳ', function () {
        VersionManager.transition('published');
        VersionManager.transition('archived');
        expect(VersionManager.canTransition('draft')).toBe(false);
        expect(VersionManager.transition('draft').ok).toBe(false);
    });

    it('published → draft qua markDirty', function () {
        VersionManager.transition('published');
        VersionManager.markDirty();
        expect(VersionManager.getState().state).toBe('draft');
    });

    it('draft → archived hợp lệ', function () {
        expect(VersionManager.canTransition('archived')).toBe(true);
        expect(VersionManager.transition('archived').ok).toBe(true);
    });
});
