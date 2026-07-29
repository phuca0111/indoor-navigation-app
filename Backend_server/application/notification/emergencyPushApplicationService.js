/**
 * P2.3 — Emergency push foundation (template + test send + preference).
 */
const NotificationTemplate = require('../../models/NotificationTemplate');
const notificationRepository = require('../../repositories/notificationRepository');
const notificationApplication = require('./notificationApplicationService');

const TEMPLATE_KEY = 'EMERGENCY_BROADCAST';
const CATEGORY = 'EMERGENCY';

const SEED_TEMPLATES = [
  {
    key: TEMPLATE_KEY,
    channel: 'IN_APP',
    locale: 'vi',
    subject: '{{title}}',
    body: '{{body}}'
  },
  {
    key: TEMPLATE_KEY,
    channel: 'PUSH',
    locale: 'vi',
    subject: '{{title}}',
    body: '{{body}}'
  }
];

async function ensureEmergencyBroadcastTemplates() {
  const templates = [];
  for (const tpl of SEED_TEMPLATES) {
    const doc = await NotificationTemplate.findOneAndUpdate(
      { key: tpl.key, channel: tpl.channel, locale: tpl.locale },
      { $setOnInsert: { ...tpl, enabled: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    templates.push(doc);
  }
  return templates;
}

async function isEmergencyPushEnabled(userId) {
  return notificationRepository.isEmergencyPushEnabled(userId);
}

async function sendTestEmergencyPush(userId, renderData = {}) {
  await ensureEmergencyBroadcastTemplates();
  const pushEnabled = await isEmergencyPushEnabled(userId);
  const tokens = await notificationRepository.findActiveFcmTokens(userId);
  const data = {
    title: renderData.title || 'Kiểm tra thông báo khẩn cấp',
    body: renderData.body || 'Đây là push thử nghiệm Phase 2.3.',
    incident_type: renderData.incident_type || 'TEST',
    building_name: renderData.building_name || 'Demo'
  };
  const channels = ['IN_APP'];
  if (pushEnabled && tokens.length) channels.push('PUSH');

  const notifications = await notificationApplication.createForUsers([userId], {
    type: CATEGORY,
    category: CATEGORY,
    template_key: TEMPLATE_KEY,
    title: data.title,
    body: data.body,
    severity: 'warning',
    channels,
    device_tokens: tokens,
    render_data: data,
    dedupe_key: `emergency-test:${userId}:${Date.now()}`
  });

  return {
    notification_ids: notifications.map((row) => String(row._id)),
    push_enabled: pushEnabled,
    device_count: tokens.length,
    channels
  };
}

module.exports = {
  TEMPLATE_KEY,
  CATEGORY,
  ensureEmergencyBroadcastTemplates,
  isEmergencyPushEnabled,
  sendTestEmergencyPush
};
