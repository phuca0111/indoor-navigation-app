// ============================================================
// EXPLORER-UI.JS — Tab "Dự án": cây Tòa → Tầng + Nhật ký xuất bản (Audit)
// Dùng dữ liệu window.editorBuildingMeta (payload GET /api/buildings/:id):
//   floors[]  — trạng thái từng tầng (published/draft/version)
//   versions[] — lịch sử xuất bản (ai / khi nào / số phòng-nút-cạnh)
// Không tự quản version — chỉ hiển thị. Đổi tầng tái dùng #floorSelect.
// ============================================================
(function () {
    'use strict';

    function qs(sel) { return document.querySelector(sel); }
    function el(tag, cls, txt) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e;
    }

    function floorLabel(fnum, fname) {
        if (fname) return fname;
        var n = parseInt(fnum, 10);
        if (n === 0) return 'Tầng trệt';
        if (Number.isFinite(n)) return 'Tầng ' + n;
        return 'Tầng ' + fnum;
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleString('vi-VN'); } catch (e) { return String(iso); }
    }

    function userName(u) {
        if (!u) return '—';
        if (typeof u === 'string') return u;
        return u.full_name || u.email || '—';
    }

    function currentFloorValue() {
        var sel = qs('#floorSelect');
        return sel ? String(sel.value) : '0';
    }

    // F5 — PATCH add/remove tầng đuôi rồi reload context + explorer.
    var _floorPatchBusy = false;
    async function patchEditorFloorCount(action) {
        if (_floorPatchBusy) return;
        if (!window.buildingId) {
            if (typeof showToast === 'function') showToast('Mở editor từ Dashboard để quản lý tầng.', 'error');
            return;
        }
        var confirmMsg = action === 'add'
            ? 'Thêm 1 tầng ở đuôi (chưa có bản đồ)?'
            : 'Bớt tầng cao nhất? Chỉ thành công nếu tầng đó chưa có bản đồ.';
        if (!window.confirm(confirmMsg)) return;
        _floorPatchBusy = true;
        try {
            var res = await apiFetch(BASE_API_URL + '/buildings/' + window.buildingId + '/floors', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: action })
            });
            var d = await res.json().catch(function () { return {}; });
            if (!res.ok) {
                if (typeof showToast === 'function') showToast(d.message || ('HTTP ' + res.status), 'error');
                return;
            }
            if (typeof showToast === 'function') showToast(d.message || 'Đã cập nhật số tầng.', 'success');
            var sel = qs('#floorSelect');
            var prevFloor = sel ? String(sel.value) : '0';
            if (typeof loadBuildingContext === 'function') await loadBuildingContext();
            // Nếu tầng đang mở bị bớt → select đã nhảy về tầng hợp lệ, cần load lại map.
            if (sel && String(sel.value) !== prevFloor) {
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            refreshExplorerPanel();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Lỗi kết nối!', 'error');
        } finally {
            _floorPatchBusy = false;
        }
    }

    // F6 — nhân bản tầng nguồn thành tầng mới ở đuôi (bản nháp).
    async function duplicateEditorFloor(sourceNum, sourceName) {
        if (_floorPatchBusy) return;
        if (!window.buildingId) {
            if (typeof showToast === 'function') showToast('Mở editor từ Dashboard để quản lý tầng.', 'error');
            return;
        }
        var label = floorLabel(sourceNum, sourceName);
        if (!window.confirm('Nhân bản ' + label + ' thành 1 tầng mới ở đuôi (dạng bản nháp)?')) return;
        _floorPatchBusy = true;
        try {
            var res = await apiFetch(BASE_API_URL + '/buildings/' + window.buildingId + '/floors/duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_floor_number: Number(sourceNum) })
            });
            var d = await res.json().catch(function () { return {}; });
            if (!res.ok) {
                if (typeof showToast === 'function') showToast(d.message || ('HTTP ' + res.status), 'error');
                return;
            }
            if (typeof showToast === 'function') showToast(d.message || 'Đã nhân bản tầng.', 'success');
            if (typeof loadBuildingContext === 'function') await loadBuildingContext();
            refreshExplorerPanel();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Lỗi kết nối!', 'error');
        } finally {
            _floorPatchBusy = false;
        }
    }

    function switchFloor(floor) {
        var sel = qs('#floorSelect');
        if (!sel) return;
        var v = String(floor);
        var exists = Array.prototype.some.call(sel.options, function (o) { return String(o.value) === v; });
        if (!exists) return;
        if (String(sel.value) === v) return;
        sel.value = v;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function getMeta(building) {
        return building || window.editorBuildingMeta || null;
    }

    function isThumbUrl(value) {
        var url = String(value || '').trim();
        if (!url || /^data:/i.test(url)) return false;
        return /^(https?:\/\/|\/)/i.test(url);
    }

    // F4: sau upload Storage — ghi URL vào meta tầng đang mở rồi refresh panel.
    function syncFloorBackgroundThumb(floorNumber, url) {
        if (!isThumbUrl(url)) return;
        var meta = window.editorBuildingMeta;
        if (!meta) return;
        if (!Array.isArray(meta.floors)) meta.floors = [];
        var num = Number(floorNumber);
        var row = meta.floors.find(function (f) { return Number(f.floor_number) === num; });
        if (row) {
            row.background_image = url;
        } else {
            meta.floors.push({ floor_number: num, background_image: url });
        }
        refreshExplorerPanel(meta);
    }

    // Danh sách tầng: ưu tiên meta.floors[], fallback total_floors / #floorSelect
    function resolveFloors(meta) {
        var current = currentFloorValue();
        var liveThumb = isThumbUrl(window.bgLastPersistedUrl)
            ? window.bgLastPersistedUrl
            : (isThumbUrl(window.bgImageBase64) ? window.bgImageBase64 : null);
        if (meta && Array.isArray(meta.floors) && meta.floors.length) {
            return meta.floors.map(function (f) {
                var num = String(f.floor_number);
                var thumb = f.background_image || null;
                // Tầng đang mở: ưu tiên URL vừa upload (chưa kịp reload GET building)
                if (num === current && liveThumb) thumb = liveThumb;
                return {
                    num: num,
                    name: f.floor_name || null,
                    published: !!f.is_published,
                    hasDraft: !!f.has_draft,
                    hasMap: !!f.has_map,
                    version: f.version || 0,
                    rooms: Number(f.rooms_count) || 0,
                    pois: Number(f.pois_count) || 0,
                    nodes: Number(f.nodes_count) || 0,
                    edges: Number(f.edges_count) || 0,
                    statsSource: f.stats_source || 'empty',
                    thumb: isThumbUrl(thumb) ? thumb : null
                };
            });
        }
        var total = parseInt(meta && meta.total_floors, 10);
        if (!Number.isFinite(total) || total < 1) {
            var sel = qs('#floorSelect');
            total = (sel && sel.options && sel.options.length) ? sel.options.length : 1;
        }
        var arr = [];
        for (var i = 0; i < total; i++) {
            arr.push({
                num: String(i), name: null, published: false, hasDraft: false, hasMap: false,
                version: 0, rooms: 0, pois: 0, nodes: 0, edges: 0, statsSource: 'empty', thumb: null
            });
        }
        return arr;
    }

    function orgName(meta) {
        var o = meta && meta.organization;
        if (!o) return null;
        return o.name || o.slug || null;
    }

    // Khối "Thông tin" dự án: tổ chức / địa chỉ / mô tả + số liệu tổng quan.
    function renderBuildingInfo(meta) {
        var wrap = el('div', 'explorer-info');
        var title = el('div', 'explorer-section-title');
        title.appendChild(el('span', null, 'Thông tin'));
        wrap.appendChild(title);

        function row(label, value) {
            if (value == null || value === '') return;
            var r = el('div', 'explorer-info-row');
            r.appendChild(el('span', 'explorer-info-label', label));
            var v = el('span', 'explorer-info-value', String(value));
            v.title = String(value);
            r.appendChild(v);
            wrap.appendChild(r);
        }
        row('Tổ chức', orgName(meta));
        row('Địa chỉ', meta && meta.address);
        row('Mô tả', meta && meta.description);

        var rs = (meta && meta.resource_summary) || {};
        var stats = el('div', 'explorer-info-stats');
        function stat(num, label, title2) {
            var s = el('div', 'explorer-info-stat');
            if (title2) s.title = title2;
            s.appendChild(el('span', 'explorer-info-stat-num', String(num)));
            s.appendChild(el('span', 'explorer-info-stat-label', label));
            stats.appendChild(s);
        }
        var totalFloors = rs.total_floors != null ? rs.total_floors : resolveFloors(meta).length;
        stat(totalFloors, 'Tầng', 'Tổng số tầng');
        stat(rs.published_floor_count || 0, 'Đã XB', 'Số tầng đã xuất bản');
        stat(rs.draft_floor_count || 0, 'Nháp', 'Số tầng có bản nháp');
        stat(rs.qr_count || 0, 'QR', 'Tổng mã QR');
        stat(rs.version_count || 0, 'Phiên bản', 'Tổng phiên bản đã xuất bản');
        wrap.appendChild(stats);
        return wrap;
    }

    function renderFloorTree(root, meta) {
        var floors = resolveFloors(meta);
        var current = currentFloorValue();

        var head = el('div', 'explorer-building');
        var bIcon = el('i'); bIcon.setAttribute('data-lucide', 'building-2'); head.appendChild(bIcon);
        var bName = (meta && meta.name) || 'Tòa nhà';
        var nameSpan = el('span', 'explorer-building-name', bName);
        nameSpan.title = bName; // hover để xem tên đầy đủ (đã cắt bớt bằng …)
        head.appendChild(nameSpan);
        var status = (meta && (meta.workspace_status || meta.status)) || 'DRAFT';
        var badgeClass = 'explorer-badge badge-draft';
        var badgeText = 'Nháp';
        if (status === 'PUBLISHED') { badgeClass = 'explorer-badge badge-pub'; badgeText = 'Đã xuất bản'; }
        else if (status === 'IN_REVIEW') { badgeClass = 'explorer-badge badge-draft'; badgeText = 'Chờ duyệt'; }
        else if (status === 'DEPRECATED') { badgeClass = 'explorer-badge badge-empty'; badgeText = 'Deprecated'; }
        else if (status === 'ARCHIVED') { badgeClass = 'explorer-badge badge-empty'; badgeText = 'Archived'; }
        head.appendChild(el('span', badgeClass, badgeText));
        root.appendChild(head);

        root.appendChild(renderBuildingInfo(meta));

        var section = el('div', 'explorer-floor-manager');
        var sectionTitle = el('div', 'explorer-section-title');
        sectionTitle.appendChild(el('span', null, 'Quản lý tầng'));
        sectionTitle.appendChild(el('span', 'explorer-audit-count', String(floors.length)));
        section.appendChild(sectionTitle);

        // F5 — thêm/bớt tầng đuôi ngay trong Editor (server chặn BUILDING_ADMIN)
        var actions = el('div', 'explorer-floor-actions');
        var addBtn = el('button', 'explorer-floor-action-btn', '+ Thêm tầng');
        addBtn.type = 'button';
        addBtn.title = 'Thêm 1 tầng ở đuôi (chưa có bản đồ)';
        addBtn.addEventListener('click', function () { patchEditorFloorCount('add'); });
        var removeBtn = el('button', 'explorer-floor-action-btn', '− Bớt tầng');
        removeBtn.type = 'button';
        removeBtn.title = 'Bớt tầng cao nhất — chỉ khi tầng đó chưa có bản đồ';
        removeBtn.addEventListener('click', function () { patchEditorFloorCount('remove'); });
        actions.appendChild(addBtn);
        actions.appendChild(removeBtn);
        section.appendChild(actions);

        var list = el('div', 'explorer-floors');
        floors.forEach(function (f) {
            var item = el('button', 'explorer-floor' + (f.num === current ? ' active' : ''));
            item.type = 'button';
            item.setAttribute('data-floor', f.num);
            item.setAttribute('aria-current', f.num === current ? 'true' : 'false');

            // F4 — thumbnail ảnh nền tầng (chỉ khi backend trả URL hợp lệ)
            if (f.thumb) {
                var thumbWrap = el('div', 'explorer-floor-thumb');
                var img = document.createElement('img');
                img.src = f.thumb;
                img.alt = '';
                img.loading = 'lazy';
                img.addEventListener('error', function () {
                    thumbWrap.remove();
                    item.classList.remove('has-thumb');
                });
                thumbWrap.appendChild(img);
                item.appendChild(thumbWrap);
                item.classList.add('has-thumb');
            }

            var body = el('div', 'explorer-floor-body');
            var main = el('div', 'explorer-floor-main');
            var ic = el('i'); ic.setAttribute('data-lucide', 'layers'); main.appendChild(ic);
            var fLabel = floorLabel(f.num, f.name);
            var fNameSpan = el('span', 'explorer-floor-name', fLabel);
            fNameSpan.title = fLabel;
            main.appendChild(fNameSpan);
            var badges = el('span', 'explorer-floor-badges');
            if (f.num === current) badges.appendChild(el('span', 'explorer-badge badge-current', 'Đang mở'));
            if (f.published) badges.appendChild(el('span', 'explorer-badge badge-pub', 'v' + f.version));
            else if (f.hasDraft) badges.appendChild(el('span', 'explorer-badge badge-draft', 'Nháp'));
            else if (!f.hasMap) badges.appendChild(el('span', 'explorer-badge badge-empty', 'Trống'));

            // F6 — nhân bản tầng (chỉ khi tầng có nội dung để copy)
            var hasContent = f.published || f.hasDraft || f.hasMap
                || f.rooms > 0 || f.pois > 0 || f.nodes > 0;
            if (hasContent) {
                var dup = el('span', 'explorer-floor-dup');
                dup.setAttribute('role', 'button');
                dup.setAttribute('tabindex', '0');
                dup.title = 'Nhân bản tầng này thành tầng mới ở đuôi';
                var dupIcon = el('i'); dupIcon.setAttribute('data-lucide', 'copy');
                dup.appendChild(dupIcon);
                var stopThen = function (e) {
                    e.stopPropagation();
                    e.preventDefault();
                    duplicateEditorFloor(f.num, f.name);
                };
                dup.addEventListener('click', stopThen);
                dup.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') stopThen(e);
                });
                badges.appendChild(dup);
            }
            main.appendChild(badges);
            body.appendChild(main);

            var stats = el('div', 'explorer-floor-stats');
            stats.title = f.statsSource === 'draft'
                ? 'Số liệu từ bản nháp'
                : (f.statsSource === 'published' ? 'Số liệu bản đã xuất bản' : 'Chưa có dữ liệu');
            stats.appendChild(el('span', null, f.rooms + ' phòng'));
            stats.appendChild(el('span', null, f.pois + ' POI'));
            stats.appendChild(el('span', null, f.nodes + ' nút'));
            body.appendChild(stats);
            item.appendChild(body);

            item.addEventListener('click', function () { switchFloor(f.num); });
            list.appendChild(item);
        });
        section.appendChild(list);
        root.appendChild(section);
    }

    function renderAudit(root, meta) {
        var versions = (meta && Array.isArray(meta.versions)) ? meta.versions : [];
        var section = el('div', 'explorer-audit');
        var title = el('div', 'explorer-section-title');
        title.appendChild(el('span', null, 'Nhật ký xuất bản'));
        title.appendChild(el('span', 'explorer-audit-count', String(versions.length)));
        section.appendChild(title);

        if (!versions.length) {
            section.appendChild(el('p', 'hint-text', 'Chưa có lần xuất bản nào.'));
            root.appendChild(section);
            return;
        }

        var listWrap = el('div', 'explorer-audit-list');
        versions.slice(0, 50).forEach(function (v) {
            var row = el('div', 'explorer-audit-row');
            var top = el('div', 'explorer-audit-top');
            top.appendChild(el('span', 'explorer-audit-floor',
                floorLabel(v.floor_number, null) + ' · v' + (v.version != null ? v.version : '?')));
            top.appendChild(el('span', 'explorer-audit-when', fmtDate(v.published_at)));
            row.appendChild(top);
            row.appendChild(el('div', 'explorer-audit-who', 'Bởi: ' + userName(v.published_by)));
            var c = [];
            if (v.rooms_count != null) c.push(v.rooms_count + ' phòng');
            if (v.nodes_count != null) c.push(v.nodes_count + ' nút');
            if (v.edges_count != null) c.push(v.edges_count + ' cạnh');
            if (c.length) row.appendChild(el('div', 'explorer-audit-counts', c.join(' · ')));
            listWrap.appendChild(row);
        });
        section.appendChild(listWrap);
        root.appendChild(section);
    }

    function updateLastPublishFooter(meta) {
        var footer = qs('#statusLastPublish');
        if (!footer) return;
        var versions = (meta && Array.isArray(meta.versions)) ? meta.versions : [];
        var latest = versions[0] || null;
        var at = (meta && meta.resource_summary && meta.resource_summary.latest_publish_at) ||
            (latest && latest.published_at) || null;
        if (!at) { footer.textContent = ''; footer.title = ''; return; }
        var who = latest ? userName(latest.published_by) : '—';
        footer.textContent = 'Xuất bản: ' + who + ' · ' + fmtDate(at);
        footer.title = 'Lần xuất bản gần nhất';
    }

    function refreshExplorerPanel(building) {
        var meta = getMeta(building);
        updateLastPublishFooter(meta);
        var root = qs('#explorerRoot');
        if (!root) return;
        root.innerHTML = '';
        if (!meta || (!meta.name && !window.buildingId)) {
            root.appendChild(el('p', 'hint-text',
                'Chưa có thông tin tòa nhà. Mở editor từ Dashboard để xem cây tòa/tầng và nhật ký xuất bản.'));
            return;
        }
        renderFloorTree(root, meta);
        renderAudit(root, meta);
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            try { window.lucide.createIcons(); } catch (e) { /* noop */ }
        }
    }

    function initExplorerUi() {
        var sel = qs('#floorSelect');
        if (sel && !sel._explorerBound) {
            sel._explorerBound = true;
            sel.addEventListener('change', function () { refreshExplorerPanel(); });
        }
        refreshExplorerPanel();
    }

    // Export (cả cho runtime lẫn test)
    window.refreshExplorerPanel = refreshExplorerPanel;
    window.syncFloorBackgroundThumb = syncFloorBackgroundThumb;
    window.initExplorerUi = initExplorerUi;
    window.ExplorerUI = {
        refreshExplorerPanel: refreshExplorerPanel,
        syncFloorBackgroundThumb: syncFloorBackgroundThumb,
        updateLastPublishFooter: updateLastPublishFooter,
        resolveFloors: resolveFloors,
        renderBuildingInfo: renderBuildingInfo,
        orgName: orgName,
        floorLabel: floorLabel,
        userName: userName,
        fmtDate: fmtDate
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExplorerUi);
    } else {
        initExplorerUi();
    }
})();
