/**
 * Outdoor routing — OSM tiles trên client; đường lấy từ OSRM (proxy).
 * Env: OSRM_BASE_URL (mặc định https://router.project-osrm.org)
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

  const route = await fetchOsrmRoute({ fromLat, fromLng, toLat, toLng, profile });
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
  normalizeProfile,
  osrmBaseUrl
};
