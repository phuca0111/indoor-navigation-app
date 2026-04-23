// ============================================
// FILE: Floor.js  (thay thế vai trò của MapData.js)
// MỤC ĐÍCH: Schema cho dữ liệu bản đồ từng TẦNG của tòa nhà
// Dùng collection 'mapdatas' để tương thích ngược với dữ liệu cũ
// ============================================

const mongoose = require('mongoose');

// --- Sub-schema: NODE đồ thị hành lang ---
const nodeSchema = new mongoose.Schema({
    id:           { type: String, required: true },
    x:            { type: Number, required: true },
    y:            { type: Number, required: true },
    node_type:    { type: String, enum: ['NORMAL', 'ELEVATOR', 'STAIRS', 'ENTRANCE', 'EXIT'], default: 'NORMAL' },
    label:        { type: String, default: '' },
    target_floor: { type: Number, default: null }   // Dành cho ELEVATOR/STAIRS chỉ tầng đích
}, { _id: false });

// --- Sub-schema: EDGE cạnh đồ thị ---
const edgeSchema = new mongoose.Schema({
    id:            { type: String, required: true },
    from_node:     { type: String, required: true },
    to_node:       { type: String, required: true },
    bidirectional: { type: Boolean, default: true },
    weight:        { type: Number, default: 0 }     // Khoảng cách thực (mét), A* dùng
}, { _id: false });

// --- Sub-schema: ROOM phòng ban ---
const roomSchema = new mongoose.Schema({
    id:        { type: String },
    name:      { type: String, default: '' },
    shape:     { type: String, enum: ['rect', 'polygon', 'circle'], default: 'rect' },
    room_type: {
        type: String,
        enum: ['OFFICE', 'RESTROOM', 'ELEVATOR', 'STAIRS', 'LOBBY', 'STORE', 'CLINIC', 'CORRIDOR', 'OTHER'],
        default: 'OTHER'
    },
    color:   { type: String, default: '#cccccc' },
    x:       { type: Number },
    y:       { type: Number },
    width:   { type: Number },
    height:  { type: Number },
    points:  [{ x: Number, y: Number }],   // polygon
    cx:      { type: Number },             // circle
    cy:      { type: Number },
    radius:  { type: Number }
}, { _id: false });

// --- Sub-schema: DOOR cửa ra vào ---
const doorSchema = new mongoose.Schema({
    id:        { type: String },
    name:      { type: String, default: '' },
    x:         { type: Number },
    y:         { type: Number },
    width:     { type: Number },
    door_type: { type: String, enum: ['SINGLE', 'DOUBLE', 'SLIDING'], default: 'SINGLE' },
    rotation:  { type: Number, default: 0 }
}, { _id: false });

// --- Sub-schema: POI điểm quan tâm ---
const poiSchema = new mongoose.Schema({
    id:          { type: String },
    name:        { type: String, default: '' },
    poi_type:    {
        type: String,
        enum: ['INFO', 'TOILET', 'EXIT', 'ELEVATOR', 'STAIRS', 'PHARMACY', 'ATM', 'FOOD', 'OTHER'],
        default: 'OTHER'
    },
    x:           { type: Number },
    y:           { type: Number },
    description: { type: String, default: '' },
    icon:        { type: String, default: '' }
}, { _id: false });

// --- Sub-schema: WALL tường bao/tường ngăn ---
const wallSchema = new mongoose.Schema({
    id:        { type: String },
    points:    [{ x: Number, y: Number }],
    thickness: { type: Number, default: 2 }
}, { _id: false });

// --- Sub-schema: QR ANCHOR điểm dán mã QR (nhúng trong floor để Android tải offline 1 lần) ---
const qrAnchorSchema = new mongoose.Schema({
    id:      { type: String },
    qr_code: { type: String, default: '' },  // Giá trị encode thực tế trong mã QR
    x:       { type: Number },
    y:       { type: Number },
    node_id: { type: String, default: '' },  // Node graph gần nhất — TPF dùng để init 60 hạt
    label:   { type: String, default: '' }
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
        scale_ratio:       { type: Number, default: 0.5 },
        background_image:  { type: String, default: '' },
        rooms:             { type: [roomSchema],     default: [] },
        doors:             { type: [doorSchema],     default: [] },
        pois:              { type: [poiSchema],      default: [] },
        nodes:             { type: [nodeSchema],     default: [] },
        edges:             { type: [edgeSchema],     default: [] },
        walls:             { type: [wallSchema],     default: [] },
        qr_anchors:        { type: [qrAnchorSchema], default: [] }
    }

}, {
    timestamps: true,
    collection: 'mapdatas'  // Giữ tên collection cũ để tương thích ngược 100%
});

module.exports = mongoose.model('Floor', floorSchema);
