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

    // Phase 5.3 — trạng thái thanh toán / hết hạn gói
    billing_status: {
        type: String,
        enum: ['ACTIVE', 'GRACE_PERIOD', 'EXPIRED'],
        default: 'ACTIVE'
    },

    // Hết hạn grace period (sau hạ gói PRO→FREE khi vượt quota)
    grace_ends_at: {
        type: Date,
        default: null
    },

    // Phase 5.4 — thời hạn gói trả phí (Super Admin / thanh toán sau này)
    plan_started_at: {
        type: Date,
        default: null
    },
    plan_expires_at: {
        type: Date,
        default: null
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
