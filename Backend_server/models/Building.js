// ============================================
// FILE: Building.js
// MỤC ĐÍCH: Tạo khuôn mẫu (Schema) cho bảng Tòa Nhà
// BẢNG NÀY LƯU: Tên tòa nhà, địa chỉ, tọa độ GPS, trạng thái publish
// ============================================

const mongoose = require('mongoose');

const buildingSchema = new mongoose.Schema({

    // Cột 1: Tên tòa nhà (VD: "Bệnh viện Chợ Rẫy", "ĐH Sài Gòn")
    name: {
        type: String,
        required: true
    },

    // Cột 2: Địa chỉ vật lý ngoài đời
    address: {
        type: String,
        default: ''
    },

    // Cột 3: Tọa độ GPS của sảnh chính tòa nhà
    // App Android sẽ dùng tọa độ này + thuật toán Haversine để tìm tòa nhà gần nhất
    gps_location: {
        lat: { type: Number, default: 0 },   // Vĩ độ (VD: 10.758414)
        lng: { type: Number, default: 0 }    // Kinh độ (VD: 106.660144)
    },

    // Cột 4: Bán kính kích hoạt (mét)
    // Nếu App phát hiện người dùng đứng trong vòng 50m quanh tòa nhà -> gợi ý tải map
    activation_radius: {
        type: Number,
        default: 50       // Mặc định 50 mét
    },

    // Cột 5: Trạng thái bản đồ
    status: {
        type: String,
        enum: ['DRAFT', 'PUBLISHED'],
        default: 'DRAFT'
    },

    // Cột 6: Mô tả ngắn về tòa nhà (dùng trong luận văn và Admin UI)
    description: {
        type: String,
        default: ''
    },

    // Cột 7: Tổng số tầng — Android dùng để render dropdown chọn tầng
    total_floors: {
        type: Number,
        default: 1,
        min: 1
    },

    // Cột 8: Ai tạo tòa nhà này
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }

}, {
    timestamps: true   // Tự thêm cột ngày tạo + ngày cập nhật
});

module.exports = mongoose.model('Building', buildingSchema);
