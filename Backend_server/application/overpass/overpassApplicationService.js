/**
 * Overpass proxy — POI OSM quanh tọa độ (amenity).
 * Client chỉ gọi Backend; Backend cache + throttle (không gọi thẳng Overpass từ app).
 *
 * Env:
 *   OVERPASS_BASE_URL=https://overpass-api.de/api/interpreter
 *   OVERPASS_TIMEOUT_MS=15000
 *   OVERPASS_USER_AGENT=IndoorNavApp/1.0 (...)
 *   OVERPASS_CACHE_TTL_SEC=600
 *   OVERPASS_MIN_INTERVAL_MS=1500
 */
function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

const DEFAULT_AMENITIES = [
  'cafe',
  'restaurant',
  'fast_food',
  'atm',
  'bank',
  'pharmacy',
  'hospital',
  'toilets',
  'parking',
  'fuel',
  'supermarket',
  'convenience',
];

function baseUrl() {
  const raw = String(process.env.OVERPASS_BASE_URL || 'https://overpass-api.de/api/interpreter').trim();
  return raw.replace(/\/+$/, '') || 'https://overpass-api.de/api/interpreter';
}

function userAgent() {
  const ua = String(process.env.OVERPASS_USER_AGENT || process.env.NOMINATIM_USER_AGENT || '').trim();
  if (ua) return ua;
  return 'IndoorNavApp/1.0 (KLTN; https://navindoor.info; contact@navindoor.info)';
}

function cacheTtlMs() {
  return Math.max(60, Number(process.env.OVERPASS_CACHE_TTL_SEC) || 600) * 1000;
}

function minIntervalMs() {
  return Math.max(0, Number(process.env.OVERPASS_MIN_INTERVAL_MS) || 1500);
}

/** @type {Map<string, { expires: number, body: object }>} */
const memoryCache = new Map();

let lastOverpassAt = 0;
let chain = Promise.resolve();

function cacheGet(key) {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    memoryCache.delete(key);
    return null;
  }
  return hit.body;
}

function cacheSet(key, body) {
  memoryCache.set(key, { expires: Date.now() + cacheTtlMs(), body });
  if (memoryCache.size > 300) {
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const r = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseAmenities(raw) {
  const list = String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''))
    .filter(Boolean)
    .slice(0, 20);
  return list.length ? [...new Set(list)] : DEFAULT_AMENITIES.slice();
}

function elementCoords(el) {
  if (el.type === 'node' && Number.isFinite(Number(el.lat)) && Number.isFinite(Number(el.lon))) {
    return { lat: Number(el.lat), lng: Number(el.lon) };
  }
  const c = el.center;
  if (c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon))) {
    return { lat: Number(c.lat), lng: Number(c.lon) };
  }
  return null;
}

function mapElement(el, originLat, originLng) {
  const coords = elementCoords(el);
  if (!coords) return null;
  const tags = el.tags && typeof el.tags === 'object' ? el.tags : {};
  const amenity = String(tags.amenity || tags.shop || '').trim() || null;
  const name =
    String(tags.name || tags['name:vi'] || tags.brand || '').trim() ||
    (amenity ? amenity.replace(/_/g, ' ') : 'POI OSM');
  const distanceM = Math.round(haversineMeters(originLat, originLng, coords.lat, coords.lng));
  return {
    id: `osm:${el.type}:${el.id}`,
    source: 'overpass',
    name,
    display_name: amenity ? `${name} · ${amenity}` : name,
    lat: coords.lat,
    lng: coords.lng,
    amenity,
    osm_type: el.type || null,
    osm_id: el.id != null ? Number(el.id) : null,
    distance_m: distanceM,
    tags: {
      ...(tags.cuisine ? { cuisine: String(tags.cuisine) } : {}),
      ...(tags.opening_hours ? { opening_hours: String(tags.opening_hours) } : {}),
      ...(tags.wheelchair ? { wheelchair: String(tags.wheelchair) } : {}),
    },
  };
}

function buildQl({ lat, lng, radius, amenities }) {
  const regex = amenities.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // shop=convenience|supermarket cũng hữu ích; gom vào cùng regex trên tag amenity + shop
  return `
[out:json][timeout:25];
(
  node["amenity"~"^(${regex})$"](around:${radius},${lat},${lng});
  way["amenity"~"^(${regex})$"](around:${radius},${lat},${lng});
  node["shop"~"^(${regex})$"](around:${radius},${lat},${lng});
  way["shop"~"^(${regex})$"](around:${radius},${lat},${lng});
);
out center tags;
`.trim();
}

async function waitTurn() {
  const gap = minIntervalMs();
  if (gap <= 0) return;
  const wait = Math.max(0, lastOverpassAt + gap - Date.now());
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastOverpassAt = Date.now();
}

async function fetchOverpass({ lat, lng, radius, amenities, limit }) {
  const ql = buildQl({ lat, lng, radius, amenities });
  const controller = new AbortController();
  const timeoutMs = Math.max(5000, Number(process.env.OVERPASS_TIMEOUT_MS) || 15000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    await waitTurn();
    res = await fetch(baseUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': userAgent(),
      },
      body: `data=${encodeURIComponent(ql)}`,
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw httpError(504, 'Overpass hết thời gian chờ.', 'OVERPASS_TIMEOUT');
    }
    throw httpError(502, 'Không kết nối được Overpass.', 'OVERPASS_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw httpError(429, 'Overpass đang giới hạn tốc độ. Thử lại sau.', 'OVERPASS_RATE_LIMIT');
  }
  if (!res.ok) {
    throw httpError(502, 'Overpass không khả dụng.', 'OVERPASS_UNAVAILABLE');
  }

  let raw;
  try {
    raw = await res.json();
  } catch {
    throw httpError(502, 'Overpass trả dữ liệu không hợp lệ.', 'OVERPASS_UNAVAILABLE');
  }

  const elements = Array.isArray(raw?.elements) ? raw.elements : [];
  const results = elements
    .map((el) => mapElement(el, lat, lng))
    .filter(Boolean)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit);

  return {
    provider: 'overpass',
    cached: false,
    lat,
    lng,
    radius_m: radius,
    amenities,
    total: results.length,
    results,
  };
}

/**
 * useCase — GET /api/overpass/nearby?lat=&lng=&radius=&amenities=&limit=
 */
async function nearby({ query }) {
  const lat = Number(query?.lat);
  const lng = Number(query?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw httpError(400, 'Thiếu lat/lng hợp lệ.', 'INVALID_COORDS');
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw httpError(400, 'lat/lng ngoài phạm vi.', 'INVALID_COORDS');
  }

  const radius = Math.min(1000, Math.max(50, Number(query?.radius) || 250));
  const limit = Math.min(60, Math.max(1, Number(query?.limit) || 30));
  const amenities = parseAmenities(query?.amenities);

  const cacheKey = [
    lat.toFixed(3),
    lng.toFixed(3),
    radius,
    amenities.slice().sort().join(','),
    limit,
  ].join('|');

  const cached = cacheGet(cacheKey);
  if (cached) {
    return { status: 200, body: { ...cached, cached: true } };
  }

  const body = await new Promise((resolve, reject) => {
    chain = chain
      .then(() => fetchOverpass({ lat, lng, radius, amenities, limit }))
      .then(resolve, reject);
  });

  cacheSet(cacheKey, body);
  return { status: 200, body };
}

function _clearCacheForTests() {
  memoryCache.clear();
  lastOverpassAt = 0;
}

module.exports = {
  nearby,
  DEFAULT_AMENITIES,
  _clearCacheForTests,
};
