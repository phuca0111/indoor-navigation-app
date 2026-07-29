/**
 * Phase 3 — Emergency Admin UI (minimal list/create/activate).
 */
(function initEmergencyAdmin(global) {
  const API = '/api/emergency';

  const INCIDENT_TYPE_VI = {
    FIRE: 'Cháy',
    FLOOD: 'Ngập lụt',
    GAS: 'Rò khí / khí độc',
    EARTHQUAKE: 'Động đất',
    OTHER: 'Khác'
  };

  const INCIDENT_STATUS_VI = {
    DRAFT: 'Bản nháp',
    PENDING: 'Chờ xử lý',
    ACTIVE: 'Đang diễn ra',
    CONTAINED: 'Đã khoanh vùng',
    RESOLVED: 'Đã kết thúc',
    ARCHIVED: 'Đã lưu trữ'
  };

  const BROADCAST_STATUS_VI = {
    PENDING: 'Chờ gửi',
    SENT: 'Đã gửi',
    FAILED: 'Gửi thất bại',
    PARTIAL: 'Gửi một phần'
  };

  function authHeaders() {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : ''
    };
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  }

  function canAccessEmergency() {
    return typeof userHasPermission === 'function' &&
      (userHasPermission('emergency.incident.write') ||
        userHasPermission('emergency.command.read') ||
        currentUser?.role === 'SUPER_ADMIN');
  }

  let _buildingsCache = [];
  let _buildingComboActiveIndex = -1;
  let _buildingComboBound = false;

  function typeLabel(type) {
    return INCIDENT_TYPE_VI[type] || type || '—';
  }

  function statusLabel(status) {
    return INCIDENT_STATUS_VI[status] || status || '—';
  }

  function broadcastStatusLabel(status) {
    return BROADCAST_STATUS_VI[status] || status || 'Chưa gửi';
  }

  function normalizeSearch(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /** Parse "10.76, 106.66" | "10.76;106.66" | "10.76 106.66". */
  function parseLatLngQuery(query) {
    const raw = String(query || '').trim();
    if (!raw) return null;
    const m = raw.match(
      /^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)(?:\s|$)/
    );
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    // Tránh nhầm "3 4" kiểu số tầng — cần ít nhất 1 phần thập phân hoặc |lat|>1
    const hasDecimal = String(m[1]).includes('.') || String(m[2]).includes('.');
    if (!hasDecimal && Math.abs(lat) <= 1 && Math.abs(lng) <= 1) return null;
    return { lat, lng };
  }

  function buildingGps(b) {
    const g = b?.gps_location || b?.gpsLocation || {};
    const lat = Number(g.lat);
    const lng = Number(g.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;
    return { lat, lng };
  }

  function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function formatDistanceM(meters) {
    if (!Number.isFinite(meters)) return '';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  function buildingName(buildingId) {
    if (!buildingId) return '—';
    const found = _buildingsCache.find((b) => String(b._id) === String(buildingId));
    if (found?.name) return found.name;
    const globalList = Array.isArray(global.allBuildings) ? global.allBuildings : [];
    const fromDash = globalList.find((b) => String(b._id) === String(buildingId));
    return fromDash?.name || String(buildingId);
  }

  function getBuildingComboEls() {
    return {
      root: document.getElementById('emergencyBuildingCombobox'),
      hidden: document.getElementById('emergencyCreateBuilding'),
      input: document.getElementById('emergencyBuildingSearch'),
      list: document.getElementById('emergencyBuildingList')
    };
  }

  function filterBuildings(query) {
    const list = _buildingsCache.slice().sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'vi')
    );
    const coords = parseLatLngQuery(query);
    if (coords) {
      return list
        .map((b) => {
          const gps = buildingGps(b);
          const dist = gps ? haversineMeters(coords, gps) : Number.POSITIVE_INFINITY;
          return { b, dist, gps };
        })
        .filter((x) => Number.isFinite(x.dist))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 40)
        .map(({ b, dist, gps }) => ({
          ...b,
          _matchDistM: dist,
          _matchGps: gps
        }));
    }

    const q = normalizeSearch(query);
    if (!q) return list.slice(0, 40);

    const qCompact = q.replace(/\s+/g, '');
    return list
      .filter((b) => {
        const name = normalizeSearch(b.name);
        const id = normalizeSearch(b._id);
        const address = normalizeSearch(b.address);
        const desc = normalizeSearch(b.description);
        const gps = buildingGps(b);
        const latStr = gps ? String(gps.lat) : '';
        const lngStr = gps ? String(gps.lng) : '';
        const coordBlob = gps
          ? normalizeSearch(`${gps.lat},${gps.lng}`).replace(/\s+/g, '')
          : '';
        return (
          name.includes(q) ||
          id.includes(q) ||
          address.includes(q) ||
          desc.includes(q) ||
          latStr.includes(qCompact) ||
          lngStr.includes(qCompact) ||
          (coordBlob && coordBlob.includes(qCompact))
        );
      })
      .slice(0, 40);
  }

  function setBuildingSelection(id, label) {
    const { hidden, input } = getBuildingComboEls();
    if (hidden) hidden.value = id || '';
    if (input) {
      input.value = label || '';
      input.dataset.selectedLabel = label || '';
    }
  }

  function clearBuildingSelection() {
    setBuildingSelection('', '');
  }

  function closeBuildingList() {
    const { root, input, list } = getBuildingComboEls();
    if (list) list.hidden = true;
    if (root) root.classList.remove('is-open');
    if (input) input.setAttribute('aria-expanded', 'false');
    _buildingComboActiveIndex = -1;
  }

  function openBuildingList() {
    const { root, input, list } = getBuildingComboEls();
    if (!list) return;
    list.hidden = false;
    if (root) root.classList.add('is-open');
    if (input) input.setAttribute('aria-expanded', 'true');
  }

  function renderBuildingOptions(query) {
    const { list, hidden } = getBuildingComboEls();
    if (!list) return;
    const rows = filterBuildings(query);
    const selectedId = hidden?.value || '';
    const byCoords = !!parseLatLngQuery(query);
    const parts = [];

    parts.push(
      `<li role="presentation">` +
      `<button type="button" class="admin-combobox-option is-clear" data-building-id="" role="option">` +
      `— Không gắn tòa nhà —</button></li>`
    );

    if (!rows.length) {
      parts.push(
        `<li class="admin-combobox-empty" role="presentation">` +
        (byCoords
          ? 'Không có tòa nhà có GPS gần tọa độ này.'
          : 'Không tìm thấy tòa nhà khớp.') +
        `</li>`
      );
    } else {
      rows.forEach((b) => {
        const id = String(b._id);
        const name = escapeHtml(b.name || id);
        const gps = b._matchGps || buildingGps(b);
        const metaBits = [];
        if (b.address) metaBits.push(escapeHtml(b.address));
        if (gps) {
          metaBits.push(
            escapeHtml(`${Number(gps.lat).toFixed(5)}, ${Number(gps.lng).toFixed(5)}`)
          );
        }
        if (b._matchDistM != null && Number.isFinite(b._matchDistM)) {
          metaBits.push(escapeHtml(`cách ${formatDistanceM(b._matchDistM)}`));
        }
        const meta = metaBits.length
          ? `<span class="admin-combobox-meta">${metaBits.join(' · ')}</span>`
          : '';
        const active = selectedId === id ? ' is-active' : '';
        parts.push(
          `<li role="presentation">` +
          `<button type="button" class="admin-combobox-option${active}" data-building-id="${escapeHtml(id)}" ` +
          `data-building-name="${escapeHtml(b.name || id)}" role="option">${name}${meta}</button></li>`
        );
      });
    }

    list.innerHTML = parts.join('');
    openBuildingList();
    _buildingComboActiveIndex = -1;
  }

  function moveBuildingHighlight(delta) {
    const { list } = getBuildingComboEls();
    if (!list || list.hidden) return;
    const options = Array.from(list.querySelectorAll('.admin-combobox-option'));
    if (!options.length) return;
    options.forEach((el) => el.classList.remove('is-active'));
    _buildingComboActiveIndex = (_buildingComboActiveIndex + delta + options.length) % options.length;
    const active = options[_buildingComboActiveIndex];
    active.classList.add('is-active');
    active.scrollIntoView({ block: 'nearest' });
  }

  function chooseBuildingFromActive() {
    const { list } = getBuildingComboEls();
    if (!list || list.hidden) return false;
    const options = Array.from(list.querySelectorAll('.admin-combobox-option'));
    const active = options[_buildingComboActiveIndex] || options[0];
    if (!active) return false;
    const id = active.getAttribute('data-building-id') || '';
    const name = active.getAttribute('data-building-name') || '';
    if (!id) clearBuildingSelection();
    else setBuildingSelection(id, name);
    closeBuildingList();
    return true;
  }

  function syncBuildingSearchFromHidden() {
    const { hidden, input } = getBuildingComboEls();
    if (!hidden || !input) return;
    if (!hidden.value) {
      input.value = '';
      input.dataset.selectedLabel = '';
      return;
    }
    const label = buildingName(hidden.value);
    input.value = label === '—' ? hidden.value : label;
    input.dataset.selectedLabel = input.value;
  }

  function populateBuildingSelect() {
    syncBuildingSearchFromHidden();
  }

  function bindBuildingCombobox() {
    if (_buildingComboBound) return;
    const { root, input, list } = getBuildingComboEls();
    if (!root || !input || !list) return;
    _buildingComboBound = true;

    input.addEventListener('focus', () => {
      renderBuildingOptions(input.value);
    });

    input.addEventListener('input', () => {
      const { hidden } = getBuildingComboEls();
      // Đang gõ lại → bỏ chọn cũ nếu lệch nhãn
      if (hidden && input.dataset.selectedLabel && input.value !== input.dataset.selectedLabel) {
        hidden.value = '';
        input.dataset.selectedLabel = '';
      }
      renderBuildingOptions(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (list.hidden) renderBuildingOptions(input.value);
        moveBuildingHighlight(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) renderBuildingOptions(input.value);
        moveBuildingHighlight(-1);
      } else if (e.key === 'Enter') {
        if (!list.hidden) {
          e.preventDefault();
          chooseBuildingFromActive();
        }
      } else if (e.key === 'Escape') {
        closeBuildingList();
      }
    });

    list.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.admin-combobox-option');
      if (!btn) return;
      e.preventDefault();
      const id = btn.getAttribute('data-building-id') || '';
      const name = btn.getAttribute('data-building-name') || '';
      if (!id) clearBuildingSelection();
      else setBuildingSelection(id, name);
      closeBuildingList();
    });

    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) closeBuildingList();
    });
  }

  async function loadBuildingsForSelect() {
    if (Array.isArray(global.allBuildings) && global.allBuildings.length) {
      _buildingsCache = global.allBuildings.slice();
    } else {
      try {
        const res = await fetch('/api/buildings', { headers: authHeaders() });
        const data = await res.json().catch(() => []);
        if (res.ok && Array.isArray(data)) _buildingsCache = data;
      } catch (_) {
        _buildingsCache = [];
      }
    }
    populateBuildingSelect();
  }

  function renderIncidents(incidents) {
    const tbody = document.getElementById('emergencyIncidentsBody');
    if (!tbody) return;
    if (!incidents.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#666;">Chưa có sự cố.</td></tr>';
      return;
    }
    tbody.innerHTML = incidents.map((row) => `
      <tr>
        <td>${escapeHtml(row.title || typeLabel(row.type))}</td>
        <td>${escapeHtml(typeLabel(row.type))}</td>
        <td><span class="badge badge-${String(row.status || '').toLowerCase()}">${escapeHtml(statusLabel(row.status))}</span></td>
        <td title="${escapeHtml(row.building_id || '')}">${escapeHtml(buildingName(row.building_id))}</td>
        <td>${row.updatedAt ? new Date(row.updatedAt).toLocaleString('vi-VN') : '—'}</td>
        <td>
          ${row.status === 'DRAFT' || row.status === 'PENDING'
    ? `<button type="button" class="btn-edit btn-sm" data-emergency-action="activate" data-id="${row.id}">Kích hoạt</button>`
    : ''}
          ${row.status === 'ACTIVE'
    ? `<button type="button" class="btn-edit btn-sm" data-emergency-action="contained" data-id="${row.id}">Đã kiểm soát</button>
          <button type="button" class="btn-edit btn-sm" data-emergency-action="broadcast" data-id="${row.id}">Gửi cảnh báo</button>`
    : ''}
          ${row.status === 'CONTAINED' || row.status === 'ACTIVE'
    ? `<button type="button" class="btn-edit btn-sm" data-emergency-action="resolved" data-id="${row.id}">Kết thúc</button>`
    : ''}
          <button type="button" class="btn-edit btn-sm" data-emergency-action="command" data-id="${row.id}">Điều khiển</button>
          ${row.building_id
    ? `<button type="button" class="btn-edit btn-sm" data-emergency-action="draw-hazard" data-id="${row.id}" data-building="${row.building_id}">Vẽ vùng nguy hiểm</button>`
    : ''}
        </td>
      </tr>
    `).join('');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadIncidents() {
    const data = await apiFetch('/incidents');
    renderIncidents(data.incidents || []);
    await loadPossiblyTrapped().catch(() => {});
  }

  async function loadPossiblyTrapped() {
    const countEl = document.getElementById('emergencyTrappedCount');
    const body = document.getElementById('emergencyTrappedBody');
    if (!body) return;
    const data = await apiFetch('/locations/possibly-trapped');
    const people = data.people || [];
    const threshold = data.trapped_still_min || 15;
    if (countEl) countEl.textContent = String(people.length);

    if (!people.length) {
      body.innerHTML =
        `<tr><td colspan="8" style="color:#888;">Chưa có ai đứng yên ≥ ${threshold} phút trong sự cố ACTIVE.</td></tr>`;
      return;
    }

    body.innerHTML = people.map((p) => {
      const coords = (p.lat != null && p.lng != null)
        ? `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`
        : '—';
      const floor = p.floor_number != null ? ` · tầng ${p.floor_number}` : '';
      const building = escapeHtml(p.building_name || (p.building_id ? String(p.building_id).slice(-6) : '—'));
      const still = p.still_minutes != null ? `${p.still_minutes} phút` : '≥ ngưỡng';
      const mapsHref = (p.lat != null && p.lng != null)
        ? `https://www.google.com/maps?q=${encodeURIComponent(`${p.lat},${p.lng}`)}`
        : '';
      const mapsBtn = mapsHref
        ? `<a class="btn-edit btn-sm" href="${mapsHref}" target="_blank" rel="noopener">Bản đồ</a>`
        : '';
      return `<tr>
        <td>
          <span class="badge" style="background:#b91c1c;color:#fff;">Mắc kẹt?</span>
          ${escapeHtml(p.display_name || '—')}
        </td>
        <td>${escapeHtml(p.email || '—')}</td>
        <td title="${escapeHtml(p.incident_id || '')}">
          ${escapeHtml(typeLabel(p.incident_type))} · ${escapeHtml(p.incident_title || '#' + String(p.incident_id || '').slice(-6))}
        </td>
        <td>${building}${escapeHtml(floor)}</td>
        <td style="color:#b91c1c;font-weight:600;">${escapeHtml(still)}</td>
        <td title="${escapeHtml(coords)}">${escapeHtml(coords)}</td>
        <td>${fmtTime(p.reported_at)}</td>
        <td class="actions-cell">
          <button type="button" class="btn-edit btn-sm" data-emergency-action="command" data-id="${escapeHtml(p.incident_id)}">Điều khiển</button>
          ${mapsBtn}
        </td>
      </tr>`;
    }).join('');
  }

  async function createIncident(event) {
    event.preventDefault();
    const type = document.getElementById('emergencyCreateType')?.value || 'FIRE';
    const title = document.getElementById('emergencyCreateTitle')?.value || '';
    const buildingId = document.getElementById('emergencyCreateBuilding')?.value || '';
    const body = { type, title: title || `Sự cố ${typeLabel(type)}` };
    if (buildingId) body.building_id = buildingId;
    await apiFetch('/incidents', { method: 'POST', body: JSON.stringify(body) });
    document.getElementById('emergencyCreateForm')?.reset();
    clearBuildingSelection();
    closeBuildingList();
    await loadIncidents();
    if (typeof showToast === 'function') showToast('Đã tạo sự cố.', 'success');
  }

  async function sendBroadcast(id) {
    try {
      const data = await apiFetch(`/incidents/${id}/broadcast`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      await loadIncidents();
      await showCommandCenter(id);
      const bc = data.broadcast || {};
      const recipients = bc.recipient_count || 0;
      const wake = bc.proximity_wake_count || 0;
      let msg;
      if (recipients > 0) {
        msg = `Đã gửi cảnh báo: ${recipients} người trong khu vực` +
          (bc.push_sent_count ? ` (push ${bc.push_sent_count})` : '') +
          (wake ? `; wake kiểm tra ${wake}` : '');
      } else if (wake > 0) {
        msg = `Không có người trong khu vực tòa. Đã gửi ${wake} wake kiểm tra khoảng cách.`;
      } else {
        msg = `Không có người nhận trong khu vực` + (bc.error ? ` — ${bc.error}` : '');
      }
      if (typeof showToast === 'function') showToast(msg, recipients > 0 ? 'success' : 'info');
      else alert(msg);
    } catch (err) {
      const text = String(err && err.message ? err.message : err);
      // Chưa ACTIVE → kích hoạt (tự broadcast) rồi báo lại.
      if (/ACTIVE|không.*ACTIVE|INCIDENT_NOT_ACTIVE/i.test(text)) {
        await changeStatus(id, 'ACTIVE');
        if (typeof showToast === 'function') {
          showToast('Sự cố chưa ACTIVE — đã kích hoạt và gửi cảnh báo.', 'success');
        }
        return;
      }
      throw err;
    }
  }

  async function changeStatus(id, status) {
    await apiFetch(`/incidents/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
    await loadIncidents();
    if (typeof showToast === 'function') {
      showToast(`Đã chuyển trạng thái → ${statusLabel(status)}`, 'success');
    }
    if (status === 'ACTIVE') {
      if (typeof showToast === 'function') {
        showToast('Đã kích hoạt và gửi cảnh báo push tới thiết bị đã đăng ký.', 'success');
      }
    }
  }

  const HAZARD_TYPE_VI = {
    FIRE: 'Cháy',
    SMOKE: 'Khói',
    GAS: 'Rò khí',
    FLOOD: 'Ngập',
    COLLAPSE: 'Sập / đổ',
    ELECTRIC: 'Điện',
    CROWD: 'Đông người',
    EARTHQUAKE: 'Động đất',
    OTHER: 'Khác'
  };

  let _commandIncidentId = null;
  let _commandIncident = null;

  function openHazardEditor(incident) {
    const buildingId = incident?.building_id;
    if (!buildingId) {
      if (typeof showToast === 'function') {
        showToast('Sự cố chưa gắn tòa nhà — không mở được Editor.', 'error');
      } else {
        alert('Sự cố chưa gắn tòa nhà.');
      }
      return;
    }
    try {
      sessionStorage.setItem('editorAuthHandoff', JSON.stringify({
        token: localStorage.getItem('token'),
        refreshToken: localStorage.getItem('refreshToken'),
        userEmail: localStorage.getItem('userEmail'),
        userRole: localStorage.getItem('userRole'),
        userId: localStorage.getItem('userId'),
        ts: Date.now()
      }));
    } catch (_) { /* ignore */ }
    const url = `/editor/index.html?buildingId=${encodeURIComponent(buildingId)}` +
      `&incidentId=${encodeURIComponent(incident.id)}&tool=hazard`;
    window.open(url, '_blank', 'noopener');
  }

  function floorLabel(n) {
    if (n == null || n === '') return 'mọi tầng';
    const v = Number(n);
    return v === 0 ? 'GF' : `${v}F`;
  }

  function renderHazardZonesSection(incident, zones) {
    const list = Array.isArray(zones) ? zones : [];
    const canWrite = typeof userHasPermission === 'function' &&
      (userHasPermission('emergency.incident.write') || currentUser?.role === 'SUPER_ADMIN');
    const rows = list.length
      ? list.map((z) => `
        <tr>
          <td>${escapeHtml(z.name || HAZARD_TYPE_VI[z.hazard_type] || z.hazard_type)}</td>
          <td>${escapeHtml(HAZARD_TYPE_VI[z.hazard_type] || z.hazard_type || '—')}</td>
          <td>${escapeHtml(floorLabel(z.floor_number))}</td>
          <td>${Array.isArray(z.polygon) ? z.polygon.length : 0}</td>
          <td>${z.active
    ? '<span class="badge" style="background:#16a34a;color:#fff;">ACTIVE</span>'
    : '<span class="badge" style="background:#ea580c;color:#fff;">Nháp</span>'}</td>
          <td>
            ${canWrite && !z.active
    ? `<button type="button" class="btn-edit btn-sm" data-hz="activate" data-id="${escapeHtml(z.id)}">Bật</button>`
    : ''}
            ${canWrite && z.active
    ? `<button type="button" class="btn-edit btn-sm" data-hz="deactivate" data-id="${escapeHtml(z.id)}">Tắt</button>`
    : ''}
            ${canWrite
    ? `<button type="button" class="btn-edit btn-sm" data-hz="delete" data-id="${escapeHtml(z.id)}">Xóa</button>`
    : ''}
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="6" style="text-align:center;color:#666;">Chưa có vùng — mở Web Editor để khoanh.</td></tr>';

    return `
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid #fecaca;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <h5 style="margin:0;">Vùng nguy hiểm (${list.filter((z) => z.active).length}/${list.length} active)</h5>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn-edit btn-sm" data-hz="open-editor">Vẽ vùng trên bản đồ</button>
            ${canWrite && incident?.status === 'ACTIVE'
    ? `<button type="button" class="btn-edit btn-sm" data-hz="activate-all">Bật tất cả</button>
               <button type="button" class="btn-edit btn-sm" data-hz="deactivate-all">Tắt tất cả</button>`
    : ''}
            <button type="button" class="btn-edit btn-sm" data-hz="reload">Làm mới zone</button>
          </div>
        </div>
        <p style="font-size:12px;color:#666;margin:8px 0;">
          Vẽ polygon trên Web Editor (toạ độ map). Zone mới là <b>nháp</b> — bật khi sự cố ACTIVE để app tránh vùng khi sơ tán.
        </p>
        <table class="data-table" style="width:100%;font-size:13px;">
          <thead>
            <tr><th>Tên</th><th>Loại</th><th>Tầng</th><th>Điểm</th><th>TT</th><th></th></tr>
          </thead>
          <tbody id="emergencyHazardZonesBody">${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderTrappedUsersSection(recentLocations) {
    const rows = (recentLocations || []).filter((l) => l.possibly_trapped);
    if (!rows.length) {
      return `<p style="font-size:13px;color:#78716c;">Chưa có user gắn cờ “có thể mắc kẹt” (đứng yên ≥ 15 phút khi sự cố ACTIVE).</p>`;
    }
    const body = rows.map((l) => {
      const mins = l.still_duration_ms != null ? Math.round(Number(l.still_duration_ms) / 60000) : '—';
      const coords = (l.lat != null && l.lng != null)
        ? `${Number(l.lat).toFixed(5)}, ${Number(l.lng).toFixed(5)}`
        : '—';
      return `<tr>
        <td><span class="badge" style="background:#b91c1c;color:#fff;">Mắc kẹt?</span> ${escapeHtml(String(l.user_id).slice(-6))}</td>
        <td>${l.floor_number != null ? l.floor_number : '—'}</td>
        <td>${escapeHtml(l.motion || 'still')}</td>
        <td>${mins} phút</td>
        <td title="${escapeHtml(coords)}">${escapeHtml(coords)}</td>
        <td>${fmtTime(l.reported_at || l.updatedAt)}</td>
      </tr>`;
    }).join('');
    return `
      <div class="emergency-card" style="margin:12px 0;border-color:#fecaca;background:#fff7f7;">
        <h5 style="margin:0 0 8px;color:#b91c1c;">Có thể mắc kẹt (${rows.length})</h5>
        <p style="margin:0 0 8px;font-size:12px;color:#78716c;">Đứng yên ≥ 15 phút — ưu tiên cứu hộ theo tọa độ cuối.</p>
        <table class="data-table" style="width:100%;">
          <thead><tr><th>User</th><th>Tầng</th><th>Motion</th><th>Đứng yên</th><th>GPS cuối</th><th>Cập nhật</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  async function loadHazardZones(incidentId) {
    const data = await apiFetch(`/incidents/${incidentId}/hazard-zones`);
    return data.hazard_zones || [];
  }

  async function showCommandCenter(id) {
    const data = await apiFetch(`/incidents/${id}/command-center`);
    const panel = document.getElementById('emergencyCommandPanel');
    if (!panel) return;
    const snap = data;
    _commandIncidentId = id;
    _commandIncident = snap.incident || { id };
    const incidentStatus = statusLabel(snap.incident?.status);
    const broadcastStatus = broadcastStatusLabel(snap.broadcast?.latest?.status);
    const wake = snap.broadcast?.latest?.proximity_wake_count || 0;
    const recipients = snap.broadcast?.latest?.recipient_count || 0;
    let zones = snap.hazard_zones?.zones || [];
    if (!zones.length) {
      try {
        zones = await loadHazardZones(id);
      } catch (_) {
        zones = [];
      }
    }
    panel.innerHTML = `
      <h4>Trung tâm điều khiển — ${escapeHtml(snap.incident?.title)}</h4>
      <p>Trạng thái: <strong>${escapeHtml(incidentStatus)}</strong>
        · Vùng nguy hiểm đang hiệu lực: ${snap.hazard_zones?.active || zones.filter((z) => z.active).length}
        · Vị trí người dùng: ${snap.locations?.count || 0}
        · <span style="color:#b91c1c;font-weight:600;">Có thể mắc kẹt: ${snap.locations?.possibly_trapped_count || 0}</span></p>
      <p>Phát thông báo: ${escapeHtml(broadcastStatus)}
        (${recipients} người trong khu vực${wake ? `; wake kiểm tra ${wake}` : ''})</p>
      ${renderTrappedUsersSection(snap.locations?.recent || [])}
      <details><summary>Nhật ký sự kiện (${(snap.timeline || []).length})</summary>
        <ul>${(snap.timeline || []).slice(0, 10).map((t) =>
          `<li>${escapeHtml(t.action)} — ${new Date(t.at).toLocaleString('vi-VN')}</li>`
        ).join('')}</ul>
      </details>
      ${renderHazardZonesSection(_commandIncident, zones)}
    `;
    panel.style.display = 'block';
    if (!panel.dataset.hzBound) {
      panel.dataset.hzBound = '1';
      panel.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-hz]');
        if (!btn) return;
        const act = btn.getAttribute('data-hz');
        const zoneId = btn.getAttribute('data-id');
        const incidentId = _commandIncidentId;
        if (!incidentId) return;
        const run = async () => {
          if (act === 'open-editor') {
            openHazardEditor(_commandIncident);
            return;
          }
          if (act === 'reload') {
            await showCommandCenter(incidentId);
            return;
          }
          if (act === 'activate' && zoneId) {
            await apiFetch(`/incidents/${incidentId}/hazard-zones/activate`, {
              method: 'POST',
              body: JSON.stringify({ zone_ids: [zoneId] })
            });
            if (typeof showToast === 'function') showToast('Đã bật vùng nguy hiểm.', 'success');
          }
          if (act === 'deactivate' && zoneId) {
            await apiFetch(`/incidents/${incidentId}/hazard-zones/deactivate`, {
              method: 'POST',
              body: JSON.stringify({ zone_ids: [zoneId] })
            });
            if (typeof showToast === 'function') showToast('Đã tắt vùng.', 'success');
          }
          if (act === 'activate-all') {
            await apiFetch(`/incidents/${incidentId}/hazard-zones/activate`, {
              method: 'POST',
              body: JSON.stringify({})
            });
            if (typeof showToast === 'function') showToast('Đã bật tất cả vùng.', 'success');
          }
          if (act === 'deactivate-all') {
            await apiFetch(`/incidents/${incidentId}/hazard-zones/deactivate`, {
              method: 'POST',
              body: JSON.stringify({})
            });
            if (typeof showToast === 'function') showToast('Đã tắt tất cả vùng.', 'success');
          }
          if (act === 'delete' && zoneId) {
            if (!confirm('Xóa vùng nguy hiểm này?')) return;
            await apiFetch(`/hazard-zones/${zoneId}`, { method: 'DELETE' });
            if (typeof showToast === 'function') showToast('Đã xóa vùng.', 'success');
          }
          await showCommandCenter(incidentId);
        };
        run().catch((err) => {
          if (typeof showToast === 'function') showToast(err.message, 'error');
          else alert(err.message);
        });
      });
    }
  }

  function bindEvents() {
    bindBuildingCombobox();
    const form = document.getElementById('emergencyCreateForm');
    if (form && !form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', (e) => createIncident(e).catch((err) => {
        if (typeof showToast === 'function') showToast(err.message, 'error');
        else alert(err.message);
      }));
    }
    const tbody = document.getElementById('emergencyIncidentsBody');
    if (tbody && !tbody.dataset.bound) {
      tbody.dataset.bound = '1';
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-emergency-action]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-emergency-action');
        if (action === 'activate') changeStatus(id, 'ACTIVE').catch((err) => alert(err.message));
        if (action === 'contained') changeStatus(id, 'CONTAINED').catch((err) => alert(err.message));
        if (action === 'resolved') changeStatus(id, 'RESOLVED').catch((err) => alert(err.message));
        if (action === 'broadcast') sendBroadcast(id).catch((err) => alert(err.message));
        if (action === 'command') showCommandCenter(id).catch((err) => alert(err.message));
        if (action === 'draw-hazard') {
          openHazardEditor({
            id,
            building_id: btn.getAttribute('data-building')
          });
        }
      });
    }
    const refreshBtn = document.getElementById('btnEmergencyRefresh');
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = '1';
      refreshBtn.addEventListener('click', () => {
        const sub = window._activeEmergencySub || 'incidents';
        const tasks = [loadIncidents()];
        if (sub === 'seismic' || sub === 'seismic-data') tasks.push(loadSeismicOverview());
        Promise.all(tasks).catch((err) => alert(err.message));
      });
    }
    const trappedRefresh = document.getElementById('btnRefreshTrapped');
    if (trappedRefresh && !trappedRefresh.dataset.bound) {
      trappedRefresh.dataset.bound = '1';
      trappedRefresh.addEventListener('click', () => {
        loadPossiblyTrapped().catch((err) => alert(err.message));
      });
    }
    const trappedBody = document.getElementById('emergencyTrappedBody');
    if (trappedBody && !trappedBody.dataset.bound) {
      trappedBody.dataset.bound = '1';
      trappedBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-emergency-action]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-emergency-action');
        if (action === 'command') showCommandCenter(id).catch((err) => alert(err.message));
      });
    }
    const seismicBtn = document.getElementById('btnSeismicRefresh');
    if (seismicBtn && !seismicBtn.dataset.bound) {
      seismicBtn.dataset.bound = '1';
      seismicBtn.addEventListener('click', () => {
        loadSeismicOverview().catch((err) => alert(err.message));
      });
    }
    const seismicBody = document.getElementById('seismicIncidentsBody');
    if (seismicBody && !seismicBody.dataset.bound) {
      seismicBody.dataset.bound = '1';
      seismicBody.addEventListener('click', (e) => {
        const usersBtn = e.target.closest('[data-seismic-users]');
        if (usersBtn) {
          renderSeismicIncidentUsers(usersBtn.getAttribute('data-seismic-users'));
          return;
        }
        const btn = e.target.closest('[data-emergency-action]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-emergency-action');
        if (action === 'command') showCommandCenter(id).catch((err) => alert(err.message));
        if (action === 'contained') changeStatus(id, 'CONTAINED').catch((err) => alert(err.message));
        if (action === 'resolved') changeStatus(id, 'RESOLVED').catch((err) => alert(err.message));
      });
    }
  }

  function fmtTime(v) {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('vi-VN');
    } catch (_) {
      return String(v);
    }
  }

  function renderSeismicKpis(stats, targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const s = stats || {};
    const cards = [
      { label: 'Báo cáo 24h', value: s.report_count_24h || 0, accent: 'accent-orange' },
      { label: 'User gửi tín hiệu', value: s.unique_users_24h || 0, accent: 'accent-blue' },
      { label: 'Thiết bị', value: s.unique_devices_24h || 0, accent: 'accent-teal' },
      { label: 'Sự cố EARTHQUAKE', value: s.earthquake_incident_count || 0, accent: 'accent-red' }
    ];
    el.innerHTML = cards.map((c) => `
      <div class="org-overview-card ${c.accent}">
        <div class="ov-label">${escapeHtml(c.label)}</div>
        <div class="ov-value">${c.value}</div>
        <div class="ov-sub">Trong phạm vi quản lý</div>
      </div>`).join('');
  }

  async function loadSeismicOverview() {
    const cfgEl = document.getElementById('seismicConfigText');
    const reportsBody = document.getElementById('seismicReportsBody');
    const incidentsBody = document.getElementById('seismicIncidentsBody');
    const usersBody = document.getElementById('seismicUsersBody');
    const detailEl = document.getElementById('seismicIncidentDetail');
    if (!reportsBody && !incidentsBody && !usersBody) return;

    const data = await apiFetch('/seismic/overview');
    window._seismicOverviewCache = data;
    const cfg = data.config || {};
    if (cfgEl) {
      cfgEl.textContent =
        `Consensus: ≥${cfg.min_devices || 2} máy · Δt≤${cfg.coincidence_ms || 1000}ms` +
        (cfg.min_density > 0
          ? ` · mật độ ≥${Math.round((cfg.min_density || 0) * 100)}% (khi online≥${cfg.density_min_online || 5})`
          : ' · mật độ tắt') +
        ` · peak ≥${cfg.min_magnitude || 0.5} · cooldown ${cfg.cooldown_min || 30} phút/tòa · FCM high-priority`;
    }

    renderSeismicKpis(data.stats, 'seismicKpiGrid');
    renderSeismicKpis(data.stats, 'seismicDataKpiGrid');

    const users = data.users_24h || [];
    if (usersBody) {
      if (!users.length) {
        usersBody.innerHTML = '<tr><td colspan="9" style="color:#888;">Chưa có user gửi cảm biến trong 24h.</td></tr>';
      } else {
        usersBody.innerHTML = users.map((u) => {
          const linked = (u.linked_incident_ids || []).map((id) => `#${String(id).slice(-6)}`).join(', ') || '—';
          const buildings = (u.buildings || []).join(', ') || '—';
          return `<tr>
            <td>${escapeHtml(u.display_name || u.full_name || '—')}</td>
            <td>${escapeHtml(u.email || '—')}</td>
            <td>${u.report_count || 0}</td>
            <td>${u.device_count || 0}</td>
            <td>${escapeHtml(buildings)}</td>
            <td>${u.peak_max != null ? Number(u.peak_max).toFixed(2) : '—'}</td>
            <td>${u.sta_lta_max != null ? Number(u.sta_lta_max).toFixed(2) : '—'}</td>
            <td>${fmtTime(u.last_at)}</td>
            <td>${escapeHtml(linked)}</td>
          </tr>`;
        }).join('');
      }
    }

    const quakes = data.earthquake_incidents || [];
    if (incidentsBody) {
      if (!quakes.length) {
        incidentsBody.innerHTML = '<tr><td colspan="7" style="color:#888;">Chưa có sự cố động đất.</td></tr>';
        if (detailEl) {
          detailEl.style.display = 'none';
          detailEl.innerHTML = '';
        }
      } else {
        incidentsBody.innerHTML = quakes.map((row) => {
          const stLabel = statusLabel(row.status);
          const actions = [];
          if (row.status === 'ACTIVE') {
            actions.push(`<button type="button" class="btn-edit btn-sm" data-emergency-action="contained" data-id="${row.id}">Khoanh</button>`);
            actions.push(`<button type="button" class="btn-edit btn-sm" data-emergency-action="resolved" data-id="${row.id}">Kết thúc</button>`);
          }
          actions.push(`<button type="button" class="btn-edit btn-sm" data-emergency-action="command" data-id="${row.id}">Điều khiển</button>`);
          actions.push(`<button type="button" class="btn-edit btn-sm" data-seismic-users="${row.id}">User liên quan</button>`);
          const srcBadge = row.external_source === 'usgs'
            ? ' <span class="badge" style="background:#1d4ed8;color:#fff;">USGS</span>'
            : '';
          const trapN = row.possibly_trapped_count || 0;
          const trapBadge = trapN
            ? ` <span class="badge" style="background:#b91c1c;color:#fff;">${trapN} mắc kẹt?</span>`
            : '';
          return `<tr>
            <td>${escapeHtml(row.title || 'Động đất')}${srcBadge}</td>
            <td>${escapeHtml(stLabel)}</td>
            <td>${escapeHtml(row.building_name || buildingName(row.building_id))}</td>
            <td>${row.contributor_count || 0}</td>
            <td>${row.affected_count || 0}${trapBadge}</td>
            <td>${fmtTime(row.activated_at || row.createdAt)}</td>
            <td class="actions-cell">${actions.join(' ')}</td>
          </tr>`;
        }).join('');
      }
    }

    const reports = data.reports || [];
    if (reportsBody) {
      if (!reports.length) {
        reportsBody.innerHTML = '<tr><td colspan="8" style="color:#888;">Chưa có báo cáo rung trong 24h.</td></tr>';
      } else {
        reportsBody.innerHTML = reports.map((r) => {
          const linked = r.incident_id
            ? `<span style="color:#b45309;">#${String(r.incident_id).slice(-6)}</span>`
            : '—';
          const peak = r.peak_ms2 != null ? Number(r.peak_ms2).toFixed(2) : (r.magnitude != null ? Number(r.magnitude).toFixed(2) : '—');
          const ratio = r.sta_lta_ratio != null ? Number(r.sta_lta_ratio).toFixed(2) : '—';
          const dev = String(r.device_id || '').slice(0, 8);
          const matchLabel = r.building_match
            ? ({ gps: 'GPS', hint: 'hint', presence: 'presence' }[r.building_match] || r.building_match)
            : '';
          const src = [r.source, matchLabel].filter(Boolean).join(' · ');
          return `<tr>
            <td>${fmtTime(r.createdAt)}</td>
            <td title="${escapeHtml(r.user_email || '')}">${escapeHtml(r.user_display || '—')}</td>
            <td>${escapeHtml(r.building_name || buildingName(r.building_id))}</td>
            <td title="${escapeHtml(r.device_id || '')}">${escapeHtml(dev)}…</td>
            <td>${peak}</td>
            <td>${ratio}</td>
            <td title="${r.lat != null ? escapeHtml(`${r.lat},${r.lng}`) : ''}">${escapeHtml(src || '—')}</td>
            <td>${linked}</td>
          </tr>`;
        }).join('');
      }
    }
  }

  function renderSeismicIncidentUsers(incidentId) {
    const detailEl = document.getElementById('seismicIncidentDetail');
    if (!detailEl) return;
    const data = window._seismicOverviewCache || {};
    const row = (data.earthquake_incidents || []).find((i) => String(i.id) === String(incidentId));
    if (!row) {
      detailEl.style.display = 'none';
      return;
    }
    const contributors = row.contributors || [];
    const affected = row.affected_users || [];
    const contribRows = contributors.length
      ? contributors.map((u) => `<tr>
          <td>${escapeHtml(u.display_name || '—')}</td>
          <td>${escapeHtml(u.email || '—')}</td>
          <td>${u.report_count || 0}</td>
          <td>${u.device_count || 0}</td>
          <td>${u.peak_max != null ? Number(u.peak_max).toFixed(2) : '—'}</td>
          <td>${fmtTime(u.last_at)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" style="color:#888;">Chưa gắn báo cáo cảm biến (chưa đủ consensus / chưa link).</td></tr>';
    const affectedRows = affected.length
      ? affected.map((u) => {
          const trap = u.possibly_trapped
            ? ' <span class="badge" style="background:#b91c1c;color:#fff;">Có thể mắc kẹt</span>'
            : '';
          const stillMin = u.still_duration_ms != null
            ? `${Math.round(Number(u.still_duration_ms) / 60000)}p`
            : '—';
          return `<tr>
          <td>${escapeHtml(u.display_name || '—')}${trap}</td>
          <td>${escapeHtml(u.email || '—')}</td>
          <td>${u.floor_number != null ? u.floor_number : '—'}</td>
          <td>${escapeHtml(u.source || '—')} · ${escapeHtml(u.motion || '—')} · yên ${stillMin}</td>
          <td>${fmtTime(u.last_location_at)}</td>
        </tr>`;
        }).join('')
      : '<tr><td colspan="5" style="color:#888;">Chưa có user báo vị trí trong sự cố này.</td></tr>';

    detailEl.style.display = 'block';
    detailEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;">
        <strong>User liên quan sự cố #${escapeHtml(String(row.id).slice(-6))} — ${escapeHtml(row.title || 'Động đất')}</strong>
        <button type="button" class="btn-add" id="btnCloseSeismicDetail" style="padding:4px 8px;font-size:12px;background:#64748b;">Đóng</button>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#78716c;">
        <strong>Đóng góp cảm biến</strong>: máy gửi rung dẫn tới / gắn với sự cố.
        <strong>Ảnh hưởng</strong>: user đã báo vị trí khi sự cố ACTIVE (heartbeat / sơ tán).
      </p>
      <h6 style="margin:8px 0;">Đóng góp cảm biến (${contributors.length})</h6>
      <table class="data-table" style="width:100%;margin-bottom:12px;">
        <thead><tr><th>User</th><th>Email</th><th>Báo cáo</th><th>Thiết bị</th><th>Peak max</th><th>Gần nhất</th></tr></thead>
        <tbody>${contribRows}</tbody>
      </table>
      <h6 style="margin:8px 0;">User ảnh hưởng / trong khu vực (${affected.length})</h6>
      <table class="data-table" style="width:100%;">
        <thead><tr><th>User</th><th>Email</th><th>Tầng</th><th>Nguồn</th><th>Cập nhật</th></tr></thead>
        <tbody>${affectedRows}</tbody>
      </table>`;
    document.getElementById('btnCloseSeismicDetail')?.addEventListener('click', () => {
      detailEl.style.display = 'none';
      detailEl.innerHTML = '';
    });
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function switchSeismicDataSub(name) {
    // Legacy: tab "reports" đã gộp vào "overview"
    let next = name === 'reports' ? 'overview' : name;
    next = ['overview', 'users'].includes(next) ? next : 'overview';
    window._activeSeismicDataSub = next;
    try { localStorage.setItem('indoorNavSeismicDataSub', next); } catch (_) { /* ignore */ }

    document.querySelectorAll('.seismic-data-subpanel').forEach((panel) => {
      const match = panel.getAttribute('data-seismic-data-panel') === next;
      panel.hidden = !match;
      panel.classList.toggle('is-active', match);
    });
    document.querySelectorAll('#seismicDataSubNav .finance-subnav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-seismic-data-sub') === next);
    });
  }

  function showEmergencySub(sub) {
    let next = sub === 'create' ? 'incidents' : sub;
    next = ['incidents', 'seismic', 'seismic-data'].includes(next) ? next : 'incidents';
    window._activeEmergencySub = next;
    try { localStorage.setItem('indoorNavEmergencySub', next); } catch (_) { /* ignore */ }

    document.querySelectorAll('.emergency-subpanel').forEach((panel) => {
      const match = panel.getAttribute('data-emergency-panel') === next;
      panel.hidden = !match;
      panel.classList.toggle('is-active', match);
    });

    const titles = {
      incidents: 'Trung tâm điều khiển khẩn cấp',
      seismic: 'Động đất — sự cố',
      'seismic-data': 'Dữ liệu cảm biến'
    };
    const titleEl = document.getElementById('emergencyPageTitle');
    if (titleEl) titleEl.textContent = titles[next] || 'Trung tâm điều khiển khẩn cấp';

    const seismicBtn = document.getElementById('btnSeismicRefresh');
    if (seismicBtn) {
      seismicBtn.style.display = (next === 'seismic' || next === 'seismic-data') ? '' : 'none';
    }

    if (next === 'seismic-data') {
      let dataSub = window._activeSeismicDataSub;
      if (!dataSub) {
        try { dataSub = localStorage.getItem('indoorNavSeismicDataSub') || 'overview'; } catch (_) { dataSub = 'overview'; }
      }
      switchSeismicDataSub(dataSub);
    }

    if (typeof syncDashboardNavActive === 'function') {
      syncDashboardNavActive('emergency', { emergencySub: next });
    }
  }

  async function load() {
    if (!canAccessEmergency()) {
      alert('Bạn không có quyền truy cập trung tâm điều khiển khẩn cấp.');
      if (typeof switchTab === 'function') await switchTab('buildings', { skipHistory: true });
      return;
    }
    bindEvents();
    await loadBuildingsForSelect();
    let sub = window._activeEmergencySub;
    if (!sub) {
      try { sub = localStorage.getItem('indoorNavEmergencySub') || 'incidents'; } catch (_) { sub = 'incidents'; }
    }
    if (sub === 'create') sub = 'incidents';
    showEmergencySub(sub);
    const tasks = [loadIncidents()];
    if (sub === 'seismic' || sub === 'seismic-data') tasks.push(loadSeismicOverview());
    await Promise.all(tasks);
  }

  global.EmergencyAdmin = {
    load,
    loadIncidents,
    loadPossiblyTrapped,
    loadSeismicOverview,
    showEmergencySub,
    switchSeismicDataSub,
    canAccessEmergency,
    populateBuildingSelect
  };
})(window);
