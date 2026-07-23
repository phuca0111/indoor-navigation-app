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
    },

    // Cột 9: Soft delete flag
    is_active: {
        type: Boolean,
        default: true
    },

    // Cột 10: Organization mà tòa nhà thuộc về (multi-tenant)
    // Building thuộc tổ chức: organization_id != null, owner_user_id = null.
    // Building trong Personal Workspace (REGISTERED_USER): organization_id = null, owner_user_id = user._id.
    organization_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null
    },

    // Cột 11: Chủ sở hữu cá nhân (Personal Workspace của REGISTERED_USER).
    // null với building thuộc Organization.
    owner_user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // Map Governance P0 — Place là gốc địa lý; Building là bản đồ kỹ thuật.
    // Nullable khi migrate; backfill bằng scripts/backfill-places.js.
    place_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Place',
        default: null,
        index: true
    },

    // Visibility cộng đồng (tách khỏi status DRAFT/PUBLISHED).
    // PRIVATE | UNLISTED | COMMUNITY | OFFICIAL
    visibility: {
        type: String,
        enum: ['PRIVATE', 'UNLISTED', 'COMMUNITY', 'OFFICIAL'],
        default: 'PRIVATE',
        index: true
    },

    // PHASE 3 — link ngược Indoor Workspace (legacy 1:1)
    workspace_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'IndoorWorkspace',
        default: null,
        index: true
    }

}, {
    timestamps: true   // Tự thêm cột ngày tạo + ngày cập nhật
});

module.exports = mongoose.model('Building', buildingSchema);
