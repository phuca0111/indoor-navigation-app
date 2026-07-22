// Catalog gói dịch vụ (CRUD). code động (FREE/PRO/ENTERPRISE + gói tùy chỉnh).
const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z][A-Z0-9_]{1,31}$/, 'Mã gói không hợp lệ']
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    price_vnd: { type: Number, default: 0, min: 0 },
    period_days: { type: Number, default: 30, min: 1 },
    max_buildings: { type: Number, default: null }, // null = không giới hạn
    max_users: { type: Number, default: null },
    // Đối tượng / kênh hiển thị gói (admin chọn trên form quản lý gói):
    // - is_personal: hiện cho REGISTERED_USER (nâng cấp Personal Workspace)
    // - is_organization: hiện khi nâng cấp / tạo tổ chức (ORG_ADMIN)
    // - show_on_landing: hiện trên trang giá công khai
    is_personal: { type: Boolean, default: false, index: true },
    is_organization: { type: Boolean, default: false, index: true },
    show_on_landing: { type: Boolean, default: true, index: true },
    // Quota riêng cho Personal Workspace (null = không giới hạn). Tách khỏi
    // max_buildings/max_users vì cùng mã gói có thể áp giới hạn khác cho cá nhân vs tổ chức.
    personal_max_buildings: { type: Number, default: null },
    personal_max_floors_per_building: { type: Number, default: null },
    personal_max_maps: { type: Number, default: null },
    personal_max_qr: { type: Number, default: null },
    is_active: { type: Boolean, default: true, index: true },
    sort_order: { type: Number, default: 0 },
    features: { type: [String], default: [] }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Plan', planSchema);
