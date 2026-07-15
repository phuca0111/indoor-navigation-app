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
  started_at: { type: Date, default: null },
  finished_at: { type: Date, default: null }
}, {
  timestamps: true,
  collection: 'publish_jobs'
});

module.exports = mongoose.model('PublishJob', publishJobSchema);
