// Phase 5.6 — Invoice gắn subscription (sẵn sàng cổng thanh toán)
const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  subscription_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    default: null,
    index: true
  },
  billing_event_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrganizationBillingEvent',
    default: null
  },
  invoice_number: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE'],
    default: 'OPEN',
    index: true
  },
  plan: {
    type: String,
    enum: ['FREE', 'PRO', 'ENTERPRISE'],
    default: null
  },
  amount: { type: Number, default: 0 },
  currency: { type: String, default: 'VND' },
  period_start: { type: Date, default: null },
  period_end: { type: Date, default: null },
  paid_at: { type: Date, default: null },
  due_at: { type: Date, default: null },
  external_ref: { type: String, default: '' },
  idempotency_key: { type: String, default: '' },
  note: { type: String, default: '' },
  metadata: { type: Object, default: {} },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

invoiceSchema.index(
  { organization_id: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string', $ne: '' } } }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
