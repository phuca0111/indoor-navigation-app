/**
 * Phase 3 — Emergency Location (heartbeat khi Incident ACTIVE + consent).
 */
const mongoose = require('mongoose');

const emergencyLocationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  incident_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Incident',
    required: true,
    index: true
  },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    default: null
  },
  floor_number: { type: Number, default: null },
  heading: { type: Number, default: null },
  accuracy: { type: Number, default: null },
  battery: { type: Number, default: null },
  motion: {
    type: String,
    enum: ['moving', 'still', 'unknown'],
    default: 'unknown'
  },
  /** Thời điểm bắt đầu đứng yên liên tục (client hoặc server suy ra). */
  still_since: { type: Date, default: null },
  /** Số ms đứng yên liên tục (client báo). */
  still_duration_ms: { type: Number, default: null },
  /** Đứng yên ≥ ngưỡng khi Incident ACTIVE → nghi mắc kẹt (chỉ nếu in_hazard_zone). */
  possibly_trapped: { type: Boolean, default: false, index: true },
  /** Đang nằm trong vùng nguy hiểm (hazard active / gần tòa EARTHQUAKE). */
  in_hazard_zone: { type: Boolean, default: false, index: true },
  /** Cách xác định vùng nguy hiểm: hazard_zone | earthquake_near_building | … */
  hazard_match: { type: String, default: '', maxlength: 48 },
  source: {
    type: String,
    enum: ['GPS', 'QR_ANCHOR', 'MANUAL_FLOOR', 'INDOOR_POSITION', 'UNKNOWN'],
    default: 'GPS'
  },
  reported_at: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

emergencyLocationSchema.index({ incident_id: 1, possibly_trapped: 1 });
emergencyLocationSchema.index({ incident_id: 1, in_hazard_zone: 1 });

emergencyLocationSchema.index({ incident_id: 1, user_id: 1 }, { unique: true });
emergencyLocationSchema.index({ incident_id: 1, reported_at: -1 });

module.exports = mongoose.model('EmergencyLocation', emergencyLocationSchema);
