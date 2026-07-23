/**
 * GĐ6 — Outdoor Discovery (Leaflet + OSM tiles + Place Registry API)
 */
(function () {
  const API = '/api/places';
  const DEFAULT_CENTER = [10.762622, 106.660172]; // HCM
  const GEOFENCE_M = 150;

  const map = L.map('map').setView(DEFAULT_CENTER, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const markersLayer = L.layerGroup().addTo(map);
  let places = [];
  let userMarker = null;
  let userCircle = null;
  let selectedId = null;

  const elQ = document.getElementById('q');
  const elResults = document.getElementById('results');
  const elDetail = document.getElementById('detail');
  const elStatus = document.getElementById('statusLine');

  function setStatus(text) {
    elStatus.textContent = text || '';
  }

  function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function renderMarkers(list) {
    markersLayer.clearLayers();
    places = list || [];
    places.forEach((p) => {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
      const m = L.marker([lat, lng]);
      m.bindTooltip(p.name || 'Place');
      m.on('click', () => selectPlace(p, true));
      markersLayer.addLayer(m);
    });
  }

  function renderResults(list) {
    elResults.innerHTML = '';
    (list || []).forEach((p) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'place-card' + (selectedId === p._id ? ' active' : '');
      const indoor = p.has_published_indoor
        ? '<span class="badge ok">Có bản đồ trong nhà</span>'
        : '<span class="badge warn">Chưa có Indoor</span>';
      const dist = p.distance_m != null ? ` · ${p.distance_m}m` : '';
      card.innerHTML =
        `<div class="name">${escapeHtml(p.name || '')}</div>` +
        `<div class="meta">${escapeHtml(p.category || '—')} · ${escapeHtml(p.address || 'Chưa có địa chỉ')}${dist}</div>` +
        indoor;
      card.addEventListener('click', () => selectPlace(p, true));
      elResults.appendChild(card);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function selectPlace(p, pan) {
    selectedId = p._id;
    renderResults(places);
    if (pan && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))) {
      map.setView([p.latitude, p.longitude], Math.max(map.getZoom(), 16));
    }
    elDetail.innerHTML = '<p class="sub">Đang tải chi tiết…</p>';
    try {
      const res = await fetch(API + '/' + encodeURIComponent(p._id));
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi ' + res.status);
      const place = data.place || p;
      const rooms = data.indoor_workspaces || [];
      const indoorHtml = rooms.length
        ? `<p><strong>${rooms.length}</strong> indoor workspace đã publish.</p>` +
          rooms.map((b) => `<div class="meta">• ${escapeHtml(b.name)} (${escapeHtml(b.workspace_status || b.status || '')})</div>`).join('')
        : '<p class="sub">Chưa có bản đồ trong nhà — có thể đề xuất / tạo workspace trên hệ thống.</p>';
      elDetail.innerHTML =
        `<h2>${escapeHtml(place.name || '')}</h2>` +
        `<div class="meta">${escapeHtml(place.category || '')} · ${escapeHtml(place.owner_type || '')}</div>` +
        `<div class="meta">${escapeHtml(place.address || '')}</div>` +
        indoorHtml;
    } catch (e) {
      elDetail.innerHTML = `<p class="sub">${escapeHtml(e.message)}</p>`;
    }
  }

  async function loadAll() {
    setStatus('Đang tải Place công khai…');
    try {
      const res = await fetch(API + '?limit=100');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
      const list = data.places || [];
      renderMarkers(list);
      renderResults(list);
      setStatus(`${list.length} Place · click bản đồ hoặc tìm kiếm`);
      if (list.length) {
        const withGps = list.filter((p) => p.latitude || p.longitude);
        if (withGps.length) {
          const bounds = L.latLngBounds(withGps.map((p) => [p.latitude, p.longitude]));
          map.fitBounds(bounds.pad(0.2));
        }
      }
    } catch (e) {
      setStatus('Lỗi tải Place: ' + e.message);
    }
  }

  async function search() {
    const q = (elQ.value || '').trim();
    setStatus('Đang tìm…');
    try {
      const body = { q, limit: 50 };
      if (userMarker) {
        const ll = userMarker.getLatLng();
        body.lat = ll.lat;
        body.lng = ll.lng;
        body.radius_m = 5000;
      }
      const res = await fetch(API + '/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
      const list = data.places || [];
      renderMarkers(list);
      renderResults(list);
      setStatus(`Tìm thấy ${list.length} · mode ${data.search_mode || 'text'}`);
    } catch (e) {
      setStatus('Lỗi tìm: ' + e.message);
    }
  }

  function onGps() {
    if (!navigator.geolocation) {
      setStatus('Trình duyệt không hỗ trợ GPS');
      return;
    }
    setStatus('Đang lấy GPS…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (userMarker) map.removeLayer(userMarker);
        if (userCircle) map.removeLayer(userCircle);
        userMarker = L.circleMarker([lat, lng], {
          radius: 8,
          color: '#2d8cff',
          fillColor: '#2d8cff',
          fillOpacity: 0.9
        }).addTo(map);
        userCircle = L.circle([lat, lng], {
          radius: GEOFENCE_M,
          color: '#2d8cff',
          weight: 1,
          fillOpacity: 0.08
        }).addTo(map);
        map.setView([lat, lng], 16);

        const near = places
          .map((p) => ({
            p,
            d: haversineM(lat, lng, Number(p.latitude), Number(p.longitude))
          }))
          .filter((x) => Number.isFinite(x.d) && x.d <= GEOFENCE_M)
          .sort((a, b) => a.d - b.d);

        if (near.length) {
          setStatus(`GPS OK · ${near.length} Place trong ${GEOFENCE_M}m`);
          selectPlace({ ...near[0].p, distance_m: Math.round(near[0].d) }, false);
        } else {
          setStatus(`GPS OK · không có Place trong ${GEOFENCE_M}m — thử Tìm gần`);
        }
      },
      (err) => setStatus('GPS lỗi: ' + err.message),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  map.on('click', (e) => {
    // Click trống: gợi ý tạo proposal (CTA text)
    elDetail.innerHTML =
      `<h2>Vị trí đã chọn</h2>` +
      `<div class="meta">${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}</div>` +
      `<p class="sub">Muốn thêm Place? Đăng nhập và gửi Proposal (POST /api/proposals).</p>`;
  });

  document.getElementById('btnSearch').addEventListener('click', search);
  document.getElementById('btnGps').addEventListener('click', onGps);
  elQ.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') search();
  });

  loadAll();
})();
