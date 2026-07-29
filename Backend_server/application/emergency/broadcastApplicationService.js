/**
 * Phase 3 — Emergency Broadcast (FCM + in-app, EMERGENCY_BROADCAST template).
 */
const Incident = require('../../models/Incident');
const EmergencyBroadcast = require('../../models/EmergencyBroadcast');
const User = require('../../models/User');
const UserHistory = require('../../models/UserHistory');
const EmergencyLocation = require('../../models/EmergencyLocation');
const ActivityLog = require('../../models/ActivityLog');
const notificationApplication = require('../notification/notificationApplicationService');
const emergencyPush = require('../notification/emergencyPushApplicationService');
const { getPolicyByType } = require('./emergencyPolicyApplicationService');
const { assertIncidentManage } = require('../../utils/emergencyScope');
const { httpError } = require('../../utils/navigationGraph');

/**
 * Spec D — lọc người nhận Broadcast (multi-layer).
 * Không gửi mọi admin chỉ vì role. Không theo dõi GPS 24/7.
 *
 * L1 GPS snapshot gần tòa | L2 indoor session mở | L3 QR ≤5p | L4 presence ≤15p
 * L5 GPS > clearDist (đủ tin) → clear presence + loại khỏi recipient
 */
async function listBroadcastRecipients(incident) {
  const UserDevice = require('../../models/UserDevice');
  const Building = require('../../models/Building');
  const { haversineMeters } = require('../../utils/geo');
  const { envNum, clearIndoorPresence } = require('../endUser/userDeviceApplicationService');

  const deviceUserIds = await UserDevice.distinct('user_id', {
    is_active: true,
    fcm_token: { $exists: true, $nin: [null, ''] }
  });

  const orClauses = [];
  if (deviceUserIds.length) {
    orClauses.push({ _id: { $in: deviceUserIds } });
  }
  if (incident.organization_id) {
    orClauses.push({ organization_id: incident.organization_id });
  }

  const filter = {
    is_active: { $ne: false },
    'notification_preferences.emergency_push': { $ne: false }
  };
  if (orClauses.length) {
    filter.$or = orClauses;
  }

  const rows = await User.find(filter).select('_id role assigned_buildings').lean();
  const baseRecipientIds = rows.map((row) => String(row._id));
  if (!incident.building_id) return baseRecipientIds;

  const buildingId = String(incident.building_id);
  const selected = new Set();
  const excludedFar = new Set();

  const presenceMin = Math.max(5, envNum('EMERGENCY_RECIPIENT_PRESENCE_WINDOW_MIN', 15));
  const qrMin = Math.max(1, envNum('EMERGENCY_RECIPIENT_QR_WINDOW_MIN', 5));
  const gpsAgeMin = Math.max(1, envNum('EMERGENCY_RECIPIENT_GPS_MAX_AGE_MIN', 5));
  const maxAccuracy = envNum('EMERGENCY_RECIPIENT_GPS_MAX_ACCURACY_M', 50);
  const clearDist = envNum('EMERGENCY_RECIPIENT_CLEAR_DISTANCE_M', 500);
  const geofenceFloor = envNum('EMERGENCY_RECIPIENT_GEOFENCE_MIN_M', 100);

  const presenceSince = new Date(Date.now() - presenceMin * 60 * 1000);
  const qrSince = new Date(Date.now() - qrMin * 60 * 1000);
  const gpsSince = new Date(Date.now() - gpsAgeMin * 60 * 1000);

  const building = await Building.findById(incident.building_id)
    .select('gps_location activation_radius')
    .lean();
  const buildingLat = Number(building?.gps_location?.lat) || 0;
  const buildingLng = Number(building?.gps_location?.lng) || 0;
  const baseRadius = Math.max(30, Number(building?.activation_radius) || 50);
  const configuredRadius = Number(process.env.EMERGENCY_RECIPIENT_GEOFENCE_RADIUS_M || 0) || 0;
  // Ưu tiên env cố định; không còn sàn cứng 200m (để demo thu hẹp được).
  const radiusMeters = configuredRadius > 0
    ? configuredRadius
    : Math.max(geofenceFloor, Math.max(baseRadius * 1.5, baseRadius + 50));
  // Clear phải ≥ R — tránh soft-exclude vô nghĩa
  const effectiveClearDist = Math.max(clearDist, radiusMeters + 50);

  // —— L1 + GPS override (Spec D) ——
  // GPS tin cậy + ngoài R → coi presence/history là nhiễu (soft exclude).
  // GPS tin cậy + > clearDist → clear presence + hard exclude (cả session/QR cũ).
  const softExcluded = new Set(); // không dùng L4/history
  if (buildingLat && buildingLng) {
    const gpsDevices = await UserDevice.find({
      is_active: true,
      last_gps_at: { $gte: gpsSince },
      last_lat: { $ne: null },
      last_lng: { $ne: null }
    })
      .select('user_id last_lat last_lng last_gps_accuracy device_id')
      .lean();

    for (const dev of gpsDevices) {
      const acc = dev.last_gps_accuracy;
      const accOk = acc == null || Number(acc) <= maxAccuracy;
      if (!accOk) continue;
      const d = haversineMeters(buildingLat, buildingLng, Number(dev.last_lat), Number(dev.last_lng));
      const uid = String(dev.user_id);
      if (d > effectiveClearDist) {
        excludedFar.add(uid);
        softExcluded.add(uid);
        clearIndoorPresence(dev.user_id).catch(() => {});
        continue;
      }
      if (d > radiusMeters) {
        // Ngoài geofence nhưng chưa tới ngưỡng clear — vẫn loại presence/history cũ.
        softExcluded.add(uid);
        continue;
      }
      selected.add(uid);
    }
  }

  // —— L2 indoor session đang mở ——
  // Vẫn chỉ hard-exclude khi > clearDist: session/QR trong nhà + GPS nhảy ngoài R vẫn cần nhận.
  const sessionIds = await UserDevice.distinct('user_id', {
    is_active: true,
    indoor_session_open: true,
    $or: [
      { last_building_id: incident.building_id },
      { last_indoor_building_id: incident.building_id }
    ]
  });
  sessionIds.forEach((id) => {
    const uid = String(id);
    if (!excludedFar.has(uid)) selected.add(uid);
  });

  // —— L3 QR ≤ 5 phút ——
  const qrIds = await UserDevice.distinct('user_id', {
    is_active: true,
    last_qr_at: { $gte: qrSince },
    last_qr_id: { $exists: true, $nin: [null, ''] },
    $or: [
      { last_building_id: incident.building_id },
      { last_indoor_building_id: incident.building_id }
    ]
  });
  qrIds.forEach((id) => {
    const uid = String(id);
    if (!excludedFar.has(uid)) selected.add(uid);
  });

  // —— L4 presence indoor ≤ 15 phút ——
  const presenceIds = await UserDevice.distinct('user_id', {
    is_active: true,
    last_indoor_at: { $gte: presenceSince },
    $or: [
      { last_building_id: incident.building_id },
      { last_indoor_building_id: incident.building_id }
    ]
  });
  presenceIds.forEach((id) => {
    const uid = String(id);
    if (!excludedFar.has(uid) && !softExcluded.has(uid)) selected.add(uid);
  });

  // —— L-radio: Wi-Fi/BLE khớp fingerprint tòa (GPS kém trong nhà) ——
  const radioMin = Math.max(3, envNum('EMERGENCY_RECIPIENT_RADIO_WINDOW_MIN', 20));
  const radioSince = new Date(Date.now() - radioMin * 60 * 1000);
  const radioIds = await UserDevice.distinct('user_id', {
    is_active: true,
    last_radio_at: { $gte: radioSince },
    last_radio_building_id: incident.building_id,
    last_radio_score: { $gte: envNum('EMERGENCY_RADIO_MIN_SCORE', 2) }
  });
  radioIds.forEach((id) => {
    const uid = String(id);
    // Radio trong nhà đáng tin hơn soft-exclude từ GPS nhảy ngoài trời
    if (!excludedFar.has(uid)) selected.add(uid);
  });

  // Fallback history cùng cửa sổ presence (bị GPS override nếu ngoài R)
  const historyUserIds = await UserHistory.distinct('user_id', {
    building_id: incident.building_id,
    type: { $in: ['VIEW_INDOOR', 'NAVIGATE_INDOOR', 'OPEN_WORKSPACE'] },
    createdAt: { $gte: presenceSince }
  });
  historyUserIds.forEach((id) => {
    const uid = String(id);
    if (!excludedFar.has(uid) && !softExcluded.has(uid)) selected.add(uid);
  });

  // Live EmergencyLocation (sau ACTIVE / heartbeat)
  const locationWindowMinutes = Math.max(
    5,
    Number(process.env.EMERGENCY_RECIPIENT_LOCATION_WINDOW_MIN || 45)
  );
  const locationSince = new Date(Date.now() - locationWindowMinutes * 60 * 1000);
  const liveRows = await EmergencyLocation.find({
    incident_id: incident._id,
    reported_at: { $gte: locationSince }
  }).select('user_id building_id lat lng accuracy').lean();

  for (const loc of liveRows) {
    const uid = String(loc.user_id);
    let liveDist = null;
    if (
      buildingLat &&
      buildingLng &&
      loc.lat != null &&
      loc.lng != null &&
      Number.isFinite(Number(loc.lat)) &&
      Number.isFinite(Number(loc.lng))
    ) {
      liveDist = haversineMeters(buildingLat, buildingLng, Number(loc.lat), Number(loc.lng));
    }

    // GPS live ngoài clearDist → không tin building_id gắn sẵn từ session cũ
    if (liveDist != null && liveDist > effectiveClearDist) {
      excludedFar.add(uid);
      continue;
    }
    if (liveDist != null && liveDist > radiusMeters) {
      softExcluded.add(uid);
      continue;
    }
    if (liveDist != null && liveDist <= radiusMeters) {
      selected.add(uid);
      continue;
    }
    if (loc.building_id && String(loc.building_id) === buildingId) {
      if (!excludedFar.has(uid) && !softExcluded.has(uid)) selected.add(uid);
    }
  }

  const baseSet = new Set(baseRecipientIds);

  // Chỉ người trong / quanh khu vực nguy hiểm (GPS, session, QR, presence, radio…).
  // Không gửi tự động cho BUILDING_ADMIN chỉ vì assigned_buildings — họ theo dõi qua admin console.
  return [...selected].filter((uid) => {
    if (!baseSet.has(uid)) return false;
    if (excludedFar.has(uid)) return false;
    return true;
  });
}

function serializeBroadcast(doc) {
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(row._id),
    incident_id: String(row.incident_id),
    status: row.status,
    title: row.title,
    body: row.body,
    recipient_count: row.recipient_count,
    push_sent_count: row.push_sent_count,
    in_app_count: row.in_app_count,
    proximity_wake_count: row.proximity_wake_count || 0,
    notification_ids: (row.notification_ids || []).map(String),
    sent_at: row.sent_at,
    error: row.error,
    createdAt: row.createdAt
  };
}

async function createBroadcast(input = {}) {
  const incidentId = input.params?.incidentId;
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  // system=true: kích hoạt từ mạng cảm biến (seismic) — bỏ qua quyền admin
  if (!input.system) {
    await assertIncidentManage(input.actor, incident);
  }

  if (incident.status !== 'ACTIVE') {
    throw httpError(409, 'Chỉ broadcast khi Incident ACTIVE.', 'INCIDENT_NOT_ACTIVE');
  }

  const policy = await getPolicyByType(incident.type);
  if (policy.broadcast === false) {
    throw httpError(409, 'Policy không cho phép broadcast loại sự cố này.', 'BROADCAST_POLICY_DISABLED');
  }

  const body = input.body || {};
  const title = String(body.title || `Cảnh báo khẩn cấp: ${incident.type}`).slice(0, 200);
  const message = String(
    body.body || incident.description || 'Vui lòng làm theo hướng dẫn di tản và mở ứng dụng.'
  ).slice(0, 1000);

  const recipientIds = await listBroadcastRecipients(incident);
  const broadcast = await EmergencyBroadcast.create({
    incident_id: incidentId,
    status: 'PENDING',
    title,
    body: message,
    recipient_count: recipientIds.length,
    created_by: input.actor?.userId || incident.created_by
  });

  let pushSent = 0;
  let inAppCount = 0;
  const notificationIds = [];

  await emergencyPush.ensureEmergencyBroadcastTemplates();

  for (const userId of recipientIds) {
    const pushEnabled = await emergencyPush.isEmergencyPushEnabled(userId);
    const tokens = await require('../../repositories/notificationRepository').findActiveFcmTokens(userId);
    const channels = ['IN_APP'];
    if (pushEnabled && tokens.length) channels.push('PUSH');
    if (channels.includes('IN_APP')) inAppCount += 1;
    if (channels.includes('PUSH')) pushSent += 1;

    const notifications = await notificationApplication.createForUsers([userId], {
      type: emergencyPush.CATEGORY,
      category: emergencyPush.CATEGORY,
      template_key: emergencyPush.TEMPLATE_KEY,
      title,
      body: message,
      severity: 'warning',
      channels,
      device_tokens: tokens,
      organization_id: incident.organization_id || null,
      render_data: {
        title,
        body: message,
        incident_id: String(incidentId),
        incident_type: incident.type,
        building_id: incident.building_id ? String(incident.building_id) : null
      },
      dedupe_key: `emergency-broadcast:${incidentId}:${userId}:${broadcast._id}`
    });
    notificationIds.push(...notifications.map((n) => n._id));
  }

  broadcast.status = recipientIds.length ? (pushSent ? 'SENT' : 'PARTIAL') : 'FAILED';
  broadcast.push_sent_count = pushSent;
  broadcast.in_app_count = inAppCount;
  broadcast.notification_ids = notificationIds;
  broadcast.sent_at = new Date();
  if (!recipientIds.length) broadcast.error = 'Không có người nhận trong khu vực tòa.';
  await broadcast.save();

  // Spec D+ — wake kiểm tra khoảng cách (không đếm vào recipient_count)
  let proximityWakeCount = 0;
  if (String(process.env.EMERGENCY_PROXIMITY_WAKE || '1') !== '0' && incident.building_id) {
    proximityWakeCount = await sendProximityWakeFans(incident, {
      title,
      body: message,
      alreadySentUserIds: recipientIds
    });
    broadcast.proximity_wake_count = proximityWakeCount;
    if (!recipientIds.length && proximityWakeCount > 0) {
      // Có wake nhưng chưa có người trong khu vực — không FAILED, cũng không giả recipient
      broadcast.status = 'SENT';
      broadcast.error = '';
    }
    await broadcast.save();
  }

  ActivityLog.create({
    user_id: input.actor?.userId || incident.created_by,
    action: 'EMERGENCY_BROADCAST_SEND',
    target_type: 'incident',
    target_id: String(incidentId),
    target: title,
    details: {
      broadcast_id: String(broadcast._id),
      recipient_count: recipientIds.length,
      push_sent_count: pushSent,
      proximity_wake_count: proximityWakeCount,
      system: Boolean(input.system)
    },
    organization_id: incident.organization_id || null,
    ip_address: input.ip || ''
  }).catch(() => {});

  return {
    status: 201,
    body: {
      broadcast: {
        ...serializeBroadcast(broadcast),
        proximity_wake_count: proximityWakeCount
      },
      policy: { broadcast: policy.broadcast }
    }
  };
}

/**
 * Gửi data-only proximity_check tới ứng viên có thể gần tòa (chưa nằm trong Spec D).
 * Không wake máy đang chắc chắn ở xa; không gửi hàng loạt mọi FCM không liên quan.
 */
async function sendProximityWakeFans(incident, { title, body, alreadySentUserIds = [] } = {}) {
  const UserDevice = require('../../models/UserDevice');
  const UserHistory = require('../../models/UserHistory');
  const Building = require('../../models/Building');
  const { sendProximityCheckPush } = require('../../services/fcmPushAdapter');
  const { haversineMeters } = require('../../utils/geo');
  const { envNum } = require('../endUser/userDeviceApplicationService');

  const building = await Building.findById(incident.building_id)
    .select('gps_location activation_radius')
    .lean();
  const buildingLat = Number(building?.gps_location?.lat) || 0;
  const buildingLng = Number(building?.gps_location?.lng) || 0;
  if (!buildingLat || !buildingLng) return 0;

  const baseRadius = Math.max(30, Number(building?.activation_radius) || 50);
  const configuredRadius = Number(process.env.EMERGENCY_RECIPIENT_GEOFENCE_RADIUS_M || 0) || 0;
  const geofenceFloor = Number(process.env.EMERGENCY_RECIPIENT_GEOFENCE_MIN_M || 100) || 100;
  const radiusMeters = configuredRadius > 0
    ? configuredRadius
    : Math.max(geofenceFloor, Math.max(baseRadius * 1.5, baseRadius + 50));
  const gpsAgeMin = Math.max(1, envNum('EMERGENCY_RECIPIENT_GPS_MAX_AGE_MIN', 5));
  const maxAccuracy = envNum('EMERGENCY_RECIPIENT_GPS_MAX_ACCURACY_M', 50);
  const clearDist = envNum('EMERGENCY_RECIPIENT_CLEAR_DISTANCE_M', 500);
  const effectiveClearDist = Math.max(clearDist, radiusMeters + 50);
  // GPS rất mới + đã rõ ràng ở xa → không wake
  const confidentFarMaxAgeSec = Math.max(
    30,
    Number(process.env.EMERGENCY_CONFIDENT_FAR_GPS_MAX_AGE_SEC || 90) || 90
  );
  const gpsSince = new Date(Date.now() - gpsAgeMin * 60 * 1000);
  const linkSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const radioMin = Math.max(3, envNum('EMERGENCY_RECIPIENT_RADIO_WINDOW_MIN', 20));
  const radioSince = new Date(Date.now() - radioMin * 60 * 1000);
  const radioMinScore = envNum('EMERGENCY_RADIO_MIN_SCORE', 2);

  const already = new Set((alreadySentUserIds || []).map(String));
  const devices = await UserDevice.find({
    is_active: true,
    fcm_token: { $exists: true, $nin: [null, ''] }
  })
    .select(
      'user_id fcm_token last_building_id last_indoor_building_id last_lat last_lng last_gps_at last_gps_accuracy last_indoor_at last_radio_building_id last_radio_at last_radio_score'
    )
    .lean();

  const historyLinked = new Set(
    (
      await UserHistory.distinct('user_id', {
        building_id: incident.building_id,
        type: { $in: ['VIEW_INDOOR', 'NAVIGATE_INDOOR', 'OPEN_WORKSPACE'] },
        createdAt: { $gte: linkSince }
      })
    ).map(String)
  );

  const buildingId = String(incident.building_id);
  const byUser = new Map(); // uid -> { tokens: [], uncertain: bool }
  for (const d of devices) {
    const uid = String(d.user_id);
    if (already.has(uid)) continue;

    const bid = String(d.last_building_id || d.last_indoor_building_id || '');
    const radioLinked =
      d.last_radio_at &&
      new Date(d.last_radio_at) >= radioSince &&
      String(d.last_radio_building_id || '') === buildingId &&
      Number(d.last_radio_score || 0) >= radioMinScore;

    let linked =
      (bid && bid === buildingId) ||
      historyLinked.has(uid) ||
      radioLinked;

    let uncertain = linked;
    let candidate = linked;
    let skipWake = false;

    if (
      d.last_gps_at &&
      new Date(d.last_gps_at) >= gpsSince &&
      d.last_lat != null &&
      d.last_lng != null
    ) {
      const acc = d.last_gps_accuracy;
      const accOk = acc == null || Number(acc) <= maxAccuracy;
      if (accOk) {
        const dist = haversineMeters(
          buildingLat,
          buildingLng,
          Number(d.last_lat),
          Number(d.last_lng)
        );
        const ageSec = (Date.now() - new Date(d.last_gps_at).getTime()) / 1000;
        if (dist > effectiveClearDist && ageSec <= confidentFarMaxAgeSec) {
          // Chắc chắn ở xa — không wake (kể cả từng gắn tòa)
          skipWake = true;
          candidate = false;
        } else if (dist <= effectiveClearDist) {
          // Trong vùng clear / quanh tòa nhưng chưa Spec D → wake
          candidate = true;
          if (dist > radiusMeters) uncertain = true;
        } else if (linked) {
          // Xa nhưng GPS cũ hơn ngưỡng confident → wake uncertain (re-entry)
          uncertain = true;
          candidate = true;
        }
      }
    }

    if (skipWake || !candidate) continue;

    if (!byUser.has(uid)) byUser.set(uid, { tokens: [], uncertain: false });
    const row = byUser.get(uid);
    row.tokens.push(d.fcm_token);
    row.uncertain = row.uncertain || uncertain;
  }
  if (!byUser.size) return 0;

  const users = await User.find({
    _id: { $in: [...byUser.keys()] },
    is_active: { $ne: false },
    'notification_preferences.emergency_push': { $ne: false }
  })
    .select('_id')
    .lean();

  let sent = 0;
  for (const u of users) {
    const row = byUser.get(String(u._id));
    if (!row) continue;
    for (const token of row.tokens) {
      try {
        await sendProximityCheckPush({
          token,
          incidentId: String(incident._id),
          buildingId: String(incident.building_id),
          buildingLat,
          buildingLng,
          radiusM: radiusMeters,
          clearDistanceM: effectiveClearDist,
          incidentType: incident.type,
          title,
          body,
          uncertainAlert: row.uncertain
        });
        sent += 1;
      } catch (e) {
        // bỏ token lỗi
      }
    }
  }
  return sent;
}

async function getBroadcastStatus(input = {}) {
  const incidentId = input.params?.incidentId;
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  await assertIncidentManage(input.actor, incident);

  const rows = await EmergencyBroadcast.find({ incident_id: incidentId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return {
    status: 200,
    body: { broadcasts: rows.map(serializeBroadcast) }
  };
}

module.exports = {
  listBroadcastRecipients,
  createBroadcast,
  getBroadcastStatus
};
