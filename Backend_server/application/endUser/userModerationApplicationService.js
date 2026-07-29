/**
 * P2.1 — Emergency consent + Warn/Ban trong User Detail (không redesign mapReputation).
 */
const User = require('../../models/User');
const { getUser, updateUser } = require('../identity/userApplicationService');
const activities = require('../../repositories/activityLogRepository');

const CONSENT_VERSION = 'v2';
const CONSENT_MODES = ['EMERGENCY_ONLY', 'ALERT_ONLY', 'ALWAYS_RESEARCH'];

/**
 * Spec D consent:
 * - mode EMERGENCY_ONLY (default): nhận cảnh báo + gửi vị trí chỉ khi ACTIVE
 * - mode ALERT_ONLY: nhận cảnh báo, không gửi vị trí (granted=false cho tracking)
 * - mode ALWAYS_RESEARCH: như EMERGENCY_ONLY ở MVP (tracking khi ACTIVE)
 * Body cũ { granted: boolean } vẫn hỗ trợ.
 */
async function setEmergencyConsent(userId, grantedOrBody, context = {}) {
  const body = typeof grantedOrBody === 'object' && grantedOrBody !== null
    ? grantedOrBody
    : { granted: grantedOrBody };

  let mode = String(body.mode || '').toUpperCase();
  if (!CONSENT_MODES.includes(mode)) {
    if (body.granted === false) mode = 'ALERT_ONLY';
    else mode = 'EMERGENCY_ONLY';
  }

  const allowsLocation = mode === 'EMERGENCY_ONLY' || mode === 'ALWAYS_RESEARCH';
  const nextGranted = body.granted != null ? Boolean(body.granted) && allowsLocation : allowsLocation;
  const now = new Date();
  const update = {
    'emergency_location_consent.granted': nextGranted,
    'emergency_location_consent.mode': mode,
    'emergency_location_consent.version': CONSENT_VERSION
  };
  if (nextGranted) {
    update['emergency_location_consent.granted_at'] = now;
    update['emergency_location_consent.revoked_at'] = null;
  } else {
    update['emergency_location_consent.revoked_at'] = now;
  }
  const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true })
    .select('emergency_location_consent email')
    .lean();
  if (!user) {
    throw Object.assign(new Error('Không tìm thấy người dùng.'), { status: 404, code: 'USER_NOT_FOUND' });
  }
  await activities.recordActivity({
    user_id: userId,
    action: 'EMERGENCY_CONSENT_UPDATE',
    target_type: 'user',
    target_id: String(userId),
    target: user.email || '',
    details: { granted: nextGranted, mode, version: CONSENT_VERSION },
    ip_address: context.ipAddress || ''
  }).catch(() => {});
  return { emergency_location_consent: user.emergency_location_consent };
}

async function getEmergencyConsent(userId) {
  const user = await User.findById(userId).select('emergency_location_consent').lean();
  if (!user) {
    throw Object.assign(new Error('Không tìm thấy người dùng.'), { status: 404, code: 'USER_NOT_FOUND' });
  }
  const c = user.emergency_location_consent || {};
  return {
    emergency_location_consent: {
      granted: Boolean(c.granted),
      mode: c.mode || (c.granted ? 'EMERGENCY_ONLY' : 'ALERT_ONLY'),
      granted_at: c.granted_at || null,
      revoked_at: c.revoked_at || null,
      version: c.version || CONSENT_VERSION
    }
  };
}

async function warnUser(userId, reason, context) {
  const principal = context.principal;
  await getUser(userId, principal);
  const text = String(reason || '').trim().slice(0, 500);
  if (!text) {
    throw Object.assign(new Error('reason bắt buộc.'), { status: 400, code: 'REASON_REQUIRED' });
  }
  const entry = {
    reason: text,
    created_at: new Date(),
    actor_user_id: principal.userId || null
  };
  const user = await User.findByIdAndUpdate(
    userId,
    { $push: { account_warnings: { $each: [entry], $slice: -50 } } },
    { new: true }
  ).select('email account_warnings is_active').lean();
  await activities.recordActivity({
    user_id: principal.userId,
    action: 'WARN_USER',
    target_type: 'user',
    target_id: String(userId),
    target: user.email,
    details: { reason: text },
    ip_address: context.ipAddress || '',
    organization_id: user.organization_id || undefined
  }).catch(() => {});
  return {
    warnings_count: (user.account_warnings || []).length,
    last_warning: entry
  };
}

async function banUserAccount(userId, reason, context) {
  const text = String(reason || '').trim().slice(0, 500);
  if (!text) {
    throw Object.assign(new Error('reason bắt buộc khi ban.'), { status: 400, code: 'REASON_REQUIRED' });
  }
  const user = await updateUser(userId, {
    is_active: false,
    account_ban_reason: text
  }, context);
  await activities.recordActivity({
    user_id: context.principal.userId,
    action: 'BAN_USER',
    target_type: 'user',
    target_id: String(userId),
    target: user.email,
    details: { reason: text },
    ip_address: context.ipAddress || '',
    organization_id: user.organization_id || undefined
  }).catch(() => {});
  return user;
}

async function unbanUserAccount(userId, context) {
  const user = await updateUser(userId, {
    is_active: true,
    account_ban_reason: ''
  }, context);
  await activities.recordActivity({
    user_id: context.principal.userId,
    action: 'UNBAN_USER',
    target_type: 'user',
    target_id: String(userId),
    target: user.email,
    details: {},
    ip_address: context.ipAddress || '',
    organization_id: user.organization_id || undefined
  }).catch(() => {});
  return user;
}

module.exports = {
  CONSENT_VERSION,
  setEmergencyConsent,
  getEmergencyConsent,
  warnUser,
  banUserAccount,
  unbanUserAccount
};
