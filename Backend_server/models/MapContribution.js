// ============================================
// Đóng góp cộng đồng (Platform) — đề xuất POI / sửa vị trí…
// Không thay Editor: Approve chỉ đánh dấu duyệt, không tự vẽ map.
// ============================================

const mongoose = require('mongoose');

const CONTRIBUTION_TYPES = [
  'ADD_POI',
  'FIX_LOCATION',
  'FIX_INFO',
  'OTHER'
];

const CONTRIBUTION_STATUS = [
  'PENDING',
  'APPROVED',
  'REJECTED'
];

/** OUTDOOR = bản đồ ngoài trời / place; INDOOR = bản đồ trong nhà / tầng */
const MAP_SCOPES = ['OUTDOOR', 'INDOOR'];

const mapContributionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: CONTRIBUTION_TYPES,
    required: true,
    index: true
  },
  map_scope: {
    type: String,
    enum: MAP_SCOPES,
    default: 'OUTDOOR',
    index: true
  },
  /** VD: "Thêm WC", "Sửa vị trí lối thoát hiểm" */
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    default: '',
    maxlength: 2000
  },
  /** Loại POI gợi ý: WC, ELEVATOR, EXIT, … */
  poi_kind: {
    type: String,
    default: '',
    maxlength: 80
  },
  place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    default: null,
    index: true
  },
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    default: null,
    index: true
  },
  floor_number: {
    type: Number,
    default: null
  },
  /** Tọa độ gợi ý (outdoor hoặc tham chiếu) */
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  /** Tọa độ trong nhà (editor space) — tuỳ chọn */
  indoor_x: { type: Number, default: null },
  indoor_y: { type: Number, default: null },
  status: {
    type: String,
    enum: CONTRIBUTION_STATUS,
    default: 'PENDING',
    index: true
  },
  submitted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reviewer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reject_reason: {
    type: String,
    default: '',
    maxlength: 1000
  },
  decided_at: {
    type: Date,
    default: null
  }
}, { timestamps: true });

mapContributionSchema.index({ status: 1, createdAt: -1 });
mapContributionSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('MapContribution', mapContributionSchema);
module.exports.CONTRIBUTION_TYPES = CONTRIBUTION_TYPES;
module.exports.CONTRIBUTION_STATUS = CONTRIBUTION_STATUS;
module.exports.MAP_SCOPES = MAP_SCOPES;
