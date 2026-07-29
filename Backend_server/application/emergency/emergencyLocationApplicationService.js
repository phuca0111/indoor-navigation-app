/**
 * Phase 3 — Emergency Location (chỉ khi Incident ACTIVE + user consent).
 * Nghi mắc kẹt = đứng yên ≥ ngưỡng VÀ đang trong vùng nguy hiểm (anti-spam).
 */
const Incident = require('../../models/Incident');
const EmergencyLocation = require('../../models/EmergencyLocation');
const HazardZone = require('../../models/HazardZone');
const Building = require('../../models/Building');
const User = require('../../models/User');
const ActivityLog = require('../../models/ActivityLog');
const { getPolicyByType } = require('./emergencyPolicyApplicationService');
const { httpError } = require('../../utils/navigationGraph');
const { pointInPolygon } = require('../../utils/hazardGeometry');
const { haversineMeters } = require('../../utils/geo');

const ACTIVE_STATUSES = new Set(['ACTIVE']);

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envBool(name, fallback = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const s = String(raw).toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(s)) return false;
  if (['1', 'true', 'on', 'yes'].includes(s)) return true;
  return fallback;
}

/** Ngưỡng đứng yên để gắn cờ nghi mắc kẹt (phút). */
function trappedStillMin() {
  return Math.max(1, envNum('EMERGENCY_TRAPPED_STILL_MIN', 15));
}

function trappedStillMs() {
  return trappedStillMin() * 60 * 1000;
}

/** Bắt buộc trong vùng nguy hiểm mới gắn mắc kẹt (tránh spam người ngồi yên ngoài vùng). */
function requireHazardForTrapped() {
  return envBool('EMERGENCY_TRAPPED_REQUIRE_HAZARD', true);
}

function trappedBuildingRadiusM() {
  return Math.max(30, envNum('EMERGENCY_TRAPPED_BUILDING_RADIUS_M', 150));
}

function hasEmergencyConsent(user) {
  const consent = user?.emergency_location_consent || {};
  const mode = String(consent.mode || (consent.granted ? 'EMERGENCY_ONLY' : 'ALERT_ONLY')).toUpperCase();
  if (mode === 'ALERT_ONLY') return false;
  if (mode === 'EMERGENCY_ONLY' || mode === 'ALWAYS_RESEARCH') return true;
  return consent.granted === true;
}

function normalizeMotion(raw) {
  const m = String(raw || 'unknown').toLowerCase();
  if (m === 'moving' || m === 'still') return m;
  return 'unknown';
}

/**
 * Tính trạng thái đứng yên (chưa gắn cờ mắc kẹt).
 */
function computeStillState(body, previous, now = new Date()) {
  const motion = normalizeMotion(body.motion);
  const clientStillMs = Number(body.still_duration_ms);
  const threshold = trappedStillMs();
  let stillSince = previous?.still_since ? new Date(previous.still_since) : null;

  if (motion === 'moving') {
    stillSince = null;
  } else if (motion === 'still') {
    if (!stillSince) {
      if (Number.isFinite(clientStillMs) && clientStillMs > 0) {
        stillSince = new Date(now.getTime() - clientStillMs);
      } else {
        stillSince = now;
      }
    }
  } else if (Number.isFinite(clientStillMs) && clientStillMs >= threshold) {
    stillSince = stillSince || new Date(now.getTime() - clientStillMs);
  }

  const durationMs = stillSince
    ? Math.max(
      Number.isFinite(clientStillMs) ? clientStillMs : 0,
      now.getTime() - stillSince.getTime()
    )
    : (Number.isFinite(clientStillMs) ? clientStillMs : null);

  const stillLongEnough =
    Boolean(stillSince && now.getTime() - stillSince.getTime() >= threshold) ||
    (Number.isFinite(clientStillMs) && clientStillMs >= threshold);

  return {
    motion: stillLongEnough && motion === 'unknown' ? 'still' : motion,
    still_since: stillSince,
    still_duration_ms: durationMs != null ? Math.round(durationMs) : null,
    still_long_enough: stillLongEnough
  };
}

/**
 * User có đang trong vùng nguy hiểm của sự cố không?
 * - Có hazard ACTIVE: polygon map (x,y) hoặc vùng cả tầng (không polygon).
 * - Không có hazard: chỉ EARTHQUAKE gần GPS tòa / cùng building_id (tránh spam loại khác).
 */
async function evaluateInDangerZone(incident, body = {}) {
  const mapX = body.map_x != null ? Number(body.map_x) : (body.x != null ? Number(body.x) : NaN);
  const mapY = body.map_y != null ? Number(body.map_y) : (body.y != null ? Number(body.y) : NaN);
  const floor = body.floor_number != null ? Number(body.floor_number) : null;
  const buildingId = body.building_id
    ? String(body.building_id)
    : (incident.building_id ? String(incident.building_id) : null);
  const lat = body.lat != null ? Number(body.lat) : NaN;
  const lng = body.lng != null ? Number(body.lng) : NaN;

  const zones = await HazardZone.find({
    incident_id: incident._id,
    active: true
  })
    .select('_id name building_id floor_number polygon')
    .lean();

  if (zones.length) {
    const matched = [];
    for (const z of zones) {
      if (z.building_id && buildingId && String(z.building_id) !== buildingId) continue;
      if (z.floor_number != null) {
        if (floor == null || Number(z.floor_number) !== Number(floor)) continue;
      }

      const poly = Array.isArray(z.polygon) ? z.polygon : [];
      if (poly.length >= 3) {
        if (Number.isFinite(mapX) && Number.isFinite(mapY)) {
          if (pointInPolygon(mapX, mapY, poly)) matched.push(z);
        }
        // Có polygon nhưng không có tọa độ map → không đoán mò (tránh spam cả tầng)
        continue;
      }

      // Zone không vẽ polygon = coi cả tầng / cả tòa trong scope zone
      if (z.building_id) {
        if (buildingId && String(z.building_id) === buildingId) matched.push(z);
      } else if (incident.building_id && buildingId && String(incident.building_id) === buildingId) {
        matched.push(z);
      }
    }
    return {
      inDanger: matched.length > 0,
      reason: matched.length ? 'hazard_zone' : 'outside_hazard',
      zoneIds: matched.map((z) => String(z._id))
    };
  }

  if (!requireHazardForTrapped()) {
    return { inDanger: true, reason: 'require_hazard_disabled', zoneIds: [] };
  }

  // Chưa khoanh hazard: chỉ động đất + gần / trong tòa sự cố
  if (incident.type === 'EARTHQUAKE' && incident.building_id) {
    if (buildingId && String(buildingId) === String(incident.building_id)) {
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const b = await Building.findById(incident.building_id)
          .select('gps_location activation_radius')
          .lean();
        const bLat = Number(b?.gps_location?.lat);
        const bLng = Number(b?.gps_location?.lng);
        if (Number.isFinite(bLat) && Number.isFinite(bLng) && !(bLat === 0 && bLng === 0)) {
          const radius = Math.max(Number(b.activation_radius) || 50, trappedBuildingRadiusM());
          const d = haversineMeters(bLat, bLng, lat, lng);
          if (d <= radius) {
            return { inDanger: true, reason: 'earthquake_near_building', zoneIds: [] };
          }
          return { inDanger: false, reason: 'earthquake_outside_building_radius', zoneIds: [] };
        }
      }
      // Có building_id khớp, GPS yếu: vẫn coi trong tòa (presence / indoor)
      return { inDanger: true, reason: 'earthquake_same_building', zoneIds: [] };
    }
  }

  return { inDanger: false, reason: 'no_active_hazard_zone', zoneIds: [] };
}

function serializeLocation(doc) {
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(row._id),
    user_id: String(row.user_id),
    incident_id: String(row.incident_id),
    lat: row.lat,
    lng: row.lng,
    building_id: row.building_id ? String(row.building_id) : null,
    floor_number: row.floor_number,
    heading: row.heading,
    accuracy: row.accuracy,
    battery: row.battery,
    motion: row.motion,
    still_since: row.still_since || null,
    still_duration_ms: row.still_duration_ms ?? null,
    possibly_trapped: Boolean(row.possibly_trapped),
    in_hazard_zone: Boolean(row.in_hazard_zone),
    hazard_match: row.hazard_match || '',
    source: row.source,
    reported_at: row.reported_at,
    updatedAt: row.updatedAt
  };
}

async function assertLocationAllowed(incident, user) {
  if (!ACTIVE_STATUSES.has(incident.status)) {
    throw httpError(409, 'Chỉ gửi vị trí khi Incident ACTIVE.', 'INCIDENT_NOT_ACTIVE');
  }
  if (!hasEmergencyConsent(user)) {
    throw httpError(403, 'User chưa đồng ý Emergency Location.', 'EMERGENCY_CONSENT_REQUIRED');
  }
  const policy = await getPolicyByType(incident.type);
  if (policy.location_tracking === false) {
    throw httpError(409, 'Policy không bật location tracking.', 'LOCATION_POLICY_DISABLED');
  }
}

async function reportLocation(input = {}) {
  const actor = input.actor;
  if (!actor?.userId) throw httpError(401, 'Chưa xác thực.', 'UNAUTHORIZED');

  const incidentId = input.params?.incidentId;
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');

  const user = await User.findById(actor.userId)
    .select('emergency_location_consent notification_preferences')
    .lean();
  await assertLocationAllowed(incident, user);

  const body = input.body || {};
  const now = new Date();
  const previous = await EmergencyLocation.findOne({
    incident_id: incidentId,
    user_id: actor.userId
  }).lean();

  const stillState = computeStillState(body, previous, now);
  const danger = await evaluateInDangerZone(incident, body);
  const possiblyTrapped = Boolean(stillState.still_long_enough && danger.inDanger);
  const becameTrapped = possiblyTrapped && !previous?.possibly_trapped;

  const location = await EmergencyLocation.findOneAndUpdate(
    { incident_id: incidentId, user_id: actor.userId },
    {
      $set: {
        lat: body.lat != null ? Number(body.lat) : null,
        lng: body.lng != null ? Number(body.lng) : null,
        building_id: body.building_id || incident.building_id || null,
        floor_number: body.floor_number != null ? Number(body.floor_number) : null,
        heading: body.heading != null ? Number(body.heading) : null,
        accuracy: body.accuracy != null ? Number(body.accuracy) : null,
        battery: body.battery != null ? Number(body.battery) : null,
        motion: stillState.motion,
        still_since: stillState.still_since,
        still_duration_ms: stillState.still_duration_ms,
        in_hazard_zone: danger.inDanger,
        hazard_match: danger.reason || '',
        possibly_trapped: possiblyTrapped,
        source: body.source || 'GPS',
        reported_at: now
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  ActivityLog.create({
    user_id: actor.userId,
    action: becameTrapped ? 'EMERGENCY_POSSIBLY_TRAPPED' : 'EMERGENCY_LOCATION_REPORT',
    target_type: 'incident',
    target_id: String(incidentId),
    target: `location:${actor.userId}`,
    details: {
      floor_number: location.floor_number,
      source: location.source,
      motion: location.motion,
      possibly_trapped: location.possibly_trapped,
      in_hazard_zone: location.in_hazard_zone,
      hazard_match: location.hazard_match,
      still_duration_ms: location.still_duration_ms
    },
    organization_id: incident.organization_id || null,
    ip_address: input.ip || ''
  }).catch(() => {});

  return { status: 200, body: { location: serializeLocation(location) } };
}

async function listLocations(input = {}) {
  const incidentId = input.params?.incidentId;
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');

  await require('../../utils/emergencyScope').assertIncidentManage(input.actor, incident);

  const rows = await EmergencyLocation.find({ incident_id: incidentId })
    .sort({ possibly_trapped: -1, reported_at: -1 })
    .limit(500)
    .lean();

  const trappedCount = rows.filter((r) => r.possibly_trapped).length;

  return {
    status: 200,
    body: {
      incident_id: String(incidentId),
      count: rows.length,
      possibly_trapped_count: trappedCount,
      trapped_still_min: trappedStillMin(),
      require_hazard: requireHazardForTrapped(),
      locations: rows.map(serializeLocation)
    }
  };
}

async function getMyLastLocation(input = {}) {
  const actor = input.actor;
  const incidentId = input.params?.incidentId;
  const row = await EmergencyLocation.findOne({
    incident_id: incidentId,
    user_id: actor.userId
  }).lean();
  return { status: 200, body: { location: row ? serializeLocation(row) : null } };
}

/**
 * Gộp mọi user possibly_trapped trên các sự cố ACTIVE trong phạm vi admin.
 */
async function listPossiblyTrapped(input = {}) {
  const actor = input.actor;
  if (!actor?.userId) throw httpError(401, 'Chưa xác thực.', 'UNAUTHORIZED');

  const { loadActorUser, isValidObjectId } = require('../../utils/emergencyScope');

  const user = await loadActorUser(actor);
  const incidentFilter = { status: 'ACTIVE' };

  if (actor.role === 'ORG_ADMIN' && user.organization_id) {
    incidentFilter.organization_id = user.organization_id;
  } else if (actor.role === 'BUILDING_ADMIN') {
    const assigned = user.assigned_buildings || [];
    incidentFilter.building_id = { $in: assigned };
  } else if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'PLATFORM_ADMIN') {
    if (user.organization_id) {
      incidentFilter.organization_id = user.organization_id;
    } else {
      return {
        status: 200,
        body: {
          count: 0,
          trapped_still_min: trappedStillMin(),
          require_hazard: requireHazardForTrapped(),
          people: []
        }
      };
    }
  }

  if (input.query?.building_id && isValidObjectId(input.query.building_id)) {
    incidentFilter.building_id = input.query.building_id;
  }

  const incidents = await Incident.find(incidentFilter)
    .select('_id title type status building_id organization_id activated_at')
    .lean();

  if (!incidents.length) {
    return {
      status: 200,
      body: {
        count: 0,
        trapped_still_min: trappedStillMin(),
        require_hazard: requireHazardForTrapped(),
        people: []
      }
    };
  }

  const incidentIds = incidents.map((i) => i._id);
  const incidentById = Object.fromEntries(incidents.map((i) => [String(i._id), i]));

  const locs = await EmergencyLocation.find({
    incident_id: { $in: incidentIds },
    possibly_trapped: true,
    in_hazard_zone: true
  })
    .sort({ still_duration_ms: -1, reported_at: -1 })
    .limit(300)
    .lean();

  const userIds = [...new Set(locs.map((l) => String(l.user_id)))];
  const buildingIds = [
    ...new Set([
      ...locs.map((l) => (l.building_id ? String(l.building_id) : null)),
      ...incidents.map((i) => (i.building_id ? String(i.building_id) : null))
    ].filter(Boolean))
  ];

  const [users, buildings] = await Promise.all([
    userIds.length
      ? User.find({ _id: { $in: userIds } }).select('email full_name phone').lean()
      : [],
    buildingIds.length
      ? Building.find({ _id: { $in: buildingIds } }).select('name').lean()
      : []
  ]);

  const userById = Object.fromEntries(
    users.map((u) => [
      String(u._id),
      {
        email: u.email || '',
        full_name: u.full_name || '',
        phone: u.phone || ''
      }
    ])
  );
  const buildingNameById = Object.fromEntries(
    buildings.map((b) => [String(b._id), b.name || ''])
  );

  const people = locs.map((loc) => {
    const inc = incidentById[String(loc.incident_id)] || {};
    const u = userById[String(loc.user_id)] || {};
    const bId = loc.building_id
      ? String(loc.building_id)
      : (inc.building_id ? String(inc.building_id) : null);
    const stillMs = loc.still_duration_ms != null
      ? Number(loc.still_duration_ms)
      : (loc.still_since ? Date.now() - new Date(loc.still_since).getTime() : null);
    return {
      user_id: String(loc.user_id),
      display_name: u.full_name || u.email || String(loc.user_id).slice(-6),
      email: u.email || '',
      phone: u.phone || '',
      incident_id: String(loc.incident_id),
      incident_title: inc.title || '',
      incident_type: inc.type || '',
      building_id: bId,
      building_name: bId ? (buildingNameById[bId] || null) : null,
      floor_number: loc.floor_number ?? null,
      lat: loc.lat,
      lng: loc.lng,
      accuracy: loc.accuracy,
      motion: loc.motion || 'still',
      still_since: loc.still_since || null,
      still_duration_ms: stillMs,
      still_minutes: stillMs != null ? Math.round(stillMs / 60000) : null,
      source: loc.source || '',
      battery: loc.battery ?? null,
      reported_at: loc.reported_at || loc.updatedAt,
      possibly_trapped: true,
      in_hazard_zone: true,
      hazard_match: loc.hazard_match || ''
    };
  });

  return {
    status: 200,
    body: {
      count: people.length,
      trapped_still_min: trappedStillMin(),
      require_hazard: requireHazardForTrapped(),
      people
    }
  };
}

module.exports = {
  hasEmergencyConsent,
  serializeLocation,
  computeStillState,
  evaluateInDangerZone,
  trappedStillMin,
  requireHazardForTrapped,
  reportLocation,
  listLocations,
  getMyLastLocation,
  listPossiblyTrapped
};
