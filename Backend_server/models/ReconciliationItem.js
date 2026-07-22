const mongoose = require('mongoose');

const reconciliationItemSchema = new mongoose.Schema({
  run_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ReconciliationRun', required: true, index: true },
  provider: { type: String, required: true, uppercase: true },
  provider_ref: { type: String, default: '', trim: true },
  merchant_ref: { type: String, default: '', trim: true },
  classification: {
    type: String,
    enum: ['MATCHED', 'MISSING_INTERNAL', 'MISSING_PROVIDER', 'AMOUNT_MISMATCH', 'STATUS_MISMATCH', 'DUPLICATE'],
    required: true,
    index: true
  },
  internal_amount_minor: { type: Number, default: null },
  provider_amount_minor: { type: Number, default: null },
  internal_status: { type: String, default: '' },
  provider_status: { type: String, default: '' },
  payment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
  provider_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProviderTransaction', default: null },
  details: { type: Object, default: {} }
}, { timestamps: true });

reconciliationItemSchema.index({ run_id: 1, provider_ref: 1, classification: 1 });

module.exports = mongoose.model('ReconciliationItem', reconciliationItemSchema);
