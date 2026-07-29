/**
 * Phase 3 — Incident Management (Emergency Platform MVP).
 */
const mongoose = require('mongoose');

const INCIDENT_TYPES = ['FIRE', 'FLOOD', 'GAS', 'COLLAPSE', 'SMOKE', 'ELECTRIC', 'CROWD', 'EARTHQUAKE', 'OTHER'];
const INCIDENT_SCOPES = ['BUILDING', 'ORG', 'GEOFENCE'];
const INCIDENT_STATUSES = ['DRAFT', 'PENDING', 'ACTIVE', 'CONTAINED', 'RESOLVED', 'ARCHIVED'];

const incidentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: INCIDENT_TYPES,
    required: true
  },
  scope: {
    type: String,
    enum: INCIDENT_SCOPES,
    default: 'BUILDING'
  },
  title: { type: String, default: '', maxlength: 200 },
  description: { type: String, default: '', maxlength: 2000 },
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    default: null,
    index: true
  },
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },
  status: {
    type: String,
    enum: INCIDENT_STATUSES,
    default: 'DRAFT',
    index: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  activated_at: { type: Date, default: null },
  contained_at: { type: Date, default: null },
  resolved_at: { type: Date, default: null },
  archived_at: { type: Date, default: null },
  timeline: {
    type: [{
      status: String,
      at: Date,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      note: { type: String, default: '' }
    }],
    default: []
  },
  /** Nguồn tạo: manual | seismic_consensus | usgs | external */
  external_source: { type: String, default: '', maxlength: 32, index: true },
  /** Id sự kiện ngoài (vd. usgs:us7000xxx) — chống trùng. */
  external_event_id: { type: String, default: '', maxlength: 128, index: true },
  external_meta: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

incidentSchema.index({ organization_id: 1, status: 1, updatedAt: -1 });
incidentSchema.index({ building_id: 1, status: 1 });
incidentSchema.index({ external_event_id: 1, building_id: 1 });

module.exports = mongoose.model('Incident', incidentSchema);
module.exports.INCIDENT_TYPES = INCIDENT_TYPES;
module.exports.INCIDENT_SCOPES = INCIDENT_SCOPES;
module.exports.INCIDENT_STATUSES = INCIDENT_STATUSES;
