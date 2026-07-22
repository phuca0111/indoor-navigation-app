const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  transaction_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LedgerTransaction',
    required: true,
    immutable: true,
    index: true
  },
  account_code: { type: String, required: true, immutable: true, uppercase: true, trim: true, index: true },
  side: { type: String, enum: ['DEBIT', 'CREDIT'], required: true, immutable: true },
  amount_minor: { type: Number, required: true, min: 1, immutable: true },
  currency: { type: String, required: true, uppercase: true, trim: true, immutable: true, default: 'VND' },
  organization_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, immutable: true, index: true },
  occurred_at: { type: Date, required: true, immutable: true, index: true },
  metadata: { type: Object, default: {}, immutable: true }
}, { timestamps: true });

ledgerEntrySchema.index({ transaction_id: 1, account_code: 1, side: 1 });
ledgerEntrySchema.pre('save', function immutableAfterCreate() {
  if (!this.isNew && this.isModified()) {
    throw Object.assign(new Error('LedgerEntry là bất biến.'), { code: 'LEDGER_IMMUTABLE' });
  }
});

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
