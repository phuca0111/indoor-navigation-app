// ============================================================
// Map Governance P0 — Places UI (Super Admin)
// Load sau dashboard.js; gọi qua window.MapGovernance
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

  let cache = [];
  let selectedId = null;

  async function loadPlaces() {
    const tbody = document.getElementById('placesList');
    const meta = document.getElementById('placesMeta');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" class="admin-table-loading-cell">Đang tải địa điểm…</td></tr>';
    }
    try {
      const q = document.getElementById('filterPlaceKeyword')?.value?.trim() || '';
      const status = document.getElementById('filterPlaceStatus')?.value || '';
      const verified = document.getElementById('filterPlaceVerified')?.value || '';
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      if (verified) params.set('verified', verified);
      params.set('limit', '100');

      const res = await fetch(API + '/places?' + params.toString(), { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải được danh sách địa điểm');

      cache = data.places || [];
      if (meta) meta.textContent = 'Tổng: ' + (data.total || cache.length) + ' địa điểm';
      renderTable();
    } catch (e) {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
      }
      if (meta) meta.textContent = '';
    }
  }

  function renderTable() {
    const tbody = document.getElementById('placesList');
    if (!tbody) return;
    if (!cache.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="analytics-muted">Chưa có địa điểm. Tạo mới hoặc chạy backfill-places.js</td></tr>';
      return;
    }
    tbody.innerHTML = cache.map((p) => {
      const gps = (Number(p.latitude) || 0).toFixed(5) + ', ' + (Number(p.longitude) || 0).toFixed(5);
      const aliases = (p.aliases || []).slice(0, 3).join(', ') || '—';
      const verified = p.verified ? '<span class="badge" style="background:#d1fae5;color:#065f46;">Đã xác minh</span>' : '—';
      return (
        '<tr>' +
        '<td title="' + escapeHtml(p.name) + '"><strong>' + escapeHtml(p.name) + '</strong></td>' +
        '<td>' + escapeHtml(aliases) + '</td>' +
        '<td>' + escapeHtml(p.category || '—') + '</td>' +
        '<td style="font-size:12px;">' + escapeHtml(gps) + '</td>' +
        '<td>' + escapeHtml(p.status || '') + '</td>' +
        '<td>' + verified + '</td>' +
        '<td>' + (p.building_count || 0) + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn-edit" onclick="MapGovernance.openEdit(\'' + p._id + '\')">Sửa</button> ' +
          '<button type="button" class="btn-edit" style="background:#2563eb;" onclick="MapGovernance.openDetail(\'' + p._id + '\')">Chi tiết</button> ' +
          '<button type="button" class="btn-edit" style="background:#059669;" onclick="MapGovernance.requestVerify(\'' + p._id + '\')">Gửi XM</button> ' +
          '<button type="button" class="btn-logout" style="background:#b91c1c;" onclick="MapGovernance.lockPlace(\'' + p._id + '\')">Khóa</button>' +
        '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function openCreate() {
    selectedId = null;
    fillForm({
      name: '',
      aliases: [],
      latitude: 0,
      longitude: 0,
      address: '',
      category: '',
      status: 'ACTIVE',
      verified: false,
      notes: ''
    });
    const title = document.getElementById('placeModalTitle');
    if (title) title.textContent = 'Thêm địa điểm';
    document.getElementById('placeModal')?.classList.add('show');
    const modal = document.getElementById('placeModal');
    if (modal) modal.style.display = 'flex';
  }

  function openEdit(id) {
    const p = cache.find((x) => String(x._id) === String(id));
    if (!p) {
      openDetail(id).then(() => {
        const found = cache.find((x) => String(x._id) === String(id));
        if (found) openEdit(id);
      });
      return;
    }
    selectedId = id;
    fillForm(p);
    const title = document.getElementById('placeModalTitle');
    if (title) title.textContent = 'Sửa địa điểm';
    const modal = document.getElementById('placeModal');
    if (modal) modal.style.display = 'flex';
  }

  function fillForm(p) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val == null ? '' : val;
    };
    set('placeFormName', p.name || '');
    set('placeFormAliases', Array.isArray(p.aliases) ? p.aliases.join(', ') : '');
    set('placeFormLat', p.latitude ?? 0);
    set('placeFormLng', p.longitude ?? 0);
    set('placeFormAddress', p.address || '');
    set('placeFormCategory', p.category || '');
    set('placeFormStatus', p.status || 'ACTIVE');
    set('placeFormNotes', p.notes || '');
    const ver = document.getElementById('placeFormVerified');
    if (ver) ver.checked = !!p.verified;
  }

  function closeModal() {
    const modal = document.getElementById('placeModal');
    if (modal) modal.style.display = 'none';
    selectedId = null;
  }

  async function savePlace(ev) {
    if (ev) ev.preventDefault();
    const payload = {
      name: document.getElementById('placeFormName')?.value?.trim() || '',
      aliases: document.getElementById('placeFormAliases')?.value || '',
      latitude: Number(document.getElementById('placeFormLat')?.value) || 0,
      longitude: Number(document.getElementById('placeFormLng')?.value) || 0,
      address: document.getElementById('placeFormAddress')?.value || '',
      category: document.getElementById('placeFormCategory')?.value || '',
      status: document.getElementById('placeFormStatus')?.value || 'ACTIVE',
      notes: document.getElementById('placeFormNotes')?.value || '',
      verified: !!document.getElementById('placeFormVerified')?.checked
    };
    if (!payload.name) {
      alert('Nhập tên địa điểm.');
      return;
    }
    try {
      const url = selectedId ? API + '/places/' + selectedId : API + '/places';
      const method = selectedId ? 'PATCH' : 'POST';
      let res = await fetch(url, {
        method,
        headers: headers(true),
        body: JSON.stringify(payload)
      });
      let data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.code === 'DUPLICATE_SUSPECTED' && !selectedId) {
        const top = data.duplicates?.top;
        const msg = 'Có vẻ địa điểm đã tồn tại' +
          (top ? ' («' + (top.place?.name || '') + '» ~' + Math.round((top.similarity || 0) * 100) + '%)' : '') +
          '.\nVẫn tạo mới?';
        if (!confirm(msg)) return;
        res = await fetch(url, {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify({ ...payload, force: true })
        });
        data = await res.json().catch(() => ({}));
      }
      if (!res.ok) throw new Error(data.message || 'Lưu thất bại');
      closeModal();
      await loadPlaces();
      alert(data.message || 'Đã lưu.');
    } catch (e) {
      alert(e.message);
    }
  }

  async function loadReviews() {
    const tbody = document.getElementById('mapReviewsList');
    const meta = document.getElementById('reviewsMeta');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6">Đang tải…</td></tr>';
    try {
      const status = document.getElementById('filterReviewStatus')?.value || 'PENDING';
      const res = await fetch(API + '/map-reviews?status=' + encodeURIComponent(status), { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải được hàng đợi duyệt');
      const rows = data.reviews || [];
      if (meta) meta.textContent = 'Số mục: ' + rows.length;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="analytics-muted">Không có yêu cầu.</td></tr>';
        return;
      }
      const visLabel = { COMMUNITY: 'Cộng đồng', OFFICIAL: 'Chính thức' };
      const stLabel = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', MERGED: 'Đã merge' };
      tbody.innerHTML = rows.map((r) => {
        const bName = r.building?.name || String(r.building_id);
        const pName = r.place?.name || (r.place_id ? String(r.place_id) : '—');
        const actions = r.status === 'PENDING'
          ? (
            '<button type="button" class="btn-create" onclick="MapGovernance.approveReview(\'' + r._id + '\')">Duyệt</button> ' +
            '<button type="button" class="btn-logout" style="background:#b91c1c;" onclick="MapGovernance.rejectReview(\'' + r._id + '\')">Từ chối</button> ' +
            '<button type="button" class="btn-edit" onclick="MapGovernance.mergeReview(\'' + r._id + '\')">Merge stub</button>'
          )
          : '—';
        return '<tr>' +
          '<td>' + escapeHtml(bName) + '</td>' +
          '<td>' + escapeHtml(pName) + '</td>' +
          '<td>' + escapeHtml(visLabel[r.requested_visibility] || r.requested_visibility) + '</td>' +
          '<td>' + escapeHtml(stLabel[r.status] || r.status) + '</td>' +
          '<td>' + escapeHtml(r.note || r.reject_reason || '—') + '</td>' +
          '<td style="white-space:nowrap;">' + actions + '</td>' +
          '</tr>';
      }).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  async function openSubmitReview() {
    const buildingId = prompt('Nhập ID tòa nhà cần gửi duyệt:');
    if (!buildingId) return;
    const vis = prompt('Loại hiển thị: COMMUNITY hoặc OFFICIAL', 'COMMUNITY');
    if (!vis) return;
    const note = prompt('Ghi chú (tuỳ chọn):', '') || '';
    try {
      const res = await fetch(API + '/map-reviews', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({
          building_id: buildingId.trim(),
          requested_visibility: String(vis).trim().toUpperCase(),
          note
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Gửi duyệt thất bại');
      await loadReviews();
      alert(data.message || 'Đã gửi.');
    } catch (e) {
      alert(e.message);
    }
  }

  async function approveReview(id) {
    if (!confirm('Duyệt yêu cầu này?')) return;
    try {
      const res = await fetch(API + '/map-reviews/' + id + '/approve', {
        method: 'POST',
        headers: headers(true),
        body: '{}'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Duyệt thất bại');
      await loadReviews();
      alert(data.message || 'Đã duyệt.');
    } catch (e) {
      alert(e.message);
    }
  }

  async function rejectReview(id) {
    const reason = prompt('Lý do từ chối:', '') || '';
    try {
      const res = await fetch(API + '/map-reviews/' + id + '/reject', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ reason })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Từ chối thất bại');
      await loadReviews();
    } catch (e) {
      alert(e.message);
    }
  }

  async function mergeReview(id) {
    const target = prompt('ID Place đích để gắn tòa nhà:');
    if (!target) return;
    try {
      const res = await fetch(API + '/map-reviews/' + id + '/merge-stub', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ target_place_id: target.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Merge thất bại');
      await loadReviews();
      alert(data.message || 'Đã merge.');
    } catch (e) {
      alert(e.message);
    }
  }

  async function loadDuplicates() {
    const tbody = document.getElementById('mapDuplicatesList');
    const meta = document.getElementById('duplicatesMeta');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6">Đang quét…</td></tr>';
    try {
      const res = await fetch(API + '/places/duplicates/scan?threshold=0.95&limit=50', { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Quét trùng thất bại');
      const pairs = data.pairs || [];
      if (meta) {
        meta.textContent = 'Ngưỡng ' + Math.round((data.threshold || 0.95) * 100) +
          '% · Quét ' + (data.total_places_scanned || 0) + ' địa điểm · ' + pairs.length + ' cặp';
      }
      if (!pairs.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="analytics-muted">Không phát hiện cặp trùng ≥ ngưỡng.</td></tr>';
        return;
      }
      tbody.innerHTML = pairs.map((p) =>
        '<tr>' +
        '<td><strong>' + Math.round((p.similarity || 0) * 100) + '%</strong></td>' +
        '<td>' + escapeHtml(p.place_a?.name || '') + '</td>' +
        '<td>' + escapeHtml(p.place_b?.name || '') + '</td>' +
        '<td>' + Math.round((p.name_score || 0) * 100) + '%</td>' +
        '<td>' + (p.gps_meters == null ? '—' : p.gps_meters) + '</td>' +
        '<td>' + escapeHtml(p.message || '') +
          ' <button type="button" class="linkish" onclick="MapGovernance.proposeMergeFromDup(\'' +
          p.place_a._id + '\',\'' + p.place_b._id + '\')">Gộp →</button></td>' +
        '</tr>'
      ).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  function proposeMergeFromDup(aId, bId) {
    const keep = prompt('Giữ Place đích (ID). Mặc định giữ B:\nA=' + aId + '\nB=' + bId, bId);
    if (!keep) return;
    const source = String(keep) === String(aId) ? bId : aId;
    createMergeRequest(source, keep, confirm('Gộp ngay? (Hủy = tạo yêu cầu chờ duyệt)'));
  }

  async function createMergeRequest(sourceId, targetId, executeNow) {
    try {
      const res = await fetch(API + '/place-merges', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({
          source_place_id: sourceId,
          target_place_id: targetId,
          execute_now: !!executeNow,
          note: 'Từ UI quản trị bản đồ'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Tạo merge thất bại');
      alert(data.message || 'OK');
      if (typeof switchTab === 'function') switchTab('map-merges');
      else await loadMerges();
    } catch (e) {
      alert(e.message);
    }
  }

  async function openDetail(id) {
    const box = document.getElementById('placeDetailBox');
    if (box) {
      box.style.display = 'block';
      box.innerHTML = '<p class="analytics-loading">Đang tải chi tiết…</p>';
    }
    try {
      const res = await fetch(API + '/places/' + id, { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải được chi tiết');
      const p = data.place;
      const buildings = data.buildings || [];
      if (!cache.find((x) => String(x._id) === String(p._id))) {
        cache.unshift(p);
      }
      if (!box) return;
      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">' +
          '<div>' +
            '<h4 style="margin:0 0 6px;">' + escapeHtml(p.name) +
              (p.verified ? ' <span style="color:#059669;font-size:12px;">✓ Đã xác minh</span>' : '') +
            '</h4>' +
            '<p style="margin:0;color:#667085;font-size:13px;">' + escapeHtml(p.address || 'Chưa có địa chỉ') + '</p>' +
            '<p style="margin:6px 0 0;font-size:12px;color:#98a2b3;">GPS: ' +
              escapeHtml(String(p.latitude)) + ', ' + escapeHtml(String(p.longitude)) +
              ' · Trạng thái: ' + escapeHtml(p.status) +
              ' · Danh mục: ' + escapeHtml(p.category || '—') +
            '</p>' +
            '<p style="margin:6px 0 0;font-size:12px;">Tên gọi khác: ' + escapeHtml((p.aliases || []).join(', ') || '—') + '</p>' +
          '</div>' +
          '<button type="button" class="btn-edit" onclick="MapGovernance.openEdit(\'' + p._id + '\')">Sửa địa điểm</button>' +
        '</div>' +
        '<div style="margin-top:14px;">' +
          '<strong style="font-size:13px;">Tòa nhà gắn địa điểm (' + buildings.length + ')</strong>' +
          (buildings.length
            ? '<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;">' +
              buildings.map((b) =>
                '<li style="margin-bottom:6px;">' +
                  escapeHtml(b.name) +
                  ' — <code>' + escapeHtml(b.status) + '</code> / <code>' + escapeHtml(b.visibility || 'PRIVATE') + '</code>' +
                  ' <button type="button" class="linkish" onclick="MapGovernance.detachBuilding(\'' + p._id + '\',\'' + b._id + '\')">Gỡ</button>' +
                  ' · Hiển thị: ' +
                  '<select onchange="MapGovernance.setBuildingVisibility(\'' + b._id + '\', this.value)" style="font-size:12px;padding:2px 4px;">' +
                    [
                      ['PRIVATE', 'Riêng tư'],
                      ['UNLISTED', 'Không liệt kê'],
                      ['COMMUNITY', 'Cộng đồng'],
                      ['OFFICIAL', 'Chính thức']
                    ].map(([v, label]) =>
                      '<option value="' + v + '"' + ((b.visibility || 'PRIVATE') === v ? ' selected' : '') + '>' + label + '</option>'
                    ).join('') +
                  '</select>' +
                '</li>'
              ).join('') +
              '</ul>'
            : '<p class="analytics-muted" style="margin:8px 0 0;">Chưa có tòa nhà. Gắn bên dưới hoặc chạy backfill.</p>') +
        '</div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">' +
          '<div>' +
            '<label style="font-size:12px;color:#666;display:block;margin-bottom:2px;">Gắn ID tòa nhà</label>' +
            '<input id="attachBuildingId" type="text" placeholder="ObjectId tòa nhà" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;min-width:260px;">' +
          '</div>' +
          '<button type="button" class="btn-add" onclick="MapGovernance.attachBuilding(\'' + p._id + '\')">Gắn tòa nhà</button>' +
        '</div>';
    } catch (e) {
      if (box) box.innerHTML = '<p class="analytics-error">' + escapeHtml(e.message) + '</p>';
    }
  }

  async function attachBuilding(placeId) {
    const buildingId = document.getElementById('attachBuildingId')?.value?.trim();
    if (!buildingId) {
      alert('Nhập ID tòa nhà.');
      return;
    }
    try {
      const res = await fetch(API + '/places/' + placeId + '/attach-building', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ building_id: buildingId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Gắn thất bại');
      await loadPlaces();
      await openDetail(placeId);
      alert(data.message || 'Đã gắn.');
    } catch (e) {
      alert(e.message);
    }
  }

  async function detachBuilding(placeId, buildingId) {
    if (!confirm('Gỡ tòa nhà khỏi địa điểm này?')) return;
    try {
      const res = await fetch(API + '/places/' + placeId + '/detach-building', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ building_id: buildingId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Gỡ thất bại');
      await loadPlaces();
      await openDetail(placeId);
    } catch (e) {
      alert(e.message);
    }
  }

  async function setBuildingVisibility(buildingId, visibility) {
    try {
      const res = await fetch(API + '/places/buildings/' + buildingId + '/visibility', {
        method: 'PATCH',
        headers: headers(true),
        body: JSON.stringify({ visibility })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Đổi visibility thất bại');
    } catch (e) {
      alert(e.message);
      throw e;
    }
  }

  async function lockPlace(id) {
    if (!confirm('Khóa địa điểm và gỡ mọi tòa nhà đang gắn?')) return;
    try {
      const res = await fetch(API + '/places/' + id, {
        method: 'DELETE',
        headers: headers()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Khóa thất bại');
      const box = document.getElementById('placeDetailBox');
      if (box) box.style.display = 'none';
      await loadPlaces();
      alert(data.message || 'Đã khóa.');
    } catch (e) {
      alert(e.message);
    }
  }

  async function loadOwnership() {
    const tbody = document.getElementById('mapOwnershipList');
    const meta = document.getElementById('ownershipMeta');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6">Đang tải…</td></tr>';
    try {
      const status = document.getElementById('filterOwnershipStatus')?.value || 'PENDING';
      const type = document.getElementById('filterOwnershipType')?.value || '';
      const qs = new URLSearchParams({ status });
      if (type) qs.set('type', type);
      const res = await fetch(API + '/place-ownership?' + qs.toString(), { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải ownership');
      const rows = data.requests || [];
      if (meta) meta.textContent = 'Số mục: ' + rows.length;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="analytics-muted">Không có yêu cầu.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((r) => {
        const detail = r.type === 'CHANGE'
          ? escapeHtml(JSON.stringify(r.proposed_changes || {}))
          : escapeHtml(r.note || '—');
        const actions = r.status === 'PENDING'
          ? (
            '<button type="button" class="btn-create" onclick="MapGovernance.approveOwnership(\'' + r._id + '\')">Duyệt</button> ' +
            '<button type="button" class="btn-logout" style="background:#b91c1c;" onclick="MapGovernance.rejectOwnership(\'' + r._id + '\')">Từ chối</button>'
          )
          : '—';
        return '<tr>' +
          '<td><code>' + escapeHtml(r.type) + '</code></td>' +
          '<td>' + escapeHtml(r.place?.name || String(r.place_id)) + '</td>' +
          '<td>' + escapeHtml(r.organization?.name || (r.organization_id ? String(r.organization_id) : '—')) + '</td>' +
          '<td style="max-width:240px;font-size:12px;">' + detail + '</td>' +
          '<td>' + escapeHtml(r.status) + '</td>' +
          '<td style="white-space:nowrap;">' + actions + '</td>' +
          '</tr>';
      }).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  async function openOwnershipCreate() {
    const type = prompt('Loại: CLAIM | CHANGE | TRANSFER', 'CLAIM');
    if (!type) return;
    const placeId = prompt('Place ID:');
    if (!placeId) return;
    const t = String(type).toUpperCase();
    const orgId = (t === 'CLAIM' || t === 'TRANSFER') ? prompt('Organization ID:') : null;
    let proposed = null;
    if (t === 'CHANGE') {
      proposed = {};
      const name = prompt('Tên đề xuất (để trống nếu không đổi):', '');
      if (name) proposed.name = name;
      const aliases = prompt('Aliases (phẩy tách):', '');
      if (aliases) proposed.aliases = aliases;
      if (!Object.keys(proposed).length) {
        alert('Cần ít nhất một thay đổi.');
        return;
      }
    }
    const note = prompt('Ghi chú:', '') || '';
    try {
      const res = await fetch(API + '/place-ownership', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({
          type: t,
          place_id: placeId.trim(),
          note,
          organization_id: orgId ? orgId.trim() : undefined,
          proposed_changes: proposed
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Tạo thất bại');
      await loadOwnership();
      alert(data.message || 'Đã tạo.');
    } catch (e) {
      alert(e.message);
    }
  }

  async function approveOwnership(id) {
    if (!confirm('Duyệt yêu cầu này?')) return;
    try {
      const res = await fetch(API + '/place-ownership/' + id + '/approve', {
        method: 'POST',
        headers: headers(true),
        body: '{}'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Duyệt thất bại');
      await loadOwnership();
      alert(data.message || 'Đã duyệt.');
    } catch (e) {
      alert(e.message);
    }
  }

  async function rejectOwnership(id) {
    const reason = prompt('Lý do từ chối:', '') || '';
    try {
      const res = await fetch(API + '/place-ownership/' + id + '/reject', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ reason })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Từ chối thất bại');
      await loadOwnership();
    } catch (e) {
      alert(e.message);
    }
  }

  async function loadMerges() {
    const tbody = document.getElementById('mapMergesList');
    const meta = document.getElementById('mergesMeta');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6">Đang tải…</td></tr>';
    try {
      const status = document.getElementById('filterMergeStatus')?.value || 'PENDING';
      const res = await fetch(API + '/place-merges?status=' + encodeURIComponent(status), { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải merges');
      const rows = data.requests || [];
      if (meta) meta.textContent = 'Số mục: ' + rows.length;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="analytics-muted">Không có yêu cầu.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((r) => {
        const result = r.merge_result
          ? ('chuyển ' + (r.merge_result.buildings_moved || 0) + ' tòa')
          : (r.reject_reason || '—');
        const actions = r.status === 'PENDING'
          ? (
            '<button type="button" class="btn-create" onclick="MapGovernance.approveMerge(\'' + r._id + '\')">Duyệt gộp</button> ' +
            '<button type="button" class="btn-logout" style="background:#b91c1c;" onclick="MapGovernance.rejectMerge(\'' + r._id + '\')">Từ chối</button>'
          )
          : '—';
        return '<tr>' +
          '<td>' + escapeHtml(r.source_place?.name || String(r.source_place_id)) + '</td>' +
          '<td>' + escapeHtml(r.target_place?.name || String(r.target_place_id)) + '</td>' +
          '<td>' + (r.similarity != null ? Math.round(r.similarity * 100) + '%' : '—') + '</td>' +
          '<td>' + escapeHtml(r.status) + '</td>' +
          '<td style="font-size:12px;">' + escapeHtml(result) + '</td>' +
          '<td style="white-space:nowrap;">' + actions + '</td>' +
          '</tr>';
      }).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  async function openMergeCreate() {
    const source = prompt('Place nguồn (sẽ MERGED):');
    if (!source) return;
    const target = prompt('Place đích (giữ lại):');
    if (!target) return;
    await createMergeRequest(source.trim(), target.trim(), confirm('Gộp ngay?'));
  }

  async function approveMerge(id) {
    if (!confirm('Duyệt và thực hiện gộp?')) return;
    try {
      const res = await fetch(API + '/place-merges/' + id + '/approve', {
        method: 'POST',
        headers: headers(true),
        body: '{}'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Gộp thất bại');
      await loadMerges();
      alert(data.message || 'Đã gộp.');
    } catch (e) {
      alert(e.message);
    }
  }

  async function rejectMerge(id) {
    const reason = prompt('Lý do từ chối:', '') || '';
    try {
      const res = await fetch(API + '/place-merges/' + id + '/reject', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ reason })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Từ chối thất bại');
      await loadMerges();
    } catch (e) {
      alert(e.message);
    }
  }

  async function loadModeration() {
    const tbody = document.getElementById('mapModerationList');
    const meta = document.getElementById('moderationMeta');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5">Đang tải…</td></tr>';
    try {
      const status = document.getElementById('filterModerationStatus')?.value || 'OPEN';
      const res = await fetch(API + '/map-moderation/reports?status=' + encodeURIComponent(status), { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải báo cáo');
      const rows = data.reports || [];
      if (meta) meta.textContent = 'Số mục: ' + rows.length;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="analytics-muted">Không có báo cáo.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((r) => {
        const actions = r.status === 'OPEN'
          ? (
            '<button type="button" class="btn-edit" onclick="MapGovernance.resolveReport(\'' + r._id + '\',\'DISMISS\')">Bỏ qua</button> ' +
            (r.target_type === 'PLACE'
              ? '<button type="button" class="btn-logout" style="background:#b91c1c;" onclick="MapGovernance.resolveReport(\'' + r._id + '\',\'LOCK_PLACE\')">Khóa Place</button> '
              : '') +
            (r.target_type === 'BUILDING'
              ? '<button type="button" class="btn-logout" style="background:#b91c1c;" onclick="MapGovernance.resolveReport(\'' + r._id + '\',\'LOCK_BUILDING\')">Khóa tòa</button> '
              : '') +
            (r.target_type === 'USER'
              ? '<button type="button" class="btn-logout" style="background:#7f1d1d;" onclick="MapGovernance.resolveReport(\'' + r._id + '\',\'BAN_USER\')">Ban</button> ' +
                '<button type="button" class="btn-edit" onclick="MapGovernance.resolveReport(\'' + r._id + '\',\'WARN\')">Cảnh cáo</button>'
              : '')
          )
          : escapeHtml(r.resolution || '—');
        return '<tr>' +
          '<td><code>' + escapeHtml(r.target_type) + '</code><br><span style="font-size:11px;">' + escapeHtml(r.target_id) + '</span></td>' +
          '<td>' + escapeHtml(r.reason_code) + '</td>' +
          '<td style="font-size:12px;max-width:220px;">' + escapeHtml(r.detail || '—') + '</td>' +
          '<td>' + escapeHtml(r.status) + '</td>' +
          '<td style="white-space:nowrap;">' + actions + '</td>' +
          '</tr>';
      }).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  async function openCreateReport() {
    const target_type = prompt('Loại: PLACE | BUILDING | USER', 'PLACE');
    if (!target_type) return;
    const target_id = prompt('ID đối tượng:');
    if (!target_id) return;
    const reason_code = prompt('Lý do: SPAM | INAPPROPRIATE | DUPLICATE | COPYRIGHT | OTHER', 'SPAM');
    const detail = prompt('Chi tiết:', '') || '';
    try {
      const res = await fetch(API + '/map-moderation/reports', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({
          target_type: String(target_type).toUpperCase(),
          target_id: target_id.trim(),
          reason_code: String(reason_code || 'OTHER').toUpperCase(),
          detail
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Gửi báo cáo thất bại');
      await loadModeration();
      alert(data.message || 'Đã gửi.');
    } catch (e) {
      alert(e.message);
    }
  }

  async function resolveReport(id, action) {
    const note = prompt('Ghi chú xử lý:', '') || '';
    try {
      const res = await fetch(API + '/map-moderation/reports/' + id + '/resolve', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ action, note, ban_days: 7 })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Xử lý thất bại');
      await loadModeration();
      alert(data.message || 'Đã xử lý.');
    } catch (e) {
      alert(e.message);
    }
  }

  async function loadMapStats() {
    const box = document.getElementById('mapStatsBox');
    if (box) box.innerHTML = '<p>Đang tải…</p>';
    try {
      const res = await fetch(API + '/map-moderation/stats', { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải thống kê');
      const cards = [
        ['Địa điểm', data.places],
        ['Báo cáo mở', data.open_reports],
        ['Chờ duyệt map', data.pending_reviews],
        ['Place khóa', data.locked_places],
        ['User bị ban map', data.banned_users]
      ];
      box.innerHTML = cards.map(([label, val]) =>
        '<div style="background:#fff;border:1px solid #eaecf0;border-radius:12px;padding:16px;">' +
          '<div style="font-size:11px;color:#98a2b3;text-transform:uppercase;">' + escapeHtml(label) + '</div>' +
          '<div style="font-size:28px;font-weight:700;color:#1d2939;margin-top:6px;">' + escapeHtml(String(val ?? 0)) + '</div>' +
        '</div>'
      ).join('');
    } catch (e) {
      if (box) box.innerHTML = '<p class="analytics-error">' + escapeHtml(e.message) + '</p>';
    }
  }

  let versionBuildingsCache = [];

  async function loadMapVersions() {
    const tbody = document.getElementById('mapVersionsBuildingList');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="admin-table-loading-cell">Đang tải…</td></tr>';
    try {
      const res = await fetch(API + '/buildings', { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải được tòa nhà');
      versionBuildingsCache = Array.isArray(data) ? data : (data.buildings || []);
      renderVersionBuildings(versionBuildingsCache);
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  function filterVersionBuildings() {
    const q = (document.getElementById('mapVersionBuildingFilter')?.value || '').trim().toLowerCase();
    const list = !q
      ? versionBuildingsCache
      : versionBuildingsCache.filter((b) => String(b.name || '').toLowerCase().includes(q));
    renderVersionBuildings(list);
  }

  function renderVersionBuildings(list) {
    const tbody = document.getElementById('mapVersionsBuildingList');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="analytics-muted">Không có tòa nhà.</td></tr>';
      return;
    }
    tbody.innerHTML = list.slice(0, 200).map((b) => (
      '<tr>' +
      '<td><strong>' + escapeHtml(b.name) + '</strong></td>' +
      '<td>' + escapeHtml(b.status || '') + '</td>' +
      '<td>' + escapeHtml(b.visibility || 'PRIVATE') + '</td>' +
      '<td>' + escapeHtml(String(b.total_floors || 1)) + '</td>' +
      '<td style="font-size:11px;">' + escapeHtml(b.place_id ? String(b.place_id) : '—') + '</td>' +
      '<td><button type="button" class="btn-edit" style="background:#8e44ad;color:#fff;" onclick="openMapVersionModal(\'' +
        escapeHtml(String(b._id)) + '\', ' + Number(b.total_floors || 1) + ')">Phiên bản</button></td>' +
      '</tr>'
    )).join('');
  }

  async function loadVerification() {
    const tbody = document.getElementById('mapVerifyList');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="admin-table-loading-cell">Đang tải…</td></tr>';
    try {
      const hub = await fetch(API + '/community/hub', { headers: headers() });
      const data = await hub.json().catch(() => ({}));
      if (!hub.ok) throw new Error(data.message || 'Không tải được queue xác minh');
      const rows = data.verification_queue || [];
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="analytics-muted">Không có Place PENDING. Dùng «Gửi XM» ở tab Địa điểm.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((p) => {
        const gps = (Number(p.latitude) || 0).toFixed(4) + ', ' + (Number(p.longitude) || 0).toFixed(4);
        return (
          '<tr>' +
          '<td><strong>' + escapeHtml(p.name) + '</strong></td>' +
          '<td>' + escapeHtml(p.verification_status || '') + '</td>' +
          '<td>' + escapeHtml(p.verification_note || '—') + '</td>' +
          '<td style="font-size:12px;">' + escapeHtml(gps) + '</td>' +
          '<td style="white-space:nowrap;">' +
            '<button type="button" class="btn-create" onclick="MapGovernance.resolveVerify(\'' + p._id + '\',\'approve\')">Duyệt</button> ' +
            '<button type="button" class="btn-logout" onclick="MapGovernance.resolveVerify(\'' + p._id + '\',\'reject\')">Từ chối</button>' +
          '</td></tr>'
        );
      }).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  async function requestVerify(id) {
    const note = prompt('Ghi chú gửi xác minh (tuỳ chọn):') || '';
    const res = await fetch(API + '/places/' + id + '/verification', {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ action: 'request', note })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || 'Không gửi được yêu cầu xác minh');
      return;
    }
    alert('Đã đưa Place vào hàng đợi xác minh.');
    await loadPlaces();
  }

  async function resolveVerify(id, action) {
    const note = prompt(action === 'approve' ? 'Ghi chú duyệt (tuỳ chọn):' : 'Lý do từ chối:') || '';
    const res = await fetch(API + '/places/' + id + '/verification', {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ action, note })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message || 'Thao tác thất bại');
      return;
    }
    await loadVerification();
  }

  async function loadCommunityHub() {
    const tbody = document.getElementById('mapCommunityList');
    const meta = document.getElementById('mapCommunityMeta');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="admin-table-loading-cell">Đang tải…</td></tr>';
    try {
      const res = await fetch(API + '/community/hub', { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải được hub cộng đồng');
      const list = data.community_buildings || [];
      if (meta) meta.textContent = 'Tổng COMMUNITY/OFFICIAL: ' + list.length;
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="analytics-muted">Chưa có building COMMUNITY/OFFICIAL đã PUBLISHED.</td></tr>';
        return;
      }
      tbody.innerHTML = list.map((b) => (
        '<tr>' +
        '<td><strong>' + escapeHtml(b.name) + '</strong></td>' +
        '<td>' + escapeHtml(b.visibility || '') + '</td>' +
        '<td>' + escapeHtml(b.address || '—') + '</td>' +
        '<td style="font-size:11px;">' + escapeHtml(b.place_id ? String(b.place_id) : '—') + '</td>' +
        '</tr>'
      )).join('');
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  global.MapGovernance = {
    loadPlaces,
    openCreate,
    openEdit,
    openDetail,
    closeModal,
    savePlace,
    attachBuilding,
    detachBuilding,
    setBuildingVisibility,
    lockPlace,
    loadReviews,
    openSubmitReview,
    approveReview,
    rejectReview,
    mergeReview,
    loadDuplicates,
    proposeMergeFromDup,
    loadOwnership,
    openOwnershipCreate,
    approveOwnership,
    rejectOwnership,
    loadMerges,
    openMergeCreate,
    approveMerge,
    rejectMerge,
    loadModeration,
    openCreateReport,
    resolveReport,
    loadMapStats,
    loadMapVersions,
    filterVersionBuildings,
    loadVerification,
    requestVerify,
    resolveVerify,
    loadCommunityHub
  };
})(window);
