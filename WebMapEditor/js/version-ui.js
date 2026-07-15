// ============================================================
// VERSION-UI.JS — Phase 5: badge Draft/Published + danh sách / Rollback
// API: GET/POST /api/map-versions/... (Backend có sẵn — editor chỉ gọi)
// ============================================================
(function () {
    'use strict';

    function vm() {
        return (window.EditorCore && EditorCore.VersionManager) ? EditorCore.VersionManager : null;
    }

    function renderVersionBadge() {
        var el = document.getElementById('editorVersionLifecycle');
        if (!el) return;
        var M = vm();
        if (!M) {
            el.textContent = 'Draft';
            el.className = 'editor-status-badge editor-status-draft';
            return;
        }
        var s = M.getState();
        var text = s.labelVi || s.state;
        if (s.dirtySincePublish) text += ' • đã sửa';
        el.textContent = text;
        el.className = 'editor-status-badge ' +
            (s.state === 'published' ? 'editor-status-published' : 'editor-status-draft');
        el.title = 'Local lifecycle · server v' +
            (s.serverVersion != null ? s.serverVersion : '—') +
            (s.publishedAt ? (' · ' + s.publishedAt) : '');
    }

    function notifyVersionChanged() {
        renderVersionBadge();
    }

    function initVersionUi() {
        renderVersionBadge();
        if (window.EditorCore && EditorCore.eventBus && typeof EditorCore.eventBus.on === 'function') {
            EditorCore.eventBus.on('version:changed', notifyVersionChanged);
        }
        var btn = document.getElementById('btnVersionHistory');
        if (btn) {
            btn.addEventListener('click', function () {
                toggleVersionPanel(true);
            });
        }
        var closeBtn = document.getElementById('btnCloseVersionPanel');
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                toggleVersionPanel(false);
            });
        }
        var refreshBtn = document.getElementById('btnRefreshVersions');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                loadVersionList();
            });
        }
    }

    function toggleVersionPanel(show) {
        var panel = document.getElementById('versionHistoryPanel');
        if (!panel) return;
        if (show) {
            panel.style.display = 'block';
            loadVersionList();
        } else {
            panel.style.display = 'none';
        }
    }

    async function loadVersionList() {
        var listEl = document.getElementById('versionHistoryList');
        var metaEl = document.getElementById('versionHistoryMeta');
        if (!listEl) return;

        if (typeof buildingId === 'undefined' || !buildingId) {
            listEl.innerHTML = '<p class="hint-text">Chưa chọn tòa nhà — mở editor từ Dashboard.</p>';
            return;
        }
        var floorEl = document.getElementById('floorSelect');
        var floor = floorEl ? floorEl.value : '0';

        listEl.innerHTML = '<p class="hint-text">Đang tải phiên bản…</p>';
        try {
            var res = await apiFetch(BASE_API_URL + '/map-versions/' + buildingId + '/' + floor);
            var data = await res.json().catch(function () { return {}; });
            if (!res.ok) {
                listEl.innerHTML = '<p class="hint-text" style="color:#c0392b">' +
                    (data.message || ('HTTP ' + res.status)) + '</p>';
                return;
            }
            var current = data.current_version;
            if (metaEl) {
                var ret = data.retention || {};
                metaEl.textContent = 'Hiện tại: v' + (current != null ? current : '—') +
                    ' · Lưu: ' + (ret.stored_count != null ? ret.stored_count : '—') +
                    '/' + (ret.max_per_floor != null ? ret.max_per_floor : '—');
            }
            var versions = data.versions || [];
            if (!versions.length) {
                listEl.innerHTML = '<p class="hint-text">Chưa có lịch sử xuất bản.</p>';
                return;
            }
            var html = '<table class="version-history-table"><thead><tr>' +
                '<th>Ver</th><th>Phòng</th><th>Node</th><th>Ai / lúc</th><th></th>' +
                '</tr></thead><tbody>';
            versions.forEach(function (v) {
                var isCurrent = current != null && Number(v.version) === Number(current);
                var who = (v.published_by && v.published_by.email) ? v.published_by.email : '—';
                var when = v.published_at ? new Date(v.published_at).toLocaleString('vi-VN') : '—';
                var btn = isCurrent
                    ? '<span class="hint-text">đang dùng</span>'
                    : ('<button type="button" class="btn btn-sm btn-outline" data-rollback="' +
                        v.version + '" data-full="' + (v.has_full_snapshot ? '1' : '0') +
                        '">Rollback</button>');
                html += '<tr' + (isCurrent ? ' class="version-row-current"' : '') + '>' +
                    '<td><b>v' + v.version + '</b></td>' +
                    '<td>' + (v.rooms_count != null ? v.rooms_count : '—') + '</td>' +
                    '<td>' + (v.nodes_count != null ? v.nodes_count : '—') + '</td>' +
                    '<td style="font-size:11px">' + who + '<br>' + when + '</td>' +
                    '<td>' + btn + '</td></tr>';
            });
            html += '</tbody></table>';
            listEl.innerHTML = html;
            listEl.querySelectorAll('[data-rollback]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var ver = btn.getAttribute('data-rollback');
                    var full = btn.getAttribute('data-full') === '1';
                    rollbackToVersion(ver, full);
                });
            });
        } catch (err) {
            console.error('loadVersionList', err);
            listEl.innerHTML = '<p class="hint-text" style="color:#c0392b">Lỗi kết nối</p>';
        }
    }

    async function rollbackToVersion(version, hasFullSnapshot) {
        if (!buildingId) return;
        var floorEl = document.getElementById('floorSelect');
        var floor = floorEl ? floorEl.value : '0';
        var msg = hasFullSnapshot
            ? ('Rollback về v' + version + '?\nSẽ tạo phiên bản mới từ snapshot đầy đủ.')
            : ('v' + version + ' chỉ có graph — rollback có thể chỉ khôi phục nodes/edges.\nTiếp tục?');
        if (!confirm(msg)) return;

        if (typeof showLoading === 'function') showLoading('Đang rollback…');
        try {
            var res = await apiFetch(
                BASE_API_URL + '/map-versions/' + buildingId + '/' + floor + '/' + version + '/rollback',
                { method: 'POST' }
            );
            var data = await res.json().catch(function () { return {}; });
            if (typeof hideLoading === 'function') hideLoading();
            if (!res.ok) {
                if (typeof showToast === 'function') {
                    showToast(data.message || ('Rollback thất bại HTTP ' + res.status), 'error');
                }
                return;
            }
            var newVer = data.map && data.map.version != null
                ? data.map.version
                : (data.new_version != null ? data.new_version : null);
            var M = vm();
            if (M && typeof M.syncAfterRollback === 'function') {
                M.syncAfterRollback(newVer);
            }
            if (typeof updateEditorMapVersion === 'function') updateEditorMapVersion(newVer);
            renderVersionBadge();
            if (typeof showToast === 'function') {
                showToast(
                    'Đã rollback → v' + (newVer != null ? newVer : '?') +
                    (data.rollback_mode === 'graph_only' ? ' (chỉ graph)' : '') +
                    '. Đang tải lại bản đồ…',
                    'success'
                );
            }
            if (typeof loadMapFromServer === 'function') {
                await loadMapFromServer();
            }
            loadVersionList();
        } catch (err) {
            if (typeof hideLoading === 'function') hideLoading();
            console.error('rollbackToVersion', err);
            if (typeof showToast === 'function') showToast('Lỗi kết nối khi rollback', 'error');
        }
    }

    function markEditorDirty() {
        var M = vm();
        if (M && typeof M.markDirty === 'function') M.markDirty();
        renderVersionBadge();
    }

    window.renderVersionBadge = renderVersionBadge;
    window.initVersionUi = initVersionUi;
    window.markEditorDirty = markEditorDirty;
    window.toggleVersionPanel = toggleVersionPanel;
    window.loadVersionList = loadVersionList;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVersionUi);
    } else {
        setTimeout(initVersionUi, 0);
    }
})();
