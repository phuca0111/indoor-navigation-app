// GĐ3 — Place Proposal (Community). Approve → sinh Place.
const mongoose = require('mongoose');
const {
  PROPOSAL_STATUS,
  PROPOSAL_STATUS_VALUES,
  VALIDATION_RISK,
  MODERATION_ROUTE
} = require('../utils/placePlatform');

const placeProposalSchema = new mongoose.Schema({
  proposed_name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  category: { type: String, default: '', maxlength: 80 },
  address: { type: String, default: '', maxlength: 500 },
  description: { type: String, default: '', maxlength: 2000 },
  photos: { type: [String], default: [] },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: PROPOSAL_STATUS_VALUES,
    default: PROPOSAL_STATUS.SUBMITTED,
    index: true
  },
  validation_snapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  risk: {
    type: String,
    enum: Object.values(VALIDATION_RISK),
    default: VALIDATION_RISK.LOW,
    index: true
  },
  route_hint: {
    type: String,
    enum: Object.values(MODERATION_ROUTE),
    default: MODERATION_ROUTE.MAP_MOD,
    index: true
  },
  resulting_place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    default: null
  },
  reviewer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reject_reason: { type: String, default: '', maxlength: 1000 },
  decided_at: { type: Date, default: null },
  escalated: { type: Boolean, default: false, index: true }
}, { timestamps: true });

placeProposalSchema.index({ status: 1, createdAt: -1 });
placeProposalSchema.index({ risk: 1, status: 1 });

module.exports = mongoose.model('PlaceProposal', placeProposalSchema);
