/**
 * Weather proxy — OpenWeatherMap Current Weather.
 * Stub-off khi thiếu OPENWEATHER_API_KEY (không làm hỏng outdoor nếu chưa cấu hình).
 *
 * Env:
 *   OPENWEATHER_API_KEY=
 *   OPENWEATHER_BASE_URL=https://api.openweathermap.org/data/2.5
 *   OPENWEATHER_TIMEOUT_MS=8000
 *   WEATHER_CACHE_TTL_SEC=600
 */
function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function apiKey() {
  return String(process.env.OPENWEATHER_API_KEY || '').trim();
}

function baseUrl() {
  const raw = String(
    process.env.OPENWEATHER_BASE_URL || 'https://api.openweathermap.org/data/2.5'
  ).trim();
  return raw.replace(/\/+$/, '') || 'https://api.openweathermap.org/data/2.5';
}

function parseCoord(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw httpError(400, `Thiếu hoặc sai ${name}.`, 'INVALID_COORD');
  }
  return n;
}

const cache = new Map();

function cacheTtlMs() {
  return Math.max(60, Number(process.env.WEATHER_CACHE_TTL_SEC) || 600) * 1000;
}

function cacheKey(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

async function fetchCurrentWeather({ lat, lng }) {
  const key = apiKey();
  if (!key) {
    throw httpError(503, 'Chưa cấu hình OPENWEATHER_API_KEY.', 'WEATHER_DISABLED');
  }

  const ck = cacheKey(lat, lng);
  const hit = cache.get(ck);
  if (hit && hit.expiresAt > Date.now()) {
    return { ...hit.body, cached: true };
  }

  const url =
    `${baseUrl()}/weather?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}` +
    `&appid=${encodeURIComponent(key)}` +
    '&units=metric&lang=vi';

  const controller = new AbortController();
  const timeoutMs = Math.max(3000, Number(process.env.OPENWEATHER_TIMEOUT_MS) || 8000);
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
      throw httpError(504, 'OpenWeatherMap hết thời gian chờ.', 'WEATHER_TIMEOUT');
    }
    throw httpError(502, 'Không kết nối được OpenWeatherMap.', 'WEATHER_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw httpError(502, 'OpenWeatherMap trả dữ liệu không hợp lệ.', 'WEATHER_UNAVAILABLE');
  }

  if (!res.ok) {
    throw httpError(502, 'OpenWeatherMap không khả dụng.', 'WEATHER_UNAVAILABLE');
  }

  const w0 = Array.isArray(body.weather) ? body.weather[0] : null;
  const mapped = {
    provider: 'openweathermap',
    cached: false,
    lat,
    lng,
    temp_c: Number.isFinite(Number(body.main?.temp))
      ? Math.round(Number(body.main.temp) * 10) / 10
      : null,
    feels_like_c: Number.isFinite(Number(body.main?.feels_like))
      ? Math.round(Number(body.main.feels_like) * 10) / 10
      : null,
    humidity: Number.isFinite(Number(body.main?.humidity))
      ? Number(body.main.humidity)
      : null,
    description: String(w0?.description || '').trim() || null,
    icon: String(w0?.icon || '').trim() || null,
    wind_mps: Number.isFinite(Number(body.wind?.speed))
      ? Math.round(Number(body.wind.speed) * 10) / 10
      : null
  };

  cache.set(ck, { expiresAt: Date.now() + cacheTtlMs(), body: { ...mapped, cached: false } });
  return mapped;
}

async function getCurrentWeather({ query }) {
  const lat = parseCoord(query?.lat, 'lat');
  const lng = parseCoord(query?.lng, 'lng');
  if (Math.abs(lat) > 90) throw httpError(400, 'Vĩ độ không hợp lệ.', 'INVALID_COORD');
  if (Math.abs(lng) > 180) throw httpError(400, 'Kinh độ không hợp lệ.', 'INVALID_COORD');

  const body = await fetchCurrentWeather({ lat, lng });
  return { status: 200, body };
}

function _resetWeatherCacheForTests() {
  cache.clear();
}

module.exports = {
  getCurrentWeather,
  _resetWeatherCacheForTests
};
