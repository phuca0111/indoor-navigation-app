// C4 — Telemetry events (web ingest; không phụ thuộc Android)
const mongoose = require('mongoose');

const EVENT_TYPES = [
  'session_start',
  'nav_complete',
  'map_view',
  'trial_started',
  'checkout_started',
  'payment_captured',
  'subscription_activated',
  'first_map_published',
  'first_navigation_completed'
];

const telemetryEventSchema = new mongoose.Schema(
  {
    event_id: { type: String, default: undefined },
    event_type: {
      type: String,
      enum: EVENT_TYPES,
      required: true,
      index: true
    },
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true
    },
    building_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      default: null,
      index: true
    },
    session_id: {
      type: String,
      default: '',
      trim: true,
      index: true
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    occurred_at: {
      type: Date,
      default: Date.now,
      index: true
    },
    meta: {
      type: Object,
      default: {}
    }
  },
  { timestamps: true }
);

telemetryEventSchema.index({ event_type: 1, occurred_at: -1 });
telemetryEventSchema.index({ building_id: 1, occurred_at: -1 });
telemetryEventSchema.index({ organization_id: 1, event_type: 1, occurred_at: -1 });
telemetryEventSchema.index(
  { event_id: 1 },
  { unique: true, partialFilterExpression: { event_id: { $type: 'string' } } }
);

module.exports = mongoose.model('TelemetryEvent', telemetryEventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
