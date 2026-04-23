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

    // IP lúc tạo token — dùng để phát hiện bất thường
    ip_address: {
        type: String,
        default: ''
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
