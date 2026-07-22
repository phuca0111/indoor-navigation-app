const mongoose = require('mongoose');

const eventDeliverySchema = new mongoose.Schema(
  {
    event_id: { type: String, required: true, index: true },
    handler: { type: String, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'RETRY', 'FAILED', 'DELIVERED', 'DEAD'],
      default: 'PENDING',
      index: true
    },
    attempts: { type: Number, default: 0 },
    available_at: { type: Date, default: Date.now, index: true },
    lease_owner: { type: String, default: null, index: true },
    lease_expires_at: { type: Date, default: null, index: true },
    delivered_at: { type: Date, default: null },
    dead_lettered_at: { type: Date, default: null },
    replay_count: { type: Number, default: 0 },
    last_error: { type: String, default: '' },
    last_error_class: { type: String, default: '' }
  },
  { timestamps: true, collection: 'event_deliveries' }
);

eventDeliverySchema.index({ event_id: 1, handler: 1 }, { unique: true });
eventDeliverySchema.index({ status: 1, available_at: 1, lease_expires_at: 1 });

module.exports = mongoose.model('EventDelivery', eventDeliverySchema);
