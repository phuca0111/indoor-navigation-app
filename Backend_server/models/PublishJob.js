// ============================================
// FILE: PublishJob.js
// Phase 2c — Job xuất bản bản đồ bất đồng bộ
// ============================================

const mongoose = require('mongoose');

const publishJobSchema = new mongoose.Schema({
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    required: true,
    index: true
  },
  floor_number: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED'],
    default: 'QUEUED',
    index: true
  },
  requested_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  edit_session_id: {
    type: String,
    default: ''
  },
  lock_fencing_token: {
    type: Number,
    default: null
  },
  idempotency_key: {
    type: String,
    default: null
  },
  /** snapshot map_data lúc enqueue (không phụ thuộc draft đổi giữa chừng) */
  map_data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  version: {
    type: Number,
    default: null
  },
  floor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Floor',
    default: null
  },
  error: {
    code: { type: String, default: null },
    message: { type: String, default: null },
    details: { type: [mongoose.Schema.Types.Mixed], default: [] }
  },
  attempts: { type: Number, default: 0 },
  max_attempts: { type: Number, default: 5 },
  fencing_token: { type: Number, default: 0 },
  lease_owner: { type: String, default: null, index: true },
  lease_expires_at: { type: Date, default: null, index: true },
  last_error_at: { type: Date, default: null },
  queue_backend: { type: String, default: 'memory' },
  dead_lettered_at: { type: Date, default: null },
  started_at: { type: Date, default: null },
  finished_at: { type: Date, default: null }
}, {
  timestamps: true,
  collection: 'publish_jobs'
});

publishJobSchema.index(
  { requested_by: 1, idempotency_key: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotency_key: { $type: 'string' } }
  }
);

module.exports = mongoose.model('PublishJob', publishJobSchema);
