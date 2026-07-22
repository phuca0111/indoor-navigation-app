// ============================================
// Map Governance P2 — Yêu cầu merge hai Place
// ============================================

const mongoose = require('mongoose');

const placeMergeSchema = new mongoose.Schema({
  source_place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    required: true,
    index: true
  },
  target_place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'],
    default: 'PENDING',
    index: true
  },
  similarity: {
    type: Number,
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
  merge_result: {
    type: mongoose.Schema.Types.Mixed,
    default: null
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
  decided_at: {
    type: Date,
    default: null
  }
}, { timestamps: true });

placeMergeSchema.index(
  { source_place_id: 1, target_place_id: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);

module.exports = mongoose.model('PlaceMergeRequest', placeMergeSchema);
