/**
 * UserDevice — registry thiết bị + snapshot presence (Spec D).
 * Snapshot chỉ cập nhật theo sự kiện; heartbeat GPS chỉ khi Emergency ACTIVE.
 */
const mongoose = require('mongoose');

const userDeviceSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  device_id: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128
  },
  platform: {
    type: String,
    enum: ['android', 'ios', 'web', 'unknown'],
    default: 'unknown'
  },
  device_name: {
    type: String,
    default: '',
    maxlength: 120
  },
  fcm_token: {
    type: String,
    default: '',
    maxlength: 512
  },
  app_version: {
    type: String,
    default: '',
    maxlength: 64
  },
  last_seen_at: {
    type: Date,
    default: Date.now
  },

  // —— Spec D snapshot ——
  last_building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    default: null,
    index: true
  },
  /** @deprecated alias — đồng bộ với last_building_id */
  last_indoor_building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    default: null,
    index: true
  },
  last_floor: {
    type: Number,
    default: null
  },
  last_qr_id: {
    type: String,
    default: '',
    maxlength: 128
  },
  last_indoor_at: {
    type: Date,
    default: null,
    index: true
  },
  last_qr_at: {
    type: Date,
    default: null,
    index: true
  },
  last_lat: { type: Number, default: null },
  last_lng: { type: Number, default: null },
  last_gps_at: { type: Date, default: null, index: true },
  last_gps_accuracy: { type: Number, default: null },
  indoor_session_open: {
    type: Boolean,
    default: false,
    index: true
  },

  // Spec D+ — radio presence (Wi-Fi / BLE)
  last_radio_building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    default: null,
    index: true
  },
  last_radio_at: { type: Date, default: null, index: true },
  last_radio_score: { type: Number, default: null },
  last_radio_source: { type: String, default: '', maxlength: 32 },
  last_radio_scan_at: { type: Date, default: null },
  last_radio_wifi_count: { type: Number, default: 0 },
  last_radio_ble_count: { type: Number, default: 0 },

  is_active: {
    type: Boolean,
    default: true
  },
  revoked_at: {
    type: Date,
    default: null
  }
}, { timestamps: true });

userDeviceSchema.index({ user_id: 1, device_id: 1 }, { unique: true });
userDeviceSchema.index({ fcm_token: 1 }, { sparse: true });
userDeviceSchema.index({ last_building_id: 1, last_indoor_at: -1 });
userDeviceSchema.index({ last_building_id: 1, last_qr_at: -1 });

module.exports = mongoose.model('UserDevice', userDeviceSchema);
