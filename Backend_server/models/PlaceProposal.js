// ============================================
// Place Proposal — đề xuất địa điểm (PHASE 2)
// User không tạo Place trực tiếp → Proposal → Validation → Moderation → Place
// ============================================

const mongoose = require('mongoose');

const PROPOSAL_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'DUPLICATE'];

const placeProposalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  latitude: {
    type: Number,
    required: true
  },

  longitude: {
    type: Number,
    required: true
  },

  address: {
    type: String,
    default: '',
    maxlength: 500
  },

  category: {
    type: String,
    default: '',
    maxlength: 80
  },

  description: {
    type: String,
    default: '',
    maxlength: 2000
  },

  image_url: {
    type: String,
    default: '',
    maxlength: 500
  },

  source: {
    type: String,
    default: '',
    maxlength: 200
  },

  status: {
    type: String,
    enum: PROPOSAL_STATUS,
    default: 'PENDING',
    index: true
  },

  submitted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Validation snapshot (rule engine)
  duplicate_score: {
    type: Number,
    default: 0
  },

  risk_score: {
    type: Number,
    default: 0
  },

  validation: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // Top duplicate Place (nếu có)
  duplicate_place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    default: null
  },

  // Place sinh ra khi approve
  place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    default: null
  },

  reviewer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
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
}, {
  timestamps: true
});

placeProposalSchema.index({ status: 1, createdAt: -1 });
placeProposalSchema.index({ name: 1, latitude: 1, longitude: 1 });

module.exports = mongoose.model('PlaceProposal', placeProposalSchema);
module.exports.PROPOSAL_STATUS = PROPOSAL_STATUS;
