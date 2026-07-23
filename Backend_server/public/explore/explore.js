// Outdoor Explore — Leaflet + OSM + Place Registry (PHASE 4 / 4c polish)
(function () {
  const API = '/api';
  const DEFAULT_CENTER = [10.7769, 106.7009];
  const DEFAULT_ZOOM = 13;
  const DEBOUNCE_MS = 400;

  const map = L.map('ex-map', { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const markersLayer = L.layerGroup().addTo(map);
  let userMarker = null;
  let places = [];
  let activeId = null;
  let lastNear = null; // { lat, lng }
  let searchTimer = null;

  const el = {
    q: document.getElementById('exQ'),
    cat: document.getElementById('exCat'),
    list: document.getElementById('exList'),
    status: document.getElementById('exStatus'),
    detail: document.getElementById('exDetail'),
    title: document.getElementById('exDetailTitle'),
    addr: document.getElementById('exDetailAddr'),
    meta: document.getElementById('exDetailMeta'),
    indoor: document.getElementById('exDetailIndoor')
  };

  function setStatus(msg) {
    if (el.status) el.status.textContent = msg;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function currentFilters(extra) {
    const out = Object.assign({}, extra || {});
    const q = el.q?.value.trim();
    const cat = el.cat?.value.trim();
    if (q) out.q = q;
    if (cat) out.category = cat;
    if (lastNear) {
      if (out.lat == null) out.lat = lastNear.lat;
      if (out.lng == null) out.lng = lastNear.lng;
      if (out.radius_m == null) out.radius_m = 3000;
    }
    return out;
  }

  async function fetchPlaces(params) {
    const p = params || {};
    const hasGeo = p.lat != null && p.lng != null;
    const hasText = !!(p.q || p.category);
    if (hasGeo || hasText) {
      const res = await fetch(API + '/places/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: p.q || '',
          category: p.category || '',
          lat: p.lat,
          lng: p.lng,
          radius_m: p.radius_m || 3000,
          limit: p.limit || 80
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải được Place');
      return data.places || [];
    }
    const qs = new URLSearchParams({ limit: String(p.limit || 80) });
    if (p.q) qs.set('q', p.q);
    if (p.category) qs.set('category', p.category);
    const res = await fetch(API + '/places?' + qs.toString());
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Không tải được Place');
    return data.places || [];
  }

  function renderList() {
    if (!el.list) return;
    if (!places.length) {
      el.list.innerHTML = '<p class="ex-meta" style="padding:8px;">Không có địa điểm công khai trong phạm vi.</p>';
      return;
    }
    el.list.innerHTML = places.map((p) => {
      const dist = p.distance_m != null ? Math.round(p.distance_m) + ' m' : '';
      const indoor = (p.building_count || 0) > 0
        ? '<span class="ex-badge">Có Indoor</span>'
        : '<span class="ex-badge ex-badge-warn">Chưa Indoor</span>';
      return (
        '<button type="button" class="ex-item' + (String(p._id) === String(activeId) ? ' is-active' : '') +
        '" data-id="' + escapeHtml(p._id) + '">' +
        '<strong>' + escapeHtml(p.name) + '</strong>' +
        '<span>' + escapeHtml(p.category || '—') + (dist ? ' · ' + dist : '') + '</span>' +
        indoor +
        '</button>'
      );
    }).join('');

    el.list.querySelectorAll('.ex-item').forEach((btn) => {
      btn.addEventListener('click', () => selectPlace(btn.getAttribute('data-id'), true));
    });
  }

  function renderMarkers() {
    markersLayer.clearLayers();
    const bounds = [];
    places.forEach((p) => {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
      const radius = Math.max(20, Number(p.radius) || 80);
      const circle = L.circle([lat, lng], {
        radius,
        color: '#0d9488',
        weight: 1,
        fillColor: '#14b8a6',
        fillOpacity: 0.12
      });
      const marker = L.marker([lat, lng]);
      const html =
        '<strong>' + escapeHtml(p.name) + '</strong><br>' +
        escapeHtml(p.address || p.category || '') + '<br>' +
        '<button type="button" data-open="' + escapeHtml(p._id) + '">Chi tiết</button>';
      marker.bindPopup(html);
      marker.on('popupopen', (e) => {
        const btn = e.popup.getElement()?.querySelector('[data-open]');
        if (btn) btn.addEventListener('click', () => selectPlace(btn.getAttribute('data-open'), false));
      });
      marker.on('click', () => selectPlace(p._id, false));
      markersLayer.addLayer(circle);
      markersLayer.addLayer(marker);
      bounds.push([lat, lng]);
    });
    if (bounds.length) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 }); } catch (_) { /* ignore */ }
    }
  }

  function shareUrlForPlace(place) {
    const key = place?.slug || place?._id || activeId;
    const u = new URL(window.location.origin + '/explore');
    if (key) u.searchParams.set('place', key);
    return u.toString();
  }

  function authToken() {
    return localStorage.getItem('token') || '';
  }

  function authHeaders(json) {
    const h = { Authorization: 'Bearer ' + authToken() };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async function bindFavoriteButton(place) {
    const btn = document.getElementById('exFavBtn');
    if (!btn || !place?._id) return;
    if (!authToken()) {
      btn.hidden = false;
      btn.textContent = 'Đăng nhập để lưu';
      btn.onclick = () => {
        window.location.href = '/login?next=' + encodeURIComponent('/explore?place=' + (place.slug || place._id));
      };
      return;
    }
    btn.hidden = false;
    let favorited = false;
    try {
      const res = await fetch(API + '/hub/favorites/check?place_id=' + encodeURIComponent(place._id), {
        headers: authHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) favorited = !!data.favorited;
    } catch (_) { /* ignore */ }

    function paint() {
      btn.textContent = favorited ? '★ Đã lưu' : '☆ Yêu thích';
      btn.classList.toggle('ex-btn-fav-on', favorited);
    }
    paint();

    btn.onclick = async () => {
      btn.disabled = true;
      try {
        if (favorited) {
          const res = await fetch(API + '/hub/favorites/' + encodeURIComponent(place._id), {
            method: 'DELETE',
            headers: authHeaders()
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || 'Không bỏ lưu được');
          }
          favorited = false;
          setStatus('Đã bỏ yêu thích');
        } else {
          const res = await fetch(API + '/hub/favorites', {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({ place_id: place._id })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || 'Không lưu được');
          favorited = true;
          setStatus('Đã thêm yêu thích');
          fetch(API + '/hub/history', {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({ type: 'FAVORITE_PLACE', place_id: place._id, label: place.name || 'Place' })
          }).catch(() => {});
        }
        paint();
      } catch (e) {
        setStatus(e.message || 'Lỗi yêu thích');
      } finally {
        btn.disabled = false;
      }
    };
  }

  async function selectPlace(idOrSlug, pan) {
    activeId = idOrSlug;
    renderList();
    let p = places.find((x) =>
      String(x._id) === String(idOrSlug) || String(x.slug) === String(idOrSlug)
    );
    if (p && pan) {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
      }
    }

    if (el.detail) el.detail.hidden = false;
    if (el.title) el.title.textContent = p?.name || 'Đang tải…';
    if (el.addr) el.addr.textContent = p?.address || '';
    if (el.meta) el.meta.textContent = 'Đang tải chi tiết…';
    if (el.indoor) el.indoor.innerHTML = '';

    try {
      const key = p?._id || idOrSlug;
      const res = await fetch(API + '/places/' + encodeURIComponent(key));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải chi tiết');
      const place = data.place;
      activeId = place._id;
      p = place;
      if (!places.some((x) => String(x._id) === String(place._id))) {
        places = [place].concat(places);
      }
      renderList();
      if (pan || !markersLayer.getLayers().length) renderMarkers();

      const lat = Number(place.latitude);
      const lng = Number(place.longitude);
      if (pan && Number.isFinite(lat) && Number.isFinite(lng)) {
        map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
      }

      el.title.textContent = place.name;
      el.addr.textContent = place.address || 'Chưa có địa chỉ';
      el.meta.textContent =
        (place.category || '—') +
        ' · GPS ' + (Number(place.latitude) || 0).toFixed(5) + ', ' + (Number(place.longitude) || 0).toFixed(5) +
        (place.radius != null ? ' · radius ' + place.radius + 'm' : '') +
        (place.verified || place.verification_status === 'VERIFIED' ? ' · Đã xác minh' : '');

      const share = shareUrlForPlace(place);
      const indoorList = data.indoor_workspaces || data.indoor_buildings || [];
      const hasIndoor = data.has_indoor || indoorList.length > 0;
      let indoorHtml = '';
      if (hasIndoor && indoorList.length) {
        indoorHtml =
          '<p><strong>Bản đồ trong nhà công khai</strong></p><ul>' +
          indoorList.map((b) => (
            '<li><strong>' + escapeHtml(b.name) + '</strong> · ' +
            escapeHtml(b.workspace_status || b.visibility || b.status || '') +
            ' · ' + (b.total_floors || 1) + ' tầng' +
            '<br><span class="ex-meta">Mở Indoor trên app Android (Place → Indoor). ' +
            '<a href="/login">Đăng nhập web</a> nếu bạn là chủ map.</span></li>'
          )).join('') +
          '</ul>';
      } else {
        indoorHtml =
          '<p>Chưa có bản đồ trong nhà công khai.</p>' +
          '<p><a href="/login">Đăng nhập</a> để đề xuất Place / tạo Indoor Workspace.</p>';
      }
      indoorHtml +=
        '<div class="ex-share">' +
        '<button type="button" class="ex-btn" id="exFavBtn" hidden>Yêu thích</button>' +
        '<button type="button" class="ex-btn" id="exCopyLink">Sao chép link Place</button>' +
        '<a class="ex-btn ex-btn-primary" href="' + escapeHtml(share) + '">Link chia sẻ</a>' +
        '</div>';
      el.indoor.innerHTML = indoorHtml;
      document.getElementById('exCopyLink')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(share);
          setStatus('Đã sao chép link Place');
        } catch (_) {
          setStatus(share);
        }
      });
      bindFavoriteButton(place);

      // Sync URL without reload
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('place', place.slug || place._id);
        window.history.replaceState({}, '', u.pathname + u.search);
      } catch (_) { /* ignore */ }
    } catch (e) {
      if (el.meta) el.meta.textContent = e.message;
    }
  }

  async function loadAll(extra) {
    setStatus('Đang tải…');
    try {
      places = await fetchPlaces(currentFilters(extra));
      setStatus(places.length + ' địa điểm');
      renderList();
      renderMarkers();
    } catch (e) {
      setStatus(e.message);
      places = [];
      renderList();
      markersLayer.clearLayers();
    }
  }

  async function search() {
    await loadAll({});
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { search(); }, DEBOUNCE_MS);
  }

  function locateNear() {
    if (!navigator.geolocation) {
      setStatus('Trình duyệt không hỗ trợ GPS.');
      return;
    }
    setStatus('Đang lấy vị trí…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        lastNear = { lat, lng };
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.circleMarker([lat, lng], {
          radius: 8,
          color: '#fff',
          weight: 2,
          fillColor: '#2563eb',
          fillOpacity: 1
        }).addTo(map).bindPopup('Bạn đang ở đây');
        map.setView([lat, lng], 15);
        await loadAll({ lat, lng, radius_m: 3000 });
        setStatus((places.length ? places.length + ' địa điểm trong ~3km' : 'Không có Place gần bạn') +
          ' · ' + lat.toFixed(4) + ', ' + lng.toFixed(4));
      },
      (err) => setStatus('Không lấy được GPS: ' + (err.message || 'bị từ chối')),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  document.getElementById('exSearchBtn')?.addEventListener('click', search);
  document.getElementById('exNearBtn')?.addEventListener('click', locateNear);
  document.getElementById('exReloadBtn')?.addEventListener('click', () => {
    if (el.q) el.q.value = '';
    if (el.cat) el.cat.value = '';
    lastNear = null;
    loadAll({});
  });
  el.q?.addEventListener('input', scheduleSearch);
  el.q?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      search();
    }
  });
  el.cat?.addEventListener('change', search);

  const params = new URLSearchParams(window.location.search);
  const boot = async () => {
    if (params.get('category') && el.cat) el.cat.value = params.get('category');
    if (params.get('q') && el.q) el.q.value = params.get('q');

    if (params.get('lat') && params.get('lng')) {
      lastNear = { lat: Number(params.get('lat')), lng: Number(params.get('lng')) };
      await loadAll({
        lat: params.get('lat'),
        lng: params.get('lng'),
        radius_m: params.get('radius_m') || 5000
      });
    } else if (params.get('q') || params.get('category')) {
      await search();
    } else {
      await loadAll({});
    }

    const placeKey = params.get('place') || params.get('slug');
    if (placeKey) {
      await selectPlace(placeKey, true);
    }
  };
  boot();
})();
