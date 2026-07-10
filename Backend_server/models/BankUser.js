// Phase 5.8 — Người dùng app TPTPbank (tách khỏi User SaaS)
const mongoose = require('mongoose');

const bankUserSchema = new mongoose.Schema({
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null
  },
  phone: {
    type: String,
    trim: true,
    default: null
  },
  password: { type: String, required: true },
  full_name: { type: String, default: '' },
  is_active: { type: Boolean, default: true }
}, { timestamps: true });

bankUserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string', $ne: '' } } }
);
bankUserSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string', $ne: '' } } }
);

module.exports = mongoose.model('BankUser', bankUserSchema);
