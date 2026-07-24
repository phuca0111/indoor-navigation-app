/**
 * Subscription mock events — Billing History UI (không cổng thanh toán thật).
 */
const mongoose = require('mongoose');

const subscriptionMockEventSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  from_plan: { type: String, default: 'FREE' },
  to_plan: { type: String, required: true },
  target_label: { type: String, default: '' },
  amount_mock: { type: Number, default: 0 },
  currency: { type: String, default: 'VND' },
  note: { type: String, default: 'upgrade-mock', maxlength: 200 }
}, { timestamps: true });

subscriptionMockEventSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('SubscriptionMockEvent', subscriptionMockEventSchema);
