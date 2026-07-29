/**
 * Activity log streams — nhóm action theo nghiệp vụ để lọc nhật ký.
 * Single source of truth cho API (+ mirror trên dashboard UI).
 */

const STREAMS = {
  auth: {
    id: 'auth',
    label: 'Đăng nhập & bảo mật',
    actions: [
      'LOGIN', 'LOGOUT', 'REGISTER', 'UPDATE_PROFILE', 'CHANGE_PASSWORD',
      'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_COMPLETE',
      'LOGOUT_ALL', 'SESSION_REVOKED', 'EMAIL_VERIFIED',
      'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED', 'UNLOCK_SESSION',
      'DEVICE_REGISTER', 'DEVICE_REVOKE', 'EMERGENCY_CONSENT_UPDATE'
    ]
  },
  buildings: {
    id: 'buildings',
    label: 'Tòa & bản đồ',
    actions: [
      'CREATE_BUILDING', 'UPDATE_BUILDING', 'DELETE_BUILDING',
      'DEACTIVATE_BUILDING', 'ACTIVATE_BUILDING',
      'ADD_FLOOR', 'REMOVE_FLOOR', 'RENAME_FLOOR', 'DUPLICATE_FLOOR',
      'SET_FLOOR_VISIBILITY', 'REORDER_FLOORS',
      'UPDATE_BUILDING_VISIBILITY',
      'ASSIGN_BUILDING', 'BUILDING_ASSIGN', 'BUILDING_UNASSIGN',
      'BUILDING_ACCESS_DENIED',
      'CREATE_QR', 'DELETE_QR',
      'PUBLISH_MAP', 'PUBLISH_MAP_REQUESTED', 'LOAD_MAP', 'ROLLBACK_MAP',
      'MAP_VERSION_RETENTION', 'SAVE_DRAFT',
      'INDOOR_WORKSPACE_CREATE'
    ]
  },
  places: {
    id: 'places',
    label: 'Place & kiểm duyệt',
    actions: [
      'CREATE_PLACE', 'UPDATE_PLACE', 'DELETE_PLACE', 'LOCK_PLACE', 'UNLOCK_PLACE',
      'ATTACH_BUILDING_PLACE', 'DETACH_BUILDING_PLACE',
      'PLACE_PROPOSAL_CREATE', 'PLACE_PROPOSAL_APPROVE', 'PLACE_PROPOSAL_REJECT',
      'PLACE_VERIFICATION_REQUEST', 'PLACE_VERIFICATION_APPROVE', 'PLACE_VERIFICATION_REJECT',
      'PLACE_OWNERSHIP_SUBMIT', 'PLACE_OWNERSHIP_APPROVE', 'PLACE_OWNERSHIP_REJECT', 'PLACE_SET_OWNER',
      'PLACE_MERGE_EXECUTE', 'PLACE_MERGE_APPROVE',
      'PLACE_REVIEW_DEACTIVATE', 'PLACE_REVIEW_ACTIVATE', 'PLACE_FAVORITE_REMOVE',
      'MAP_CONTRIBUTION_CREATE', 'MAP_CONTRIBUTION_APPROVE', 'MAP_CONTRIBUTION_REJECT',
      'MAP_MODERATION_RESOLVE',
      'MAP_REVIEW_AUTO_APPROVE', 'MAP_REVIEW_SUBMIT', 'MAP_REVIEW_APPROVE',
      'MAP_REVIEW_REJECT', 'MAP_REVIEW_MERGE_STUB', 'MAP_REVIEW_MERGE_ENGINE'
    ]
  },
  people: {
    id: 'people',
    label: 'Tài khoản & thành viên',
    actions: [
      'CREATE_USER', 'ADMIN_UPDATE_USER', 'ACTIVATE_USER', 'DEACTIVATE_USER', 'DELETE_USER',
      'WARN_USER', 'BAN_USER', 'UNBAN_USER', 'ADMIN_RESET_PASSWORD',
      'MEMBER_INVITED', 'MEMBER_INVITE_REVOKED', 'MEMBER_INVITE_ACCEPTED',
      'MEMBER_UPDATED', 'MEMBER_REMOVED',
      'JOIN_ORG_REQUEST', 'JOIN_ORG_APPROVE', 'JOIN_ORG_REJECT',
      'UPDATE_ORGANIZATION', 'DEACTIVATE_ORGANIZATION', 'ACTIVATE_ORGANIZATION',
      'UPDATE_ORG_CONTACT'
    ]
  },
  billing: {
    id: 'billing',
    label: 'Gói & thanh toán',
    actions: [
      'CREATE_PLAN', 'UPDATE_PLAN', 'DELETE_PLAN',
      'CREATE_INVOICE', 'UPDATE_INVOICE', 'VOID_INVOICE', 'MARK_INVOICE_PAID',
      'CHECKOUT_START', 'SUBSCRIPTION_PAYMENT', 'REFUND_PAYMENT',
      'PERSONAL_PLAN_UPGRADE',
      'ACTIVATE_SUBSCRIPTION', 'CANCEL_SUBSCRIPTION', 'EXPIRE_SUBSCRIPTION',
      'CREATE_BILLING_EVENT',
      'SET_PUBLISH_PERMIT', 'CLEAR_PUBLISH_PERMIT'
    ]
  },
  emergency: {
    id: 'emergency',
    label: 'Khẩn cấp',
    actions: [
      'INCIDENT_CREATE', 'INCIDENT_UPDATE', 'INCIDENT_STATUS_CHANGE',
      'HAZARD_ZONE_CREATE', 'HAZARD_ZONE_UPDATE', 'HAZARD_ZONE_ACTIVATE', 'HAZARD_ZONE_DEACTIVATE',
      'EMERGENCY_BROADCAST_SEND', 'EMERGENCY_LOCATION_REPORT', 'EMERGENCY_POSSIBLY_TRAPPED',
      'SEISMIC_EARTHQUAKE_TRIGGER', 'USGS_EARTHQUAKE_TRIGGER'
    ]
  },
  platform: {
    id: 'platform',
    label: 'Nền tảng',
    actions: [
      'CREATE_ORG',
      'APPROVE_ORG_REGISTRATION', 'REJECT_ORG_REGISTRATION',
      'SELF_SERVICE_ORG_TRIAL'
    ]
  }
};

const STREAM_ORDER = ['all', 'auth', 'buildings', 'places', 'people', 'billing', 'emergency', 'platform'];

/** Role → stream ids được phép (không gồm `all`; `all` = union). */
const ROLE_STREAMS = {
  SUPER_ADMIN: ['auth', 'buildings', 'places', 'people', 'billing', 'emergency', 'platform'],
  ORG_ADMIN: ['auth', 'buildings', 'places', 'people', 'billing', 'emergency'],
  FINANCE_ADMIN: ['billing']
};

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

function allowedStreamIds(role) {
  const key = normalizeRole(role);
  if (key === 'SUPER_ADMIN') return ROLE_STREAMS.SUPER_ADMIN.slice();
  return (ROLE_STREAMS[key] || []).slice();
}

function resolveStreamActions(streamId, role) {
  const id = String(streamId || 'all').trim().toLowerCase() || 'all';
  const allowed = allowedStreamIds(role);

  if (!allowed.length) {
    return { ok: false, status: 403, message: 'Bạn không có quyền xem nhật ký.', code: 'LOGS_FORBIDDEN' };
  }

  if (id === 'all') {
    const actions = [...new Set(allowed.flatMap((sid) => STREAMS[sid]?.actions || []))];
    return { ok: true, stream: 'all', actions };
  }

  if (!STREAMS[id]) {
    return { ok: false, status: 400, message: 'Luồng nhật ký không hợp lệ.', code: 'INVALID_LOG_STREAM' };
  }

  if (!allowed.includes(id)) {
    return {
      ok: false,
      status: 403,
      message: 'Bạn không có quyền xem luồng nhật ký này.',
      code: 'LOG_STREAM_FORBIDDEN'
    };
  }

  return { ok: true, stream: id, actions: STREAMS[id].actions.slice() };
}

function streamsForRole(role) {
  const allowed = allowedStreamIds(role);
  const chips = [{ id: 'all', label: 'Tất cả' }];
  for (const sid of STREAM_ORDER) {
    if (sid === 'all') continue;
    if (allowed.includes(sid) && STREAMS[sid]) {
      chips.push({ id: sid, label: STREAMS[sid].label });
    }
  }
  return chips;
}

function actionOptionsForStream(streamId, role, labels = {}) {
  const resolved = resolveStreamActions(streamId, role);
  if (!resolved.ok) return [];
  return resolved.actions.map((action) => ({
    value: action,
    label: labels[action] || action
  }));
}

module.exports = {
  STREAMS,
  STREAM_ORDER,
  ROLE_STREAMS,
  allowedStreamIds,
  resolveStreamActions,
  streamsForRole,
  actionOptionsForStream
};
