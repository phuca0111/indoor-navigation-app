/**
 * Spec D+ — Radio presence (Wi-Fi BSSID + BLE) hỗ trợ khi GPS kém.
 * Học fingerprint khi user đang indoor / GPS gần tòa; khớp khi scan lại.
 */
const Building = require('../../models/Building');
const BuildingRadioFingerprint = require('../../models/BuildingRadioFingerprint');
const { haversineMeters } = require('../../utils/geo');

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeBssid(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, ':');
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(s)) return '';
  // Bỏ multicast/random local bit thô — vẫn giữ; chỉ lọc rỗng
  if (s === '00:00:00:00:00:00' || s === 'ff:ff:ff:ff:ff:ff') return '';
  return s;
}

function normalizeBleId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f:]/g, '')
    .slice(0, 64);
}

function parseWifiList(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();
  for (const item of arr.slice(0, 40)) {
    const bssid =
      typeof item === 'string'
        ? normalizeBssid(item)
        : normalizeBssid(item?.bssid || item?.BSSID);
    if (!bssid || seen.has(bssid)) continue;
    seen.add(bssid);
    out.push({
      bssid,
      rssi: Number.isFinite(Number(item?.rssi)) ? Number(item.rssi) : null,
      ssid: String(item?.ssid || '').slice(0, 64)
    });
  }
  return out;
}

function parseBleList(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();
  for (const item of arr.slice(0, 40)) {
    const id =
      typeof item === 'string'
        ? normalizeBleId(item)
        : normalizeBleId(item?.id || item?.address || item?.uuid);
    if (!id || id.length < 8 || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      rssi: Number.isFinite(Number(item?.rssi)) ? Number(item.rssi) : null
    });
  }
  return out;
}

async function learnFingerprints(buildingId, wifiList, bleList) {
  if (!buildingId) return;
  const now = new Date();
  const ops = [];
  for (const w of wifiList) {
    ops.push(
      BuildingRadioFingerprint.findOneAndUpdate(
        { building_id: buildingId, wifi_bssid: w.bssid },
        {
          $set: { last_seen_at: now, ble_id: '' },
          $inc: { hit_count: 1 },
          $setOnInsert: { building_id: buildingId, wifi_bssid: w.bssid }
        },
        { upsert: true }
      )
    );
  }
  for (const b of bleList) {
    ops.push(
      BuildingRadioFingerprint.findOneAndUpdate(
        { building_id: buildingId, ble_id: b.id },
        {
          $set: { last_seen_at: now, wifi_bssid: '' },
          $inc: { hit_count: 1 },
          $setOnInsert: { building_id: buildingId, ble_id: b.id }
        },
        { upsert: true }
      )
    );
  }
  if (ops.length) await Promise.all(ops.map((p) => p.catch(() => null)));
}

/**
 * @returns {{ buildingId: string|null, score: number, source: string }}
 */
async function matchBuildingFromRadio(wifiList, bleList) {
  const minHits = Math.max(1, envNum('EMERGENCY_RADIO_MIN_HITS', 2));
  const minScore = Math.max(1, envNum('EMERGENCY_RADIO_MIN_SCORE', 2));
  const wifiIds = wifiList.map((w) => w.bssid);
  const bleIds = bleList.map((b) => b.id);
  if (!wifiIds.length && !bleIds.length) {
    return { buildingId: null, score: 0, source: '' };
  }

  const or = [];
  if (wifiIds.length) or.push({ wifi_bssid: { $in: wifiIds } });
  if (bleIds.length) or.push({ ble_id: { $in: bleIds } });

  const rows = await BuildingRadioFingerprint.find({
    $or: or,
    hit_count: { $gte: minHits }
  })
    .select('building_id wifi_bssid ble_id hit_count')
    .lean();

  if (!rows.length) return { buildingId: null, score: 0, source: '' };

  const scores = new Map(); // buildingId -> { wifi: n, ble: n }
  for (const row of rows) {
    const id = String(row.building_id);
    if (!scores.has(id)) scores.set(id, { wifi: 0, ble: 0 });
    const s = scores.get(id);
    if (row.wifi_bssid) s.wifi += 1;
    if (row.ble_id) s.ble += 1;
  }

  let bestId = null;
  let bestScore = 0;
  let bestSource = '';
  for (const [id, s] of scores.entries()) {
    const score = s.wifi + s.ble;
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
      bestSource = s.wifi && s.ble ? 'wifi+ble' : s.wifi ? 'wifi' : 'ble';
    }
  }

  if (!bestId || bestScore < minScore) {
    return { buildingId: null, score: bestScore, source: '' };
  }
  return { buildingId: bestId, score: bestScore, source: bestSource };
}

/**
 * Xử lý radio trong updatePresence.
 * @returns patch fields cho UserDevice
 */
async function applyRadioPresence(input = {}, context = {}) {
  const wifiList = parseWifiList(input.wifi_bssids || input.wifi || []);
  const bleList = parseBleList(input.ble_ids || input.ble || []);
  if (!wifiList.length && !bleList.length) return {};

  const now = new Date();
  const patch = {
    last_radio_scan_at: now,
    last_radio_wifi_count: wifiList.length,
    last_radio_ble_count: bleList.length
  };

  let learnBuildingId = input.building_id ? String(input.building_id) : null;

  // Học khi GPS gần tâm tòa (user đang outdoor sát tòa / vừa vào)
  if (!learnBuildingId && input.lat != null && input.lng != null) {
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    const learnRadius = envNum('EMERGENCY_RADIO_LEARN_RADIUS_M', 120);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const buildings = await Building.find({
        is_active: { $ne: false },
        'gps_location.lat': { $ne: 0 }
      })
        .select('_id gps_location')
        .limit(80)
        .lean();
      let nearest = null;
      let nearestDist = Infinity;
      for (const b of buildings) {
        const d = haversineMeters(
          Number(b.gps_location.lat),
          Number(b.gps_location.lng),
          lat,
          lng
        );
        if (d < nearestDist) {
          nearestDist = d;
          nearest = b;
        }
      }
      if (nearest && nearestDist <= learnRadius) {
        learnBuildingId = String(nearest._id);
      }
    }
  }

  // Không học fingerprint nếu GPS tin cậy chứng minh đang xa tòa claimed (mở map từ xa)
  if (learnBuildingId && input.lat != null && input.lng != null) {
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    const learnRadius = envNum('EMERGENCY_RADIO_LEARN_RADIUS_M', 120);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const b = await Building.findById(learnBuildingId).select('gps_location').lean();
      const bLat = Number(b?.gps_location?.lat);
      const bLng = Number(b?.gps_location?.lng);
      if (Number.isFinite(bLat) && Number.isFinite(bLng) && (bLat !== 0 || bLng !== 0)) {
        const d = haversineMeters(bLat, bLng, lat, lng);
        if (d > learnRadius) {
          learnBuildingId = null;
        }
      }
    }
  }

  if (learnBuildingId) {
    await learnFingerprints(learnBuildingId, wifiList, bleList);
  }

  const match = await matchBuildingFromRadio(wifiList, bleList);
  if (match.buildingId) {
    // GPS tin cậy + xa tòa radio khớp → không claim presence (tránh mở map từ xa + fingerprint bẩn)
    let allowRadioPresence = true;
    if (input.lat != null && input.lng != null) {
      const lat = Number(input.lat);
      const lng = Number(input.lng);
      const clearDist = envNum('EMERGENCY_RECIPIENT_CLEAR_DISTANCE_M', 500);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const b = await Building.findById(match.buildingId).select('gps_location').lean();
        const bLat = Number(b?.gps_location?.lat);
        const bLng = Number(b?.gps_location?.lng);
        if (Number.isFinite(bLat) && Number.isFinite(bLng) && (bLat !== 0 || bLng !== 0)) {
          const d = haversineMeters(bLat, bLng, lat, lng);
          if (d > clearDist) allowRadioPresence = false;
        }
      }
    }
    if (allowRadioPresence) {
      patch.last_radio_building_id = match.buildingId;
      patch.last_radio_at = now;
      patch.last_radio_score = match.score;
      patch.last_radio_source = match.source;
      if (!input.clear_presence) {
        patch.last_building_id = match.buildingId;
        patch.last_indoor_building_id = match.buildingId;
        patch.last_indoor_at = now;
      }
    }
  }

  return patch;
}

module.exports = {
  applyRadioPresence,
  parseWifiList,
  parseBleList,
  matchBuildingFromRadio,
  learnFingerprints
};
