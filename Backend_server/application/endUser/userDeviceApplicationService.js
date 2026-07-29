/**
 * P2.1 + Spec D — UserDevice registry + presence snapshot.
 */
const UserDevice = require('../../models/UserDevice');
const activities = require('../../repositories/activityLogRepository');
const { haversineMeters } = require('../../utils/geo');

function normalizeDeviceId(raw) {
  const id = String(raw || '').trim();
  if (!id || id.length > 128) {
    throw Object.assign(new Error('device_id không hợp lệ.'), { status: 400, code: 'INVALID_DEVICE_ID' });
  }
  return id;
}

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function publicDevice(doc) {
  if (!doc) return null;
  const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const buildingId = d.last_building_id || d.last_indoor_building_id || null;
  return {
    _id: d._id,
    device_id: d.device_id,
    platform: d.platform,
    device_name: d.device_name || '',
    has_fcm_token: Boolean(d.fcm_token),
    app_version: d.app_version || '',
    last_seen_at: d.last_seen_at,
    last_building_id: buildingId ? String(buildingId) : null,
    last_floor: d.last_floor,
    last_qr_id: d.last_qr_id || '',
    last_indoor_at: d.last_indoor_at,
    last_qr_at: d.last_qr_at,
    last_lat: d.last_lat,
    last_lng: d.last_lng,
    last_gps_at: d.last_gps_at,
    last_gps_accuracy: d.last_gps_accuracy,
    indoor_session_open: Boolean(d.indoor_session_open),
    last_radio_building_id: d.last_radio_building_id ? String(d.last_radio_building_id) : null,
    last_radio_at: d.last_radio_at,
    last_radio_score: d.last_radio_score,
    last_radio_source: d.last_radio_source || '',
    is_active: d.is_active !== false,
    revoked_at: d.revoked_at || null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt
  };
}

function presenceClearPatch() {
  return {
    last_building_id: null,
    last_indoor_building_id: null,
    last_floor: null,
    last_qr_id: '',
    last_indoor_at: null,
    last_qr_at: null,
    indoor_session_open: false,
    last_radio_building_id: null,
    last_radio_at: null,
    last_radio_score: null,
    last_radio_source: ''
  };
}

async function upsertMyDevice(userId, input = {}, context = {}) {
  const device_id = normalizeDeviceId(input.device_id);
  const platform = ['android', 'ios', 'web'].includes(String(input.platform || '').toLowerCase())
    ? String(input.platform).toLowerCase()
    : 'unknown';
  const patch = {
    platform,
    device_name: String(input.device_name || '').slice(0, 120),
    app_version: String(input.app_version || '').slice(0, 64),
    last_seen_at: new Date(),
    is_active: true,
    revoked_at: null
  };
  if (input.fcm_token !== undefined) {
    patch.fcm_token = String(input.fcm_token || '').slice(0, 512);
  }
  const device = await UserDevice.findOneAndUpdate(
    { user_id: userId, device_id },
    { $set: patch, $setOnInsert: { user_id: userId, device_id } },
    { upsert: true, new: true }
  );
  await activities.recordActivity({
    user_id: userId,
    action: 'DEVICE_REGISTER',
    target_type: 'user_device',
    target_id: String(device._id),
    target: device_id,
    details: { platform, has_fcm: Boolean(device.fcm_token) },
    ip_address: context.ipAddress || ''
  }).catch(() => {});
  return publicDevice(device);
}

/**
 * Spec D — cập nhật snapshot theo sự kiện (không heartbeat).
 * Body: device_id + optional building_id, floor, qr_id, lat/lng/accuracy,
 *       indoor_session_open, clear_presence, building_lat/lng (để clear >300m).
 */
async function updateMyPresence(userId, input = {}) {
  const device_id = normalizeDeviceId(input.device_id);
  const now = new Date();
  const filter = { user_id: userId, device_id, is_active: true };

  let device = await UserDevice.findOne(filter);
  if (!device) {
    device = await UserDevice.findOneAndUpdate(
      { user_id: userId, device_id },
      {
        $set: {
          platform: 'android',
          last_seen_at: now,
          is_active: true,
          revoked_at: null
        },
        $setOnInsert: { user_id: userId, device_id }
      },
      { upsert: true, new: true }
    );
  }

  const patch = { last_seen_at: now };
  const clearDistance = envNum('EMERGENCY_RECIPIENT_CLEAR_DISTANCE_M', 500);
  const maxGpsAgeMin = envNum('EMERGENCY_RECIPIENT_GPS_MAX_AGE_MIN', 5);
  const maxAccuracy = envNum('EMERGENCY_RECIPIENT_GPS_MAX_ACCURACY_M', 50);

  if (input.clear_presence === true) {
    Object.assign(patch, presenceClearPatch());
  }

  if (input.building_id) {
    patch.last_building_id = input.building_id;
    patch.last_indoor_building_id = input.building_id;
  }
  if (input.floor != null && Number.isFinite(Number(input.floor))) {
    patch.last_floor = Number(input.floor);
  }
  if (input.qr_id != null && String(input.qr_id).trim()) {
    patch.last_qr_id = String(input.qr_id).trim().slice(0, 128);
    patch.last_qr_at = now;
    if (input.building_id) {
      patch.last_building_id = input.building_id;
      patch.last_indoor_building_id = input.building_id;
    }
  }
  if (input.touch_indoor === true || input.building_id || input.qr_id) {
    if (input.building_id || device.last_building_id || device.last_indoor_building_id) {
      patch.last_indoor_at = now;
    }
  }
  if (input.indoor_session_open != null) {
    patch.indoor_session_open = Boolean(input.indoor_session_open);
    if (patch.indoor_session_open && (input.building_id || device.last_building_id)) {
      patch.last_indoor_at = now;
      if (input.building_id) {
        patch.last_building_id = input.building_id;
        patch.last_indoor_building_id = input.building_id;
      }
    }
  }

  const lat = input.lat != null ? Number(input.lat) : null;
  const lng = input.lng != null ? Number(input.lng) : null;
  const accuracy = input.accuracy != null ? Number(input.accuracy) : null;
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    patch.last_lat = lat;
    patch.last_lng = lng;
    patch.last_gps_at = now;
    if (accuracy != null && Number.isFinite(accuracy)) patch.last_gps_accuracy = accuracy;

    // L5: GPS đủ tin + cách tâm tòa > clearDistance → clear presence
    const bLat = input.building_lat != null ? Number(input.building_lat) : null;
    const bLng = input.building_lng != null ? Number(input.building_lng) : null;
    const accOk = accuracy == null || accuracy <= maxAccuracy;
    if (
      accOk &&
      bLat &&
      bLng &&
      Number.isFinite(bLat) &&
      Number.isFinite(bLng)
    ) {
      const d = haversineMeters(bLat, bLng, lat, lng);
      if (d > clearDistance) {
        Object.assign(patch, presenceClearPatch());
      }
    }

    // Claim building_id từ xa (không QR): tra GPS tòa — từ chối presence indoor
    if (
      accOk &&
      input.building_id &&
      !(input.qr_id && String(input.qr_id).trim())
    ) {
      try {
        const Building = require('../../models/Building');
        const bdoc = await Building.findById(input.building_id).select('gps_location').lean();
        const tLat = Number(bdoc?.gps_location?.lat);
        const tLng = Number(bdoc?.gps_location?.lng);
        if (Number.isFinite(tLat) && Number.isFinite(tLng) && (tLat !== 0 || tLng !== 0)) {
          const d2 = haversineMeters(tLat, tLng, lat, lng);
          if (d2 > clearDistance) {
            Object.assign(patch, presenceClearPatch());
            patch.last_lat = lat;
            patch.last_lng = lng;
            patch.last_gps_at = now;
            if (accuracy != null && Number.isFinite(accuracy)) patch.last_gps_accuracy = accuracy;
          }
        }
      } catch (_) {
        /* ignore */
      }
    }
  }

  // Spec D+ — Wi-Fi / BLE fingerprint (học + khớp), chạy sau GPS để không bị clear oan
  try {
    const { applyRadioPresence } = require('./radioPresenceApplicationService');
    const radioPatch = await applyRadioPresence(input, { userId, now });
    Object.assign(patch, radioPatch);
  } catch (e) {
    // radio optional — không chặn presence GPS/QR
  }

  const updated = await UserDevice.findOneAndUpdate(
    { _id: device._id },
    { $set: patch },
    { new: true }
  );
  return publicDevice(updated);
}

async function listMyDevices(userId) {
  const rows = await UserDevice.find({ user_id: userId, is_active: true })
    .sort({ last_seen_at: -1 })
    .lean();
  return { total: rows.length, devices: rows.map(publicDevice) };
}

async function revokeMyDevice(userId, deviceIdOrObjectId, context = {}) {
  const device = await UserDevice.findOne({
    user_id: userId,
    is_active: true,
    $or: [
      { _id: /^[a-f0-9]{24}$/i.test(String(deviceIdOrObjectId || '')) ? deviceIdOrObjectId : null },
      { device_id: String(deviceIdOrObjectId || '') }
    ].filter((clause) => {
      const v = Object.values(clause)[0];
      return v !== null && v !== undefined && v !== '';
    })
  });
  if (!device) {
    throw Object.assign(new Error('Không tìm thấy thiết bị.'), { status: 404, code: 'DEVICE_NOT_FOUND' });
  }
  device.is_active = false;
  device.revoked_at = new Date();
  device.fcm_token = '';
  await device.save();
  await activities.recordActivity({
    user_id: userId,
    action: 'DEVICE_REVOKE',
    target_type: 'user_device',
    target_id: String(device._id),
    target: device.device_id,
    details: {},
    ip_address: context.ipAddress || ''
  }).catch(() => {});
  return publicDevice(device);
}

async function listAdminUserDevices(userId) {
  const rows = await UserDevice.find({ user_id: userId })
    .sort({ last_seen_at: -1 })
    .limit(100)
    .lean();
  return { total: rows.length, devices: rows.map(publicDevice) };
}

async function countActiveDevices(userId) {
  return UserDevice.countDocuments({ user_id: userId, is_active: true });
}

async function markIndoorPresence(userId, buildingId, extras = {}) {
  if (!userId || !buildingId) return { matched: 0 };
  const now = new Date();
  const $set = {
    last_building_id: buildingId,
    last_indoor_building_id: buildingId,
    last_indoor_at: now,
    last_seen_at: now
  };
  if (extras.floor != null && Number.isFinite(Number(extras.floor))) {
    $set.last_floor = Number(extras.floor);
  }
  if (extras.qr_id) {
    $set.last_qr_id = String(extras.qr_id).slice(0, 128);
    $set.last_qr_at = now;
  }
  if (extras.indoor_session_open != null) {
    $set.indoor_session_open = Boolean(extras.indoor_session_open);
  }
  const result = await UserDevice.updateMany(
    { user_id: userId, is_active: true },
    { $set }
  );
  return { matched: result.modifiedCount || result.matchedCount || 0 };
}

async function clearIndoorPresence(userId, buildingId = null) {
  if (!userId) return { matched: 0 };
  const filter = { user_id: userId, is_active: true };
  if (buildingId) {
    filter.$or = [
      { last_building_id: buildingId },
      { last_indoor_building_id: buildingId }
    ];
  }
  const result = await UserDevice.updateMany(filter, { $set: presenceClearPatch() });
  return { matched: result.modifiedCount || result.matchedCount || 0 };
}

module.exports = {
  upsertMyDevice,
  updateMyPresence,
  listMyDevices,
  revokeMyDevice,
  listAdminUserDevices,
  countActiveDevices,
  markIndoorPresence,
  clearIndoorPresence,
  publicDevice,
  envNum
};
