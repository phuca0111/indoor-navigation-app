/**
 * P2.3 — FCM push adapter (firebase-admin optional, stub khi thiếu credentials).
 * Tương thích firebase-admin v12+ modular API (getApps / cert / getMessaging).
 */
const LOG_PREFIX = '[fcm-push]';

let messagingClient = null;
let initAttempted = false;

function isFcmConfigured() {
  return Boolean(
    process.env.FCM_PROJECT_ID &&
    process.env.FCM_SERVICE_ACCOUNT_JSON
  );
}

function parseServiceAccount() {
  try {
    return JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
  } catch {
    return null;
  }
}

function getMessagingClient() {
  if (initAttempted) return messagingClient;
  initAttempted = true;
  if (!isFcmConfigured()) return null;
  const credentials = parseServiceAccount();
  if (!credentials) {
    console.warn(LOG_PREFIX, 'FCM_SERVICE_ACCOUNT_JSON không hợp lệ.');
    return null;
  }
  try {
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    if (!getApps().length) {
      initializeApp({
        credential: cert(credentials),
        projectId: process.env.FCM_PROJECT_ID
      });
    }
    messagingClient = getMessaging();
    console.info(LOG_PREFIX, 'firebase-admin sẵn sàng, project=', process.env.FCM_PROJECT_ID);
  } catch (error) {
    console.warn(LOG_PREFIX, 'firebase-admin không khả dụng:', error.message);
    messagingClient = null;
  }
  return messagingClient;
}

function resetForTests() {
  messagingClient = null;
  initAttempted = false;
}

function normalizeData(data) {
  if (!data || typeof data !== 'object') return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [String(key), value == null ? '' : String(value)])
  );
}

async function sendFcmPush(delivery) {
  const token = String(delivery?.recipient || '').trim();
  if (!token) return { deferred: true, reason: 'RECIPIENT_MISSING' };

  const payload = delivery.rendered_payload || {};
  const title = payload.subject || payload.title || 'Thông báo';
  const body = payload.body || '';
  const isEmergency = String(delivery.category || '').toUpperCase() === 'EMERGENCY';

  // WHY: EMERGENCY gửi DATA-ONLY → onMessageReceived luôn chạy (kể cả nền/kill)
  // để app tự dựng full-screen intent. Không dùng notification payload hệ thống.
  const data = normalizeData({
    ...payload.data,
    ...(isEmergency
      ? {
          title,
          body,
          emergency: 'true',
          incident_type: payload.data?.incident_type || payload.incident_type || '',
          incident_id: payload.data?.incident_id || payload.incident_id || '',
          building_id: payload.data?.building_id || payload.building_id || ''
        }
      : {})
  });

  if (!isFcmConfigured()) {
    console.info(LOG_PREFIX, 'stub send (no credentials)', {
      token_preview: `${token.slice(0, 12)}…`,
      title,
      emergency: isEmergency
    });
    return { provider_message_id: `fcm-stub-${Date.now()}` };
  }

  const messaging = getMessagingClient();
  if (!messaging) {
    return { deferred: true, reason: 'FCM_SDK_MISSING' };
  }

  const message = isEmergency
    ? {
        token,
        data,
        android: {
          // High priority: đánh thức app khi Doze / nền — EEW cần giây
          priority: 'high',
          ttl: 60 * 60 * 1000,
          collapseKey: data.incident_id
            ? `emergency-${data.incident_id}`
            : 'emergency-broadcast'
        }
      }
    : {
        token,
        notification: { title, body },
        data,
        android: { priority: 'high', ttl: 24 * 60 * 60 * 1000 }
      };

  const messageId = await messaging.send(message);
  return { provider_message_id: messageId || '' };
}

/** Spec D — Stop Emergency (data-only) khi CONTAINED/RESOLVED. */
async function sendEmergencyStopPush({ token, incidentId, buildingId }) {
  const t = String(token || '').trim();
  if (!t) return { deferred: true, reason: 'RECIPIENT_MISSING' };

  const data = normalizeData({
    emergency: 'false',
    action: 'stop',
    title: 'Sự cố đã kết thúc',
    body: 'Đã tắt chế độ khẩn cấp.',
    incident_id: incidentId || '',
    building_id: buildingId || ''
  });

  if (!isFcmConfigured()) {
    console.info(LOG_PREFIX, 'stub stop emergency', { token_preview: `${t.slice(0, 12)}…` });
    return { provider_message_id: `fcm-stub-stop-${Date.now()}` };
  }

  const messaging = getMessagingClient();
  if (!messaging) return { deferred: true, reason: 'FCM_SDK_MISSING' };

  const messageId = await messaging.send({
    token: t,
    data,
    android: {
      priority: 'high',
      ttl: 60 * 60 * 1000,
      collapseKey: incidentId ? `emergency-stop-${incidentId}` : 'emergency-stop'
    }
  });
  return { provider_message_id: messageId || '' };
}

/**
 * Spec D+ — luôn gửi proximity_check (kể cả uncertain).
 * Client: GPS live > clearDist → không hiện; không đo được GPS + uncertain → vẫn hiện (máy túi).
 */
async function sendProximityCheckPush({
  token,
  incidentId,
  buildingId,
  buildingLat,
  buildingLng,
  radiusM,
  clearDistanceM,
  incidentType,
  title,
  body,
  uncertainAlert = false
}) {
  const t = String(token || '').trim();
  if (!t) return { deferred: true, reason: 'RECIPIENT_MISSING' };

  const data = normalizeData({
    action: 'proximity_check',
    emergency: 'false',
    title: title || 'Cảnh báo khẩn cấp',
    body: body || 'Có sự cố gần bạn. Đang xác minh vị trí…',
    incident_id: incidentId || '',
    building_id: buildingId || '',
    building_lat: buildingLat != null ? String(buildingLat) : '',
    building_lng: buildingLng != null ? String(buildingLng) : '',
    radius_m: radiusM != null ? String(radiusM) : '150',
    clear_distance_m: clearDistanceM != null ? String(clearDistanceM) : '500',
    incident_type: incidentType || 'FIRE',
    // 1 = nếu không đo được GPS live → vẫn hiện (re-entry / túi quần).
    // GPS live ngoài clear_distance → KHÔNG hiện (dù uncertain=1).
    uncertain_alert: uncertainAlert ? '1' : '0'
  });

  if (!isFcmConfigured()) {
    console.info(LOG_PREFIX, 'stub proximity_check', {
      token_preview: `${t.slice(0, 12)}…`,
      uncertain: uncertainAlert
    });
    return { provider_message_id: `fcm-stub-prox-${Date.now()}` };
  }

  const messaging = getMessagingClient();
  if (!messaging) return { deferred: true, reason: 'FCM_SDK_MISSING' };

  const messageId = await messaging.send({
    token: t,
    data,
    android: {
      priority: 'high',
      ttl: 60 * 60 * 1000,
      collapseKey: incidentId ? `emergency-prox-${incidentId}` : 'emergency-prox'
    }
  });
  return { provider_message_id: messageId || '' };
}

module.exports = {
  isFcmConfigured,
  getMessagingClient,
  sendFcmPush,
  sendEmergencyStopPush,
  sendProximityCheckPush,
  resetForTests
};
