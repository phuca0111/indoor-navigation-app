// ============================================
// FILE: Floor.js  (thay thế vai trò của MapData.js)
// MỤC ĐÍCH: Schema cho dữ liệu bản đồ từng TẦNG của tòa nhà
// Dùng collection 'mapdatas' để tương thích ngược với dữ liệu cũ
// ============================================

const mongoose = require('mongoose');

// --- Sub-schema: NODE đồ thị hành lang ---
const nodeSchema = new mongoose.Schema({
    id: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    neighbors: { type: [String], default: [] },
    is_elevator: { type: Boolean, default: false },
    is_stairs: { type: Boolean, default: false },
    node_type: { type: String, default: 'NORMAL' }
}, { _id: false });

// --- Sub-schema: EDGE cạnh đồ thị ---
const edgeSchema = new mongoose.Schema({
    source: { type: String, required: true },
    target: { type: String, required: true },
    distance: { type: Number, default: 0 }
}, { _id: false });

// --- Sub-schema: ROOM phòng ban ---
const roomSchema = new mongoose.Schema({
    id: { type: String },
    name: { type: String, default: '' },
    shape: { type: String, enum: ['rect', 'polygon', 'circle'], default: 'rect' },
    room_type: {
        type: String,
        enum: ['OFFICE', 'RESTROOM', 'ELEVATOR', 'STAIRS', 'LOBBY', 'STORE', 'CLINIC', 'CORRIDOR', 'OTHER'],
        default: 'OTHER'
    },
    color: { type: String, default: '#cccccc' },
    x: { type: Number },
    y: { type: Number },
    width: { type: Number },
    height: { type: Number },
    points: [{ x: Number, y: Number }],   // polygon
    cx: { type: Number },             // circle
    cy: { type: Number },
    radius: { type: Number }
}, { _id: false });

// --- Sub-schema: DOOR cửa ra vào ---
const doorSchema = new mongoose.Schema({
    id: { type: String },
    name: { type: String, default: '' },
    x: { type: Number },
    y: { type: Number },
    width: { type: Number },
    type: { type: String, default: 'Cửa chính' }, // Khớp với frontend
    rotation: { type: Number, default: 0 }
}, { _id: false });

// --- Sub-schema: POI điểm quan tâm ---
const poiSchema = new mongoose.Schema({
    id: { type: String },
    name: { type: String, default: '' },
    poi_type: {
        type: String,
        enum: ['INFO', 'TOILET', 'EXIT', 'ELEVATOR', 'STAIRS', 'PHARMACY', 'ATM', 'FOOD', 'OTHER'],
        default: 'OTHER'
    },
    x: { type: Number },
    y: { type: Number },
    description: { type: String, default: '' },
    icon: { type: String, default: '' }
}, { _id: false });

// --- Sub-schema: WALL tường bao/tường ngăn ---
const wallSchema = new mongoose.Schema({
    id: { type: String },
    type: { type: String, default: 'segment' },
    is_outer: { type: Boolean, default: false },
    thickness: { type: Number, default: 4 },
    points: [{ x: Number, y: Number }]
}, { _id: false });

// --- Sub-schema: QR ANCHOR điểm dán mã QR ---
const qrAnchorSchema = new mongoose.Schema({
    qr_id: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    room_name: { type: String, default: '' },
    node_id: { type: String, default: null }
}, { _id: false });

// --- Schema chính: FLOOR ---
const floorSchema = new mongoose.Schema({

    building_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Building',
        required: true
    },

    floor_number: {
        type: Number,
        required: true
    },

    floor_name: {
        type: String,
        default: ''     // VD: "Tầng Trệt", "Tầng 1", "Tầng 2"
    },

    version: {
        type: Number,
        default: 1
    },

    published_at: {
        type: Date,
        default: null
    },

    last_modified_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    map_data: {
        scale_ratio: { type: Number, default: 0.5 },
        background_image: { type: String, default: '' },
        rooms: { type: [roomSchema], default: [] },
        doors: { type: [doorSchema], default: [] },
        pois: { type: [poiSchema], default: [] },
        nodes: { type: [nodeSchema], default: [] },
        edges: { type: [edgeSchema], default: [] },
        walls: { type: [wallSchema], default: [] },
        qr_anchors: { type: [qrAnchorSchema], default: [] }
    }

}, {
    timestamps: true,
    collection: 'mapdatas'  // Giữ tên collection cũ để tương thích ngược 100%
});

module.exports = mongoose.model('Floor', floorSchema);
