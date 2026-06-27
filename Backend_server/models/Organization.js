// ============================================
// FILE: Organization.js
// MỤC ĐÍCH: Schema cho Organization (multi-tenant)
// MỖI BUILDING thuộc về MỘT Organization
// ============================================

const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({

    // Tên hiển thị của tổ chức (trường, bệnh viện, TTTM)
    name: {
        type: String,
        required: true
    },

    // Slug dùng cho URL/api — duy nhất toàn hệ thống
    // VD: "university-saigon", "benh-vien-cho-ray"
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    // Gói dịch vụ — dùng sau khi có billing
    plan: {
        type: String,
        enum: ['FREE', 'PRO', 'ENTERPRISE'],
        default: 'FREE'
    },

    // Trạng thái organization
    is_active: {
        type: Boolean,
        default: true
    }

}, {
    timestamps: true
});

module.exports = mongoose.model('Organization', organizationSchema);
