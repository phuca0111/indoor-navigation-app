const mongoose = require('mongoose');

const providerTransactionSchema = new mongoose.Schema({
  provider: { type: String, required: true, uppercase: true, trim: true },
  provider_ref: { type: String, required: true, trim: true },
  merchant_ref: { type: String, required: true, trim: true, index: true },
  merchant_id: { type: String, default: '', trim: true },
  terminal_id: { type: String, default: '', trim: true },
  transaction_type: { type: String, enum: ['PAYMENT', 'REFUND', 'TRANSFER'], default: 'PAYMENT' },
  status: { type: String, required: true, uppercase: true, trim: true, index: true },
  amount_minor: { type: Number, required: true },
  currency: { type: String, required: true, uppercase: true, default: 'VND' },
  occurred_at: { type: Date, default: null, index: true },
  invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null, index: true },
  payment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null, index: true },
  webhook_inbox_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WebhookInbox', default: null },
  business_fingerprint: { type: String, default: '', trim: true },
  provider_payload: { type: Object, default: {} }
}, { timestamps: true });

providerTransactionSchema.index({ provider: 1, provider_ref: 1 }, { unique: true });
providerTransactionSchema.index(
  { provider: 1, business_fingerprint: 1 },
  {
    unique: true,
    partialFilterExpression: { business_fingerprint: { $type: 'string', $gt: '' } }
  }
);

module.exports = mongoose.model('ProviderTransaction', providerTransactionSchema);
