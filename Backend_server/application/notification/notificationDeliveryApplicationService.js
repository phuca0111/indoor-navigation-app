const crypto = require('crypto');
const notificationRepository = require('../../repositories/notificationRepository');
const { getTransporter } = require('../../services/mailService');

const adapters = new Map();
const MAX_ATTEMPTS = Math.max(1, Number(process.env.NOTIFICATION_MAX_ATTEMPTS) || 8);
const LEASE_MS = Math.max(30_000, Number(process.env.NOTIFICATION_LEASE_MS) || 120_000);
const SECURITY_CATEGORIES = new Set(['SECURITY', 'AUTH_SECURITY', 'ACCOUNT_SECURITY']);

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
  const preference = await notificationRepository.findPreference(
    userId,
    String(category || 'GENERAL').toUpperCase()
  );
  if (!preference) return channels;
  return channels.filter((channel) => preference.channels?.[channel] !== false);
}

function idempotencyKey(notification, channel) {
  return crypto.createHash('sha256')
    .update(`${notification._id}:${channel}`)
    .digest('hex');
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
      ? await notificationRepository.findTemplate({
          key: String(input.template_key).toUpperCase(),
          channel,
          locale: String(input.locale || 'vi').toLowerCase(),
          enabled: true
        })
      : null;
    const data = { ...(notification.data || {}), ...(input.render_data || {}) };
    const payload = template ? {
      subject: render(template.subject, data),
      body: render(template.body, data),
      data: notification.data || {}
    } : (input.rendered_payload || {
      subject: notification.title,
      body: notification.body,
      data: notification.data
    });
    const recipient = channel === 'EMAIL'
      ? String(input.email || '')
      : channel === 'SMS'
        ? String(input.phone || '')
        : channel === 'PUSH'
          ? String(input.device_token || '')
          : String(notification.user_id);
    deliveries.push(await notificationRepository.upsertDelivery(
      notification._id,
      channel,
      {
        event_id: input.event_id || notification.event_id || '',
        category,
        recipient,
        provider: String(input.provider || channel),
        idempotency_key: idempotencyKey(notification, channel),
        template_key: input.template_key || '',
        rendered_payload: redact(payload),
        status: 'PENDING',
        attempts: 0,
        sent_at: null
      }
    ));
  }
  return deliveries;
}

function registerAdapter(channel, adapter, capabilities = {}) {
  if (typeof adapter !== 'function') throw new TypeError('Notification adapter phải là hàm.');
  adapters.set(channel, {
    send: adapter,
    capabilities: {
      idempotency: Boolean(capabilities.idempotency),
      html: Boolean(capabilities.html),
      maxPayloadBytes: Number(capabilities.maxPayloadBytes) || 256 * 1024
    }
  });
}

function providerCapabilities(channel) {
  return adapters.get(channel)?.capabilities || null;
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
    html: payload.html || undefined,
    headers: { 'X-Idempotency-Key': delivery.idempotency_key }
  });
  return { provider_message_id: info?.messageId || '' };
}

async function deferredCredential(channel, delivery) {
  const configured = channel === 'PUSH'
    ? Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_SERVICE_ACCOUNT_JSON)
    : Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_API_KEY);
  return {
    deferred: true,
    reason: configured ? `${channel}_ADAPTER_NOT_INSTALLED` : `${channel}_CREDENTIALS_MISSING`,
    recipient_present: Boolean(delivery.recipient)
  };
}

registerAdapter('IN_APP', async () => ({ provider_message_id: '' }), { idempotency: true });
registerAdapter('EMAIL', smtpAdapter, { idempotency: false, html: true });
registerAdapter('PUSH', (delivery) => deferredCredential('PUSH', delivery), { idempotency: true });
registerAdapter('SMS', (delivery) => deferredCredential('SMS', delivery), { idempotency: true });

async function claimNext(owner = `notification-worker:${process.pid}`) {
  const now = new Date();
  return notificationRepository.claimDelivery(
    owner,
    now,
    new Date(now.getTime() + LEASE_MS)
  );
}

async function processDelivery(delivery, owner = delivery.lease_owner) {
  const registration = adapters.get(delivery.channel);
  const semantics = registration?.capabilities.idempotency
    ? 'EXACTLY_ONCE_PROVIDER'
    : 'AT_LEAST_ONCE';
  try {
    const result = registration
      ? await registration.send(delivery, {
          idempotencyKey: delivery.idempotency_key,
          capabilities: registration.capabilities
        })
      : { deferred: true, reason: 'PROVIDER_NOT_CONFIGURED' };
    const update = result.deferred ? {
      $set: {
        status: 'DEFERRED',
        available_at: new Date(Date.now() + 15 * 60_000),
        lease_owner: null,
        lease_expires_at: null,
        last_error: result.reason,
        last_error_class: 'ProviderDeferred',
        delivery_semantics: semantics
      }
    } : {
      $set: {
        status: 'SENT',
        sent_at: new Date(),
        provider_message_id: result.provider_message_id || '',
        lease_owner: null,
        lease_expires_at: null,
        last_error: '',
        last_error_class: '',
        delivery_semantics: semantics
      }
    };
    const saved = await notificationRepository.completeDelivery(delivery._id, owner, update);
    if (!saved) throw Object.assign(new Error('Notification delivery lease đã mất.'), {
      code: 'NOTIFICATION_LEASE_LOST'
    });
    return saved;
  } catch (cause) {
    if (cause.code === 'NOTIFICATION_LEASE_LOST') throw cause;
    const dead = Number(delivery.attempts || 0) >= MAX_ATTEMPTS;
    return notificationRepository.completeDelivery(delivery._id, owner, {
      $set: {
        status: dead ? 'DEAD' : 'RETRY',
        dead_lettered_at: dead ? new Date() : null,
        available_at: new Date(
          Date.now() + Math.min(15 * 60_000, 1000 * 2 ** Number(delivery.attempts || 1))
        ),
        lease_owner: null,
        lease_expires_at: null,
        last_error: String(cause.message || cause).slice(0, 1000),
        last_error_class: String(cause.name || 'Error').slice(0, 120),
        delivery_semantics: semantics
      }
    });
  }
}

async function processPending(limit = 20, owner = `notification-worker:${process.pid}`) {
  let processed = 0;
  while (processed < Math.min(100, Math.max(1, Number(limit) || 20))) {
    const delivery = await claimNext(owner);
    if (!delivery) break;
    await processDelivery(delivery, owner);
    processed += 1;
  }
  return { processed };
}

function setAdapterForTests(channel, adapter, capabilities = {}) {
  if (adapter) registerAdapter(channel, adapter, capabilities);
  else adapters.delete(channel);
}

module.exports = {
  redact,
  render,
  enabledChannels,
  enqueueForNotification,
  registerAdapter,
  providerCapabilities,
  claimNext,
  processDelivery,
  processPending,
  setAdapterForTests
};
