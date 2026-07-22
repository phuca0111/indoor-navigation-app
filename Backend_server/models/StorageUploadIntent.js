const mongoose = require('mongoose');

const uploadIntentSchema = new mongoose.Schema({
  token_hash: { type: String, required: true, unique: true },
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organization_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  backend: { type: String, enum: ['minio', 's3'], required: true },
  bucket: { type: String, required: true },
  key: { type: String, required: true },
  expected_mime: { type: String, required: true },
  expected_size: { type: Number, required: true },
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETING', 'COMPLETED', 'EXPIRED'],
    default: 'PENDING',
    index: true
  },
  expires_at: { type: Date, required: true },
  completed_at: { type: Date, default: null },
  claimed_at: { type: Date, default: null, index: true },
  last_error: { type: String, default: '' }
}, { timestamps: true });

// Giữ intent quá hạn để reconciler có thể xóa object mồ côi trước khi TTL dọn DB.
uploadIntentSchema.index({ expires_at: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('StorageUploadIntent', uploadIntentSchema);
