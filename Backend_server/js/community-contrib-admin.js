// ============================================================
// Đóng góp cộng đồng — chỉ đề xuất (OUTDOOR / INDOOR)
// Báo cáo địa điểm → PlaceReportsAdmin (tab riêng)
// ============================================================

(function (global) {
  const API = '/api';

  function token() {
    return localStorage.getItem('token') || '';
  }

  function headers(json) {
    const h = { Authorization: 'Bearer ' + token() };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shortId(id) {
    const s = String(id || '');
    if (!s) return '—';
    if (s.length <= 12) return s;
    return s.slice(0, 6) + '…' + s.slice(-4);
  }

  function fmtDate(v) {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('vi-VN');
    } catch (_) {
      return String(v);
    }
  }

  const TYPE_LABEL = {
    ADD_POI: 'Thêm POI',
    FIX_LOCATION: 'Sửa vị trí',
    FIX_INFO: 'Sửa thông tin',
    OTHER: 'Khác'
  };

  const SCOPE_LABEL = {
    OUTDOOR: 'Ngoài trời',
    INDOOR: 'Trong nhà'
  };

  async function loadAll() {
    await loadContributions();
  }

  async function loadContributions() {
    const tbody = document.getElementById('ccContribList');
    const meta = document.getElementById('ccContribMeta');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="admin-table-loading-cell">Đang tải đề xuất…</td></tr>';
    try {
      const status = document.getElementById('ccFilterContribStatus')?.value || 'PENDING';
      const type = document.getElementById('ccFilterContribType')?.value || '';
      const scope = document.getElementById('ccFilterMapScope')?.value || '';
      const params = new URLSearchParams();
      if (status && status !== 'ALL') params.set('status', status);
      if (type) params.set('type', type);
      if (scope) params.set('map_scope', scope);
      params.set('limit', '80');
      const res = await fetch(API + '/map-contributions?' + params.toString(), { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải được đề xuất');
      const rows = data.contributions || [];
      if (meta) meta.textContent = 'Số đề xuất: ' + rows.length;
      if (!rows.length) {
        if (tbody) {
          tbody.innerHTML =
            '<tr><td colspan="8" class="analytics-muted">Không có đề xuất trong bộ lọc này.</td></tr>';
        }
        return;
      }
      tbody.innerHTML = rows.map((c) => {
        const loc =
          c.latitude != null && c.longitude != null
            ? Number(c.latitude).toFixed(5) + ', ' + Number(c.longitude).toFixed(5)
            : '—';
        const pending = c.status === 'PENDING';
        const actions = pending
          ? (
            '<button type="button" class="btn-create" onclick="CommunityContribAdmin.approveContrib(\'' + c._id + '\')">Duyệt</button> ' +
            '<button type="button" class="btn-logout" style="background:#b91c1c;" onclick="CommunityContribAdmin.rejectContrib(\'' + c._id + '\')">Từ chối</button>'
          )
          : (
            '<span style="font-size:12px;color:#667085;">' +
            escapeHtml(c.status) +
            (c.reject_reason ? ' — ' + escapeHtml(c.reject_reason) : '') +
            '</span>'
          );
        return (
          '<tr>' +
          '<td><strong>' + escapeHtml(c.title) + '</strong>' +
            (c.poi_kind ? '<div style="font-size:11px;color:#667085;">' + escapeHtml(c.poi_kind) + '</div>' : '') +
            (c.description ? '<div style="font-size:11px;color:#94a3b8;max-width:220px;" title="' + escapeHtml(c.description) + '">' + escapeHtml(c.description.slice(0, 80)) + (c.description.length > 80 ? '…' : '') + '</div>' : '') +
          '</td>' +
          '<td>' + escapeHtml(SCOPE_LABEL[c.map_scope] || c.map_scope || 'OUTDOOR') + '</td>' +
          '<td>' + escapeHtml(TYPE_LABEL[c.type] || c.type) + '</td>' +
          '<td style="font-size:12px;" title="' + escapeHtml(String(c.building_id || c.place_id || '')) + '">' +
            (c.building_id ? 'Tòa ' + escapeHtml(shortId(c.building_id)) : '') +
            (c.building_id && c.place_id ? '<br>' : '') +
            (c.place_id ? 'Place ' + escapeHtml(shortId(c.place_id)) : '') +
            (!c.building_id && !c.place_id ? '—' : '') +
            (c.floor_number != null ? '<div style="font-size:11px;color:#667085;">Tầng ' + escapeHtml(String(c.floor_number)) + '</div>' : '') +
          '</td>' +
          '<td style="font-size:12px;">' + escapeHtml(loc) + '</td>' +
          '<td>' + escapeHtml(c.status) + '</td>' +
          '<td style="font-size:12px;">' + escapeHtml(fmtDate(c.createdAt)) + '</td>' +
          '<td style="white-space:nowrap;">' + actions + '</td>' +
          '</tr>'
        );
      }).join('');
    } catch (e) {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
      }
      if (meta) meta.textContent = '';
    }
  }

  async function approveContrib(id) {
    if (!confirm('Duyệt đề xuất này?\n\nLưu ý: Platform chỉ duyệt — áp vào map vẫn làm trong Editor.')) return;
    try {
      const res = await fetch(API + '/map-contributions/' + id + '/approve', {
        method: 'POST',
        headers: headers(true),
        body: '{}'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Duyệt thất bại');
      alert(data.message || 'Đã duyệt.');
      await loadContributions();
    } catch (e) {
      alert(e.message);
    }
  }

  async function rejectContrib(id) {
    const reason = prompt('Lý do từ chối (vd: Sai vị trí):', 'Sai vị trí');
    if (reason == null) return;
    try {
      const res = await fetch(API + '/map-contributions/' + id + '/reject', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ reason: reason || 'Từ chối' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Từ chối thất bại');
      alert(data.message || 'Đã từ chối.');
      await loadContributions();
    } catch (e) {
      alert(e.message);
    }
  }

  async function openCreateContrib() {
    const scope = prompt('Phạm vi map: OUTDOOR | INDOOR', 'OUTDOOR') || 'OUTDOOR';
    const title = prompt('Tiêu đề (vd: Thêm WC / Sửa cổng vào):', scope.toUpperCase() === 'INDOOR' ? 'Thêm WC' : 'Sửa thông tin địa điểm');
    if (!title) return;
    const type = prompt('Loại: ADD_POI | FIX_LOCATION | FIX_INFO | OTHER', 'ADD_POI') || 'ADD_POI';
    const poi_kind = prompt('Loại POI (vd: WC) — để trống nếu không cần:', scope.toUpperCase() === 'INDOOR' ? 'WC' : '') || '';
    const place_id = prompt('place_id (OUTDOOR khuyến nghị):', '') || null;
    const building_id = prompt('building_id (bắt buộc nếu INDOOR):', '') || null;
    const floor = prompt('Số tầng (INDOOR):', scope.toUpperCase() === 'INDOOR' ? '1' : '');
    try {
      const body = {
        type: String(type).toUpperCase(),
        map_scope: String(scope).toUpperCase(),
        title,
        poi_kind,
        description: 'Đề xuất thử từ admin',
        place_id: place_id || undefined,
        building_id: building_id || undefined,
        floor_number: floor !== '' && floor != null ? Number(floor) : undefined
      };
      const res = await fetch(API + '/map-contributions', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Gửi thất bại');
      alert(data.message || 'Đã gửi.');
      const statusEl = document.getElementById('ccFilterContribStatus');
      if (statusEl) statusEl.value = 'PENDING';
      await loadContributions();
    } catch (e) {
      alert(e.message);
    }
  }

  global.CommunityContribAdmin = {
    loadAll,
    loadContributions,
    approveContrib,
    rejectContrib,
    openCreateContrib
  };
})(window);
