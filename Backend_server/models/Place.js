// ============================================
// FILE: Place.js
// Map Governance P0 — Địa điểm vật lý (canonical root)
// Building gắn place_id; Personal/Org là ownership trên Building.
// ============================================

const mongoose = require('mongoose');
const { PLACE_STATUS_VALUES } = require('../utils/mapVisibility');

const placeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  aliases: {
    type: [String],
    default: []
  },

  latitude: {
    type: Number,
    default: 0
  },

  longitude: {
    type: Number,
    default: 0
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

  // GeoJSON Polygon (optional) — { type: 'Polygon', coordinates: [[[lng,lat],...]] }
  boundary: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  verified: {
    type: Boolean,
    default: false
  },

  // P4 — workflow xác minh Place
  verification_status: {
    type: String,
    enum: ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'],
    default: 'UNVERIFIED'
  },

  verification_note: {
    type: String,
    default: '',
    maxlength: 1000
  },

  verified_at: {
    type: Date,
    default: null
  },

  verified_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  owner_org_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },

  status: {
    type: String,
    enum: PLACE_STATUS_VALUES,
    default: 'ACTIVE'
  },

  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  notes: {
    type: String,
    default: '',
    maxlength: 1000
  }
}, {
  timestamps: true
});

placeSchema.index({ name: 'text', aliases: 'text', address: 'text' });
placeSchema.index({ latitude: 1, longitude: 1 });
placeSchema.index({ status: 1, verified: 1 });
placeSchema.index({ verification_status: 1, status: 1 });
placeSchema.index({ category: 1 });
placeSchema.index({ owner_org_id: 1 });

placeSchema.pre('save', function normalizeAliases() {
  if (Array.isArray(this.aliases)) {
    this.aliases = [...new Set(
      this.aliases
        .map((a) => String(a || '').trim())
        .filter(Boolean)
    )].slice(0, 30);
  }
});

module.exports = mongoose.model('Place', placeSchema);
