// ============================================
// FILE: ContactMessage.js
// MỤC ĐÍCH: Inbox liên hệ Landing (WL3)
// ============================================

const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
  message: { type: String, required: true, trim: true, maxlength: 4000 },
  phone: { type: String, default: '', trim: true, maxlength: 40 },
  source: { type: String, default: 'landing', trim: true },
  status: {
    type: String,
    enum: ['NEW', 'READ', 'ARCHIVED'],
    default: 'NEW',
    index: true
  },
  ip_address: { type: String, default: '' },
  user_agent: { type: String, default: '', maxlength: 400 }
}, { timestamps: true });

contactMessageSchema.index({ createdAt: -1 });
contactMessageSchema.index({ email: 1, createdAt: -1 });

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
