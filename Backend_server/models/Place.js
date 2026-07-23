// ============================================
// FILE: Place.js
// Map Governance P0 — Địa điểm vật lý (canonical root)
// Building gắn place_id; Personal/Org là ownership trên Building.
// ============================================

const mongoose = require('mongoose');
const { PLACE_STATUS_VALUES } = require('../utils/mapVisibility');
const {
  PUBLICATION_STATUS_VALUES,
  OWNER_TYPE_VALUES,
  VERIFICATION_STATUS_VALUES,
  PUBLICATION_STATUS,
  OWNER_TYPE,
  publicationFromLegacyStatus,
  legacyStatusFromPublication,
  deriveOwnerType
} = require('../utils/placePlatform');

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

  // P4 + kiến trúc Place — verification tách khỏi publish
  verification_status: {
    type: String,
    enum: VERIFICATION_STATUS_VALUES,
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

  // GĐ1 — ownership kiến trúc (UNCLAIMED | COMMUNITY | ORGANIZATION | SYSTEM)
  owner_type: {
    type: String,
    enum: OWNER_TYPE_VALUES,
    default: OWNER_TYPE.UNCLAIMED,
    index: true
  },

  // Legacy governance: DRAFT | ACTIVE | LOCKED | MERGED
  status: {
    type: String,
    enum: PLACE_STATUS_VALUES,
    default: 'ACTIVE'
  },

  // GĐ1 — publication kiến trúc (song song legacy status)
  publication_status: {
    type: String,
    enum: PUBLICATION_STATUS_VALUES,
    default: PUBLICATION_STATUS.DRAFT,
    index: true
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
  },

  // GĐ7 — Indoor Workspace đang publish mặc định (Building id)
  current_published_building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    default: null
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
placeSchema.index({ publication_status: 1, owner_type: 1 });

placeSchema.pre('save', function normalizePlacePlatformFields() {
  if (Array.isArray(this.aliases)) {
    this.aliases = [...new Set(
      this.aliases
        .map((a) => String(a || '').trim())
        .filter(Boolean)
    )].slice(0, 30);
  }

  // Đồng bộ 2 chiều tối thiểu: publication ↔ legacy status khi một bên đổi
  if (this.isModified('publication_status') && !this.isModified('status')) {
    this.status = legacyStatusFromPublication(this.publication_status);
  } else if (this.isNew && !this.publication_status) {
    this.publication_status = publicationFromLegacyStatus(this.status);
  } else if (this.isModified('status') && !this.isModified('publication_status')) {
    this.publication_status = publicationFromLegacyStatus(this.status);
  } else if (this.isNew) {
    if (!this.publication_status || this.publication_status === PUBLICATION_STATUS.DRAFT) {
      if (this.status && this.status !== 'DRAFT') {
        this.publication_status = publicationFromLegacyStatus(this.status);
      }
    }
  }

  this.owner_type = deriveOwnerType({
    owner_type: this.owner_type,
    owner_org_id: this.owner_org_id
  });
});

module.exports = mongoose.model('Place', placeSchema);
