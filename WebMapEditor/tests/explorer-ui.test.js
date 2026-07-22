// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

function setupDom() {
    document.body.innerHTML = [
        '<select id="floorSelect">',
        '  <option value="0">Tầng trệt</option>',
        '  <option value="1">Tầng 1</option>',
        '  <option value="2">Tầng 2</option>',
        '</select>',
        '<div id="explorerRoot"></div>',
        '<span id="statusLastPublish"></span>'
    ].join('');
}

var EX;
beforeAll(async function () {
    setupDom();
    window.buildingId = 'b1';
    await import('../js/explorer-ui.js');
    EX = window.ExplorerUI;
});

beforeEach(function () {
    setupDom();
    window.buildingId = 'b1';
    window.editorBuildingMeta = null;
});

function metaFull() {
    return {
        name: 'Tòa A',
        status: 'PUBLISHED',
        total_floors: 3,
        floors: [
            { floor_number: 0, floor_name: 'Tầng trệt', is_published: true, has_draft: false, has_map: true, version: 3 },
            { floor_number: 1, is_published: false, has_draft: true, has_map: true, version: 0 },
            { floor_number: 2, is_published: false, has_draft: false, has_map: false, version: 0 }
        ],
        versions: [
            { floor_number: 0, version: 3, published_at: '2026-07-18T10:00:00Z', published_by: { full_name: 'An Nguyễn', email: 'an@x.vn' }, rooms_count: 5, nodes_count: 8, edges_count: 7 },
            { floor_number: 0, version: 2, published_at: '2026-07-17T09:00:00Z', published_by: { email: 'binh@x.vn' } }
        ],
        resource_summary: { latest_publish_at: '2026-07-18T10:00:00Z' }
    };
}

describe('ExplorerUI — cây tòa/tầng + nhật ký xuất bản', function () {
    it('resolveFloors đọc từ meta.floors[]', function () {
        var fs = EX.resolveFloors(metaFull());
        expect(fs.length).toBe(3);
        expect(fs[0].published).toBe(true);
        expect(fs[0].version).toBe(3);
        expect(fs[1].hasDraft).toBe(true);
        expect(fs[2].hasMap).toBe(false);
    });

    it('resolveFloors fallback theo total_floors khi thiếu floors[]', function () {
        var fs = EX.resolveFloors({ total_floors: 4 });
        expect(fs.length).toBe(4);
        expect(fs.every(function (f) { return !f.published && !f.hasMap; })).toBe(true);
    });

    it('resolveFloors fallback theo #floorSelect khi không có total_floors', function () {
        var fs = EX.resolveFloors({});
        expect(fs.length).toBe(3); // 3 option trong select
    });

    it('floorLabel / userName / fmtDate', function () {
        expect(EX.floorLabel(0, null)).toBe('Tầng trệt');
        expect(EX.floorLabel(2, null)).toBe('Tầng 2');
        expect(EX.floorLabel(1, 'Lầu G')).toBe('Lầu G');
        expect(EX.userName({ full_name: 'An', email: 'a@x' })).toBe('An');
        expect(EX.userName({ email: 'a@x' })).toBe('a@x');
        expect(EX.userName(null)).toBe('—');
        expect(EX.fmtDate(null)).toBe('—');
        expect(EX.fmtDate('2026-07-18T10:00:00Z')).not.toBe('—');
    });

    it('render cây tầng: đủ 3 tầng + badge published/nháp/trống', function () {
        EX.refreshExplorerPanel(metaFull());
        var root = document.getElementById('explorerRoot');
        var floors = root.querySelectorAll('.explorer-floor');
        expect(floors.length).toBe(3);
        expect(root.querySelector('.explorer-building-name').textContent).toBe('Tòa A');
        // Badge tầng trệt = v3, tầng 1 = Nháp, tầng 2 = Trống
        expect(root.textContent).toContain('v3');
        expect(root.textContent).toContain('Nháp');
        expect(root.textContent).toContain('Trống');
    });

    it('render khối Thông tin: tổ chức/địa chỉ + số liệu tổng quan', function () {
        var meta = Object.assign(metaFull(), {
            organization: { name: 'ĐH Bách Khoa' },
            address: '268 Lý Thường Kiệt, Q10',
            resource_summary: {
                total_floors: 3, published_floor_count: 1, draft_floor_count: 1,
                qr_count: 12, version_count: 4, latest_publish_at: '2026-07-18T10:00:00Z'
            }
        });
        EX.refreshExplorerPanel(meta);
        var root = document.getElementById('explorerRoot');
        var info = root.querySelector('.explorer-info');
        expect(info).not.toBeNull();
        expect(info.textContent).toContain('ĐH Bách Khoa');
        expect(info.textContent).toContain('268 Lý Thường Kiệt');
        var stats = info.querySelectorAll('.explorer-info-stat');
        expect(stats.length).toBe(5);
        expect(info.textContent).toContain('12'); // QR
        expect(info.textContent).toContain('Phiên bản');
    });

    it('renderBuildingInfo bỏ qua trường thiếu (không org/địa chỉ)', function () {
        var info = EX.renderBuildingInfo({ total_floors: 2 });
        expect(info.textContent).not.toContain('Tổ chức');
        expect(info.querySelectorAll('.explorer-info-stat').length).toBe(5);
        expect(EX.orgName({ organization: { name: 'X' } })).toBe('X');
        expect(EX.orgName({})).toBeNull();
    });

    it('tầng hiện tại (#floorSelect) được đánh dấu active', function () {
        document.getElementById('floorSelect').value = '1';
        EX.refreshExplorerPanel(metaFull());
        var active = document.querySelectorAll('.explorer-floor.active');
        expect(active.length).toBe(1);
        expect(active[0].getAttribute('data-floor')).toBe('1');
    });

    it('render nhật ký xuất bản: đúng số dòng + ai/khi nào', function () {
        EX.refreshExplorerPanel(metaFull());
        var rows = document.querySelectorAll('.explorer-audit-row');
        expect(rows.length).toBe(2);
        expect(document.querySelector('.explorer-audit-count').textContent).toBe('2');
        expect(document.getElementById('explorerRoot').textContent).toContain('An Nguyễn');
        expect(document.getElementById('explorerRoot').textContent).toContain('5 phòng');
    });

    it('footer #statusLastPublish hiển thị người + thời gian gần nhất', function () {
        EX.refreshExplorerPanel(metaFull());
        var footer = document.getElementById('statusLastPublish');
        expect(footer.textContent).toContain('An Nguyễn');
        expect(footer.textContent.startsWith('Xuất bản:')).toBe(true);
    });

    it('chưa xuất bản lần nào → hint + footer trống', function () {
        EX.refreshExplorerPanel({ name: 'Tòa B', status: 'DRAFT', total_floors: 2, floors: [], versions: [] });
        expect(document.getElementById('explorerRoot').textContent).toContain('Chưa có lần xuất bản');
        expect(document.getElementById('statusLastPublish').textContent).toBe('');
    });

    it('không có meta + không có buildingId → hint mở từ Dashboard', function () {
        window.buildingId = null;
        EX.refreshExplorerPanel(null);
        expect(document.getElementById('explorerRoot').textContent).toContain('Dashboard');
    });
});
