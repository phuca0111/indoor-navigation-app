// ============================================
// Map Governance P2 — Claim / Change / Transfer ownership Place
// ============================================

const mongoose = require('mongoose');

const placeOwnershipSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['CLAIM', 'CHANGE', 'TRANSFER'],
    required: true,
    index: true
  },
  place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    required: true,
    index: true
  },
  // Org xin quyền sở hữu / nhận transfer
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },
  // Transfer: org hiện tại (nếu có)
  from_organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  // CHANGE: các field đề xuất (name, aliases, latitude, longitude, address, category, notes)
  proposed_changes: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
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
  decided_at: {
    type: Date,
    default: null
  }
}, { timestamps: true });

placeOwnershipSchema.index(
  { place_id: 1, type: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING', type: 'CLAIM' } }
);

module.exports = mongoose.model('PlaceOwnershipRequest', placeOwnershipSchema);
