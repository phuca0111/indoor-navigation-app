// ============================================================
// Báo cáo địa điểm — PlaceReport (outdoor) + IndoorReport (phòng/POI)
// ============================================================

(function (global) {
  const API_OUTDOOR = '/api/place-platform';
  const API_INDOOR = '/api/indoor-places';

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

  function fmtDate(v) {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('vi-VN');
    } catch (_) {
      return String(v);
    }
  }

  const REASON_LABEL = {
    WRONG_LOCATION: 'Sai vị trí',
    WRONG_NAME: 'Sai tên',
    WRONG_FLOOR: 'Sai tầng',
    QR_INVALID: 'QR lỗi',
    ROUTE_ERROR: 'Lỗi đường đi',
    SPAM: 'Spam',
    DUPLICATE: 'Trùng',
    CLOSED: 'Đã đóng cửa',
    OTHER: 'Khác'
  };

  async function loadAll() {
    await loadReports();
  }

  function buildParams() {
    const status = document.getElementById('prFilterStatus')?.value || 'OPEN';
    const reason = document.getElementById('prFilterReason')?.value || '';
    const params = new URLSearchParams();
    // Map CLOSED → RESOLVED for indoor (enum); outdoor close accepts CLOSED in UI historically
    let st = status;
    if (st === 'CLOSED') st = 'RESOLVED';
    if (status) params.set('status', status === 'CLOSED' ? 'RESOLVED' : status);
    // For outdoor PlaceReport, CLOSED might be stored as RESOLVED — also try ALL if needed
    if (status === 'CLOSED') {
      // outdoor may still use RESOLVED; keep as RESOLVED
      params.set('status', 'RESOLVED');
    }
    if (reason) params.set('reason_code', reason);
    params.set('limit', '80');
    return params;
  }

  async function fetchOutdoor() {
    const params = buildParams();
    // Outdoor: OPEN / RESOLVED / DISMISSED / ALL — map CLOSED filter to RESOLVED
    const status = document.getElementById('prFilterStatus')?.value || 'OPEN';
    if (status === 'CLOSED') {
      params.set('status', 'RESOLVED');
    }
    const res = await fetch(API_OUTDOOR + '/admin/reports?' + params.toString(), {
      headers: headers()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không tải báo cáo outdoor');
    return (data.reports || []).map((r) => ({
      ...r,
      scope: 'OUTDOOR',
      _api: 'outdoor'
    }));
  }

  async function fetchIndoor() {
    const params = buildParams();
    const res = await fetch(API_INDOOR + '/admin/reports?' + params.toString(), {
      headers: headers()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không tải báo cáo indoor');
    return (data.reports || []).map((r) => ({
      ...r,
      scope: 'INDOOR',
      _api: 'indoor'
    }));
  }

  async function loadReports() {
    const tbody = document.getElementById('prReportList');
    const meta = document.getElementById('prReportMeta');
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="admin-table-loading-cell">Đang tải báo cáo…</td></tr>';
    }
    try {
      const scope = document.getElementById('prFilterScope')?.value || 'ALL';
      let rows = [];
      if (scope === 'OUTDOOR' || scope === 'ALL') {
        rows = rows.concat(await fetchOutdoor());
      }
      if (scope === 'INDOOR' || scope === 'ALL') {
        rows = rows.concat(await fetchIndoor());
      }
      rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      if (meta) {
        meta.textContent =
          'Số báo cáo: ' +
          rows.length +
          (scope === 'ALL' ? ' (ngoài trời + trong nhà)' : scope === 'INDOOR' ? ' (trong nhà)' : ' (ngoài trời)');
      }
      if (!rows.length) {
        if (tbody) {
          tbody.innerHTML =
            '<tr><td colspan="7" class="analytics-muted">Không có báo cáo.</td></tr>';
        }
        return;
      }
      tbody.innerHTML = rows
        .map((r) => {
          const isIndoor = r.scope === 'INDOOR' || r._api === 'indoor';
          const title = isIndoor
            ? (r.entity_name || '—') +
              (r.building_name ? ' · ' + r.building_name : '') +
              (r.floor_number != null ? ' · T' + r.floor_number : '')
            : r.place?.name || '—';
          const sub = isIndoor
            ? (r.entity_kind || '') + ' #' + (r.entity_id || '')
            : r.place?.slug || '';
          const reporter = r.reported_by?.email || r.reported_by?.full_name || '—';
          const open = r.status === 'OPEN';
          const closeFn = isIndoor ? 'closeIndoorReport' : 'closeReport';
          const actions = open
            ? (
              '<button type="button" class="btn-create" onclick="PlaceReportsAdmin.' +
              closeFn +
              '(\'' +
              r._id +
              '\',\'RESOLVED\')">Đóng / xử lý</button> ' +
              '<button type="button" class="btn-edit" onclick="PlaceReportsAdmin.' +
              closeFn +
              '(\'' +
              r._id +
              '\',\'DISMISSED\')">Bỏ qua</button>'
            )
            : (
              '<span style="font-size:12px;color:#667085;">' +
              escapeHtml(r.status) +
              (r.resolver_note ? ' — ' + escapeHtml(r.resolver_note) : '') +
              '</span>'
            );
          return (
            '<tr>' +
            '<td><strong>' +
            escapeHtml(title) +
            '</strong>' +
            (sub
              ? '<div style="font-size:11px;color:#667085;">' + escapeHtml(sub) + '</div>'
              : '') +
            '</td>' +
            '<td><span style="font-size:11px;padding:2px 6px;border-radius:4px;background:' +
            (isIndoor ? '#e8f0fe' : '#f1f3f4') +
            ';">' +
            (isIndoor ? 'Trong nhà' : 'Ngoài trời') +
            '</span></td>' +
            '<td>' +
            escapeHtml(REASON_LABEL[r.reason_code] || r.reason_code || '—') +
            '</td>' +
            '<td style="font-size:12px;max-width:240px;" title="' +
            escapeHtml(r.detail || '') +
            '">' +
            escapeHtml((r.detail || '—').slice(0, 100)) +
            ((r.detail || '').length > 100 ? '…' : '') +
            '</td>' +
            '<td style="font-size:12px;">' +
            escapeHtml(reporter) +
            '</td>' +
            '<td style="font-size:12px;">' +
            escapeHtml(fmtDate(r.createdAt)) +
            '</td>' +
            '<td style="white-space:nowrap;">' +
            actions +
            '</td>' +
            '</tr>'
          );
        })
        .join('');
    } catch (e) {
      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="7" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
      }
      if (meta) meta.textContent = '';
    }
  }

  async function closeReport(id, status) {
    const note = prompt(
      status === 'DISMISSED' ? 'Ghi chú bỏ qua (tuỳ chọn):' : 'Ghi chú xử lý (tuỳ chọn):',
      ''
    );
    if (note == null) return;
    try {
      const res = await fetch(API_OUTDOOR + '/reports/' + id + '/close', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ status: status || 'RESOLVED', note: note || '' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Xử lý thất bại');
      alert(data.message || 'Đã cập nhật báo cáo.');
      await loadReports();
    } catch (e) {
      alert(e.message);
    }
  }

  async function closeIndoorReport(id, status) {
    const note = prompt(
      status === 'DISMISSED' ? 'Ghi chú bỏ qua (tuỳ chọn):' : 'Ghi chú xử lý (tuỳ chọn):',
      ''
    );
    if (note == null) return;
    try {
      const res = await fetch(API_INDOOR + '/reports/' + id + '/close', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ status: status || 'RESOLVED', note: note || '' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Xử lý thất bại');
      alert(data.message || 'Đã cập nhật báo cáo.');
      await loadReports();
    } catch (e) {
      alert(e.message);
    }
  }

  global.PlaceReportsAdmin = {
    loadAll,
    loadReports,
    closeReport,
    closeIndoorReport
  };
})(window);
