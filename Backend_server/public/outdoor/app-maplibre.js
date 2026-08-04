/**
 * Outdoor Platform — MapLibre GL JS
 * Nền cố định: OpenFreeMap Liberty (+ nhãn Việt vùng đảo)
 * Leaflet cũ: /outdoor?map=leaflet → app-leaflet.js
 */
(function () {
  const API = '/api/places';
  const PP = '/api/place-platform';
  const DEFAULT_CENTER = [106.660172, 10.762622]; // [lng, lat]
  const GEOFENCE_M = 150;
  const Basemap = window.IndoorNavBasemap;
  const STYLE_URL =
    (Basemap && Basemap.LIBERTY_STYLE) || 'https://tiles.openfreemap.org/styles/liberty';

  const map = new maplibregl.Map({
    container: 'map',
    style: STYLE_URL,
    center: DEFAULT_CENTER,
    zoom: 13,
    attributionControl: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

  let places = [];
  let osmHits = [];
  let overpassHits = [];
  let placeMarkers = [];
  let osmMarkers = [];
  let overpassMarkers = [];
  let userMarker = null;
  let selectedId = null;
  let searchTimer = null;
  let userLngLat = null;
  let lastGeofence = null;
  let lastRouteCoords = null;
  let appStarted = false;

  const elQ = document.getElementById('q');
  const elCat = document.getElementById('category');
  const elResults = document.getElementById('results');
  const elDetail = document.getElementById('detail');
  const elStatus = document.getElementById('statusLine');

  function setStatus(text) {
    elStatus.textContent = text || '';
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

  function restoreMapOverlays() {
    if (lastGeofence) {
      setCircle(
        'place-geofence',
        lastGeofence.lng,
        lastGeofence.lat,
        lastGeofence.radius,
        { 'fill-color': '#2563eb', 'fill-opacity': 0.06 },
        { 'line-color': '#2563eb', 'line-width': 1 },
      );
    }
    if (userLngLat) {
      setCircle(
        'user-geofence',
        userLngLat.lng,
        userLngLat.lat,
        GEOFENCE_M,
        { 'fill-color': '#2563eb', 'fill-opacity': 0.08 },
        { 'line-color': '#2563eb', 'line-width': 1 },
      );
    }
    if (lastRouteCoords && lastRouteCoords.length >= 2) {
      ensureRouteLayer();
      map.getSource('outdoor-route').setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: lastRouteCoords },
      });
    }
  }

  function onBasemapReady() {
    preferVietnameseLabels();
    if (Basemap && Basemap.ensureVietnamIslandLabels) Basemap.ensureVietnamIslandLabels(map);
    if (Basemap) Basemap.ensureIslandBlankCovers(map);
    restoreMapOverlays();
  }

  if (Basemap) {
    Basemap.installBasemapSwitcher(map, {
      onStyleReady: onBasemapReady,
    });
  }

  function circlePolygon(lng, lat, radiusM, steps) {
    steps = steps || 64;
    const coords = [];
    const R = 6371000;
    const latRad = (lat * Math.PI) / 180;
    for (let i = 0; i <= steps; i++) {
      const bearing = (i * 2 * Math.PI) / steps;
      const lat2 = Math.asin(
        Math.sin(latRad) * Math.cos(radiusM / R) +
          Math.cos(latRad) * Math.sin(radiusM / R) * Math.cos(bearing),
      );
      const lng2 =
        ((lng * Math.PI) / 180) +
        Math.atan2(
          Math.sin(bearing) * Math.sin(radiusM / R) * Math.cos(latRad),
          Math.cos(radiusM / R) - Math.sin(latRad) * Math.sin(lat2),
        );
      coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
    }
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] },
    };
  }

  function ensureCircleSource(id, paintFill, paintLine) {
    if (!map.getSource(id)) {
      map.addSource(id, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: id + '-fill',
        type: 'fill',
        source: id,
        paint: paintFill,
      });
      map.addLayer({
        id: id + '-line',
        type: 'line',
        source: id,
        paint: paintLine,
      });
    }
  }

  function setCircle(id, lng, lat, radiusM, fillPaint, linePaint) {
    ensureCircleSource(id, fillPaint, linePaint);
    map.getSource(id).setData({
      type: 'FeatureCollection',
      features: [circlePolygon(lng, lat, radiusM)],
    });
  }

  function clearCircle(id) {
    if (map.getSource(id)) {
      map.getSource(id).setData({ type: 'FeatureCollection', features: [] });
    }
  }

  function syncUrl(place) {
    try {
      if (!place) return;
      const key = place.slug || place._id;
      if (place.slug) {
        history.replaceState({}, '', '/outdoor/place/' + encodeURIComponent(place.slug));
      } else {
        history.replaceState({}, '', '/outdoor?place=' + encodeURIComponent(String(key)));
      }
    } catch (_) {
      /* ignore */
    }
  }

  function clearPlaceMarkers() {
    placeMarkers.forEach(function (m) {
      m.remove();
    });
    placeMarkers = [];
  }

  function renderMarkers(list) {
    clearPlaceMarkers();
    places = list || [];
    places.forEach(function (p) {
      const lat = Number(p.latitude);
      const lng = Number(p.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'od-ml-marker';
      el.title = p.name || 'Place';
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        selectPlace(p, true);
      });
      placeMarkers.push(marker);
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

  function renderOsmMarkers(list) {
    clearOsmMarkers();
    (list || []).forEach(function (hit) {
      const lat = Number(hit.lat);
      const lng = Number(hit.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'od-ml-marker od-ml-marker--osm';
      el.title = hit.name || 'OSM';
      el.textContent = '📍';
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        focusOsmHit(hit);
      });
      osmMarkers.push(marker);
    });
  }

  function focusOsmHit(hit) {
    const lat = Number(hit.lat);
    const lng = Number(hit.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    selectedId = null;
    const dest = { latitude: lat, longitude: lng, name: hit.name };
    const gmaps =
      'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(lat + ',' + lng);
    elDetail.innerHTML =
      '<p class="sub"><strong>' +
      escapeHtml(hit.name || '') +
      '</strong> <span class="badge">OSM</span></p>' +
      '<p class="sub">' +
      escapeHtml(hit.display_name || '') +
      '</p>' +
      '<p class="sub">Nguồn: OpenStreetMap (Nominatim) — chỉ đường ngoài trời, không Indoor.</p>' +
      '<div style="display:flex;gap:0.4rem;margin-top:0.6rem;flex-wrap:wrap;">' +
      '<button type="button" class="secondary" id="btnOsrmOsm" style="width:auto;">Chỉ đường (OSM)</button>' +
      '<a class="btn-link" href="' +
      gmaps +
      '" target="_blank" rel="noopener">Google Maps</a>' +
      '</div>';
    map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15), duration: 500 });
    const btn = document.getElementById('btnOsrmOsm');
    if (btn) {
      btn.onclick = async function () {
        setStatus('Đang tính đường OSRM…');
        const ok = await drawOsrmRouteToPlace(dest);
        if (!ok) setStatus('Không lấy được đường — dùng Google Maps');
      };
    }
    setStatus('Đang tính đường OSRM…');
    drawOsrmRouteToPlace(dest).then(function (ok) {
      if (!ok) setStatus('Không lấy được đường — bấm Chỉ đường hoặc Google Maps');
    });
  }

  function renderResults(list, osmList) {
    elResults.innerHTML = '';
    const placesList = list || [];
    const osm = osmList || osmHits || [];

    if (placesList.length) {
      const h = document.createElement('div');
      h.className = 'sub';
      h.style.margin = '8px 0 4px';
      h.textContent = 'Địa điểm trong hệ thống · ' + placesList.length;
      elResults.appendChild(h);
    }
    placesList.forEach(function (p) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'place-card' + (String(selectedId) === String(p._id) ? ' active' : '');
      const indoor = p.has_published_indoor
        ? '<span class="badge ok">Indoor sẵn sàng</span>'
        : '<span class="badge warn">Chưa có Indoor</span>';
      const dist = p.distance_m != null ? ' · ' + p.distance_m + 'm' : '';
      card.innerHTML =
        '<div class="name">' +
        escapeHtml(p.name || '') +
        '</div>' +
        '<div class="meta">' +
        escapeHtml(p.category || '—') +
        ' · ' +
        escapeHtml(p.address || 'Chưa có địa chỉ') +
        dist +
        '</div>' +
        indoor;
      card.addEventListener('click', function () {
        selectPlace(p, true);
      });
      elResults.appendChild(card);
    });

    if (osm.length) {
      const h2 = document.createElement('div');
      h2.className = 'sub';
      h2.style.margin = '12px 0 4px';
      h2.textContent = 'Bản đồ OSM · ' + osm.length;
      elResults.appendChild(h2);
      osm.forEach(function (hit) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'place-card';
        card.innerHTML =
          '<div class="name">' +
          escapeHtml(hit.name || '') +
          ' <span class="badge">OSM</span></div>' +
          '<div class="meta">' +
          escapeHtml(hit.display_name || '') +
          '</div>';
        card.addEventListener('click', function () {
          focusOsmHit(hit);
        });
        elResults.appendChild(card);
      });
    }

    const nearby = overpassHits || [];
    if (nearby.length) {
      const h3 = document.createElement('div');
      h3.className = 'sub';
      h3.style.margin = '12px 0 4px';
      h3.textContent = 'POI quanh đây · ' + nearby.length;
      elResults.appendChild(h3);
      nearby.forEach(function (hit) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'place-card';
        card.innerHTML =
          '<div class="name">' +
          escapeHtml(hit.name || '') +
          ' <span class="badge">POI</span></div>' +
          '<div class="meta">' +
          escapeHtml(
            [hit.amenity, hit.distance_m != null ? hit.distance_m + ' m' : '']
              .filter(Boolean)
              .join(' · ') ||
              hit.display_name ||
              '',
          ) +
          '</div>';
        card.addEventListener('click', function () {
          focusOsmHit({
            name: hit.name,
            display_name: hit.display_name || hit.amenity || '',
            lat: hit.lat,
            lng: hit.lng,
          });
        });
        elResults.appendChild(card);
      });
    }
  }

  async function fetchGeocode(q) {
    if (!q || q.length < 2) {
      osmHits = [];
      clearOsmMarkers();
      return [];
    }
    try {
      const params = new URLSearchParams({ q: q, limit: '5' });
      if (userLngLat) {
        params.set('lat', String(userLngLat.lat));
        params.set('lng', String(userLngLat.lng));
      }
      const res = await fetch('/api/geocode?' + params.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
      osmHits = data.results || [];
      renderOsmMarkers(osmHits);
      return osmHits;
    } catch (e) {
      console.warn('geocode', e);
      osmHits = [];
      clearOsmMarkers();
      return [];
    }
  }

  function clearOverpassMarkers() {
    overpassMarkers.forEach(function (m) {
      try {
        m.remove();
      } catch (_) {}
    });
    overpassMarkers = [];
  }

  function renderOverpassMarkers(list) {
    clearOverpassMarkers();
    (list || []).forEach(function (hit) {
      const lat = Number(hit.lat);
      const lng = Number(hit.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'od-ml-marker od-ml-marker--overpass';
      el.title = hit.name || 'POI';
      el.textContent = '•';
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        focusOsmHit({
          name: hit.name,
          display_name: hit.display_name || hit.amenity || '',
          lat: lat,
          lng: lng,
        });
      });
      overpassMarkers.push(marker);
    });
  }

  async function fetchOverpassNearby() {
    if (!userLngLat) {
      setStatus('Cần GPS để tải POI quanh đây');
      return [];
    }
    try {
      setStatus('Đang tải POI Overpass…');
      const params = new URLSearchParams({
        lat: String(userLngLat.lat),
        lng: String(userLngLat.lng),
        radius: '250',
        limit: '25',
      });
      const res = await fetch('/api/overpass/nearby?' + params.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
      overpassHits = data.results || [];
      renderOverpassMarkers(overpassHits);
      renderResults(places, osmHits);
      setStatus('POI quanh đây · ' + overpassHits.length + (data.cached ? ' (cache)' : ''));
      return overpassHits;
    } catch (e) {
      console.warn('overpass', e);
      overpassHits = [];
      clearOverpassMarkers();
      setStatus('Overpass: ' + (e.message || 'lỗi'));
      return [];
    }
  }

  function drawPlaceGeofence(place) {
    const lat = Number(place.latitude);
    const lng = Number(place.longitude);
    const radius = Math.max(20, Number(place.radius) || 80);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      lastGeofence = null;
      clearCircle('place-geofence');
      return;
    }
    lastGeofence = { lng: lng, lat: lat, radius: radius };
    setCircle(
      'place-geofence',
      lng,
      lat,
      radius,
      { 'fill-color': '#2563eb', 'fill-opacity': 0.06 },
      { 'line-color': '#2563eb', 'line-width': 1 },
    );
  }

  function mapsDirectionsUrl(place) {
    const lat = Number(place.latitude);
    const lng = Number(place.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return (
      'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(lat + ',' + lng)
    );
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

  async function drawOsrmRouteToPlace(place) {
    clearOutdoorRoute();
    const toLat = Number(place.latitude);
    const toLng = Number(place.longitude);
    if (!Number.isFinite(toLat) || !Number.isFinite(toLng)) return false;
    if (!navigator.geolocation) return false;
    return new Promise(function (resolve) {
      navigator.geolocation.getCurrentPosition(
        async function (pos) {
          try {
            const fromLat = pos.coords.latitude;
            const fromLng = pos.coords.longitude;
            const qs = new URLSearchParams({
              fromLat: String(fromLat),
              fromLng: String(fromLng),
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

  async function selectPlace(p, pan) {
    selectedId = p._id;
    renderResults(places);
    if (pan && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))) {
      map.easeTo({
        center: [Number(p.longitude), Number(p.latitude)],
        zoom: Math.max(map.getZoom(), 16),
        duration: 500,
      });
    }
    elDetail.innerHTML = '<p class="sub">Đang tải chi tiết…</p>';
    try {
      let place = p;
      let rooms = [];
      const key = p.slug || p._id;
      const ppRes = await fetch(PP + '/places/' + encodeURIComponent(key));
      if (ppRes.ok) {
        const pp = await ppRes.json();
        place = Object.assign({}, p, pp.place || {});
      }
      const res = await fetch(API + '/' + encodeURIComponent(p._id));
      const data = await res.json().catch(function () {
        return {};
      });
      if (res.ok) {
        place = Object.assign({}, place, data.place || {});
        rooms = data.indoor_workspaces || [];
      }

      drawPlaceGeofence(place);
      syncUrl(place);

      const gmaps = mapsDirectionsUrl(place);
      const indoorHtml = rooms.length
        ? '<p><strong>' +
          rooms.length +
          '</strong> indoor đã publish.</p>' +
          '<p class="sub">Handoff: chỉ đường ngoài trời tới Place → trên app Android bấm <strong>Vào trong nhà</strong> khi tới gần.</p>' +
          rooms
            .map(function (b) {
              const bid = b._id || b.id;
              return (
                '<div class="meta">• ' +
                escapeHtml(b.name) +
                ' <a href="/editor/?buildingId=' +
                encodeURIComponent(String(bid || '')) +
                '" target="_blank" rel="noopener">Mở editor</a></div>'
              );
            })
            .join('') +
          '<p><a href="/outdoor/place/' +
          encodeURIComponent(place.slug || place._id) +
          '">Deep-link app</a> · <a href="/get-app">Cài Android</a></p>'
        : '<p class="sub">Chưa có bản đồ trong nhà.</p>';

      const flags = place.community_flags || {};
      const flagBits = [
        flags.verified ? 'Verified' : null,
        flags.official ? 'Official' : null,
        flags.community ? 'Community' : null,
        flags.pending ? 'Pending' : null,
      ]
        .filter(Boolean)
        .join(' · ');

      elDetail.innerHTML =
        '<h2>' +
        escapeHtml(place.name || '') +
        '</h2>' +
        '<div class="meta">' +
        escapeHtml(place.category || '') +
        (flagBits ? ' · ' + escapeHtml(flagBits) : '') +
        '</div>' +
        '<div class="meta">' +
        escapeHtml(place.address || '') +
        '</div>' +
        (place.description
          ? '<p class="sub">' + escapeHtml(place.description).slice(0, 280) + '</p>'
          : '') +
        indoorHtml +
        '<div style="display:flex;gap:0.4rem;margin-top:0.6rem;flex-wrap:wrap;">' +
        '<button type="button" class="secondary" id="btnFav" style="width:auto;">Yêu thích</button>' +
        '<button type="button" class="secondary" id="btnFollow" style="width:auto;">Follow</button>' +
        '<button type="button" class="secondary" id="btnReview" style="width:auto;">Đánh giá</button>' +
        '<button type="button" class="secondary" id="btnPropose" style="width:auto;">Đề xuất</button>' +
        '<button type="button" class="secondary" id="btnReport" style="width:auto;">Báo cáo</button>' +
        (gmaps
          ? '<a class="btn-link" id="btnMaps" href="' +
            gmaps +
            '" target="_blank" rel="noopener">Đi tới (Google Maps)</a>' +
            '<button type="button" class="secondary" id="btnOsrm" style="width:auto;">Chỉ đường (OSM)</button>'
          : '') +
        '<button type="button" class="secondary" id="btnCopy" style="width:auto;">Copy link</button>' +
        '<a href="/get-app" style="font-size:0.8rem;align-self:center;">Android App</a>' +
        '</div>';
      wireFavorite(place);
      wireFollow(place);
      wireReview(place);
      wirePropose(place);
      wireReport(place);
      const btnOsrm = document.getElementById('btnOsrm');
      if (btnOsrm) {
        btnOsrm.onclick = async function () {
          setStatus('Đang tính đường OSRM…');
          const ok = await drawOsrmRouteToPlace(place);
          if (!ok) setStatus('Không lấy được đường — dùng Google Maps');
        };
      }
      const btnCopy = document.getElementById('btnCopy');
      if (btnCopy) {
        btnCopy.onclick = function () {
          const link =
            window.location.origin +
            '/outdoor/place/' +
            encodeURIComponent(place.slug || place._id);
          navigator.clipboard
            .writeText(link)
            .then(function () {
              setStatus('Đã copy deep-link');
            })
            .catch(function () {
              setStatus(link);
            });
        };
      }
      recordViewHistory(place);
      recordPlaceView(place);
    } catch (e) {
      elDetail.innerHTML = '<p class="sub">' + escapeHtml(e.message) + '</p>';
    }
  }

  function authToken() {
    return localStorage.getItem('token') || '';
  }

  function requireAuth(nextPath) {
    if (authToken()) return true;
    window.location.href =
      '/login?next=' + encodeURIComponent(nextPath || '/outdoor/place/' + (selectedId || ''));
    return false;
  }

  function recordPlaceView(place) {
    const key = (place && (place.slug || place._id)) || '';
    if (!key) return;
    fetch(PP + '/places/' + encodeURIComponent(key) + '/view', { method: 'POST' }).catch(
      function () {},
    );
  }

  function recordViewHistory(place) {
    if (!place || !place._id) return;
    const key = place.slug || place._id;
    fetch('/api/place-platform/places/' + encodeURIComponent(key) + '/view', {
      method: 'POST',
      headers: authToken() ? { Authorization: 'Bearer ' + authToken() } : {},
    }).catch(function () {});
    if (!authToken()) return;
    fetch('/api/hub/history', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + authToken(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'VIEW_PLACE',
        place_id: place._id,
        label: place.name || '',
      }),
    }).catch(function () {});
  }

  function wireFollow(place) {
    const btn = document.getElementById('btnFollow');
    if (!btn || !place || !place._id) return;
    if (!authToken()) {
      btn.textContent = 'Follow (login)';
      btn.onclick = function () {
        requireAuth('/outdoor/place/' + (place.slug || place._id));
      };
      return;
    }
    let following = false;
    fetch('/api/hub/community/following', {
      headers: { Authorization: 'Bearer ' + authToken() },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        const rows = d.following || [];
        following = rows.some(function (f) {
          return String(f.place_id) === String(place._id);
        });
        btn.textContent = following ? 'Đang follow' : 'Follow';
      })
      .catch(function () {});

    btn.onclick = async function () {
      btn.disabled = true;
      try {
        if (following) {
          const res = await fetch('/api/hub/community/follow/' + encodeURIComponent(place._id), {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + authToken() },
          });
          if (!res.ok) throw new Error('Không bỏ follow');
          following = false;
          setStatus('Đã bỏ theo dõi');
        } else {
          const res = await fetch('/api/hub/community/follow', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + authToken(),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ place_id: place._id }),
          });
          if (!res.ok) throw new Error('Không follow được');
          following = true;
          setStatus('Đã theo dõi Place');
        }
        btn.textContent = following ? 'Đang follow' : 'Follow';
      } catch (e) {
        setStatus(e.message || 'Lỗi follow');
      } finally {
        btn.disabled = false;
      }
    };
  }

  function wireReview(place) {
    const btn = document.getElementById('btnReview');
    if (!btn || !place || !place._id) return;
    btn.onclick = async function () {
      if (!requireAuth('/outdoor/place/' + (place.slug || place._id))) return;
      const ratingRaw = window.prompt('Đánh giá Place (1–5 sao):', '5');
      if (ratingRaw == null) return;
      const rating = Math.max(1, Math.min(5, parseInt(ratingRaw, 10) || 0));
      if (!rating) {
        setStatus('Rating không hợp lệ');
        return;
      }
      const comment = window.prompt('Nhận xét (tuỳ chọn):', '') || '';
      btn.disabled = true;
      try {
        const res = await fetch('/api/place-platform/reviews', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + authToken(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            place_id: place._id,
            rating: rating,
            comment: comment.slice(0, 500),
          }),
        });
        const data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
        setStatus('Đã gửi đánh giá ★' + rating);
      } catch (e) {
        setStatus(e.message || 'Lỗi review');
      } finally {
        btn.disabled = false;
      }
    };
  }

  function wirePropose(place) {
    const btn = document.getElementById('btnPropose');
    if (!btn || !place || !place._id) return;
    btn.onclick = async function () {
      if (!requireAuth('/outdoor/place/' + (place.slug || place._id))) return;
      const title = window.prompt(
        'Đề xuất cho map ngoài trời (vd: Sửa cổng vào, Thêm lối thoát):',
        '',
      );
      if (!title || !String(title).trim()) return;
      const type =
        window.prompt('Loại: FIX_LOCATION · FIX_INFO · ADD_POI · OTHER', 'FIX_INFO') || 'FIX_INFO';
      const detail = window.prompt('Mô tả chi tiết (tuỳ chọn):', '') || '';
      btn.disabled = true;
      try {
        const res = await fetch('/api/map-contributions', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + authToken(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            map_scope: 'OUTDOOR',
            type: String(type).trim().toUpperCase(),
            title: String(title).trim().slice(0, 200),
            description: String(detail).slice(0, 500),
            place_id: place._id,
            latitude: place.latitude,
            longitude: place.longitude,
          }),
        });
        const data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
        setStatus('Đã gửi đề xuất — chờ kiểm duyệt');
      } catch (e) {
        setStatus(e.message || 'Lỗi đề xuất');
      } finally {
        btn.disabled = false;
      }
    };
  }

  function wireReport(place) {
    const btn = document.getElementById('btnReport');
    if (!btn || !place || !place._id) return;
    btn.onclick = async function () {
      if (!requireAuth('/outdoor/place/' + (place.slug || place._id))) return;
      const reason = window.prompt(
        'Lý do báo cáo:\nWRONG_LOCATION · WRONG_NAME · SPAM · DUPLICATE · CLOSED',
        'WRONG_LOCATION',
      );
      if (!reason) return;
      const detail = window.prompt('Chi tiết (tuỳ chọn):', '') || '';
      btn.disabled = true;
      try {
        const res = await fetch('/api/place-platform/reports', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + authToken(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            place_id: place._id,
            reason_code: String(reason).trim().toUpperCase(),
            detail: detail.slice(0, 500),
          }),
        });
        const data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
        setStatus('Đã gửi báo cáo');
      } catch (e) {
        setStatus(e.message || 'Lỗi report');
      } finally {
        btn.disabled = false;
      }
    };
  }

  function wireFavorite(place) {
    const btn = document.getElementById('btnFav');
    if (!btn || !place || !place._id) return;
    if (!authToken()) {
      btn.textContent = 'Đăng nhập để lưu';
      btn.onclick = function () {
        window.location.href =
          '/login?next=' + encodeURIComponent('/outdoor/place/' + (place.slug || place._id));
      };
      return;
    }
    let favorited = false;
    fetch('/api/hub/favorites/check?place_id=' + encodeURIComponent(place._id), {
      headers: { Authorization: 'Bearer ' + authToken() },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        favorited = !!d.favorited;
        btn.textContent = favorited ? '★ Đã lưu' : '☆ Yêu thích';
      })
      .catch(function () {});

    btn.onclick = async function () {
      btn.disabled = true;
      try {
        if (favorited) {
          const res = await fetch('/api/hub/favorites/' + encodeURIComponent(place._id), {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + authToken() },
          });
          if (!res.ok) throw new Error('Không bỏ lưu');
          favorited = false;
          setStatus('Đã bỏ yêu thích');
        } else {
          const res = await fetch('/api/hub/favorites', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + authToken(),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ place_id: place._id }),
          });
          if (!res.ok) throw new Error('Không lưu được');
          favorited = true;
          setStatus('Đã thêm yêu thích');
        }
        btn.textContent = favorited ? '★ Đã lưu' : '☆ Yêu thích';
      } catch (e) {
        setStatus(e.message || 'Lỗi yêu thích');
      } finally {
        btn.disabled = false;
      }
    };
  }

  function filterByCategory(list) {
    const cat = ((elCat && elCat.value) || '').trim().toLowerCase();
    if (!cat) return list;
    return (list || []).filter(function (p) {
      return String(p.category || '').toLowerCase().indexOf(cat) !== -1;
    });
  }

  function fitPlaces(list) {
    const withGps = (list || []).filter(function (p) {
      return Number(p.latitude) || Number(p.longitude);
    });
    if (!withGps.length) return;
    if (withGps.length === 1) {
      map.easeTo({
        center: [Number(withGps[0].longitude), Number(withGps[0].latitude)],
        zoom: 15,
        duration: 500,
      });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    withGps.forEach(function (p) {
      bounds.extend([Number(p.longitude), Number(p.latitude)]);
    });
    map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 600 });
  }

  async function loadAll(opts) {
    setStatus('Đang tải Place công khai…');
    try {
      const res = await fetch(API + '?limit=100');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
      const list = filterByCategory(data.places || []);
      renderMarkers(list);
      renderResults(list);
      setStatus(list.length + ' Place · MapLibre · search / filter');
      if (!(opts && opts.skipFit) && list.length) fitPlaces(list);
      return list;
    } catch (e) {
      setStatus('Lỗi tải Place: ' + e.message);
      return [];
    }
  }

  async function search() {
    const q = (elQ.value || '').trim();
    const cat = ((elCat && elCat.value) || '').trim();
    setStatus('Đang tìm…');
    try {
      const body = { q: q, limit: 50 };
      if (cat) body.category = cat;
      if (userLngLat) {
        body.lat = userLngLat.lat;
        body.lng = userLngLat.lng;
        body.radius_m = 5000;
      }
      const placePromise = fetch(API + '/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async function (res) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
        return data;
      });
      const geoPromise = q.length >= 2 ? fetchGeocode(q) : Promise.resolve([]);
      const pair = await Promise.all([placePromise, geoPromise]);
      const data = pair[0];
      const list = data.places || [];
      places = list;
      renderMarkers(list);
      renderResults(list, osmHits);
      const osmN = osmHits.length;
      setStatus(
        'Place ' +
          list.length +
          (osmN ? ' · OSM ' + osmN : '') +
          ' · ' +
          (data.search_mode || 'text'),
      );
    } catch (e) {
      setStatus('Lỗi tìm: ' + e.message);
    }
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(search, 320);
  }

  function onGps() {
    if (!navigator.geolocation) {
      setStatus('Trình duyệt không hỗ trợ GPS');
      return;
    }
    setStatus('Đang lấy GPS…');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        userLngLat = { lat: lat, lng: lng };
        if (userMarker) userMarker.remove();
        const dot = document.createElement('div');
        dot.className = 'od-ml-user';
        userMarker = new maplibregl.Marker({ element: dot, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(map);
        setCircle(
          'user-geofence',
          lng,
          lat,
          GEOFENCE_M,
          { 'fill-color': '#2563eb', 'fill-opacity': 0.08 },
          { 'line-color': '#2563eb', 'line-width': 1 },
        );
        map.easeTo({ center: [lng, lat], zoom: 16, duration: 600 });
        search().then(function () {
          return fetchOverpassNearby();
        });
      },
      function (err) {
        setStatus('GPS lỗi: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function openDeepLink() {
    const pathMatch = window.location.pathname.match(/^\/(?:outdoor|app)\/place\/([^/]+)/i);
    const params = new URLSearchParams(window.location.search);
    const key = (pathMatch && pathMatch[1]) || params.get('place') || params.get('slug');
    if (!key) return;
    try {
      const res = await fetch(PP + '/places/' + encodeURIComponent(decodeURIComponent(key)));
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Không tìm thấy');
      const place = data.place;
      places = [place];
      renderMarkers(places);
      renderResults(places);
      selectPlace(place, true);
      setStatus('Deep-link: ' + (place.slug || place.name));
    } catch (e) {
      setStatus('Deep-link lỗi: ' + e.message);
    }
  }

  document.getElementById('btnSearch').addEventListener('click', search);
  document.getElementById('btnGps').addEventListener('click', onGps);
  const btnOverpass = document.getElementById('btnOverpass');
  if (btnOverpass) {
    btnOverpass.addEventListener('click', function () {
      if (!userLngLat) {
        onGps();
        return;
      }
      fetchOverpassNearby();
    });
  }
  if (elCat) {
    elCat.addEventListener('change', function () {
      if ((elQ.value || '').trim()) search();
      else loadAll({ skipFit: true });
    });
  }
  elQ.addEventListener('input', scheduleSearch);
  elQ.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') {
      clearTimeout(searchTimer);
      search();
    }
  });

  function startApp() {
    if (appStarted) return;
    appStarted = true;
    preferVietnameseLabels();
    loadAll().then(function () {
      openDeepLink();
    });
  }

  map.on('load', startApp);
})();
