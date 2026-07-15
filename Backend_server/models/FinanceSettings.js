// Cấu hình hóa đơn / công ty (singleton)
const mongoose = require('mongoose');

const financeSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    company_name: { type: String, default: 'Indoor Navigation SaaS', trim: true },
    tax_code: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    currency: { type: String, default: 'VND', trim: true },
    default_tax_percent: { type: Number, default: 0, min: 0, max: 100 },
    invoice_prefix: { type: String, default: 'INV', trim: true },
    invoice_footer: { type: String, default: 'Cảm ơn quý khách.', trim: true },
    reminder_days_before_expiry: { type: Number, default: 7, min: 1, max: 90 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('FinanceSettings', financeSettingsSchema);
