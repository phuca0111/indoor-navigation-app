const NotificationDelivery = require('../models/NotificationDelivery');
const NotificationPreference = require('../models/NotificationPreference');
const NotificationTemplate = require('../models/NotificationTemplate');
const { getTransporter } = require('./mailService');

const MAX_ATTEMPTS = Math.max(1, Number(process.env.NOTIFICATION_MAX_ATTEMPTS) || 8);
const LEASE_MS = Math.max(30_000, Number(process.env.NOTIFICATION_LEASE_MS) || 120_000);
const SECURITY_CATEGORIES = new Set(['SECURITY', 'AUTH_SECURITY', 'ACCOUNT_SECURITY']);
const adapters = new Map();

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /password|secret|token|otp|authorization/i.test(key) ? '[REDACTED]' : redact(item)
  ]));
}

function render(text, data = {}) {
  return String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = path.split('.').reduce((current, key) => current?.[key], data);
    return value == null ? '' : String(value);
  });
}

async function enabledChannels(userId, category, requested, securityOverride = false) {
  const channels = requested?.length ? requested : ['IN_APP'];
  if (securityOverride || SECURITY_CATEGORIES.has(String(category).toUpperCase())) {
    return [...new Set(['IN_APP', ...channels])];
  }
  const preference = await NotificationPreference.findOne({
    user_id: userId,
    category: String(category || 'GENERAL').toUpperCase()
  }).lean();
  if (!preference) return channels;
  return channels.filter((channel) => preference.channels?.[channel] !== false);
}

async function enqueueForNotification(notification, input = {}) {
  const category = String(input.category || input.type || 'GENERAL').toUpperCase();
  const channels = await enabledChannels(
    notification.user_id,
    category,
    input.channels,
    input.security_override
  );
  const deliveries = [];
  for (const channel of channels) {
    const template = input.template_key
      ? await NotificationTemplate.findOne({
          key: String(input.template_key).toUpperCase(),
          channel,
          locale: String(input.locale || 'vi').toLowerCase(),
          enabled: true
        }).lean()
      : null;
    const renderData = {
      ...(notification.data || {}),
      ...(input.render_data || {})
    };
    const renderedPayload = template
      ? {
          subject: render(template.subject, renderData),
          body: render(template.body, renderData),
          data: notification.data || {}
        }
      : input.rendered_payload || {
          subject: notification.title,
          body: notification.body,
          data: notification.data
        };
    const recipient = channel === 'EMAIL'
      ? String(input.email || '')
      : channel === 'SMS'
        ? String(input.phone || '')
        : channel === 'PUSH'
          ? String(input.device_token || '')
          : String(notification.user_id);
    const delivery = await NotificationDelivery.findOneAndUpdate(
      { notification_id: notification._id, channel },
      {
        $setOnInsert: {
          event_id: input.event_id || notification.event_id || '',
          category,
          recipient,
          provider: input.provider || channel,
          template_key: input.template_key || '',
          rendered_payload: redact(renderedPayload),
          status: 'PENDING',
          attempts: 0,
          sent_at: null
        }
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    deliveries.push(delivery);
  }
  return deliveries;
}

async function claimNext(owner = `notification-worker:${process.pid}`) {
  const now = new Date();
  return NotificationDelivery.findOneAndUpdate(
    {
      status: { $in: ['PENDING', 'RETRY', 'FAILED', 'DEFERRED', 'PROCESSING'] },
      available_at: { $lte: now },
      $or: [
        { lease_expires_at: null },
        { lease_expires_at: { $lte: now } }
      ]
    },
    {
      $set: {
        status: 'PROCESSING',
        lease_owner: owner,
        lease_expires_at: new Date(Date.now() + LEASE_MS)
      },
      $inc: { attempts: 1 }
    },
    { sort: { available_at: 1, createdAt: 1 }, returnDocument: 'after' }
  );
}

async function smtpAdapter(delivery) {
  if (!delivery.recipient) return { deferred: true, reason: 'RECIPIENT_MISSING' };
  const transporter = getTransporter();
  if (!transporter) return { deferred: true, reason: 'SMTP_CREDENTIALS_MISSING' };
  const payload = delivery.rendered_payload || {};
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: delivery.recipient,
    subject: payload.subject || 'Thông báo',
    text: payload.body || '',
    html: payload.html || undefined
  });
  return { provider_message_id: info?.messageId || '' };
}

async function credentialAdapter(channel, delivery) {
  const configured = channel === 'PUSH'
    ? Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_SERVICE_ACCOUNT_JSON)
    : Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_API_KEY);
  return {
    deferred: true,
    reason: configured ? `${channel}_ADAPTER_READY` : `${channel}_CREDENTIALS_MISSING`,
    recipient_present: Boolean(delivery.recipient)
  };
}

adapters.set('IN_APP', async () => ({ provider_message_id: '' }));
adapters.set('EMAIL', smtpAdapter);
adapters.set('PUSH', (delivery) => credentialAdapter('PUSH', delivery));
adapters.set('SMS', (delivery) => credentialAdapter('SMS', delivery));

async function processDelivery(delivery) {
  const adapter = adapters.get(delivery.channel);
  try {
    const result = adapter
      ? await adapter(delivery)
      : { deferred: true, reason: 'PROVIDER_NOT_CONFIGURED' };
    delivery.lease_owner = null;
    delivery.lease_expires_at = null;
    if (result.deferred) {
      delivery.status = 'DEFERRED';
      delivery.available_at = new Date(Date.now() + 15 * 60_000);
      delivery.last_error = result.reason;
      delivery.last_error_class = 'ProviderDeferred';
    } else {
      delivery.status = 'SENT';
      delivery.sent_at = new Date();
      delivery.provider_message_id = result.provider_message_id || '';
      delivery.last_error = '';
      delivery.last_error_class = '';
    }
    await delivery.save();
    return delivery;
  } catch (error) {
    const dead = Number(delivery.attempts || 0) >= MAX_ATTEMPTS;
    delivery.status = dead ? 'DEAD' : 'RETRY';
    delivery.dead_lettered_at = dead ? new Date() : null;
    delivery.available_at = new Date(
      Date.now() + Math.min(15 * 60_000, 1000 * 2 ** Number(delivery.attempts || 1))
    );
    delivery.lease_owner = null;
    delivery.lease_expires_at = null;
    delivery.last_error = String(error.message || error).slice(0, 1000);
    delivery.last_error_class = String(error.name || 'Error').slice(0, 120);
    await delivery.save();
    return delivery;
  }
}

async function processPending(limit = 20, owner) {
  let processed = 0;
  while (processed < Math.min(100, Math.max(1, Number(limit) || 20))) {
    const delivery = await claimNext(owner);
    if (!delivery) break;
    await processDelivery(delivery);
    processed += 1;
  }
  return { processed };
}

function setAdapterForTests(channel, adapter) {
  if (adapter) adapters.set(channel, adapter);
  else adapters.delete(channel);
}

module.exports = {
  redact,
  render,
  enabledChannels,
  enqueueForNotification,
  claimNext,
  processDelivery,
  processPending,
  setAdapterForTests,
  NotificationTemplate
};
