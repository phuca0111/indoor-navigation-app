// Đơn thanh toán gói cá nhân (REGISTERED_USER) qua QR — độc lập Organization/Invoice
const mongoose = require('mongoose');

const personalPaymentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  plan: { type: String, default: 'PRO' },
  months: { type: Number, default: 1, min: 1, max: 24 },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'VND' },

  // Mục đích đơn: nâng cấp gói cá nhân (UPGRADE) hay tạo tổ chức trả phí (CREATE_ORG)
  purpose: { type: String, enum: ['UPGRADE', 'CREATE_ORG'], default: 'UPGRADE' },
  // Thông tin tổ chức cần tạo (khi purpose = CREATE_ORG)
  org_meta: {
    name: { type: String, default: '' },
    slug: { type: String, default: '' }
  },
  // Tổ chức đã tạo sau khi thanh toán thành công
  org_id_created: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'PAID', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  // Token ngẫu nhiên để xác thực QR (không lộ quyền tài khoản)
  token: { type: String, required: true, index: true },
  expires_at: { type: Date, required: true },
  paid_at: { type: Date, default: null },

  // Thông tin liên hệ/hóa đơn người dùng nhập (đều tùy chọn)
  contact: {
    full_name: { type: String, default: '' },
    company: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    country: { type: String, default: '' },
    phone: { type: String, default: '' }
  },

  // Thông tin thanh toán khi hoàn tất
  bank_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BankUser', default: null },
  bank_tx_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BankTransaction', default: null }
}, { timestamps: true });

module.exports = mongoose.model('PersonalPayment', personalPaymentSchema);
