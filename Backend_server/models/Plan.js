// Catalog gói dịch vụ (CRUD). code = FREE|PRO|ENTERPRISE (tương thích Phase 5).
const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      enum: ['FREE', 'PRO', 'ENTERPRISE', 'STARTER', 'GOVERNMENT']
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    price_vnd: { type: Number, default: 0, min: 0 },
    period_days: { type: Number, default: 30, min: 1 },
    max_buildings: { type: Number, default: null }, // null = không giới hạn
    max_users: { type: Number, default: null },
    is_active: { type: Boolean, default: true, index: true },
    sort_order: { type: Number, default: 0 },
    features: { type: [String], default: [] }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Plan', planSchema);
