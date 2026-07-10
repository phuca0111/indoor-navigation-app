// Phase 5.8 — Lịch sử giao dịch ví ảo
const mongoose = require('mongoose');

const bankTransactionSchema = new mongoose.Schema({
  bank_user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankUser',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['TOPUP', 'PAYMENT', 'REFUND'],
    required: true
  },
  amount: { type: Number, required: true },
  balance_after: { type: Number, required: true },
  invoice_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    default: null
  },
  invoice_number: { type: String, default: '' },
  description: { type: String, default: '' },
  idempotency_key: { type: String, default: '' }
}, { timestamps: true });

bankTransactionSchema.index(
  { idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string', $ne: '' } } }
);

module.exports = mongoose.model('BankTransaction', bankTransactionSchema);
