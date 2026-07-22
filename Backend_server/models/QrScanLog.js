const mongoose = require('mongoose');

const qrScanLogSchema = new mongoose.Schema({
  qr_code: { type: String, required: true, index: true },
  building_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', default: null, index: true },
  floor_number: { type: Number, default: null },
  node_id: { type: String, default: '' },
  label: { type: String, default: '' },
  scanned_at: { type: Date, default: Date.now, index: true }
}, { timestamps: false });

qrScanLogSchema.index({ scanned_at: -1 });

module.exports = mongoose.model('QrScanLog', qrScanLogSchema);
