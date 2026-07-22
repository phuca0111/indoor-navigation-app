const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },
  backend: { type: String, enum: ['local', 'minio', 's3', 'external'], required: true, index: true },
  bucket: { type: String, default: '', trim: true },
  key: { type: String, default: '', trim: true },
  url: { type: String, required: true, trim: true },
  mime: { type: String, default: 'application/octet-stream', trim: true },
  size: { type: Number, default: 0, min: 0 },
  checksum: { type: String, default: '', trim: true, lowercase: true, index: true },
  status: {
    type: String,
    enum: ['PENDING', 'ACTIVE', 'DELETED', 'PURGED', 'FAILED'],
    default: 'ACTIVE',
    index: true
  },
  ref_count: { type: Number, default: 0, min: 0 },
  retention_until: { type: Date, default: null, index: true },
  deleted_at: { type: Date, default: null, index: true },
  purged_at: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true });

assetSchema.index({ backend: 1, bucket: 1, key: 1 }, {
  unique: true,
  partialFilterExpression: { key: { $gt: '' } }
});
assetSchema.index({ status: 1, ref_count: 1, retention_until: 1 });

module.exports = mongoose.model('Asset', assetSchema);
