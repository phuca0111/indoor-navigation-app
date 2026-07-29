/**
 * Phase 3 — Hazard Zone (polygon/floor, gắn incident).
 */
const mongoose = require('mongoose');

const HAZARD_TYPES = ['FIRE', 'FLOOD', 'GAS', 'COLLAPSE', 'SMOKE', 'ELECTRIC', 'CROWD', 'EARTHQUAKE', 'OTHER'];

const hazardZoneSchema = new mongoose.Schema({
  incident_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Incident',
    required: true,
    index: true
  },
  hazard_type: {
    type: String,
    enum: HAZARD_TYPES,
    required: true
  },
  name: { type: String, default: '', maxlength: 120 },
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    default: null,
    index: true
  },
  floor_number: { type: Number, default: null },
  /** Polygon trong tọa độ map (x,y) hoặc lat/lng nếu outdoor */
  polygon: {
    type: [{
      x: { type: Number, required: true },
      y: { type: Number, required: true }
    }],
    default: [],
    validate: {
      validator(v) {
        return !v || v.length === 0 || v.length >= 3;
      },
      message: 'Polygon cần ít nhất 3 điểm.'
    }
  },
  active: { type: Boolean, default: false, index: true },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

hazardZoneSchema.index({ incident_id: 1, active: 1 });

module.exports = mongoose.model('HazardZone', hazardZoneSchema);
module.exports.HAZARD_TYPES = HAZARD_TYPES;
