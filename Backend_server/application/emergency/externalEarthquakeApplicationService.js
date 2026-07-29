/**
 * Nguồn động đất ngoài (USGS) → kích hoạt EARTHQUAKE gần tòa nhà.
 * Viện Địa cầu VN chưa có API GeoJSON công khai — USGS bao phủ khu vực VN;
 * có thể trỏ EXTERNAL_QUAKE_FEED_URL sang feed khác khi có.
 */
const Building = require('../../models/Building');
const Incident = require('../../models/Incident');
const ActivityLog = require('../../models/ActivityLog');
const { haversineMeters } = require('../../utils/geo');
const { resolveBuildingScope } = require('../../utils/emergencyScope');

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function enabled() {
  const raw = String(process.env.USGS_QUAKE_ENABLED || 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function minMagnitude() {
  return Math.max(2, envNum('USGS_MIN_MAGNITUDE', 4.5));
}

function lookbackMinutes() {
  return Math.max(5, envNum('USGS_LOOKBACK_MIN', 120));
}

/** Bán kính ảnh hưởng cơ sở (km) ở M≈4.5; scale theo magnitude. */
function baseRadiusKm() {
  return Math.max(10, envNum('USGS_BASE_RADIUS_KM', 80));
}

function matchRadiusKm(magnitude) {
  const mag = Number(magnitude) || minMagnitude();
  // M4.5 → base; mỗi +1 độ ~ ×2 bán kính (đơn giản hóa).
  const scale = Math.pow(2, Math.max(0, mag - 4.5));
  return Math.min(500, baseRadiusKm() * scale);
}

function feedUrl() {
  const custom = String(process.env.EXTERNAL_QUAKE_FEED_URL || '').trim();
  if (custom) return custom;
  // USGS FDSN — sự kiện gần đây, có thể ảnh hưởng VN / khu vực tòa.
  const minMag = minMagnitude();
  const start = new Date(Date.now() - lookbackMinutes() * 60 * 1000).toISOString();
  return (
    'https://earthquake.usgs.gov/fdsnws/event/1/query' +
    `?format=geojson&starttime=${encodeURIComponent(start)}` +
    `&minmagnitude=${minMag}&orderby=time&limit=50`
  );
}

function eventExternalId(feature) {
  const id = feature?.id || feature?.properties?.code || feature?.properties?.ids;
  if (!id) return null;
  return `usgs:${String(id)}`;
}

function parseFeatures(geojson) {
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  return features
    .map((f) => {
      const coords = f?.geometry?.coordinates;
      const lng = Number(coords?.[0]);
      const lat = Number(coords?.[1]);
      const mag = Number(f?.properties?.mag);
      const place = String(f?.properties?.place || '').slice(0, 200);
      const time = f?.properties?.time ? new Date(f.properties.time) : null;
      const extId = eventExternalId(f);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !extId) return null;
      if (!Number.isFinite(mag) || mag < minMagnitude()) return null;
      return { extId, lat, lng, mag, place, time, rawId: String(f.id || '') };
    })
    .filter(Boolean);
}

async function fetchQuakeFeed() {
  const url = feedUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'IndoorNav-Emergency/1.0' },
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`USGS feed HTTP ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function findNearbyBuildings(lat, lng, radiusKm) {
  const buildings = await Building.find({
    is_active: { $ne: false },
    'gps_location.lat': { $exists: true },
    'gps_location.lng': { $exists: true }
  })
    .select('_id name gps_location organization_id activation_radius')
    .lean();

  const radiusM = radiusKm * 1000;
  const hits = [];
  for (const b of buildings) {
    const bLat = Number(b.gps_location?.lat);
    const bLng = Number(b.gps_location?.lng);
    if (!Number.isFinite(bLat) || !Number.isFinite(bLng)) continue;
    if (bLat === 0 && bLng === 0) continue;
    const distM = haversineMeters(bLat, bLng, lat, lng);
    if (distM <= radiusM) {
      hits.push({ building: b, distanceKm: distM / 1000 });
    }
  }
  return hits.sort((a, b) => a.distanceKm - b.distanceKm);
}

async function alreadyHandled(extId, buildingId) {
  return Incident.exists({
    external_event_id: extId,
    building_id: buildingId
  });
}

async function activateFromUsgs({ event, building, distanceKm }) {
  const buildingId = String(building._id);
  if (await alreadyHandled(event.extId, buildingId)) {
    return { skipped: true, reason: 'duplicate' };
  }

  const active = await Incident.findOne({
    building_id: buildingId,
    type: 'EARTHQUAKE',
    status: 'ACTIVE'
  })
    .select('_id')
    .lean();
  if (active) {
    return { skipped: true, reason: 'already_active', incident_id: String(active._id) };
  }

  const scope = await resolveBuildingScope(buildingId);
  const now = new Date();
  const title = `Cảnh báo động đất (USGS M${event.mag.toFixed(1)})`;
  const description =
    `Nguồn USGS: M${event.mag.toFixed(1)} — ${event.place || 'không rõ vị trí'}. ` +
    `Cách tòa ~${distanceKm.toFixed(1)} km. ` +
    'Hãy sơ tán theo lối thoát hiểm gần nhất và tuân theo hướng dẫn tại chỗ.';

  const incident = await Incident.create({
    type: 'EARTHQUAKE',
    scope: 'BUILDING',
    title,
    description,
    building_id: buildingId,
    organization_id: scope?.organization_id || building.organization_id || null,
    status: 'ACTIVE',
    created_by: null,
    activated_at: now,
    external_source: 'usgs',
    external_event_id: event.extId,
    external_meta: {
      magnitude: event.mag,
      place: event.place,
      lat: event.lat,
      lng: event.lng,
      time: event.time,
      distance_km: Number(distanceKm.toFixed(2)),
      usgs_id: event.rawId
    },
    timeline: [
      {
        status: 'ACTIVE',
        at: now,
        by: null,
        note: `USGS ${event.extId} M${event.mag.toFixed(1)} @ ${distanceKm.toFixed(1)}km`
      }
    ]
  });

  let broadcast = null;
  try {
    const { createBroadcast } = require('./broadcastApplicationService');
    const result = await createBroadcast({
      params: { incidentId: String(incident._id) },
      body: { title, body: description },
      actor: { userId: null, role: 'SYSTEM' },
      system: true,
      ip: ''
    });
    broadcast = result.body?.broadcast || null;
  } catch (err) {
    console.warn('[usgs] broadcast failed:', err.message);
  }

  ActivityLog.create({
    user_id: null,
    action: 'USGS_EARTHQUAKE_TRIGGER',
    target_type: 'incident',
    target_id: String(incident._id),
    target: title,
    details: {
      building_id: buildingId,
      external_event_id: event.extId,
      magnitude: event.mag,
      distance_km: distanceKm
    },
    organization_id: incident.organization_id || null,
    ip_address: ''
  }).catch(() => {});

  return { skipped: false, incident, broadcast };
}

/**
 * Một vòng poll USGS / feed ngoài.
 */
async function pollExternalEarthquakes() {
  if (!enabled()) {
    return { skipped: true, reason: 'disabled' };
  }

  const geojson = await fetchQuakeFeed();
  const events = parseFeatures(geojson);
  const results = [];

  for (const event of events) {
    const radiusKm = matchRadiusKm(event.mag);
    const nearby = await findNearbyBuildings(event.lat, event.lng, radiusKm);
    for (const hit of nearby) {
      try {
        const out = await activateFromUsgs({
          event,
          building: hit.building,
          distanceKm: hit.distanceKm
        });
        results.push({
          event_id: event.extId,
          building_id: String(hit.building._id),
          ...out,
          incident_id: out.incident ? String(out.incident._id) : out.incident_id || null
        });
      } catch (err) {
        results.push({
          event_id: event.extId,
          building_id: String(hit.building._id),
          error: err.message
        });
      }
    }
  }

  const triggered = results.filter((r) => r.skipped === false).length;
  return {
    skipped: false,
    events_seen: events.length,
    actions: results.length,
    triggered,
    results: results.slice(0, 40)
  };
}

module.exports = {
  enabled,
  minMagnitude,
  feedUrl,
  parseFeatures,
  matchRadiusKm,
  pollExternalEarthquakes,
  activateFromUsgs
};
