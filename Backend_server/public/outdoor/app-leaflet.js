/**
 * Outdoor Platform — OSM experience (search · filter · cluster · deep-link · Maps CTA)
 * BẢN LEAFLET CŨ — nạp khi /outdoor?map=leaflet
 * Mặc định: app-maplibre.js
 */
(function () {
  const API = '/api/places';
  const PP = '/api/place-platform';
  const DEFAULT_CENTER = [10.762622, 106.660172];
  const GEOFENCE_M = 150;

  const map = L.map('map').setView(DEFAULT_CENTER, 13);
  if (typeof installVietnamBasemap === 'function') {
    installVietnamBasemap(map);
  } else {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
  }

  const markersLayer = (typeof L.markerClusterGroup === 'function')
    ? L.markerClusterGroup()
    : L.layerGroup();
  map.addLayer(markersLayer);

  let places = [];
  let userMarker = null;
  let userCircle = null;
  let placeGeofence = null;
  let selectedId = null;
  let searchTimer = null;

  const elQ = document.getElementById('q');
  const elCat = document.getElementById('category');
  const elResults = document.getElementById('results');
  const elDetail = document.getElementById('detail');
  const elStatus = document.getElementById('statusLine');

  function setStatus(text) {
    elStatus.textContent = text || '';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function syncUrl(place) {
    try {
      if (!place) return;
      const key = place.slug || place._id;
      if (place.slug) {
        history.replaceState({}, '', '/outdoor/place/' + encodeURIComponent(place.slug));
      } else {
        history.replaceState({}, '', '/outdoor?place=' + encodeURIComponent(String(key)));
      }
    } catch (_) { /* ignore */ }
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
      card.className = 'place-card' + (String(selectedId) === String(p._id) ? ' active' : '');
      const indoor = p.has_published_indoor
        ? '<span class="badge ok">Indoor sẵn sàng</span>'
        : '<span class="badge warn">Chưa có Indoor</span>';
      const dist = p.distance_m != null ? ' · ' + p.distance_m + 'm' : '';
      card.innerHTML =
        '<div class="name">' + escapeHtml(p.name || '') + '</div>' +
        '<div class="meta">' + escapeHtml(p.category || '—') + ' · ' +
        escapeHtml(p.address || 'Chưa có địa chỉ') + dist + '</div>' +
        indoor;
      card.addEventListener('click', () => selectPlace(p, true));
      elResults.appendChild(card);
    });
  }

  function drawPlaceGeofence(place) {
    if (placeGeofence) {
      map.removeLayer(placeGeofence);
      placeGeofence = null;
    }
    const lat = Number(place.latitude);
    const lng = Number(place.longitude);
    const radius = Math.max(20, Number(place.radius) || 80);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    placeGeofence = L.circle([lat, lng], {
      radius,
      color: '#2563eb',
      weight: 1,
      fillOpacity: 0.06
    }).addTo(map);
  }

  function mapsDirectionsUrl(place) {
    const lat = Number(place.latitude);
    const lng = Number(place.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return 'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(lat + ',' + lng);
  }

  let outdoorRouteLine = null;

  function clearOutdoorRoute() {
    if (outdoorRouteLine) {
      map.removeLayer(outdoorRouteLine);
      outdoorRouteLine = null;
    }
  }

  async function drawOsrmRouteToPlace(place) {
    clearOutdoorRoute();
    const toLat = Number(place.latitude);
    const toLng = Number(place.longitude);
    if (!Number.isFinite(toLat) || !Number.isFinite(toLng)) return false;
    if (!navigator.geolocation) return false;
    return new Promise(function (resolve) {
      navigator.geolocation.getCurrentPosition(async function (pos) {
        try {
          const fromLat = pos.coords.latitude;
          const fromLng = pos.coords.longitude;
          const qs = new URLSearchParams({
            fromLat: String(fromLat),
            fromLng: String(fromLng),
            toLat: String(toLat),
            toLng: String(toLng),
            profile: 'foot'
          });
          const res = await fetch('/api/navigation/outdoor-route?' + qs.toString());
          const data = await res.json().catch(function () { return {}; });
          if (!res.ok || !Array.isArray(data.polyline) || data.polyline.length < 2) {
            resolve(false);
            return;
          }
          const latlngs = data.polyline.map(function (p) {
            return [p.lat, p.lng];
          });
          outdoorRouteLine = L.polyline(latlngs, { color: '#1A73E8', weight: 5 }).addTo(map);
          map.fitBounds(outdoorRouteLine.getBounds(), { padding: [40, 40] });
          setStatus('Đường đi bộ · ' + Math.round(data.distance_m || 0) + ' m');
          resolve(true);
        } catch (e) {
          resolve(false);
        }
      }, function () { resolve(false); }, { enableHighAccuracy: true, timeout: 8000 });
    });
  }

  async function selectPlace(p, pan) {
    selectedId = p._id;
    renderResults(places);
    if (pan && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))) {
      map.setView([p.latitude, p.longitude], Math.max(map.getZoom(), 16));
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
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        place = Object.assign({}, place, data.place || {});
        rooms = data.indoor_workspaces || [];
      }

      drawPlaceGeofence(place);
      syncUrl(place);

      const gmaps = mapsDirectionsUrl(place);
      const indoorHtml = rooms.length
        ? '<p><strong>' + rooms.length + '</strong> indoor đã publish.</p>' +
          rooms.map(function (b) {
            const bid = b._id || b.id;
            return '<div class="meta">• ' + escapeHtml(b.name) +
              ' <a href="/editor/?buildingId=' + encodeURIComponent(String(bid || '')) +
              '" target="_blank" rel="noopener">Mở</a></div>';
          }).join('')
        : '<p class="sub">Chưa có bản đồ trong nhà.</p>';

      const flags = place.community_flags || {};
      const flagBits = [
        flags.verified ? 'Verified' : null,
        flags.official ? 'Official' : null,
        flags.community ? 'Community' : null,
        flags.pending ? 'Pending' : null
      ].filter(Boolean).join(' · ');

      elDetail.innerHTML =
        '<h2>' + escapeHtml(place.name || '') + '</h2>' +
        '<div class="meta">' + escapeHtml(place.category || '') +
        (flagBits ? ' · ' + escapeHtml(flagBits) : '') + '</div>' +
        '<div class="meta">' + escapeHtml(place.address || '') + '</div>' +
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
          ? '<a class="btn-link" id="btnMaps" href="' + gmaps +
            '" target="_blank" rel="noopener">Đi tới (Google Maps)</a>' +
            '<button type="button" class="secondary" id="btnOsrm" style="width:auto;">Chỉ đường ngoài trời</button>'
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
          const link = window.location.origin + '/outdoor/place/' +
            encodeURIComponent(place.slug || place._id);
          navigator.clipboard.writeText(link).then(function () {
            setStatus('Đã copy deep-link');
          }).catch(function () {
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
    window.location.href = '/login?next=' +
      encodeURIComponent(nextPath || ('/outdoor/place/' + (selectedId || '')));
    return false;
  }

  /** Creator analytics — Place.view_count (public, không cần login). */
  function recordPlaceView(place) {
    const key = (place && (place.slug || place._id)) || '';
    if (!key) return;
    fetch(PP + '/places/' + encodeURIComponent(key) + '/view', { method: 'POST' })
      .catch(function () {});
  }

  function recordViewHistory(place) {
    if (!place || !place._id) return;
    const key = place.slug || place._id;
    fetch('/api/place-platform/places/' + encodeURIComponent(key) + '/view', {
      method: 'POST',
      headers: authToken()
        ? { Authorization: 'Bearer ' + authToken() }
        : {}
    }).catch(function () {});
    if (!authToken()) return;
    fetch('/api/hub/history', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + authToken(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'VIEW_PLACE',
        place_id: place._id,
        label: place.name || ''
      })
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
      headers: { Authorization: 'Bearer ' + authToken() }
    })
      .then(function (r) { return r.json(); })
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
            headers: { Authorization: 'Bearer ' + authToken() }
          });
          if (!res.ok) throw new Error('Không bỏ follow');
          following = false;
          setStatus('Đã bỏ theo dõi');
        } else {
          const res = await fetch('/api/hub/community/follow', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + authToken(),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ place_id: place._id })
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
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            place_id: place._id,
            rating: rating,
            comment: comment.slice(0, 500)
          })
        });
        const data = await res.json().catch(function () { return {}; });
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
        ''
      );
      if (!title || !String(title).trim()) return;
      const type = window.prompt(
        'Loại: FIX_LOCATION · FIX_INFO · ADD_POI · OTHER',
        'FIX_INFO'
      ) || 'FIX_INFO';
      const detail = window.prompt('Mô tả chi tiết (tuỳ chọn):', '') || '';
      btn.disabled = true;
      try {
        const res = await fetch('/api/map-contributions', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + authToken(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            map_scope: 'OUTDOOR',
            type: String(type).trim().toUpperCase(),
            title: String(title).trim().slice(0, 200),
            description: String(detail).slice(0, 500),
            place_id: place._id,
            latitude: place.latitude,
            longitude: place.longitude
          })
        });
        const data = await res.json().catch(function () { return {}; });
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
        'WRONG_LOCATION'
      );
      if (!reason) return;
      const detail = window.prompt('Chi tiết (tuỳ chọn):', '') || '';
      btn.disabled = true;
      try {
        const res = await fetch('/api/place-platform/reports', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + authToken(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            place_id: place._id,
            reason_code: String(reason).trim().toUpperCase(),
            detail: detail.slice(0, 500)
          })
        });
        const data = await res.json().catch(function () { return {}; });
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
        window.location.href = '/login?next=' +
          encodeURIComponent('/outdoor/place/' + (place.slug || place._id));
      };
      return;
    }
    let favorited = false;
    fetch('/api/hub/favorites/check?place_id=' + encodeURIComponent(place._id), {
      headers: { Authorization: 'Bearer ' + authToken() }
    })
      .then(function (r) { return r.json(); })
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
            headers: { Authorization: 'Bearer ' + authToken() }
          });
          if (!res.ok) throw new Error('Không bỏ lưu');
          favorited = false;
          setStatus('Đã bỏ yêu thích');
        } else {
          const res = await fetch('/api/hub/favorites', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + authToken(),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ place_id: place._id })
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
    const cat = (elCat && elCat.value || '').trim().toLowerCase();
    if (!cat) return list;
    return (list || []).filter(function (p) {
      return String(p.category || '').toLowerCase().indexOf(cat) !== -1;
    });
  }

  async function loadAll(opts) {
    setStatus('Đang tải Place công khai…');
    try {
      const res = await fetch(API + '?limit=100');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
      let list = filterByCategory(data.places || []);
      renderMarkers(list);
      renderResults(list);
      setStatus(list.length + ' Place · search / filter / cluster');
      if (!(opts && opts.skipFit) && list.length) {
        const withGps = list.filter(function (p) { return p.latitude || p.longitude; });
        if (withGps.length) {
          const bounds = L.latLngBounds(withGps.map(function (p) {
            return [p.latitude, p.longitude];
          }));
          map.fitBounds(bounds.pad(0.2));
        }
      }
      return list;
    } catch (e) {
      setStatus('Lỗi tải Place: ' + e.message);
      return [];
    }
  }

  async function search() {
    const q = (elQ.value || '').trim();
    const cat = (elCat && elCat.value || '').trim();
    setStatus('Đang tìm…');
    try {
      const body = { q: q, limit: 50 };
      if (cat) body.category = cat;
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
      setStatus('Tìm thấy ' + list.length + ' · mode ' + (data.search_mode || 'text'));
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
        if (userMarker) map.removeLayer(userMarker);
        if (userCircle) map.removeLayer(userCircle);
        userMarker = L.circleMarker([lat, lng], {
          radius: 8,
          color: '#2563eb',
          fillColor: '#2563eb',
          fillOpacity: 0.9
        }).addTo(map);
        userCircle = L.circle([lat, lng], {
          radius: GEOFENCE_M,
          color: '#2563eb',
          weight: 1,
          fillOpacity: 0.08
        }).addTo(map);
        map.setView([lat, lng], 16);
        search();
      },
      function (err) { setStatus('GPS lỗi: ' + err.message); },
      { enableHighAccuracy: true, timeout: 12000 }
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
  if (elCat) elCat.addEventListener('change', function () {
    if ((elQ.value || '').trim()) search();
    else loadAll({ skipFit: true });
  });
  elQ.addEventListener('input', scheduleSearch);
  elQ.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') {
      clearTimeout(searchTimer);
      search();
    }
  });

  loadAll().then(function () {
    openDeepLink();
  });
})();
