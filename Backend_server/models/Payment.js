// Sổ giao dịch thanh toán (ledger append-only)
const mongoose = require('mongoose');

const PAYMENT_METHODS = ['MANUAL', 'VNPAY', 'TPTP', 'BANK', 'OTHER'];
const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED'];

const paymentSchema = new mongoose.Schema(
  {
    // null = thanh toán cá nhân (PersonalPayment → Invoice PERSONAL-*)
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true
    },
    invoice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
      index: true
    },
    // Dương = thu; âm = hoàn tiền (refund ledger line)
    amount: { type: Number, required: true },
    currency: { type: String, default: 'VND' },
    method: {
      type: String,
      enum: PAYMENT_METHODS,
      default: 'MANUAL',
      index: true
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'PENDING',
      index: true
    },
    paid_at: { type: Date, default: null },
    provider: { type: String, default: '', uppercase: true, trim: true, index: true },
    provider_ref: { type: String, default: '', trim: true },
    external_ref: { type: String, default: '', trim: true },
    note: { type: String, default: '', trim: true },
    idempotency_key: { type: String, default: '' },
    metadata: { type: Object, default: {} },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { timestamps: true }
);

paymentSchema.index(
  { idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string', $ne: '' } } }
);
paymentSchema.index(
  { provider: 1, provider_ref: 1 },
  {
    unique: true,
    partialFilterExpression: {
      provider: { $type: 'string', $ne: '' },
      provider_ref: { $type: 'string', $ne: '' }
    }
  }
);

module.exports = mongoose.model('Payment', paymentSchema);
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
