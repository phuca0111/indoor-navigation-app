/**
 * Báo cáo rung từ điện thoại (máy đo địa chấn cộng đồng — MVP).
 * Gom theo building_id trong cửa sổ thời gian → kích hoạt Incident EARTHQUAKE.
 */
const mongoose = require('mongoose');

const seismicShakeReportSchema = new mongoose.Schema({
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
    maxlength: 128,
    index: true
  },
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    required: true,
    index: true
  },
  /** Cường độ ước lượng (m/s² lệch / peak đã lọc). */
  magnitude: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  peak_ms2: { type: Number, default: null },
  duration_ms: { type: Number, default: null },
  /** STA/LTA on-device (Hướng 1). */
  sta_lta_ratio: { type: Number, default: null },
  algorithm: { type: String, default: '', maxlength: 32 },
  source: {
    type: String,
    enum: ['charging_idle', 'background', 'foreground', 'manual', 'unknown'],
    default: 'unknown'
  },
  client_ts: { type: Date, default: null },
  /** GPS lúc báo cáo (đối chiếu tòa khi app chạy nền). */
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  gps_accuracy: { type: Number, default: null },
  /** Cách xác định building_id: gps | hint | presence */
  building_match: { type: String, default: '', maxlength: 16 },
  incident_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Incident',
    default: null
  }
}, { timestamps: true });

seismicShakeReportSchema.index({ building_id: 1, createdAt: -1 });
seismicShakeReportSchema.index({ building_id: 1, device_id: 1, createdAt: -1 });

module.exports = mongoose.model('SeismicShakeReport', seismicShakeReportSchema);
