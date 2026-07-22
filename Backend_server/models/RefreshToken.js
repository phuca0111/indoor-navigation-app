// ============================================
// FILE: RefreshToken.js
// MỤC ĐÍCH: Quản lý Refresh Token cho JWT
// DÙNG ĐỂ: Cấp lại Access Token mới mà không cần login lại
// MongoDB TTL index tự động xóa token hết hạn
// ============================================

const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({

    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Hash của refresh token (không lưu raw token để bảo mật)
    token_hash: {
        type: String,
        required: true,
        index: true
    },

    family_id: {
        type: String,
        required: true,
        index: true,
        default: () => require('crypto').randomUUID()
    },
    parent_token_hash: { type: String, default: null, select: false },
    replaced_by_hash: { type: String, default: null, select: false },

    // Thời điểm hết hạn — MongoDB TTL index dùng field này để tự xóa document
    expires_at: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 }
    },

    // Cho phép revoke thủ công trước khi hết hạn
    is_revoked: {
        type: Boolean,
        default: false
    },
    revoked_at: { type: Date, default: null },
    revoked_reason: {
        type: String,
        enum: ['ROTATED', 'LOGOUT', 'LOGOUT_ALL', 'PASSWORD_CHANGED', 'REUSE_DETECTED', 'SESSION_REVOKED', null],
        default: null
    },

    // IP lúc tạo token — dùng để phát hiện bất thường
    ip_address: {
        type: String,
        default: ''
    },
    user_agent: { type: String, default: '', maxlength: 500 },
    device_name: { type: String, default: '', maxlength: 120 },
    last_used_at: { type: Date, default: Date.now },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
