// Phase 5.5 — Billing events cho organization (production-ready)
const mongoose = require('mongoose');

const organizationBillingEventSchema = new mongoose.Schema({
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  event_type: {
    type: String,
    enum: [
      'SUBSCRIPTION_PURCHASED',
      'SUBSCRIPTION_RENEWED',
      'PAYMENT_FAILED',
      'SUBSCRIPTION_EXPIRED',
      'PAYMENT_REFUNDED',
      'MANUAL_ADJUSTMENT'
    ],
    required: true
  },
  payment_status: {
    type: String,
    enum: ['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED'],
    required: true
  },
  plan: {
    type: String,
    enum: ['FREE', 'PRO', 'ENTERPRISE'],
    default: null
  },
  amount: { type: Number, default: 0 },
  currency: { type: String, default: 'VND' },
  period_start_at: { type: Date, default: null },
  period_end_at: { type: Date, default: null },
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

organizationBillingEventSchema.index(
  { organization_id: 1, idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string', $ne: '' } } }
);

module.exports = mongoose.model('OrganizationBillingEvent', organizationBillingEventSchema);

