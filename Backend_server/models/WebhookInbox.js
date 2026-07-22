const mongoose = require('mongoose');

const webhookInboxSchema = new mongoose.Schema({
  provider: { type: String, required: true, uppercase: true, trim: true, index: true },
  event_key: { type: String, required: true, trim: true },
  raw_payload: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
  sanitized_payload: { type: Object, default: {} },
  signature_status: { type: String, enum: ['VALID', 'INVALID', 'MISSING', 'NOT_REQUIRED'], required: true },
  process_status: {
    type: String,
    enum: ['RECEIVED', 'PROCESSING', 'PROCESSED', 'REJECTED', 'FAILED'],
    default: 'RECEIVED',
    index: true
  },
  attempts: { type: Number, default: 0 },
  processing_started_at: { type: Date, default: null },
  lease_owner: { type: String, default: null, index: true },
  lease_expires_at: { type: Date, default: null, index: true },
  processed_at: { type: Date, default: null },
  last_error: { type: String, default: '' },
  provider_transaction_ref: { type: String, default: '', trim: true },
  invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null }
}, { timestamps: true });

webhookInboxSchema.index({ provider: 1, event_key: 1 }, { unique: true });
webhookInboxSchema.index({ process_status: 1, lease_expires_at: 1, createdAt: 1 });

module.exports = mongoose.model('WebhookInbox', webhookInboxSchema);
