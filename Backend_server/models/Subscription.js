// Phase 5.6 — Subscription (source of truth cho gói trả phí)
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  plan: {
    type: String,
    uppercase: true,
    trim: true,
    required: true
  },
  status: {
    type: String,
    enum: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'CANCELED', 'EXPIRED', 'ARCHIVED'],
    default: 'ACTIVE',
    index: true
  },
  current_period_start: { type: Date, default: null },
  current_period_end: { type: Date, default: null },
  cancel_at_period_end: { type: Boolean, default: false },
  canceled_at: { type: Date, default: null },
  provider: {
    type: String,
    enum: ['MANUAL', 'STRIPE', 'VNPAY', 'MOMO', 'OTHER'],
    default: 'MANUAL'
  },
  provider_subscription_id: { type: String, default: '' },
  is_current: { type: Boolean, default: true, index: true },
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

subscriptionSchema.index(
  { organization_id: 1, is_current: 1 },
  { unique: true, partialFilterExpression: { is_current: true } }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
