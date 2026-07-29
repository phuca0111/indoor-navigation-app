const mongoose = require('mongoose');

const notificationDeliverySchema = new mongoose.Schema(
  {
    notification_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      required: true,
      index: true
    },
    channel: {
      type: String,
      enum: ['IN_APP', 'EMAIL', 'PUSH', 'SMS'],
      required: true
    },
    event_id: { type: String, default: '', index: true },
    category: { type: String, default: 'GENERAL', index: true },
    recipient: { type: String, default: '', index: true },
    provider: { type: String, default: '' },
    idempotency_key: { type: String, default: '', index: true },
    delivery_semantics: {
      type: String,
      enum: ['EXACTLY_ONCE_PROVIDER', 'AT_LEAST_ONCE'],
      default: 'AT_LEAST_ONCE'
    },
    template_key: { type: String, default: '' },
    rendered_payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    provider_message_id: { type: String, default: '' },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'DEFERRED', 'RETRY', 'FAILED', 'SENT', 'DEAD'],
      default: 'PENDING',
      index: true
    },
    attempts: { type: Number, default: 0 },
    available_at: { type: Date, default: Date.now, index: true },
    lease_owner: { type: String, default: null, index: true },
    lease_expires_at: { type: Date, default: null, index: true },
    sent_at: { type: Date, default: null },
    dead_lettered_at: { type: Date, default: null },
    last_error: { type: String, default: '' },
    last_error_class: { type: String, default: '' }
  },
  { timestamps: true }
);

// Unique theo (notification, channel, recipient) — cho phép nhiều PUSH cùng notification (nhiều FCM token).
notificationDeliverySchema.index(
  { notification_id: 1, channel: 1, recipient: 1 },
  { unique: true }
);
notificationDeliverySchema.index({ status: 1, available_at: 1, lease_expires_at: 1 });
notificationDeliverySchema.index({ event_id: 1, recipient: 1, channel: 1 });
notificationDeliverySchema.index(
  { provider: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $gt: '' } } }
);

const NotificationDelivery = mongoose.model('NotificationDelivery', notificationDeliverySchema);

/**
 * Bỏ index cũ notification_id+channel (chặn multi-device PUSH).
 * Gọi một lần khi server boot.
 */
async function ensureDeliveryIndexes() {
  try {
    const indexes = await NotificationDelivery.collection.indexes();
    const obsolete = indexes.find(
      (idx) =>
        idx.name === 'notification_id_1_channel_1' ||
        (idx.unique &&
          idx.key &&
          Object.keys(idx.key).length === 2 &&
          idx.key.notification_id === 1 &&
          idx.key.channel === 1 &&
          idx.key.recipient == null)
    );
    if (obsolete) {
      await NotificationDelivery.collection.dropIndex(obsolete.name);
      console.log(`[NotificationDelivery] dropped obsolete index ${obsolete.name}`);
    }
    await NotificationDelivery.syncIndexes();
  } catch (err) {
    console.warn('[NotificationDelivery] ensureDeliveryIndexes:', err.message);
  }
}

module.exports = NotificationDelivery;
module.exports.ensureDeliveryIndexes = ensureDeliveryIndexes;
