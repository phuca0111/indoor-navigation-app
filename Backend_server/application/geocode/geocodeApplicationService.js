/**
 * Geocode proxy — Nominatim (OSM).
 * Client (Android/Web) chỉ gọi Backend; Backend cache + giới hạn tốc độ.
 *
 * Env:
 *   NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
 *   NOMINATIM_TIMEOUT_MS=8000
 *   NOMINATIM_USER_AGENT=IndoorNavApp/1.0 (contact@example.com)
 *   GEOCODE_CACHE_TTL_SEC=300
 *   GEOCODE_MIN_INTERVAL_MS=1100   (policy ~1 req/s tới Nominatim public)
 */
function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function baseUrl() {
  const raw = String(process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org').trim();
  return raw.replace(/\/+$/, '') || 'https://nominatim.openstreetmap.org';
}

function userAgent() {
  const ua = String(process.env.NOMINATIM_USER_AGENT || '').trim();
  if (ua) return ua;
  return 'IndoorNavApp/1.0 (KLTN; https://navindoor.info; contact@navindoor.info)';
}

function cacheTtlMs() {
  return Math.max(30, Number(process.env.GEOCODE_CACHE_TTL_SEC) || 300) * 1000;
}

function minIntervalMs() {
  return Math.max(0, Number(process.env.GEOCODE_MIN_INTERVAL_MS) || 1100);
}

/** @type {Map<string, { expires: number, body: object }>} */
const memoryCache = new Map();

let lastNominatimAt = 0;
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
  // Giữ cache nhỏ
  if (memoryCache.size > 500) {
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
  }
}

function normalizeQuery(q) {
  return String(q || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

function mapNominatimHit(row) {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const display = String(row.display_name || '').trim();
  const name =
    String(row.name || '').trim() ||
    display.split(',')[0]?.trim() ||
    'Địa điểm OSM';
  return {
    id: `osm:${row.place_id || `${lat},${lng}`}`,
    source: 'nominatim',
    name,
    display_name: display,
    lat,
    lng,
    type: String(row.type || row.class || '').trim() || null,
    osm_class: String(row.class || '').trim() || null,
    importance: Number(row.importance) || null,
  };
}

async function waitTurn() {
  const gap = minIntervalMs();
  if (gap <= 0) return;
  const wait = Math.max(0, lastNominatimAt + gap - Date.now());
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastNominatimAt = Date.now();
}

async function fetchNominatim({ q, limit, lat, lng, countryCodes }) {
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '0',
    limit: String(limit),
  });
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    // Ưu tiên kết quả quanh user (viewbox ~ ±0.35°)
    const d = 0.35;
    params.set('viewbox', `${lng - d},${lat + d},${lng + d},${lat - d}`);
    params.set('bounded', '0');
  }
  if (countryCodes) {
    params.set('countrycodes', countryCodes);
  }

  const url = `${baseUrl()}/search?${params.toString()}`;
  const controller = new AbortController();
  const timeoutMs = Math.max(3000, Number(process.env.NOMINATIM_TIMEOUT_MS) || 8000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    await waitTurn();
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent(),
      },
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw httpError(504, 'Nominatim hết thời gian chờ.', 'NOMINATIM_TIMEOUT');
    }
    throw httpError(502, 'Không kết nối được Nominatim.', 'NOMINATIM_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw httpError(429, 'Nominatim đang giới hạn tốc độ. Thử lại sau.', 'NOMINATIM_RATE_LIMIT');
  }
  if (!res.ok) {
    throw httpError(502, 'Nominatim không khả dụng.', 'NOMINATIM_UNAVAILABLE');
  }

  let raw;
  try {
    raw = await res.json();
  } catch {
    throw httpError(502, 'Nominatim trả dữ liệu không hợp lệ.', 'NOMINATIM_UNAVAILABLE');
  }

  const results = (Array.isArray(raw) ? raw : [])
    .map(mapNominatimHit)
    .filter(Boolean);

  return {
    q,
    provider: 'nominatim',
    cached: false,
    total: results.length,
    results,
  };
}

/**
 * useCase — GET /api/geocode?q=&limit=&lat=&lng=
 */
async function geocode({ query }) {
  const q = normalizeQuery(query?.q ?? query?.query);
  if (q.length < 2) {
    throw httpError(400, 'Tham số q tối thiểu 2 ký tự.', 'INVALID_QUERY');
  }

  let limit = Math.min(10, Math.max(1, Number(query?.limit) || 5));
  const lat = query?.lat != null ? Number(query.lat) : NaN;
  const lng = query?.lng != null ? Number(query.lng) : NaN;
  const countryCodes = String(query?.countrycodes || process.env.GEOCODE_COUNTRYCODES || 'vn')
    .trim()
    .toLowerCase() || undefined;

  const cacheKey = [
    q.toLowerCase(),
    limit,
    Number.isFinite(lat) ? lat.toFixed(3) : '',
    Number.isFinite(lng) ? lng.toFixed(3) : '',
    countryCodes || '',
  ].join('|');

  const cached = cacheGet(cacheKey);
  if (cached) {
    return {
      status: 200,
      body: { ...cached, cached: true },
    };
  }

  // Serialise gọi Nominatim (1 req/s global trong process)
  const body = await new Promise((resolve, reject) => {
    chain = chain
      .then(() =>
        fetchNominatim({
          q,
          limit,
          lat: Number.isFinite(lat) ? lat : undefined,
          lng: Number.isFinite(lng) ? lng : undefined,
          countryCodes,
        }),
      )
      .then(resolve, reject);
  });

  cacheSet(cacheKey, body);
  return { status: 200, body };
}

/** Test helper */
function _clearCacheForTests() {
  memoryCache.clear();
  lastNominatimAt = 0;
}

module.exports = {
  geocode,
  _clearCacheForTests,
};
