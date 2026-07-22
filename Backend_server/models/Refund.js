const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema(
  {
    payment_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true
    },
    invoice_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
      index: true
    },
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true
    },
    provider: {
      type: String,
      enum: ['MANUAL', 'VNPAY', 'TPTP', 'BANK', 'OTHER'],
      required: true
    },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'VND' },
    status: {
      type: String,
      enum: ['REQUESTED', 'PROCESSING', 'GATEWAY_PENDING', 'COMPLETED', 'FAILED'],
      default: 'REQUESTED',
      index: true
    },
    idempotency_key: { type: String, required: true, unique: true, index: true },
    provider_refund_id: { type: String, default: '' },
    provider_status: { type: String, default: '' },
    provider_response: { type: Object, default: {} },
    requested_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reason: { type: String, default: '' },
    attempts: { type: Number, default: 0 },
    processing_started_at: { type: Date, default: null },
    lease_expires_at: { type: Date, default: null, index: true },
    last_error: { type: String, default: '' },
    completed_at: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Refund', refundSchema);
