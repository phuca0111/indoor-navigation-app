const mongoose = require('mongoose');

const cmsAuditLogSchema = new mongoose.Schema({
  actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'SCHEDULE', 'RESTORE', 'PURGE'],
    required: true,
    index: true
  },
  resource_type: {
    type: String,
    enum: ['ARTICLE', 'BANNER', 'MEDIA', 'PAGE', 'CONFIG'],
    required: true,
    index: true
  },
  resource_id: { type: String, required: true, index: true },
  resource_label: { type: String, default: '', trim: true },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  ip_address: { type: String, default: '' },
  revision_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CmsRevision', default: null },
  resource_version: { type: Number, default: 0 }
}, { timestamps: true, minimize: false });

cmsAuditLogSchema.index({ createdAt: -1 });
cmsAuditLogSchema.index({ resource_type: 1, resource_id: 1, createdAt: -1 });
module.exports = mongoose.model('CmsAuditLog', cmsAuditLogSchema);
