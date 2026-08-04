/**
 * Outdoor routing — OSM tiles trên client; đường lấy từ OSRM (proxy).
 * Fallback OpenRouteService khi có ORS_API_KEY và OSRM lỗi mạng/5xx (không thay OSRM khi có route).
 * Env: OSRM_BASE_URL, ORS_API_KEY, ORS_BASE_URL
 */
function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function osrmBaseUrl() {
  const raw = String(process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').trim();
  return raw.replace(/\/+$/, '') || 'https://router.project-osrm.org';
}

function orsApiKey() {
  return String(process.env.ORS_API_KEY || '').trim();
}

function orsBaseUrl() {
  const raw = String(process.env.ORS_BASE_URL || 'https://api.openrouteservice.org').trim();
  return raw.replace(/\/+$/, '') || 'https://api.openrouteservice.org';
}

function parseCoord(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw httpError(400, `Thiếu hoặc sai ${name}.`, 'INVALID_COORD');
  }
  return n;
}

function normalizeProfile(raw) {
  const p = String(raw || 'foot').trim().toLowerCase();
  if (p === 'walking' || p === 'walk' || p === 'foot') return 'foot';
  if (p === 'driving' || p === 'car' || p === 'drive') return 'driving';
  if (p === 'cycling' || p === 'bike' || p === 'bicycle') return 'cycling';
  return 'foot';
}

function orsProfile(pathProfile) {
  if (pathProfile === 'driving') return 'driving-car';
  if (pathProfile === 'cycling') return 'cycling-regular';
  return 'foot-walking';
}

/**
 * OSRM maneuver.type + modifier → left | right | straight | arrive | depart
 */
function normalizeManeuver(maneuver) {
  if (!maneuver || typeof maneuver !== 'object') return 'straight';
  const type = String(maneuver.type || '').toLowerCase();
  const modifier = String(maneuver.modifier || '').toLowerCase();

  if (type === 'arrive') return 'arrive';
  if (type === 'depart') return 'depart';

  if (
    modifier.includes('left') ||
    type === 'off ramp' && modifier.includes('left')
  ) {
    return 'left';
  }
  if (
    modifier.includes('right') ||
    type === 'off ramp' && modifier.includes('right')
  ) {
    return 'right';
  }
  if (modifier.includes('uturn') || modifier.includes('u-turn')) {
    return modifier.includes('left') ? 'left' : 'right';
  }
  if (
    type === 'continue' ||
    type === 'new name' ||
    type === 'notification' ||
    modifier === 'straight' ||
    !modifier
  ) {
    return 'straight';
  }
  if (modifier.includes('slight left') || modifier === 'slight left') return 'left';
  if (modifier.includes('slight right') || modifier === 'slight right') return 'right';
  return 'straight';
}

function instructionVi(maneuverKey, distanceM, streetName) {
  const d = Math.max(0, Math.round(Number(distanceM) || 0));
  const street = String(streetName || '').trim();
  const streetPart = street ? ` lên ${street}` : '';

  switch (maneuverKey) {
    case 'arrive':
      return 'Đã đến nơi';
    case 'depart':
      return d > 0 ? `Đi thẳng ${d} m${streetPart}` : `Bắt đầu${streetPart}`;
    case 'left':
      return d <= 1 ? `Rẽ trái${streetPart}` : `Rẽ trái sau ${d} m${streetPart}`;
    case 'right':
      return d <= 1 ? `Rẽ phải${streetPart}` : `Rẽ phải sau ${d} m${streetPart}`;
    default:
      return d > 0 ? `Đi thẳng ${d} m${streetPart}` : `Đi thẳng${streetPart}`;
  }
}

function mapOsrmRoute(osrmJson) {
  if (!osrmJson || osrmJson.code !== 'Ok' || !Array.isArray(osrmJson.routes) || !osrmJson.routes[0]) {
    return null;
  }
  const route = osrmJson.routes[0];
  const coords = route.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const polyline = coords
    .map((c) => {
      const lng = Number(c?.[0]);
      const lat = Number(c?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter(Boolean);

  if (polyline.length < 2) return null;

  const steps = [];
  const legs = Array.isArray(route.legs) ? route.legs : [];
  for (const leg of legs) {
    const legSteps = Array.isArray(leg.steps) ? leg.steps : [];
    for (const step of legSteps) {
      const maneuver = step.maneuver || {};
      const key = normalizeManeuver(maneuver);
      const loc = Array.isArray(maneuver.location) ? maneuver.location : null;
      const lng = Number(loc?.[0]);
      const lat = Number(loc?.[1]);
      const distanceM = Number(step.distance) || 0;
      steps.push({
        maneuver: key,
        distance_m: Math.round(distanceM * 10) / 10,
        duration_s: Math.round(Number(step.duration) || 0),
        name: String(step.name || '').trim(),
        instruction: instructionVi(key, distanceM, step.name),
        location:
          Number.isFinite(lat) && Number.isFinite(lng)
            ? { lat, lng }
            : null
      });
    }
  }

  return {
    provider: 'osrm',
    profile: null,
    distance_m: Math.round((Number(route.distance) || 0) * 10) / 10,
    duration_s: Math.round(Number(route.duration) || 0),
    polyline,
    steps
  };
}

/** Map ORS GeoJSON directions → cùng shape client (polyline/steps). */
function mapOrsRoute(orsJson) {
  const features = Array.isArray(orsJson?.features) ? orsJson.features : [];
  const feature = features[0];
  if (!feature) return null;
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const polyline = coords
    .map((c) => {
      const lng = Number(c?.[0]);
      const lat = Number(c?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter(Boolean);
  if (polyline.length < 2) return null;

  const summary = feature.properties?.summary || {};
  const segments = Array.isArray(feature.properties?.segments) ? feature.properties.segments : [];
  const steps = [];
  for (const seg of segments) {
    const segSteps = Array.isArray(seg.steps) ? seg.steps : [];
    for (const step of segSteps) {
      const type = Number(step.type);
      // ORS step types: 0 turn left … 10 arrive — map thô sang left/right/straight
      let key = 'straight';
      if (type === 10) key = 'arrive';
      else if (type === 11) key = 'depart';
      else if ([0, 2, 4, 6].includes(type)) key = 'left';
      else if ([1, 3, 5, 7].includes(type)) key = 'right';
      const distanceM = Number(step.distance) || 0;
      const name = String(step.name || '').trim();
      const wayPoints = Array.isArray(step.way_points) ? step.way_points : null;
      const idx = Number.isFinite(wayPoints?.[0]) ? wayPoints[0] : null;
      const pt = idx != null && polyline[idx] ? polyline[idx] : null;
      steps.push({
        maneuver: key,
        distance_m: Math.round(distanceM * 10) / 10,
        duration_s: Math.round(Number(step.duration) || 0),
        name,
        instruction: instructionVi(key, distanceM, name),
        location: pt || null
      });
    }
  }

  return {
    provider: 'openrouteservice',
    profile: null,
    distance_m: Math.round((Number(summary.distance) || 0) * 10) / 10,
    duration_s: Math.round(Number(summary.duration) || 0),
    polyline,
    steps
  };
}

async function fetchOsrmRoute({ fromLat, fromLng, toLat, toLng, profile }) {
  const base = osrmBaseUrl();
  const pathProfile = normalizeProfile(profile);
  const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
  const url =
    `${base}/route/v1/${pathProfile}/${coords}` +
    '?overview=full&geometries=geojson&steps=true';

  const controller = new AbortController();
  const timeoutMs = Math.max(3000, Number(process.env.OSRM_TIMEOUT_MS) || 12000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw httpError(504, 'OSRM hết thời gian chờ.', 'OSRM_TIMEOUT');
    }
    throw httpError(502, 'Không kết nối được OSRM.', 'OSRM_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw httpError(502, 'OSRM trả về dữ liệu không hợp lệ.', 'OSRM_UNAVAILABLE');
  }

  if (!res.ok) {
    throw httpError(502, 'OSRM không khả dụng.', 'OSRM_UNAVAILABLE');
  }

  if (body.code === 'NoRoute' || body.code === 'NoSegment') {
    throw httpError(404, 'Không tìm thấy đường đi.', 'ROUTE_NOT_FOUND');
  }

  const mapped = mapOsrmRoute(body);
  if (!mapped) {
    throw httpError(404, 'Không tìm thấy đường đi.', 'ROUTE_NOT_FOUND');
  }
  mapped.profile = pathProfile;
  return mapped;
}

async function fetchOrsRoute({ fromLat, fromLng, toLat, toLng, profile }) {
  const key = orsApiKey();
  if (!key) {
    throw httpError(503, 'Chưa cấu hình ORS_API_KEY.', 'ORS_DISABLED');
  }
  const pathProfile = normalizeProfile(profile);
  const url = `${orsBaseUrl()}/v2/directions/${orsProfile(pathProfile)}/geojson`;
  const controller = new AbortController();
  const timeoutMs = Math.max(3000, Number(process.env.ORS_TIMEOUT_MS) || 12000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: key
      },
      body: JSON.stringify({
        coordinates: [
          [fromLng, fromLat],
          [toLng, toLat]
        ],
        instructions: true,
        elevation: false
      }),
      signal: controller.signal
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw httpError(504, 'OpenRouteService hết thời gian chờ.', 'ORS_TIMEOUT');
    }
    throw httpError(502, 'Không kết nối được OpenRouteService.', 'ORS_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw httpError(502, 'OpenRouteService trả dữ liệu không hợp lệ.', 'ORS_UNAVAILABLE');
  }

  if (!res.ok) {
    throw httpError(502, 'OpenRouteService không khả dụng.', 'ORS_UNAVAILABLE');
  }

  const mapped = mapOrsRoute(body);
  if (!mapped) {
    throw httpError(404, 'Không tìm thấy đường đi.', 'ROUTE_NOT_FOUND');
  }
  mapped.profile = pathProfile;
  return mapped;
}

function shouldTryOrsFallback(err) {
  if (!orsApiKey()) return false;
  const code = err?.code || '';
  const status = Number(err?.status) || 0;
  if (code === 'ROUTE_NOT_FOUND' || status === 404) return true;
  if (code === 'OSRM_TIMEOUT' || code === 'OSRM_UNAVAILABLE') return true;
  if (status === 502 || status === 504) return true;
  return false;
}

/**
 * useCase — GET/POST outdoor-route
 */
async function getOutdoorRoute({ query, body }) {
  const src = { ...(query || {}), ...(body || {}) };
  const fromLat = parseCoord(src.fromLat ?? src.from_lat, 'fromLat');
  const fromLng = parseCoord(src.fromLng ?? src.from_lng, 'fromLng');
  const toLat = parseCoord(src.toLat ?? src.to_lat, 'toLat');
  const toLng = parseCoord(src.toLng ?? src.to_lng, 'toLng');
  const profile = normalizeProfile(src.profile);

  if (Math.abs(fromLat) > 90 || Math.abs(toLat) > 90) {
    throw httpError(400, 'Vĩ độ không hợp lệ.', 'INVALID_COORD');
  }
  if (Math.abs(fromLng) > 180 || Math.abs(toLng) > 180) {
    throw httpError(400, 'Kinh độ không hợp lệ.', 'INVALID_COORD');
  }

  let route;
  try {
    route = await fetchOsrmRoute({ fromLat, fromLng, toLat, toLng, profile });
  } catch (osrmErr) {
    if (!shouldTryOrsFallback(osrmErr)) throw osrmErr;
    try {
      route = await fetchOrsRoute({ fromLat, fromLng, toLat, toLng, profile });
    } catch (_orsErr) {
      // Ưu tiên lỗi OSRM gốc nếu ORS cũng fail (tránh che thông báo quen thuộc)
      throw osrmErr;
    }
  }

  return {
    status: 200,
    body: {
      ...route,
      from: { lat: fromLat, lng: fromLng },
      to: { lat: toLat, lng: toLng }
    }
  };
}

module.exports = {
  getOutdoorRoute,
  normalizeManeuver,
  instructionVi,
  mapOsrmRoute,
  mapOrsRoute,
  normalizeProfile,
  osrmBaseUrl,
  orsApiKey,
  shouldTryOrsFallback
};
