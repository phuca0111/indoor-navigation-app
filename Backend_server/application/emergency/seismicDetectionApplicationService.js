/**
 * MVP phát hiện động đất cộng đồng + consensus server:
 * đồng thời (coincidence) + mật độ thiết bị trong tòa → ACTIVE EARTHQUAKE + broadcast.
 */
const SeismicShakeReport = require('../../models/SeismicShakeReport');
const Incident = require('../../models/Incident');
const UserDevice = require('../../models/UserDevice');
const Building = require('../../models/Building');
const ActivityLog = require('../../models/ActivityLog');
const {
  isValidObjectId,
  resolveBuildingScope,
  loadActorUser
} = require('../../utils/emergencyScope');
const { httpError } = require('../../utils/navigationGraph');
const { haversineMeters } = require('../../utils/geo');

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function windowMs() {
  return Math.max(5, envNum('SEISMIC_WINDOW_SEC', 45)) * 1000;
}

/** Sai lệch thời gian tối đa giữa các máy trong cụm đồng thuận (ms). Tòa nhà ≈ 0.5–1s. */
function coincidenceMs() {
  return Math.max(200, envNum('SEISMIC_COINCIDENCE_MS', 1000));
}

function minDevices() {
  return Math.max(1, Math.floor(envNum('SEISMIC_MIN_DEVICES', 2)));
}

/** Tỷ lệ máy báo / máy online trong tòa (0 = tắt kiểm tra mật độ). Production ≈ 0.2 */
function minDensity() {
  const raw = process.env.SEISMIC_MIN_DENSITY;
  if (raw === undefined || raw === '') return 0.2;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.2;
}

/** Chỉ áp mật độ khi số máy online ≥ ngưỡng này. */
function densityApplyMinOnline() {
  return Math.max(1, Math.floor(envNum('SEISMIC_DENSITY_MIN_ONLINE', 5)));
}

function minMagnitude() {
  return Math.max(0.2, envNum('SEISMIC_MIN_MAGNITUDE', 0.5));
}

function cooldownMs() {
  return Math.max(1, envNum('SEISMIC_COOLDOWN_MIN', 30)) * 60 * 1000;
}

function deviceReportCooldownMs() {
  return Math.max(5, envNum('SEISMIC_DEVICE_COOLDOWN_SEC', 30)) * 1000;
}

function presenceOnlineMin() {
  return Math.max(1, envNum('SEISMIC_PRESENCE_ONLINE_MIN', 15));
}

/** Bán kính tối thiểu đối chiếu GPS→tòa (m). Trong nhà GPS lệch nên ≥ activation_radius. */
function gpsMatchMinMeters() {
  return Math.max(50, envNum('SEISMIC_GPS_MATCH_M', 150));
}

/** Bỏ qua GPS nếu accuracy quá kém (m). */
function gpsMaxAccuracyMeters() {
  return Math.max(30, envNum('SEISMIC_GPS_MAX_ACCURACY_M', 200));
}

function parseClientGps(body = {}) {
  const lat = body.lat != null ? Number(body.lat) : NaN;
  const lng = body.lng != null ? Number(body.lng) : NaN;
  const accuracy = body.accuracy != null ? Number(body.accuracy) : null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null
  };
}

/**
 * Tòa gần nhất trong bán kính kích hoạt (+ đệm GPS).
 * @returns {{ buildingId: string, distanceM: number } | null}
 */
async function matchBuildingByGps(gps, preferredBuildingId = null) {
  if (!gps) return null;
  if (gps.accuracy != null && gps.accuracy > gpsMaxAccuracyMeters()) return null;

  const buildings = await Building.find({
    is_active: { $ne: false },
    'gps_location.lat': { $exists: true },
    'gps_location.lng': { $exists: true }
  })
    .select('_id gps_location activation_radius')
    .lean();

  let best = null;
  let preferredHit = null;
  for (const b of buildings) {
    const bLat = Number(b.gps_location?.lat);
    const bLng = Number(b.gps_location?.lng);
    if (!Number.isFinite(bLat) || !Number.isFinite(bLng)) continue;
    if (bLat === 0 && bLng === 0) continue;
    const dist = haversineMeters(bLat, bLng, gps.lat, gps.lng);
    const radius = Math.max(
      Number(b.activation_radius) || 50,
      gpsMatchMinMeters()
    ) + Math.min(gps.accuracy || 0, 80);
    if (dist > radius) continue;
    const hit = { buildingId: String(b._id), distanceM: dist };
    if (!best || dist < best.distanceM) best = hit;
    if (preferredBuildingId && String(b._id) === String(preferredBuildingId)) {
      preferredHit = hit;
    }
  }
  // Ưu tiên hint nếu vẫn nằm trong bán kính GPS (user vừa chọn tòa đó).
  return preferredHit || best;
}

function reportTimeMs(row) {
  if (row.client_ts) {
    const t = new Date(row.client_ts).getTime();
    if (Number.isFinite(t)) return t;
  }
  return new Date(row.createdAt).getTime();
}

/**
 * Cụm đồng thuận lớn nhất: nhiều device_id khác nhau nằm trong cửa sổ coincidenceMs.
 */
function findBestCoincidenceCluster(reports, maxSpreadMs) {
  const sorted = [...reports].sort((a, b) => reportTimeMs(a) - reportTimeMs(b));
  let best = { devices: new Set(), reports: [], spreadMs: 0 };
  let left = 0;
  for (let right = 0; right < sorted.length; right++) {
    const tRight = reportTimeMs(sorted[right]);
    while (left <= right && tRight - reportTimeMs(sorted[left]) > maxSpreadMs) {
      left += 1;
    }
    const slice = sorted.slice(left, right + 1);
    const devices = new Set(slice.map((r) => r.device_id));
    if (devices.size > best.devices.size ||
      (devices.size === best.devices.size && slice.length > best.reports.length)) {
      best = {
        devices,
        reports: slice,
        spreadMs: slice.length ? tRight - reportTimeMs(slice[0]) : 0
      };
    }
  }
  return best;
}

async function countOnlineDevicesInBuilding(buildingId) {
  const since = new Date(Date.now() - presenceOnlineMin() * 60 * 1000);
  return UserDevice.countDocuments({
    is_active: true,
    $or: [
      { last_building_id: buildingId, last_seen_at: { $gte: since } },
      { last_building_id: buildingId, last_indoor_at: { $gte: since } },
      { last_indoor_building_id: buildingId, indoor_session_open: true },
      { last_radio_building_id: buildingId, last_radio_at: { $gte: since } }
    ]
  });
}

function consensusConfig() {
  return {
    window_sec: Math.round(windowMs() / 1000),
    coincidence_ms: coincidenceMs(),
    min_devices: minDevices(),
    min_density: minDensity(),
    density_min_online: densityApplyMinOnline(),
    min_magnitude: minMagnitude(),
    cooldown_min: Math.round(cooldownMs() / 60000),
    presence_online_min: presenceOnlineMin()
  };
}

async function evaluateConsensus(buildingId, windowReports) {
  const cluster = findBestCoincidenceCluster(windowReports, coincidenceMs());
  const deviceCount = cluster.devices.size;
  const need = minDevices();
  const online = await countOnlineDevicesInBuilding(buildingId);
  const density = online > 0 ? deviceCount / online : 0;
  const densityRequired = minDensity();
  const applyDensity = densityRequired > 0 && online >= densityApplyMinOnline();

  let ok = deviceCount >= need;
  let reason = ok ? 'consensus_ok' : 'awaiting_more_devices';

  if (ok && applyDensity && density < densityRequired) {
    ok = false;
    reason = 'density_too_low';
  }

  const avgMagnitude =
    cluster.reports.reduce((s, r) => s + Number(r.magnitude || 0), 0) /
    Math.max(1, cluster.reports.length);
  const peakMagnitude = Math.max(
    0,
    ...cluster.reports.map((r) => Number(r.peak_ms2 || r.magnitude || 0))
  );

  return {
    ok,
    reason,
    deviceCount,
    need,
    online,
    density,
    densityRequired: applyDensity ? densityRequired : 0,
    applyDensity,
    spreadMs: cluster.spreadMs,
    coincidenceMs: coincidenceMs(),
    avgMagnitude,
    peakMagnitude,
    clusterReports: cluster.reports
  };
}

/**
 * Ưu tiên: GPS gần tòa → hint session → presence thiết bị.
 * @returns {{ buildingId: string, match: 'gps'|'hint'|'presence' }}
 */
async function resolveBuildingId(actorUserId, body = {}) {
  const deviceId = String(body.device_id || '').trim();
  if (!deviceId) {
    throw httpError(400, 'Thiếu device_id.', 'DEVICE_ID_REQUIRED');
  }

  const hintRaw = body.building_id || body.building_hint;
  let hint = null;
  if (hintRaw && isValidObjectId(hintRaw)) {
    const exists = await Building.exists({ _id: hintRaw });
    if (exists) hint = String(hintRaw);
  }

  const gps = parseClientGps(body);
  const gpsHit = await matchBuildingByGps(gps, hint);
  if (gpsHit) {
    return { buildingId: gpsHit.buildingId, match: 'gps' };
  }

  if (hint) {
    return { buildingId: hint, match: 'hint' };
  }

  const device = await UserDevice.findOne({
    user_id: actorUserId,
    device_id: deviceId,
    is_active: true
  })
    .select('last_building_id last_indoor_building_id last_radio_building_id last_lat last_lng last_gps_at')
    .lean();

  // Presence gần đây vẫn hữu ích khi GPS trong nhà yếu / chưa xin quyền.
  const fromPresence =
    device?.last_indoor_building_id ||
    device?.last_building_id ||
    device?.last_radio_building_id;

  if (fromPresence) {
    return { buildingId: String(fromPresence), match: 'presence' };
  }

  // Thử GPS đã lưu trên device (heartbeat / presence trước đó).
  const storedGps = parseClientGps({
    lat: device?.last_lat,
    lng: device?.last_lng
  });
  const storedHit = await matchBuildingByGps(storedGps, null);
  if (storedHit) {
    return { buildingId: storedHit.buildingId, match: 'gps' };
  }

  throw httpError(
    400,
    'Không xác định được tòa nhà. Bật GPS gần tòa, hoặc mở map / quét QR trước.',
    'BUILDING_UNKNOWN'
  );
}

async function findRecentActiveEarthquake(buildingId) {
  return Incident.findOne({
    building_id: buildingId,
    type: 'EARTHQUAKE',
    status: 'ACTIVE'
  })
    .select('_id status activated_at createdAt')
    .lean();
}

async function findCooldownEarthquake(buildingId) {
  const since = new Date(Date.now() - cooldownMs());
  return Incident.findOne({
    building_id: buildingId,
    type: 'EARTHQUAKE',
    createdAt: { $gte: since }
  })
    .select('_id createdAt')
    .lean();
}

const activatingBuildings = new Set();

async function activateEarthquakeIncident({
  buildingId,
  actorUserId,
  deviceCount,
  avgMagnitude,
  peakMagnitude,
  spreadMs,
  online,
  density
}) {
  const key = String(buildingId);
  if (activatingBuildings.has(key)) {
    return { incident: null, broadcast: null, skipped: true };
  }
  activatingBuildings.add(key);
  try {
    const dup = await findRecentActiveEarthquake(buildingId);
    if (dup) return { incident: null, broadcast: null, skipped: true, existing: dup };

    const building = await resolveBuildingScope(buildingId);
    const now = new Date();
    const title = 'Cảnh báo động đất (cảm biến cộng đồng)';
    const description =
      `Consensus: ${deviceCount} thiết bị đồng thời (Δt≈${Math.round(spreadMs)}ms) ` +
      `trên ~${online} máy online (mật độ ${(density * 100).toFixed(0)}%). ` +
      `Cường độ TB ≈ ${avgMagnitude.toFixed(2)} m/s², peak ≈ ${peakMagnitude.toFixed(2)}. ` +
      'Hãy sơ tán theo lối thoát hiểm gần nhất.';

    const incident = await Incident.create({
      type: 'EARTHQUAKE',
      scope: 'BUILDING',
      title,
      description,
      building_id: buildingId,
      organization_id: building?.organization_id || null,
      status: 'ACTIVE',
      created_by: actorUserId,
      activated_at: now,
      timeline: [
        {
          status: 'DRAFT',
          at: now,
          by: actorUserId,
          note: 'Tự tạo từ mạng cảm biến điện thoại (seismic consensus)'
        },
        {
          status: 'ACTIVE',
          at: now,
          by: actorUserId,
          note: `Consensus: ${deviceCount} thiết bị, Δt=${Math.round(spreadMs)}ms, dens=${(density * 100).toFixed(0)}%`
        }
      ]
    });

    let broadcast = null;
    try {
      const { createBroadcast } = require('./broadcastApplicationService');
      const result = await createBroadcast({
        params: { incidentId: String(incident._id) },
        body: { title, body: description },
        actor: { userId: actorUserId, role: 'SYSTEM' },
        system: true,
        ip: ''
      });
      broadcast = result.body?.broadcast || null;
    } catch (err) {
      console.warn('[seismic] auto-broadcast failed:', err.message);
      broadcast = { error: err.message, status: 'FAILED' };
    }

    ActivityLog.create({
      user_id: actorUserId,
      action: 'SEISMIC_EARTHQUAKE_TRIGGER',
      target_type: 'incident',
      target_id: String(incident._id),
      target: title,
      details: {
        building_id: String(buildingId),
        deviceCount,
        avgMagnitude,
        peakMagnitude,
        spreadMs,
        online,
        density
      },
      organization_id: building?.organization_id || null,
      ip_address: ''
    }).catch(() => {});

    return { incident, broadcast };
  } finally {
    activatingBuildings.delete(key);
  }
}

/**
 * POST /api/emergency/shake-reports
 */
async function submitShakeReport(input = {}) {
  const actor = input.actor;
  if (!actor?.userId) throw httpError(401, 'Chưa xác thực.', 'UNAUTHORIZED');

  const body = input.body || {};
  const deviceId = String(body.device_id || '').trim();
  if (!deviceId) throw httpError(400, 'Thiếu device_id.', 'DEVICE_ID_REQUIRED');

  const magnitude = Number(body.magnitude);
  if (!Number.isFinite(magnitude) || magnitude < minMagnitude()) {
    throw httpError(
      400,
      `Cường độ quá thấp (tối thiểu ${minMagnitude()}).`,
      'MAGNITUDE_TOO_LOW'
    );
  }

  const resolved = await resolveBuildingId(actor.userId, body);
  const buildingId = resolved.buildingId;
  const gps = parseClientGps(body);

  const recentSameDevice = await SeismicShakeReport.findOne({
    building_id: buildingId,
    device_id: deviceId,
    createdAt: { $gte: new Date(Date.now() - deviceReportCooldownMs()) }
  })
    .select('_id createdAt')
    .lean();

  if (recentSameDevice) {
    return {
      status: 200,
      body: {
        accepted: false,
        reason: 'device_cooldown',
        building_id: buildingId,
        building_match: resolved.match,
        triggered: false
      }
    };
  }

  const report = await SeismicShakeReport.create({
    user_id: actor.userId,
    device_id: deviceId,
    building_id: buildingId,
    magnitude: Math.min(100, magnitude),
    peak_ms2: Number.isFinite(Number(body.peak_ms2)) ? Number(body.peak_ms2) : magnitude,
    duration_ms: Number.isFinite(Number(body.duration_ms)) ? Number(body.duration_ms) : null,
    sta_lta_ratio: Number.isFinite(Number(body.sta_lta_ratio)) ? Number(body.sta_lta_ratio) : null,
    algorithm: String(body.algorithm || '').slice(0, 32),
    source: ['charging_idle', 'background', 'foreground', 'manual', 'unknown'].includes(body.source)
      ? body.source
      : 'unknown',
    client_ts: body.client_ts ? new Date(body.client_ts) : null,
    lat: gps?.lat ?? null,
    lng: gps?.lng ?? null,
    gps_accuracy: gps?.accuracy ?? null,
    building_match: resolved.match
  });

  if (gps) {
    try {
      await UserDevice.updateOne(
        { user_id: actor.userId, device_id: deviceId, is_active: true },
        {
          $set: {
            last_lat: gps.lat,
            last_lng: gps.lng,
            last_gps_at: new Date(),
            ...(gps.accuracy != null ? { last_gps_accuracy: gps.accuracy } : {}),
            last_building_id: buildingId
          }
        }
      );
    } catch (_) { /* ignore */ }
  }

  const since = new Date(Date.now() - windowMs());
  const windowReports = await SeismicShakeReport.find({
    building_id: buildingId,
    createdAt: { $gte: since },
    magnitude: { $gte: minMagnitude() }
  })
    .select('device_id magnitude peak_ms2 user_id createdAt client_ts')
    .lean();

  const consensus = await evaluateConsensus(buildingId, windowReports);

  const already = await findRecentActiveEarthquake(buildingId);
  if (already) {
    return {
      status: 200,
      body: {
        accepted: true,
        report_id: String(report._id),
        building_id: buildingId,
        building_match: resolved.match,
        window_device_count: consensus.deviceCount,
        threshold: consensus.need,
        online_devices: consensus.online,
        density: consensus.density,
        coincidence_spread_ms: consensus.spreadMs,
        triggered: false,
        reason: 'incident_already_active',
        incident_id: String(already._id)
      }
    };
  }

  if (!consensus.ok) {
    return {
      status: 200,
      body: {
        accepted: true,
        report_id: String(report._id),
        building_id: buildingId,
        building_match: resolved.match,
        window_device_count: consensus.deviceCount,
        threshold: consensus.need,
        online_devices: consensus.online,
        density: Number(consensus.density.toFixed(4)),
        density_required: consensus.densityRequired,
        coincidence_spread_ms: Math.round(consensus.spreadMs),
        coincidence_ms: consensus.coincidenceMs,
        triggered: false,
        reason: consensus.reason
      }
    };
  }

  const cooled = await findCooldownEarthquake(buildingId);
  if (cooled) {
    return {
      status: 200,
      body: {
        accepted: true,
        report_id: String(report._id),
        building_id: buildingId,
        building_match: resolved.match,
        window_device_count: consensus.deviceCount,
        threshold: consensus.need,
        triggered: false,
        reason: 'building_cooldown',
        recent_incident_id: String(cooled._id)
      }
    };
  }

  const { incident, broadcast } = await activateEarthquakeIncident({
    buildingId,
    actorUserId: actor.userId,
    deviceCount: consensus.deviceCount,
    avgMagnitude: consensus.avgMagnitude,
    peakMagnitude: consensus.peakMagnitude,
    spreadMs: consensus.spreadMs,
    online: consensus.online,
    density: consensus.density
  });

  if (!incident) {
    return {
      status: 200,
      body: {
        accepted: true,
        report_id: String(report._id),
        building_id: buildingId,
        window_device_count: consensus.deviceCount,
        threshold: consensus.need,
        triggered: false,
        reason: 'race_or_already_active'
      }
    };
  }

  const clusterIds = consensus.clusterReports.map((r) => r._id).filter(Boolean);
  if (clusterIds.length) {
    await SeismicShakeReport.updateMany(
      { _id: { $in: clusterIds } },
      { $set: { incident_id: incident._id } }
    );
  } else {
    await SeismicShakeReport.updateMany(
      { building_id: buildingId, createdAt: { $gte: since }, incident_id: null },
      { $set: { incident_id: incident._id } }
    );
  }

  return {
    status: 201,
    body: {
      accepted: true,
      report_id: String(report._id),
      building_id: buildingId,
      building_match: resolved.match,
      window_device_count: consensus.deviceCount,
      threshold: consensus.need,
      online_devices: consensus.online,
      density: Number(consensus.density.toFixed(4)),
      coincidence_spread_ms: Math.round(consensus.spreadMs),
      triggered: true,
      incident: {
        id: String(incident._id),
        type: incident.type,
        status: incident.status,
        title: incident.title
      },
      broadcast
    }
  };
}

/**
 * GET /api/emergency/seismic/overview — admin: cảm biến + thống kê user 24h + user đóng góp từng sự cố.
 */
async function getSeismicOverview(input = {}) {
  const actor = input.actor;
  if (!actor?.userId) throw httpError(401, 'Chưa xác thực.', 'UNAUTHORIZED');
  const user = await loadActorUser(actor);
  const User = require('../../models/User');
  const EmergencyLocation = require('../../models/EmergencyLocation');

  const buildingFilter = {};
  if (actor.role === 'ORG_ADMIN' && user.organization_id) {
    const buildingIds = await Building.find({ organization_id: user.organization_id })
      .select('_id')
      .lean();
    buildingFilter.building_id = { $in: buildingIds.map((b) => b._id) };
  } else if (actor.role === 'BUILDING_ADMIN') {
    const assigned = user.assigned_buildings || [];
    buildingFilter.building_id = { $in: assigned };
  } else if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'PLATFORM_ADMIN') {
    if (user.organization_id) {
      const buildingIds = await Building.find({ organization_id: user.organization_id })
        .select('_id')
        .lean();
      buildingFilter.building_id = { $in: buildingIds.map((b) => b._id) };
    }
  }

  if (input.query?.building_id && isValidObjectId(input.query.building_id)) {
    buildingFilter.building_id = input.query.building_id;
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const reports24h = await SeismicShakeReport.find({
    ...buildingFilter,
    createdAt: { $gte: dayAgo }
  })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const reports = reports24h.slice(0, 80);

  const incidentFilter = {
    type: 'EARTHQUAKE',
    ...buildingFilter
  };
  const incidents = await Incident.find(incidentFilter)
    .sort({ updatedAt: -1 })
    .limit(30)
    .lean();

  const incidentIds = incidents.map((i) => i._id);
  const linkedReports = incidentIds.length
    ? await SeismicShakeReport.find({ incident_id: { $in: incidentIds } })
      .select('user_id device_id building_id incident_id magnitude peak_ms2 sta_lta_ratio source createdAt')
      .lean()
    : [];

  // User báo vị trí trong sự cố (ảnh hưởng / đang trong khu vực khi ACTIVE)
  const locationRows = incidentIds.length
    ? await EmergencyLocation.find({ incident_id: { $in: incidentIds } })
      .select('user_id incident_id building_id floor_number updatedAt createdAt source motion possibly_trapped still_duration_ms still_since reported_at')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean()
    : [];

  const allUserIds = [
    ...new Set([
      ...reports24h.map((r) => String(r.user_id)),
      ...linkedReports.map((r) => String(r.user_id)),
      ...locationRows.map((r) => String(r.user_id))
    ])
  ];
  const userDocs = allUserIds.length
    ? await User.find({ _id: { $in: allUserIds } })
      .select('email full_name')
      .lean()
    : [];
  const userById = Object.fromEntries(
    userDocs.map((u) => [
      String(u._id),
      {
        id: String(u._id),
        email: u.email || '',
        full_name: u.full_name || ''
      }
    ])
  );

  function userLabel(uid) {
    const u = userById[String(uid)];
    if (!u) return { id: String(uid), email: '', full_name: '', display: String(uid).slice(-6) };
    const display = u.full_name || u.email || String(uid).slice(-6);
    return { ...u, display };
  }

  // Thống kê user gửi cảm biến trong 24h
  const userAgg = new Map();
  for (const r of reports24h) {
    const uid = String(r.user_id);
    let row = userAgg.get(uid);
    if (!row) {
      row = {
        user_id: uid,
        report_count: 0,
        device_ids: new Set(),
        building_ids: new Set(),
        peak_max: 0,
        sta_lta_max: 0,
        last_at: null,
        first_at: null,
        sources: new Set(),
        linked_incident_ids: new Set()
      };
      userAgg.set(uid, row);
    }
    row.report_count += 1;
    if (r.device_id) row.device_ids.add(r.device_id);
    if (r.building_id) row.building_ids.add(String(r.building_id));
    row.peak_max = Math.max(row.peak_max, Number(r.peak_ms2 || r.magnitude || 0));
    row.sta_lta_max = Math.max(row.sta_lta_max, Number(r.sta_lta_ratio || 0));
    if (r.source) row.sources.add(r.source);
    if (r.incident_id) row.linked_incident_ids.add(String(r.incident_id));
    const t = new Date(r.createdAt).getTime();
    if (!row.last_at || t > new Date(row.last_at).getTime()) row.last_at = r.createdAt;
    if (!row.first_at || t < new Date(row.first_at).getTime()) row.first_at = r.createdAt;
  }

  const buildingIds = [
    ...new Set([
      ...reports24h.map((r) => String(r.building_id)),
      ...incidents.filter((i) => i.building_id).map((i) => String(i.building_id))
    ])
  ];
  const buildings = await Building.find({ _id: { $in: buildingIds } })
    .select('name')
    .lean();
  const nameById = Object.fromEntries(buildings.map((b) => [String(b._id), b.name]));

  const users_24h = [...userAgg.values()]
    .map((row) => {
      const u = userLabel(row.user_id);
      const bNames = [...row.building_ids].map((id) => nameById[id] || id.slice(-6));
      return {
        user_id: row.user_id,
        email: u.email,
        full_name: u.full_name,
        display_name: u.display,
        report_count: row.report_count,
        device_count: row.device_ids.size,
        buildings: bNames,
        building_ids: [...row.building_ids],
        peak_max: Number(row.peak_max.toFixed(3)),
        sta_lta_max: Number(row.sta_lta_max.toFixed(2)),
        sources: [...row.sources],
        linked_incident_ids: [...row.linked_incident_ids],
        first_at: row.first_at,
        last_at: row.last_at
      };
    })
    .sort((a, b) => b.report_count - a.report_count || new Date(b.last_at) - new Date(a.last_at));

  // Gắn contributor + affected theo từng sự cố
  const linkedByIncident = new Map();
  for (const r of linkedReports) {
    const iid = String(r.incident_id);
    if (!linkedByIncident.has(iid)) linkedByIncident.set(iid, []);
    linkedByIncident.get(iid).push(r);
  }
  const locByIncident = new Map();
  for (const loc of locationRows) {
    const iid = String(loc.incident_id);
    if (!locByIncident.has(iid)) locByIncident.set(iid, []);
    locByIncident.get(iid).push(loc);
  }

  function uniqueContributors(reportList) {
    const map = new Map();
    for (const r of reportList) {
      const uid = String(r.user_id);
      let row = map.get(uid);
      if (!row) {
        const u = userLabel(uid);
        row = {
          user_id: uid,
          email: u.email,
          full_name: u.full_name,
          display_name: u.display,
          report_count: 0,
          peak_max: 0,
          last_at: null,
          device_ids: new Set()
        };
        map.set(uid, row);
      }
      row.report_count += 1;
      row.peak_max = Math.max(row.peak_max, Number(r.peak_ms2 || r.magnitude || 0));
      if (r.device_id) row.device_ids.add(r.device_id);
      const t = new Date(r.createdAt).getTime();
      if (!row.last_at || t > new Date(row.last_at).getTime()) row.last_at = r.createdAt;
    }
    return [...map.values()].map((row) => ({
      user_id: row.user_id,
      email: row.email,
      full_name: row.full_name,
      display_name: row.display_name,
      report_count: row.report_count,
      device_count: row.device_ids.size,
      peak_max: Number(row.peak_max.toFixed(3)),
      last_at: row.last_at
    })).sort((a, b) => b.report_count - a.report_count);
  }

  function uniqueAffected(locList) {
    const map = new Map();
    for (const loc of locList) {
      const uid = String(loc.user_id);
      if (map.has(uid)) {
        if (loc.possibly_trapped) map.get(uid).possibly_trapped = true;
        continue;
      }
      const u = userLabel(uid);
      map.set(uid, {
        user_id: uid,
        email: u.email,
        full_name: u.full_name,
        display_name: u.display,
        floor_number: loc.floor_number ?? null,
        last_location_at: loc.reported_at || loc.updatedAt || loc.createdAt,
        source: loc.source || '',
        motion: loc.motion || 'unknown',
        possibly_trapped: Boolean(loc.possibly_trapped),
        still_duration_ms: loc.still_duration_ms ?? null,
        still_since: loc.still_since || null
      });
    }
    return [...map.values()].sort((a, b) => Number(b.possibly_trapped) - Number(a.possibly_trapped));
  }

  return {
    status: 200,
    body: {
      config: consensusConfig(),
      stats: {
        window_hours: 24,
        report_count_24h: reports24h.length,
        unique_users_24h: users_24h.length,
        unique_devices_24h: new Set(reports24h.map((r) => r.device_id)).size,
        earthquake_incident_count: incidents.length
      },
      users_24h,
      reports: reports.map((r) => ({
        id: String(r._id),
        user_id: String(r.user_id),
        user_display: userLabel(r.user_id).display,
        user_email: userLabel(r.user_id).email,
        building_id: String(r.building_id),
        building_name: nameById[String(r.building_id)] || null,
        device_id: r.device_id,
        magnitude: r.magnitude,
        peak_ms2: r.peak_ms2,
        sta_lta_ratio: r.sta_lta_ratio,
        algorithm: r.algorithm,
        source: r.source,
        building_match: r.building_match || null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        gps_accuracy: r.gps_accuracy ?? null,
        duration_ms: r.duration_ms,
        incident_id: r.incident_id ? String(r.incident_id) : null,
        createdAt: r.createdAt,
        client_ts: r.client_ts
      })),
      earthquake_incidents: incidents.map((row) => {
        const iid = String(row._id);
        const contributors = uniqueContributors(linkedByIncident.get(iid) || []);
        const affected = uniqueAffected(locByIncident.get(iid) || []);
        return {
          id: iid,
          title: row.title,
          status: row.status,
          building_id: row.building_id ? String(row.building_id) : null,
          building_name: row.building_id ? nameById[String(row.building_id)] || null : null,
          description: row.description,
          activated_at: row.activated_at,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          external_source: row.external_source || '',
          external_event_id: row.external_event_id || '',
          contributor_count: contributors.length,
          affected_count: affected.length,
          possibly_trapped_count: affected.filter((u) => u.possibly_trapped).length,
          contributors,
          affected_users: affected
        };
      })
    }
  };
}

module.exports = {
  submitShakeReport,
  getSeismicOverview,
  windowMs,
  minDevices,
  minMagnitude,
  coincidenceMs,
  findBestCoincidenceCluster,
  evaluateConsensus
};
