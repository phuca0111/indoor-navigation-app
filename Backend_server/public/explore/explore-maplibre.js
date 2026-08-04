/**
 * Outdoor Explore — MapLibre GL JS
 * Nền cố định: OpenFreeMap Liberty (+ nhãn Việt vùng đảo)
 * Leaflet cũ: /explore?map=leaflet → explore-leaflet.js
 */
(function () {
  const API = '/api';
  const DEFAULT_CENTER = [106.7009, 10.7769]; // MapLibre: [lng, lat]
  const DEFAULT_ZOOM = 13;
  const DEBOUNCE_MS = 400;
  const Basemap = window.IndoorNavBasemap;
  const STYLE_URL =
    (Basemap && Basemap.LIBERTY_STYLE) || 'https://tiles.openfreemap.org/styles/liberty';

  const map = new maplibregl.Map({
    container: 'ex-map',
    style: STYLE_URL,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

  let places = [];
  let osmHits = [];
  let activeId = null;
  let lastNear = null;
  let searchTimer = null;
  let placeMarkers = [];
  let osmMarkers = [];
  let userMarker = null;
  let popup = null;
  let lastRouteCoords = null;

  if (Basemap) {
    Basemap.installBasemapSwitcher(map, {
      onStyleReady: function () {
        Basemap.preferVietnameseLabels(map);
        if (Basemap.ensureVietnamIslandLabels) Basemap.ensureVietnamIslandLabels(map);
        Basemap.ensureIslandBlankCovers(map);
        if (lastRouteCoords && lastRouteCoords.length >= 2) {
          ensureRouteLayer();
          map.getSource('outdoor-route').setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: lastRouteCoords },
          });
        }
      },
    });
  }

  const el = {
    q: document.getElementById('exQ'),
    cat: document.getElementById('exCat'),
    list: document.getElementById('exList'),
    status: document.getElementById('exStatus'),
    detail: document.getElementById('exDetail'),
    title: document.getElementById('exDetailTitle'),
    addr: document.getElementById('exDetailAddr'),
    meta: document.getElementById('exDetailMeta'),
    indoor: document.getElementById('exDetailIndoor'),
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

  function preferVietnameseLabels() {
    if (Basemap) Basemap.preferVietnameseLabels(map);
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
          limit: p.limit || 80,
        }),
      });
      const data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.message || 'Không tải được Place');
      return data.places || [];
    }
    const qs = new URLSearchParams({ limit: String(p.limit || 80) });
    if (p.q) qs.set('q', p.q);
    if (p.category) qs.set('category', p.category);
    const res = await fetch(API + '/places?' + qs.toString());
    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.message || 'Không tải được Place');
    return data.places || [];
  }

  function renderList() {
    if (!el.list) return;
    const osm = osmHits || [];
    if (!places.length && !osm.length) {
      el.list.innerHTML =
        '<p class="ex-meta" style="padding:8px;">Không có địa điểm công khai trong phạm vi.</p>';
      return;
    }
    let html = '';
    if (places.length) {
      html +=
        '<p class="ex-meta" style="padding:8px 8px 4px;">Địa điểm trong hệ thống · ' +
        places.length +
        '</p>';
      html += places
        .map(function (p) {
          const dist = p.distance_m != null ? Math.round(p.distance_m) + ' m' : '';
          const indoor =
            (p.building_count || 0) > 0
              ? '<span class="ex-badge">Có Indoor</span>'
              : '<span class="ex-badge ex-badge-warn">Chưa Indoor</span>';
          return (
            '<button type="button" class="ex-item' +
            (String(p._id) === String(activeId) ? ' is-active' : '') +
            '" data-id="' +
            escapeHtml(p._id) +
            '">' +
            '<strong>' +
            escapeHtml(p.name) +
            '</strong>' +
            '<span>' +
            escapeHtml(p.category || '—') +
            (dist ? ' · ' + dist : '') +
            '</span>' +
            indoor +
            '</button>'
          );
        })
        .join('');
    }
    if (osm.length) {
      html +=
        '<p class="ex-meta" style="padding:12px 8px 4px;">Địa điểm · ' + osm.length + '</p>';
      html += osm
        .map(function (hit, idx) {
          return (
            '<button type="button" class="ex-item" data-osm="' +
            idx +
            '">' +
            '<strong>' +
            escapeHtml(hit.name || '') +
            '</strong>' +
            '<span>' +
            escapeHtml(hit.display_name || '') +
            '</span>' +
            '</button>'
          );
        })
        .join('');
    }
    el.list.innerHTML = html;

    el.list.querySelectorAll('.ex-item[data-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectPlace(btn.getAttribute('data-id'), true);
      });
    });
    el.list.querySelectorAll('.ex-item[data-osm]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const hit = osmHits[Number(btn.getAttribute('data-osm'))];
        if (hit) focusOsmHit(hit);
      });
    });
  }

  function clearOsmMarkers() {
    osmMarkers.forEach(function (m) {
      try {
        m.remove();
      } catch (_) {}
    });
    osmMarkers = [];
  }

  function clearOutdoorRoute() {
    lastRouteCoords = null;
    if (map.getSource('outdoor-route')) {
      map.getSource('outdoor-route').setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  }

  function ensureRouteLayer() {
    if (map.getSource('outdoor-route')) return;
    map.addSource('outdoor-route', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id: 'outdoor-route-line',
      type: 'line',
      source: 'outdoor-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#1A73E8', 'line-width': 5 },
    });
  }

  async function drawOsrmRouteTo(lat, lng) {
    clearOutdoorRoute();
    const toLat = Number(lat);
    const toLng = Number(lng);
    if (!Number.isFinite(toLat) || !Number.isFinite(toLng)) return false;
    if (!navigator.geolocation) return false;
    return new Promise(function (resolve) {
      navigator.geolocation.getCurrentPosition(
        async function (pos) {
          try {
            const qs = new URLSearchParams({
              fromLat: String(pos.coords.latitude),
              fromLng: String(pos.coords.longitude),
              toLat: String(toLat),
              toLng: String(toLng),
              profile: 'foot',
            });
            const res = await fetch('/api/navigation/outdoor-route?' + qs.toString());
            const data = await res.json().catch(function () {
              return {};
            });
            if (!res.ok || !Array.isArray(data.polyline) || data.polyline.length < 2) {
              resolve(false);
              return;
            }
            ensureRouteLayer();
            const coords = data.polyline.map(function (p) {
              return [p.lng, p.lat];
            });
            lastRouteCoords = coords;
            map.getSource('outdoor-route').setData({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: coords },
            });
            const bounds = coords.reduce(function (b, c) {
              return b.extend(c);
            }, new maplibregl.LngLatBounds(coords[0], coords[0]));
            map.fitBounds(bounds, { padding: 40, duration: 600 });
            setStatus('Đường đi bộ · ' + Math.round(data.distance_m || 0) + ' m');
            resolve(true);
          } catch (e) {
            resolve(false);
          }
        },
        function () {
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }

  function focusOsmHit(hit) {
    const lat = Number(hit.lat);
    const lng = Number(hit.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    activeId = null;
    renderList();
    map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15), duration: 500 });
    if (el.detail) el.detail.hidden = false;
    if (el.title) el.title.textContent = hit.name || 'Địa điểm';
    if (el.addr) el.addr.textContent = hit.display_name || '';
    if (el.meta) el.meta.textContent = 'OpenStreetMap — chỉ đường ngoài trời, không Indoor';
    const gmaps =
      'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(lat + ',' + lng);
    if (el.indoor) {
      el.indoor.innerHTML =
        '<div style="display:flex;gap:0.4rem;margin-top:0.5rem;flex-wrap:wrap;">' +
        '<button type="button" class="ex-btn ex-btn-primary" id="exOsrmOsm">Chỉ đường ngoài trời</button>' +
        '<a class="ex-btn" href="' +
        gmaps +
        '" target="_blank" rel="noopener">Google Maps</a>' +
        '</div>';
      const btn = document.getElementById('exOsrmOsm');
      if (btn) {
        btn.addEventListener('click', async function () {
          setStatus('Đang tính đường OSRM…');
          const ok = await drawOsrmRouteTo(lat, lng);
          if (!ok) setStatus('Không lấy được đường — dùng Google Maps');
        });
      }
    }
    setStatus('Đang tính đường OSRM…');
    drawOsrmRouteTo(lat, lng).then(function (ok) {
      if (!ok) setStatus('Không lấy được đường — bấm Chỉ đường hoặc Google Maps');
    });
  }

  async function fetchOverpassNearby() {
    if (!lastNear) {
      setStatus('Bấm “Gần tôi” trước để lấy GPS.');
      return [];
    }
    try {
      setStatus('Đang tải POI Overpass…');
      const params = new URLSearchParams({
        lat: String(lastNear.lat),
        lng: String(lastNear.lng),
        radius: '250',
        limit: '25',
      });
      const res = await fetch(API + '/overpass/nearby?' + params.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
      osmHits = (data.results || []).map(function (h) {
        return {
          name: h.name,
          display_name: h.display_name || [h.amenity, h.distance_m != null ? h.distance_m + ' m' : ''].filter(Boolean).join(' · '),
          lat: h.lat,
          lng: h.lng,
        };
      });
      renderOsmMarkers();
      renderList();
      setStatus('POI quanh đây · ' + osmHits.length);
      return osmHits;
    } catch (e) {
      console.warn('overpass', e);
      setStatus('Overpass: ' + (e.message || 'lỗi'));
      return [];
    }
  }

  function renderOsmMarkers() {
    clearOsmMarkers();
    (osmHits || []).forEach(function (hit) {
      const lat = Number(hit.lat);
      const lng = Number(hit.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const elMarker = document.createElement('button');
      elMarker.type = 'button';
      elMarker.className = 'ex-ml-marker ex-ml-marker--osm';
      elMarker.title = hit.name || 'Địa điểm';
      const marker = new maplibregl.Marker({ element: elMarker, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);
      elMarker.addEventListener('click', function (e) {
        e.stopPropagation();
        focusOsmHit(hit);
      });
      osmMarkers.push(marker);
    });
  }

  async function fetchGeocode(q) {
    if (!q || q.length < 2) {
      osmHits = [];
      clearOsmMarkers();
      return [];
    }
    try {
      const params = new URLSearchParams({ q: q, limit: '5' });
      if (lastNear) {
        params.set('lat', String(lastNear.lat));
        params.set('lng', String(lastNear.lng));
      }
      const res = await fetch(API + '/geocode?' + params.toString());
      const data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.message || 'geocode lỗi');
      osmHits = data.results || [];
      renderOsmMarkers();
      return osmHits;
    } catch (e) {
      console.warn('geocode', e);
      osmHits = [];
      clearOsmMarkers();
      return [];
    }
  }

  function clearPlaceMarkers() {
    placeMarkers.forEach(function (m) {
      m.remove();
    });
    placeMarkers = [];
    if (popup) {
      popup.remove();
      popup = null;
    }
  }

  function renderMarkers() {
    clearPlaceMarkers();
    const bounds = new maplibregl.LngLatBounds();
    let hasBound = false;

    places.forEach(function (p) {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;

      const elMarker = document.createElement('button');
      elMarker.type = 'button';
      elMarker.className = 'ex-ml-marker';
      elMarker.title = p.name || 'Place';
      elMarker.setAttribute('aria-label', p.name || 'Place');

      const marker = new maplibregl.Marker({ element: elMarker, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);

      elMarker.addEventListener('click', function (e) {
        e.stopPropagation();
        selectPlace(p._id, false);
        if (popup) popup.remove();
        popup = new maplibregl.Popup({ offset: 18, closeButton: true })
          .setLngLat([lng, lat])
          .setHTML(
            '<strong>' +
              escapeHtml(p.name) +
              '</strong><br>' +
              escapeHtml(p.address || p.category || '') +
              '<br><button type="button" class="ex-btn ex-btn-primary" data-open="' +
              escapeHtml(p._id) +
              '">Chi tiết</button>',
          )
          .addTo(map);
        setTimeout(function () {
          const btn = document.querySelector('.maplibregl-popup [data-open]');
          if (btn) {
            btn.addEventListener('click', function () {
              selectPlace(btn.getAttribute('data-open'), false);
            });
          }
        }, 0);
      });

      placeMarkers.push(marker);
      bounds.extend([lng, lat]);
      hasBound = true;
    });

    if (hasBound && placeMarkers.length > 1) {
      try {
        map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 600 });
      } catch (_) {
        /* ignore */
      }
    } else if (hasBound && placeMarkers.length === 1) {
      const ll = placeMarkers[0].getLngLat();
      map.easeTo({ center: [ll.lng, ll.lat], zoom: Math.max(map.getZoom(), 14), duration: 500 });
    }
  }

  function shareUrlForPlace(place) {
    const key = place?.slug || place?._id || activeId;
    const u = new URL(window.location.origin + '/explore');
    if (key) u.searchParams.set('place', key);
    // giữ engine maplibre khi share
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
      btn.onclick = function () {
        window.location.href =
          '/login?next=' + encodeURIComponent('/explore?place=' + (place.slug || place._id));
      };
      return;
    }
    btn.hidden = false;
    let favorited = false;
    try {
      const res = await fetch(API + '/hub/favorites/check?place_id=' + encodeURIComponent(place._id), {
        headers: authHeaders(),
      });
      const data = await res.json().catch(function () {
        return {};
      });
      if (res.ok) favorited = !!data.favorited;
    } catch (_) {
      /* ignore */
    }

    function paint() {
      btn.textContent = favorited ? '★ Đã lưu' : '☆ Yêu thích';
      btn.classList.toggle('ex-btn-fav-on', favorited);
    }
    paint();

    btn.onclick = async function () {
      btn.disabled = true;
      try {
        if (favorited) {
          const res = await fetch(API + '/hub/favorites/' + encodeURIComponent(place._id), {
            method: 'DELETE',
            headers: authHeaders(),
          });
          if (!res.ok) {
            const data = await res.json().catch(function () {
              return {};
            });
            throw new Error(data.message || 'Không bỏ lưu được');
          }
          favorited = false;
          setStatus('Đã bỏ yêu thích');
        } else {
          const res = await fetch(API + '/hub/favorites', {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({ place_id: place._id }),
          });
          const data = await res.json().catch(function () {
            return {};
          });
          if (!res.ok) throw new Error(data.message || 'Không lưu được');
          favorited = true;
          setStatus('Đã thêm yêu thích');
          fetch(API + '/hub/history', {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({
              type: 'FAVORITE_PLACE',
              place_id: place._id,
              label: place.name || 'Place',
            }),
          }).catch(function () {});
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
    let p = places.find(function (x) {
      return String(x._id) === String(idOrSlug) || String(x.slug) === String(idOrSlug);
    });
    if (p && pan) {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        map.easeTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), 16),
          duration: 500,
        });
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
      const data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.message || 'Không tải chi tiết');
      const place = data.place;
      activeId = place._id;
      p = place;
      if (
        !places.some(function (x) {
          return String(x._id) === String(place._id);
        })
      ) {
        places = [place].concat(places);
      }
      renderList();
      if (pan || !placeMarkers.length) renderMarkers();

      const lat = Number(place.latitude);
      const lng = Number(place.longitude);
      if (pan && Number.isFinite(lat) && Number.isFinite(lng)) {
        map.easeTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), 16),
          duration: 500,
        });
      }

      el.title.textContent = place.name;
      el.addr.textContent = place.address || 'Chưa có địa chỉ';
      el.meta.textContent =
        (place.category || '—') +
        ' · GPS ' +
        (Number(place.latitude) || 0).toFixed(5) +
        ', ' +
        (Number(place.longitude) || 0).toFixed(5) +
        (place.radius != null ? ' · radius ' + place.radius + 'm' : '') +
        (place.verified || place.verification_status === 'VERIFIED' ? ' · Đã xác minh' : '');

      const share = shareUrlForPlace(place);
      const indoorList = data.indoor_workspaces || data.indoor_buildings || [];
      const hasIndoor = data.has_indoor || indoorList.length > 0;
      let indoorHtml = '';
      if (hasIndoor && indoorList.length) {
        indoorHtml =
          '<p><strong>Bản đồ trong nhà công khai</strong></p>' +
          '<p class="ex-meta">Handoff: trên app Android chỉ đường ngoài trời tới Place → khi tới gần bấm Vào trong nhà.</p>' +
          '<ul>' +
          indoorList
            .map(function (b) {
              return (
                '<li><strong>' +
                escapeHtml(b.name) +
                '</strong> · ' +
                escapeHtml(b.workspace_status || b.visibility || b.status || '') +
                ' · ' +
                (b.total_floors || 1) +
                ' tầng' +
                '<br><span class="ex-meta">Mở Indoor trên app Android (Place → Indoor). ' +
                '<a href="/login">Đăng nhập web</a> nếu bạn là chủ map.</span></li>'
              );
            })
            .join('') +
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
        '<a class="ex-btn ex-btn-primary" href="' +
        escapeHtml(share) +
        '">Link chia sẻ</a>' +
        '</div>';
      el.indoor.innerHTML = indoorHtml;
      document.getElementById('exCopyLink')?.addEventListener('click', async function () {
        try {
          await navigator.clipboard.writeText(share);
          setStatus('Đã sao chép link Place');
        } catch (_) {
          setStatus(share);
        }
      });
      bindFavoriteButton(place);

      try {
        const u = new URL(window.location.href);
        u.searchParams.set('place', place.slug || place._id);
        u.searchParams.delete('map');
        window.history.replaceState({}, '', u.pathname + u.search);
      } catch (_) {
        /* ignore */
      }
    } catch (e) {
      if (el.meta) el.meta.textContent = e.message;
    }
  }

  async function loadAll(extra) {
    setStatus('Đang tải…');
    try {
      const filters = currentFilters(extra);
      const q = (filters.q || '').trim();
      const pair = await Promise.all([
        fetchPlaces(filters),
        q.length >= 2 ? fetchGeocode(q) : Promise.resolve([]).then(function () {
          osmHits = [];
          clearOsmMarkers();
          return [];
        }),
      ]);
      places = pair[0];
      setStatus(
        places.length +
          ' địa điểm' +
          (osmHits.length ? ' · địa điểm ngoài ' + osmHits.length : ''),
      );
      renderList();
      renderMarkers();
    } catch (e) {
      setStatus(e.message);
      places = [];
      osmHits = [];
      renderList();
      clearPlaceMarkers();
      clearOsmMarkers();
    }
  }

  async function search() {
    await loadAll({});
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      search();
    }, DEBOUNCE_MS);
  }

  function locateNear() {
    if (!navigator.geolocation) {
      setStatus('Trình duyệt không hỗ trợ GPS.');
      return;
    }
    setStatus('Đang lấy vị trí…');
    navigator.geolocation.getCurrentPosition(
      async function (pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        lastNear = { lat: lat, lng: lng };
        if (userMarker) userMarker.remove();
        const dot = document.createElement('div');
        dot.className = 'ex-ml-user';
        userMarker = new maplibregl.Marker({ element: dot, anchor: 'center' })
          .setLngLat([lng, lat])
          .setPopup(new maplibregl.Popup().setText('Bạn đang ở đây'))
          .addTo(map);
        map.easeTo({ center: [lng, lat], zoom: 15, duration: 600 });
        await loadAll({ lat: lat, lng: lng, radius_m: 3000 });
        await fetchOverpassNearby();
        setStatus(
          (places.length ? places.length + ' địa điểm trong ~3km' : 'Không có Place gần bạn') +
            (osmHits.length ? ' · POI ' + osmHits.length : '') +
            ' · ' +
            lat.toFixed(4) +
            ', ' +
            lng.toFixed(4),
        );
      },
      function (err) {
        setStatus('Không lấy được GPS: ' + (err.message || 'bị từ chối'));
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  document.getElementById('exSearchBtn')?.addEventListener('click', search);
  document.getElementById('exNearBtn')?.addEventListener('click', locateNear);
  document.getElementById('exReloadBtn')?.addEventListener('click', function () {
    if (el.q) el.q.value = '';
    if (el.cat) el.cat.value = '';
    lastNear = null;
    loadAll({});
  });
  el.q?.addEventListener('input', scheduleSearch);
  el.q?.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      search();
    }
  });
  el.cat?.addEventListener('change', search);

  const params = new URLSearchParams(window.location.search);

  map.on('load', function () {
    preferVietnameseLabels();
  });

  async function bootPlaces() {
    if (params.get('category') && el.cat) el.cat.value = params.get('category');
    if (params.get('q') && el.q) el.q.value = params.get('q');

    if (params.get('lat') && params.get('lng')) {
      lastNear = { lat: Number(params.get('lat')), lng: Number(params.get('lng')) };
      await loadAll({
        lat: params.get('lat'),
        lng: params.get('lng'),
        radius_m: params.get('radius_m') || 5000,
      });
    } else if (params.get('q') || params.get('category')) {
      await search();
    } else {
      await loadAll({});
    }

    const placeKey = params.get('place') || params.get('slug');
    if (placeKey) await selectPlace(placeKey, true);
  }

  if (map.loaded()) {
    preferVietnameseLabels();
    bootPlaces();
  } else {
    map.once('load', function () {
      bootPlaces();
    });
  }
})();
