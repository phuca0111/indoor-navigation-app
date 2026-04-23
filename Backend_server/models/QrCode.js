// ============================================
// FILE: QrCode.js
// MỤC ĐÍCH: Lưu thông tin từng mã QR được dán trong tòa nhà
// DÙNG ĐỂ: Android scan QR → tra ngay building_id + vị trí + node_id
//          mà không cần tải toàn bộ bản đồ trước
// ============================================

const mongoose = require('mongoose');

const qrCodeSchema = new mongoose.Schema({

    // Giá trị thực tế được encode trong mã QR (unique, indexed để tra cứu nhanh)
    qr_code: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Thuộc về tòa nhà nào
    building_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Building',
        required: true
    },

    // Thuộc tầng số mấy
    floor_number: {
        type: Number,
        required: true
    },

    // Tọa độ pixel trên canvas bản đồ
    x: { type: Number, required: true },
    y: { type: Number, required: true },

    // Node graph gần nhất — TPF Engine dùng để khởi tạo 60 hạt khi scan QR
    node_id: {
        type: String,
        default: ''
    },

    // Tên mô tả để nhận biết — VD: "Cổng A", "Hành lang B2"
    label: {
        type: String,
        default: ''
    },

    // Admin nào tạo mã QR này
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }

}, {
    timestamps: true
});

module.exports = mongoose.model('QrCode', qrCodeSchema);
