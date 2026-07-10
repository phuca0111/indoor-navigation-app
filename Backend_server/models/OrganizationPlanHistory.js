// Phase 5.4 — Lịch sử đổi gói / billing của tổ chức
const mongoose = require('mongoose');

const organizationPlanHistorySchema = new mongoose.Schema({
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  from_plan: { type: String, default: null },
  to_plan: { type: String, required: true },
  from_billing_status: { type: String, default: null },
  to_billing_status: { type: String, default: 'ACTIVE' },
  changed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  source: {
    type: String,
    enum: ['MANUAL_SUPER_ADMIN', 'PAYMENT', 'SYSTEM'],
    default: 'MANUAL_SUPER_ADMIN'
  },
  note: { type: String, default: '' },
  snapshot: {
    buildings_active: { type: Number, default: 0 },
    users_active: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('OrganizationPlanHistory', organizationPlanHistorySchema);
