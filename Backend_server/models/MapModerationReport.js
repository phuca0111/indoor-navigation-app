// ============================================
// Map Governance P3 — Báo cáo / kiểm duyệt
// ============================================

const mongoose = require('mongoose');

const mapModerationSchema = new mongoose.Schema({
  target_type: {
    type: String,
    enum: ['PLACE', 'BUILDING', 'USER'],
    required: true,
    index: true
  },
  target_id: {
    type: String,
    required: true,
    index: true
  },
  reason_code: {
    type: String,
    enum: ['SPAM', 'INAPPROPRIATE', 'DUPLICATE', 'COPYRIGHT', 'OTHER'],
    default: 'OTHER'
  },
  detail: {
    type: String,
    default: '',
    maxlength: 2000
  },
  status: {
    type: String,
    enum: ['OPEN', 'RESOLVED', 'DISMISSED'],
    default: 'OPEN',
    index: true
  },
  resolution: {
    type: String,
    enum: ['NONE', 'LOCK_PLACE', 'LOCK_BUILDING', 'BAN_USER', 'MERGE_HINT', 'WARN'],
    default: 'NONE'
  },
  reported_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolved_at: {
    type: Date,
    default: null
  },
  resolver_note: {
    type: String,
    default: '',
    maxlength: 1000
  }
}, { timestamps: true });

mapModerationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('MapModerationReport', mapModerationSchema);
