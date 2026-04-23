// ============================================
// FILE: ActivityLog.js
// MỤC ĐÍCH: Tạo khuôn mẫu (Schema) cho bảng Nhật Ký Hoạt Động
// BẢNG NÀY LƯU: Ai đã làm gì, lúc mấy giờ, ở đâu
// DÙNG ĐỂ: Truy vết lịch sử, biết ai xóa nhầm dữ liệu
// ============================================

const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({

    // Cột 1: Ai đã thực hiện hành động (Liên kết sang bảng User)
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Cột 2: Hành động gì (enum đầy đủ)
    action: {
        type: String,
        required: true,
        enum: [
            'LOGIN', 'LOGOUT',
            'PUBLISH_MAP', 'LOAD_MAP',
            'CREATE_BUILDING', 'UPDATE_BUILDING', 'DELETE_BUILDING',
            'CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'ASSIGN_BUILDING',
            'CREATE_QR', 'DELETE_QR'
        ]
    },

    // Cột 3: Loại đối tượng bị tác động — 'building' | 'floor' | 'user' | 'qr'
    target_type: {
        type: String,
        default: ''
    },

    // Cột 4: ID của đối tượng bị tác động (dạng String để linh hoạt với ObjectId)
    target_id: {
        type: String,
        default: ''
    },

    // Cột 5: Mô tả dạng text — VD: "Bệnh viện Chợ Rẫy - Tầng 3"
    target: {
        type: String,
        default: ''
    },

    // Cột 6: Ghi chú chi tiết thêm
    details: {
        type: String,
        default: ''
    },

    // Cột 7: Địa chỉ IP của máy thực hiện
    ip_address: {
        type: String,
        default: ''
    }

}, {
    // Tự động thêm cột createdAt = thời điểm ghi log
    timestamps: true
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);
