// ============================================
// FILE: Place.js
// Place Registry — địa điểm ngoài đời (canonical outdoor)
// Building/Workspace gắn place_id; không chứa CAD/Floor/QR.
// ============================================

const mongoose = require('mongoose');
const { PLACE_STATUS_VALUES } = require('../utils/mapVisibility');
const {
  PLACE_OWNER_TYPES,
  PLACE_PUBLICATION_STATUS,
  slugifyPlaceName
} = require('../utils/placeRegistry');

const placeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  slug: {
    type: String,
    trim: true,
    maxlength: 100,
    default: ''
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

  /** Bán kính gợi ý outdoor / geofence Place (mét) — khác activation_radius Building */
  radius: {
    type: Number,
    default: 80,
    min: 10,
    max: 5000
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

  // GeoJSON Polygon (optional)
  boundary: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  owner_type: {
    type: String,
    enum: PLACE_OWNER_TYPES,
    default: 'UNCLAIMED'
  },

  publication_status: {
    type: String,
    enum: PLACE_PUBLICATION_STATUS,
    default: 'PUBLIC'
  },

  verified: {
    type: Boolean,
    default: false
  },

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

  /** Lifecycle nội bộ registry: DRAFT/ACTIVE/LOCKED/MERGED */
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
placeSchema.index({ slug: 1 }, { unique: true, sparse: true });
placeSchema.index({ latitude: 1, longitude: 1 });
placeSchema.index({ status: 1, verified: 1 });
placeSchema.index({ verification_status: 1, status: 1 });
placeSchema.index({ publication_status: 1, status: 1 });
placeSchema.index({ category: 1 });
placeSchema.index({ owner_org_id: 1 });
placeSchema.index({ owner_type: 1 });

placeSchema.pre('save', function normalizePlace() {
  if (Array.isArray(this.aliases)) {
    this.aliases = [...new Set(
      this.aliases
        .map((a) => String(a || '').trim())
        .filter(Boolean)
    )].slice(0, 30);
  }
  if (!this.slug || !String(this.slug).trim()) {
    this.slug = slugifyPlaceName(this.name);
  } else {
    this.slug = slugifyPlaceName(this.slug);
  }
  if (this.owner_org_id && this.owner_type === 'UNCLAIMED') {
    this.owner_type = 'ORGANIZATION';
  }
});

module.exports = mongoose.model('Place', placeSchema);
