const mongoose = require('mongoose');

const domainEventSchema = new mongoose.Schema(
  {
    event_id: { type: String, required: true, unique: true, index: true },
    event_key: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, index: true },
    schema_version: { type: Number, required: true, min: 1, default: 1 },
    correlation_id: { type: String, required: true, index: true },
    causation_id: { type: String, default: null, index: true },
    occurred_at: { type: Date, required: true, default: Date.now, index: true },
    aggregate_type: { type: String, required: true, index: true },
    aggregate_id: { type: String, required: true, index: true },
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true
    },
    actor_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    payload: { type: Object, default: {} },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'RETRY', 'DEAD'],
      default: 'PENDING',
      index: true
    },
    attempts: { type: Number, default: 0 },
    available_at: { type: Date, default: Date.now, index: true },
    locked_at: { type: Date, default: null },
    lease_owner: { type: String, default: null, index: true },
    lease_expires_at: { type: Date, default: null, index: true },
    processed_at: { type: Date, default: null },
    dead_lettered_at: { type: Date, default: null },
    replay_count: { type: Number, default: 0 },
    replay_history: [{
      actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reason: { type: String, default: '' },
      at: { type: Date, default: Date.now }
    }],
    last_error: { type: String, default: '' },
    last_error_class: { type: String, default: '' }
  },
  { timestamps: true, collection: 'domain_events' }
);

domainEventSchema.index({ status: 1, available_at: 1, createdAt: 1 });
domainEventSchema.index({ organization_id: 1, occurred_at: -1 });

module.exports = mongoose.model('DomainEvent', domainEventSchema);
