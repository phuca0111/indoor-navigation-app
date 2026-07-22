const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  source_id: { type: String, default: undefined, immutable: true },
  actor_type: { type: String, enum: ['USER', 'SYSTEM', 'SERVICE'], required: true, immutable: true },
  actor_id: { type: String, default: '', immutable: true, index: true },
  actor_role: { type: String, default: '', immutable: true },
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    immutable: true,
    index: true
  },
  action: { type: String, required: true, immutable: true, index: true },
  resource_type: { type: String, required: true, immutable: true, index: true },
  resource_id: { type: String, default: '', immutable: true, index: true },
  before: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  after: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  patch: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  ip_address: { type: String, default: '', immutable: true },
  user_agent: { type: String, default: '', immutable: true },
  request_id: { type: String, default: '', immutable: true, index: true },
  correlation_id: { type: String, default: '', immutable: true, index: true },
  source: { type: String, required: true, immutable: true, index: true },
  outcome: {
    type: String,
    enum: ['SUCCESS', 'FAILURE', 'DENIED'],
    default: 'SUCCESS',
    immutable: true
  },
  reason: { type: String, default: '', immutable: true },
  domain_event_id: { type: String, default: '', immutable: true, index: true },
  occurred_at: { type: Date, required: true, default: Date.now, immutable: true, index: true }
}, { timestamps: { createdAt: true, updatedAt: false }, minimize: false });

auditLogSchema.index({ source: 1, source_id: 1 }, { unique: true, sparse: true });
auditLogSchema.index({ organization_id: 1, occurred_at: -1 });
auditLogSchema.index({ action: 1, occurred_at: -1 });

auditLogSchema.pre('save', function preventMutation() {
  if (!this.isNew && this.isModified()) {
    throw Object.assign(new Error('AuditLog là bất biến.'), {
      code: 'AUDIT_IMMUTABLE'
    });
  }
});
for (const hook of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne']) {
  auditLogSchema.pre(hook, function rejectUpdate() {
    throw Object.assign(new Error('AuditLog là bất biến.'), {
      code: 'AUDIT_IMMUTABLE'
    });
  });
}

module.exports = mongoose.model('AuditLog', auditLogSchema);
