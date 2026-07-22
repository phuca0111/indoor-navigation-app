const mongoose = require('mongoose');

const STAGES = [
  'TrialStarted',
  'CheckoutStarted',
  'PaymentCaptured',
  'SubscriptionActivated',
  'FirstMapPublished',
  'FirstNavigationCompleted'
];

const analyticsEventSchema = new mongoose.Schema({
  event_id: { type: String, required: true, unique: true, immutable: true },
  stage: { type: String, enum: STAGES, required: true, immutable: true, index: true },
  subject_type: { type: String, required: true, immutable: true },
  subject_id: { type: String, required: true, immutable: true, index: true },
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    immutable: true,
    index: true
  },
  session_id: { type: String, default: '', immutable: true, index: true },
  occurred_at: { type: Date, required: true, default: Date.now, immutable: true, index: true },
  properties: { type: Object, default: {}, immutable: true }
}, { timestamps: true });

analyticsEventSchema.index({ organization_id: 1, occurred_at: -1 });
analyticsEventSchema.index({ organization_id: 1, stage: 1, occurred_at: -1 });
analyticsEventSchema.index(
  { organization_id: 1, subject_type: 1, subject_id: 1, stage: 1 },
  { unique: true }
);

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
module.exports.STAGES = STAGES;
