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

    // Danh sách tầng: ưu tiên meta.floors[], fallback total_floors / #floorSelect
    function resolveFloors(meta) {
        if (meta && Array.isArray(meta.floors) && meta.floors.length) {
            return meta.floors.map(function (f) {
                return {
                    num: String(f.floor_number),
                    name: f.floor_name || null,
                    published: !!f.is_published,
                    hasDraft: !!f.has_draft,
                    hasMap: !!f.has_map,
                    version: f.version || 0
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
            arr.push({ num: String(i), name: null, published: false, hasDraft: false, hasMap: false, version: 0 });
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
        var status = (meta && meta.status) || 'DRAFT';
        head.appendChild(el('span',
            'explorer-badge ' + (status === 'PUBLISHED' ? 'badge-pub' : 'badge-draft'),
            status === 'PUBLISHED' ? 'Đã xuất bản' : 'Nháp'));
        root.appendChild(head);

        root.appendChild(renderBuildingInfo(meta));

        var list = el('div', 'explorer-floors');
        floors.forEach(function (f) {
            var item = el('button', 'explorer-floor' + (f.num === current ? ' active' : ''));
            item.type = 'button';
            item.setAttribute('data-floor', f.num);
            var ic = el('i'); ic.setAttribute('data-lucide', 'layers'); item.appendChild(ic);
            var fLabel = floorLabel(f.num, f.name);
            var fNameSpan = el('span', 'explorer-floor-name', fLabel);
            fNameSpan.title = fLabel;
            item.appendChild(fNameSpan);
            var badges = el('span', 'explorer-floor-badges');
            if (f.published) badges.appendChild(el('span', 'explorer-badge badge-pub', 'v' + f.version));
            else if (f.hasDraft) badges.appendChild(el('span', 'explorer-badge badge-draft', 'Nháp'));
            else if (!f.hasMap) badges.appendChild(el('span', 'explorer-badge badge-empty', 'Trống'));
            item.appendChild(badges);
            item.addEventListener('click', function () { switchFloor(f.num); });
            list.appendChild(item);
        });
        root.appendChild(list);
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
    window.initExplorerUi = initExplorerUi;
    window.ExplorerUI = {
        refreshExplorerPanel: refreshExplorerPanel,
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
