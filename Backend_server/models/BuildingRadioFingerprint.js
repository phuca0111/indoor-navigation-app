/**
 * Fingerprint Wi-Fi / BLE theo tòa — học khi user indoor hoặc GPS gần tòa,
 * dùng để suy presence khi GPS kém (trong nhà / máy túi, vẫn gửi qua 4G).
 */
const mongoose = require('mongoose');

const buildingRadioFingerprintSchema = new mongoose.Schema(
  {
    building_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      required: true,
      index: true
    },
    /** BSSID chuẩn hoá (aa:bb:...) */
    wifi_bssid: {
      type: String,
      default: '',
      trim: true,
      maxlength: 32,
      index: true
    },
    /** MAC/UUID BLE rút gọn */
    ble_id: {
      type: String,
      default: '',
      trim: true,
      maxlength: 64,
      index: true
    },
    hit_count: { type: Number, default: 1, min: 1 },
    last_seen_at: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

buildingRadioFingerprintSchema.index(
  { building_id: 1, wifi_bssid: 1 },
  { unique: true, partialFilterExpression: { wifi_bssid: { $gt: '' } } }
);
buildingRadioFingerprintSchema.index(
  { building_id: 1, ble_id: 1 },
  { unique: true, partialFilterExpression: { ble_id: { $gt: '' } } }
);

module.exports = mongoose.model('BuildingRadioFingerprint', buildingRadioFingerprintSchema);
