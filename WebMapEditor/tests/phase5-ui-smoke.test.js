/**
 * @vitest-environment happy-dom
 * Phase 5 — Smoke UI Version badge / panel (không gọi Backend thật)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const VersionManager = require('../core/version-manager.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('Phase 5 UI Smoke — Version', function () {
    beforeEach(function () {
        document.body.innerHTML = `
          <span id="editorVersionLifecycle" class="editor-status-badge"></span>
          <button id="btnVersionHistory" type="button">Lịch sử</button>
          <div id="versionHistoryPanel" style="display:none">
            <button id="btnCloseVersionPanel" type="button">Đóng</button>
            <button id="btnRefreshVersions" type="button">Làm mới</button>
            <p id="versionHistoryMeta"></p>
            <div id="versionHistoryList"></div>
          </div>
          <strong id="editorMapVersion">—</strong>
        `;
        globalThis.EditorCore = { VersionManager: VersionManager, eventBus: null };
        VersionManager.init({ state: 'draft', revision: 0 });

        // Stub fetch API — không gọi server
        globalThis.buildingId = null;
        globalThis.BASE_API_URL = '/api';
        globalThis.apiFetch = async function () {
            return { ok: true, json: async function () { return { versions: [], current_version: null }; } };
        };

        var src = fs.readFileSync(path.join(ROOT, 'js/version-ui.js'), 'utf8');
        // eslint-disable-next-line no-eval
        (0, eval)(src);
        if (typeof window.initVersionUi === 'function') window.initVersionUi();
    });

    it('UI-V0: có badge + nút Lịch sử + panel', function () {
        expect(document.getElementById('editorVersionLifecycle')).toBeTruthy();
        expect(document.getElementById('btnVersionHistory')).toBeTruthy();
        expect(document.getElementById('versionHistoryPanel')).toBeTruthy();
        expect(typeof window.renderVersionBadge).toBe('function');
        expect(typeof window.markEditorDirty).toBe('function');
    });

    it('UI-V1: render badge Draft → sau sync publish → Đã xuất bản', function () {
        window.renderVersionBadge();
        expect(document.getElementById('editorVersionLifecycle').textContent).toMatch(/Nháp|Draft/i);
        VersionManager.syncAfterPublish(2);
        window.renderVersionBadge();
        expect(document.getElementById('editorVersionLifecycle').textContent).toMatch(/xuất bản/i);
        expect(document.getElementById('editorVersionLifecycle').className).toMatch(/published/);
    });

    it('UI-V2: markEditorDirty đổi badge sang Nháp • đã sửa', function () {
        VersionManager.syncAfterPublish(1);
        window.markEditorDirty();
        window.renderVersionBadge();
        var t = document.getElementById('editorVersionLifecycle').textContent;
        expect(t).toMatch(/Nháp|Draft/i);
        expect(t).toMatch(/đã sửa/i);
    });

    it('UI-V4: syncAfterRollback rồi badge Published', function () {
        VersionManager.syncAfterPublish(1);
        window.markEditorDirty();
        VersionManager.syncAfterRollback(3);
        window.renderVersionBadge();
        expect(document.getElementById('editorVersionLifecycle').textContent).toMatch(/xuất bản/i);
        expect(document.getElementById('editorVersionLifecycle').className).toMatch(/published/);
    });

    it('UI-V5: mở panel khi có buildingId + mock versions (rollback btn hiện)', async function () {
        globalThis.buildingId = 'b1';
        globalThis.apiFetch = async function () {
            return {
                ok: true,
                json: async function () {
                    return {
                        current_version: 2,
                        retention: { max_per_floor: 10, stored_count: 2 },
                        versions: [
                            { version: 2, rooms_count: 3, nodes_count: 4, published_at: '2026-07-16T01:00:00Z', has_full_snapshot: true },
                            { version: 1, rooms_count: 2, nodes_count: 2, published_at: '2026-07-15T01:00:00Z', has_full_snapshot: true }
                        ]
                    };
                }
            };
        };
        document.body.insertAdjacentHTML('beforeend', '<select id="floorSelect"><option value="0">0</option></select>');
        await window.loadVersionList();
        expect(document.getElementById('versionHistoryMeta').textContent).toMatch(/v2/);
        expect(document.getElementById('versionHistoryList').innerHTML).toMatch(/Rollback|đang dùng/);
        expect(document.querySelector('[data-rollback="1"]')).toBeTruthy();
    });
});
