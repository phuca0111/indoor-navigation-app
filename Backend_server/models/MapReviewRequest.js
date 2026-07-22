// ============================================
// Map Governance P1 — Hàng đợi duyệt bản đồ cộng đồng
// ============================================

const mongoose = require('mongoose');

const mapReviewSchema = new mongoose.Schema({
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    required: true,
    index: true
  },
  place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    default: null,
    index: true
  },
  requested_visibility: {
    type: String,
    enum: ['COMMUNITY', 'OFFICIAL'],
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'MERGED'],
    default: 'PENDING',
    index: true
  },
  submitted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  note: {
    type: String,
    default: '',
    maxlength: 1000
  },
  reject_reason: {
    type: String,
    default: '',
    maxlength: 1000
  },
  // Merge stub (P2 sẽ mở rộng)
  merge_target_place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    default: null
  },
  decided_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

mapReviewSchema.index(
  { building_id: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);

module.exports = mongoose.model('MapReviewRequest', mapReviewSchema);
