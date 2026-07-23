// ============================================
// Indoor Workspace — PHASE 3 Business Flow
// Place (0..n) → Workspace → Building (kỹ thuật / Editor)
// Transition: Building ≈ Workspace (1:1 legacy)
// ============================================

const mongoose = require('mongoose');

const WORKSPACE_KINDS = ['COMMUNITY', 'OFFICIAL', 'ORG', 'PERSONAL', 'EXPERIMENTAL'];
const WORKSPACE_STATUS = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

const indoorWorkspaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  description: {
    type: String,
    default: '',
    maxlength: 2000
  },

  kind: {
    type: String,
    enum: WORKSPACE_KINDS,
    default: 'COMMUNITY',
    index: true
  },

  status: {
    type: String,
    enum: WORKSPACE_STATUS,
    default: 'DRAFT',
    index: true
  },

  place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    required: true,
    index: true
  },

  /** Building kỹ thuật (Editor/CAD) — 1:1 trong giai đoạn chuyển tiếp */
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    required: true,
    unique: true,
    index: true
  },

  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },

  owner_user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },

  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  /** Workspace được chọn là bản current published cho Place (sau này) */
  is_current_published: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

indoorWorkspaceSchema.index({ place_id: 1, kind: 1 });

module.exports = mongoose.model('IndoorWorkspace', indoorWorkspaceSchema);
module.exports.WORKSPACE_KINDS = WORKSPACE_KINDS;
module.exports.WORKSPACE_STATUS = WORKSPACE_STATUS;
