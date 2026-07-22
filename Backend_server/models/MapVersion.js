// ============================================
// FILE: MapVersion.js
// MỤC ĐÍCH: Lưu lịch sử các phiên bản bản đồ đã Publish
// DÙNG ĐỂ: Truy vết ai publish lúc nào, rollback nếu cần
// LƯU Ý: Không lưu background_image để tiết kiệm dung lượng DB
// ============================================

const mongoose = require('mongoose');

const mapVersionSchema = new mongoose.Schema({

    building_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Building',
        required: true
    },

    floor_number: {
        type: Number,
        required: true
    },

    // Số version tại thời điểm publish
    version: {
        type: Number,
        required: true
    },

    // Thống kê nhanh để hiển thị trong Admin UI mà không cần parse graph_snapshot
    rooms_count: { type: Number, default: 0 },
    nodes_count: { type: Number, default: 0 },
    edges_count: { type: Number, default: 0 },

    // Snapshot đồ thị — chỉ lưu nodes + edges (bỏ background_image)
    graph_snapshot: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },

    // Snapshot map đầy đủ (không background_image) — dùng rollback toàn bộ
    map_snapshot: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },

    // Ai bấm Publish
    published_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    published_at: {
        type: Date,
        default: Date.now
    }

}, {
    timestamps: false,   // published_at đã đủ, không cần thêm createdAt/updatedAt
    autoIndex: false // tạo unique index bằng preflight script sau khi duplicate = 0
});

mapVersionSchema.index(
    { building_id: 1, floor_number: 1, version: 1 },
    { unique: true }
);

module.exports = mongoose.model('MapVersion', mapVersionSchema);
