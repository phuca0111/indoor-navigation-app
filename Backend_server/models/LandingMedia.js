const mongoose = require('mongoose');

const landingMediaSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  kind: {
    type: String,
    enum: ['logo', 'icon', 'image', 'video', 'pdf', 'other'],
    default: 'image',
    index: true
  },
  mime: { type: String, default: '' },
  size: { type: Number, default: 0 },
  checksum: { type: String, default: '', trim: true, lowercase: true },
  storage_asset_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null, index: true },
  storage_backend: {
    type: String,
    enum: ['local', 'minio', 's3', 'external'],
    default: 'external',
    index: true
  },
  storage_bucket: { type: String, default: '' },
  storage_key: { type: String, default: '' },
  status: {
    type: String,
    enum: ['ACTIVE', 'DELETED', 'PURGED'],
    default: 'ACTIVE',
    index: true
  },
  deleted_at: { type: Date, default: null, index: true },
  retention_until: { type: Date, default: null, index: true },
  purged_at: { type: Date, default: null },
  alt: { type: String, default: '' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  organization_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  revision: { type: Number, default: 1, min: 1 }
}, { timestamps: true });

landingMediaSchema.index({ createdAt: -1 });
landingMediaSchema.index({ status: 1, retention_until: 1 });
landingMediaSchema.index({ status: 1, name: 1, createdAt: -1 });

module.exports = mongoose.model('LandingMedia', landingMediaSchema);
