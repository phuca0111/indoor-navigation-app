/**
 * FCM push adapter — firebase-admin khi có credentials; stub khi thiếu.
 * Tương thích firebase-admin v12+ modular API (getApps / cert / getMessaging).
 *
 * Credentials (một trong các cách):
 *   FCM_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json
 *   FCM_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
 *   FCM_SERVICE_ACCOUNT_BASE64=<base64 của JSON>
 * Bắt buộc kèm: FCM_PROJECT_ID=your-firebase-project-id
 * Tắt cứng: FCM_ENABLED=false  (luôn stub, dù có credentials)
 */
const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[fcm-push]';

let messagingClient = null;
let initAttempted = false;
let lastInitError = null;
let cachedCredentialsMeta = null;

function envFlagTrue(name, defaultTrue = true) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return defaultTrue;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function resolveServiceAccountObject() {
  const pathEnv = String(process.env.FCM_SERVICE_ACCOUNT_PATH || '').trim();
  if (pathEnv) {
    const abs = path.isAbsolute(pathEnv)
      ? pathEnv
      : path.resolve(process.cwd(), pathEnv);
    if (fs.existsSync(abs)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
        cachedCredentialsMeta = { source: 'path', path: abs };
        return parsed;
      } catch (e) {
        lastInitError = `Không đọc được service account file: ${e.message}`;
        return null;
      }
    }
    // PATH khai báo nhưng chưa có file → fallback JSON/BASE64 (không fail sớm)
  }

  const b64 = String(process.env.FCM_SERVICE_ACCOUNT_BASE64 || '').trim();
  if (b64) {
    try {
      const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      cachedCredentialsMeta = { source: 'base64' };
      return parsed;
    } catch (e) {
      lastInitError = `FCM_SERVICE_ACCOUNT_BASE64 không hợp lệ: ${e.message}`;
      return null;
    }
  }

  const json = String(process.env.FCM_SERVICE_ACCOUNT_JSON || '').trim();
  if (json) {
    try {
      const parsed = JSON.parse(json);
      cachedCredentialsMeta = { source: 'json_env' };
      return parsed;
    } catch (e) {
      lastInitError = `FCM_SERVICE_ACCOUNT_JSON không hợp lệ: ${e.message}`;
      return null;
    }
  }

  if (pathEnv) {
    lastInitError = `FCM_SERVICE_ACCOUNT_PATH không tồn tại và không có JSON/BASE64 fallback: ${pathEnv}`;
  } else {
    lastInitError = 'Thiếu FCM_SERVICE_ACCOUNT_PATH / _JSON / _BASE64';
  }
  return null;
}

function projectIdFromCredentials(creds) {
  const fromEnv = String(process.env.FCM_PROJECT_ID || '').trim();
  if (fromEnv) return fromEnv;
  return String(creds?.project_id || '').trim() || '';
}

/** Có đủ biến để thử init production (chưa chắc SDK ok). */
function hasCredentialMaterial() {
  return Boolean(
    String(process.env.FCM_SERVICE_ACCOUNT_PATH || '').trim() ||
      String(process.env.FCM_SERVICE_ACCOUNT_JSON || '').trim() ||
      String(process.env.FCM_SERVICE_ACCOUNT_BASE64 || '').trim(),
  );
}

function isFcmConfigured() {
  if (!envFlagTrue('FCM_ENABLED', true)) return false;
  if (!hasCredentialMaterial()) return false;
  // PROJECT_ID có thể lấy từ file service account
  const pid = String(process.env.FCM_PROJECT_ID || '').trim();
  if (pid) return true;
  const creds = resolveServiceAccountObject();
  return Boolean(creds && projectIdFromCredentials(creds));
}

/**
 * Snapshot trạng thái FCM — dùng health / verify script / bootstrap log.
 */
function getFcmRuntimeStatus() {
  const enabled = envFlagTrue('FCM_ENABLED', true);
  if (!enabled) {
    return {
      mode: 'disabled',
      ready: false,
      project_id: String(process.env.FCM_PROJECT_ID || '').trim() || null,
      credential_source: null,
      message: 'FCM_ENABLED=false — luôn stub',
    };
  }
  if (!hasCredentialMaterial()) {
    return {
      mode: 'stub',
      ready: false,
      project_id: String(process.env.FCM_PROJECT_ID || '').trim() || null,
      credential_source: null,
      message: 'Chưa cấu hình service account → stub',
    };
  }
  const creds = resolveServiceAccountObject();
  if (!creds) {
    return {
      mode: 'misconfigured',
      ready: false,
      project_id: String(process.env.FCM_PROJECT_ID || '').trim() || null,
      credential_source: null,
      message: lastInitError || 'Credentials không đọc được',
    };
  }
  const projectId = projectIdFromCredentials(creds);
  if (!projectId) {
    return {
      mode: 'misconfigured',
      ready: false,
      project_id: null,
      credential_source: cachedCredentialsMeta?.source || null,
      message: 'Thiếu FCM_PROJECT_ID và project_id trong service account',
    };
  }
  const messaging = getMessagingClient();
  if (!messaging) {
    return {
      mode: 'misconfigured',
      ready: false,
      project_id: projectId,
      credential_source: cachedCredentialsMeta?.source || null,
      message: lastInitError || 'firebase-admin init thất bại',
    };
  }
  return {
    mode: 'production',
    ready: true,
    project_id: projectId,
    credential_source: cachedCredentialsMeta?.source || null,
    message: 'FCM production sẵn sàng',
  };
}

function getMessagingClient() {
  if (initAttempted) return messagingClient;
  initAttempted = true;
  lastInitError = null;

  if (!envFlagTrue('FCM_ENABLED', true)) {
    lastInitError = 'FCM_ENABLED=false';
    return null;
  }

  const credentials = resolveServiceAccountObject();
  if (!credentials) return null;

  const projectId = projectIdFromCredentials(credentials);
  if (!projectId) {
    lastInitError = 'Thiếu project id (FCM_PROJECT_ID hoặc project_id trong JSON)';
    return null;
  }

  try {
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    if (!getApps().length) {
      initializeApp({
        credential: cert(credentials),
        projectId,
      });
    }
    messagingClient = getMessaging();
    console.info(LOG_PREFIX, 'firebase-admin sẵn sàng, project=', projectId,
      'source=', cachedCredentialsMeta?.source || '?');
  } catch (error) {
    lastInitError = error.message;
    console.warn(LOG_PREFIX, 'firebase-admin không khả dụng:', error.message);
    messagingClient = null;
  }
  return messagingClient;
}

function resetForTests() {
  messagingClient = null;
  initAttempted = false;
  lastInitError = null;
  cachedCredentialsMeta = null;
}

function normalizeData(data) {
  if (!data || typeof data !== 'object') return {};
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [String(key), value == null ? '' : String(value)]),
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
          building_id: payload.data?.building_id || payload.building_id || '',
        }
      : {}),
  });

  if (!isFcmConfigured()) {
    console.info(LOG_PREFIX, 'stub send (no credentials)', {
      token_preview: `${token.slice(0, 12)}…`,
      title,
      emergency: isEmergency,
    });
    return { provider_message_id: `fcm-stub-${Date.now()}`, stub: true };
  }

  const messaging = getMessagingClient();
  if (!messaging) {
    return { deferred: true, reason: 'FCM_SDK_MISSING', error: lastInitError };
  }

  const message = isEmergency
    ? {
        token,
        data,
        android: {
          priority: 'high',
          ttl: 60 * 60 * 1000,
          collapseKey: data.incident_id
            ? `emergency-${data.incident_id}`
            : 'emergency-broadcast',
        },
      }
    : {
        token,
        notification: { title, body },
        data,
        android: { priority: 'high', ttl: 24 * 60 * 60 * 1000 },
      };

  const messageId = await messaging.send(message);
  return { provider_message_id: messageId || '', stub: false };
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
    building_id: buildingId || '',
  });

  if (!isFcmConfigured()) {
    console.info(LOG_PREFIX, 'stub stop emergency', { token_preview: `${t.slice(0, 12)}…` });
    return { provider_message_id: `fcm-stub-stop-${Date.now()}`, stub: true };
  }

  const messaging = getMessagingClient();
  if (!messaging) return { deferred: true, reason: 'FCM_SDK_MISSING' };

  const messageId = await messaging.send({
    token: t,
    data,
    android: {
      priority: 'high',
      ttl: 60 * 60 * 1000,
      collapseKey: incidentId ? `emergency-stop-${incidentId}` : 'emergency-stop',
    },
  });
  return { provider_message_id: messageId || '', stub: false };
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
  uncertainAlert = false,
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
    uncertain_alert: uncertainAlert ? '1' : '0',
  });

  if (!isFcmConfigured()) {
    console.info(LOG_PREFIX, 'stub proximity_check', {
      token_preview: `${t.slice(0, 12)}…`,
      uncertain: uncertainAlert,
    });
    return { provider_message_id: `fcm-stub-prox-${Date.now()}`, stub: true };
  }

  const messaging = getMessagingClient();
  if (!messaging) return { deferred: true, reason: 'FCM_SDK_MISSING' };

  const messageId = await messaging.send({
    token: t,
    data,
    android: {
      priority: 'high',
      ttl: 60 * 60 * 1000,
      collapseKey: incidentId ? `emergency-prox-${incidentId}` : 'emergency-prox',
    },
  });
  return { provider_message_id: messageId || '', stub: false };
}

function logStartupStatus() {
  const status = getFcmRuntimeStatus();
  const level = status.ready ? 'info' : 'warn';
  console[level](
    LOG_PREFIX,
    `mode=${status.mode}`,
    status.project_id ? `project=${status.project_id}` : '',
    status.message,
  );
  return status;
}

module.exports = {
  isFcmConfigured,
  getMessagingClient,
  getFcmRuntimeStatus,
  sendFcmPush,
  sendEmergencyStopPush,
  sendProximityCheckPush,
  logStartupStatus,
  resetForTests,
};
