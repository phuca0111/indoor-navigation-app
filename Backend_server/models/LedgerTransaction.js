const mongoose = require('mongoose');

const ledgerTransactionSchema = new mongoose.Schema({
  source_type: { type: String, required: true, uppercase: true, trim: true, index: true },
  source_id: { type: String, required: true, trim: true, index: true },
  posting_key: { type: String, required: true, unique: true, index: true },
  transaction_type: {
    type: String,
    enum: ['INCOME', 'REFUND', 'EXPENSE', 'REVERSAL', 'TRANSFER'],
    required: true,
    index: true
  },
  currency: { type: String, required: true, uppercase: true, trim: true, default: 'VND' },
  occurred_at: { type: Date, required: true, default: Date.now, index: true },
  description: { type: String, default: '', trim: true },
  organization_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  metadata: { type: Object, default: {} },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

ledgerTransactionSchema.pre('save', function immutableAfterCreate() {
  if (!this.isNew && this.isModified()) {
    throw Object.assign(new Error('LedgerTransaction là bất biến.'), { code: 'LEDGER_IMMUTABLE' });
  }
});

module.exports = mongoose.model('LedgerTransaction', ledgerTransactionSchema);
