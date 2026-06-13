// ============================================
// FILE: MapData.js
// MỤC ĐÍCH: Tạo khuôn mẫu (Schema) cho bảng Dữ Liệu Bản Đồ
// BẢNG NÀY LƯU: Toàn bộ cục JSON mà Web Map Editor vẽ ra
//   bao gồm: polygon phòng, node hành lang, edge đường đi, mốc QR
// ĐÂY LÀ FILE QUAN TRỌNG NHẤT CỦA DỰ ÁN!
// ============================================

const mongoose = require('mongoose');

const mapDataSchema = new mongoose.Schema({

    // Cột 1: Bản đồ này thuộc tòa nhà nào (Liên kết sang bảng Building)
    building_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Building',
        required: true
    },

    // Cột 2: Bản đồ của tầng số mấy (VD: 1, 2, 3)
    floor_number: {
        type: Number,
        required: true
    },

    // Cột 3: Số phiên bản (Mỗi lần Admin bấm Publish thì tăng lên 1)
    version: {
        type: Number,
        default: 1
    },

    // Cột 4: CỤC DỮ LIỆU LÕI - Chứa toàn bộ hình vẽ của Web Map Editor
    map_data: {

        // 4a: Tỷ lệ quy đổi mét sang pixel (VD: 1 mét = 20 pixel)
        scale_ratio: { type: Number, default: 0.5 },

        // 4b: Ảnh nền mặt bằng (Lưu dạng đường link URL hoặc chuỗi Base64)
        background_image: { type: String, default: '' },

        // 4c: Mảng các phòng ban đã vẽ (Polygon, Rect, Circle)
        rooms: [{
            id: Number,                            // ID định danh duy nhất của phòng
            name: String,
            shape: { type: String, default: 'rect' },
            color: { type: String, default: '#ccc' },
            labelRotation: { type: Number, default: 0 },
            labelFontSize: { type: Number, default: 14 },
            labelAutoScale: { type: Boolean, default: true },
            labelLineHeight: { type: Number, default: 1.2 },
            room_type: String,
            x: Number,
            y: Number,
            width: Number,
            height: Number,
            points: [{ x: Number, y: Number }],
            vertices: [{ x: Number, y: Number }],
            cx: Number,
            cy: Number,
            radius: Number
        }],

        // 4d: Mảng các cánh cửa
        doors: [{
            id: Number,
            name: String,
            x: Number,
            y: Number,
            width: Number,
            type: { type: String },                // "Đơn", "Đôi"... (khai báo lồng để không đè keyword schema type)
            rotation: { type: Number, default: 0 }
        }],

        // 4e: Mảng các điểm quan tâm (Point of Interest) - Dùng Mixed để linh hoạt tối đa
        pois: [mongoose.Schema.Types.Mixed],

        // 4f: Mảng các chấm tròn đường đi (Nodes)
        nodes: [mongoose.Schema.Types.Mixed],

        // 4g: Mảng các đường nối
        edges: [mongoose.Schema.Types.Mixed],

        // 4g.1: Mảng tường bao/tường ngăn (line/polyline)
        walls: [mongoose.Schema.Types.Mixed],

        // 4h: Mảng các điểm dán mã QR
        qr_anchors: [mongoose.Schema.Types.Mixed]
    },

    // Cột 5: Ngày giờ Admin bấm nút Publish
    published_at: {
        type: Date,
        default: null
    }

}, {
    timestamps: true
});

module.exports = mongoose.model('MapData', mapDataSchema);
