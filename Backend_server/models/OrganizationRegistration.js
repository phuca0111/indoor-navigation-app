// ============================================
// FILE: OrganizationRegistration.js
// MỤC ĐÍCH: Hồ sơ đăng ký tổ chức (Dạng B — chờ Super Admin duyệt)
// ============================================

const mongoose = require('mongoose');

const organizationRegistrationSchema = new mongoose.Schema({
  organization_name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  plan: {
    type: String,
    uppercase: true,
    trim: true,
    default: 'FREE'
  },
  contact_name: { type: String, required: true, trim: true },
  contact_email: { type: String, required: true, trim: true, lowercase: true },
  contact_phone: { type: String, default: '', trim: true },
  admin_password_hash: { type: String, required: true },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
    index: true
  },
  reject_reason: { type: String, default: '' },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewed_at: { type: Date, default: null },
  organization_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  admin_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  source: { type: String, enum: ['REGISTRATION', 'SELF_SERVICE'], default: 'REGISTRATION' },
  ip_address: { type: String, default: '' }
}, { timestamps: true });

organizationRegistrationSchema.index({ contact_email: 1, status: 1 });
organizationRegistrationSchema.index({ slug: 1, status: 1 });

module.exports = mongoose.model('OrganizationRegistration', organizationRegistrationSchema);
