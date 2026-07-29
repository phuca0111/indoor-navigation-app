// Engagement trong nhà — đánh giá phòng / POI (không tạo Place outdoor)
const mongoose = require('mongoose');

const ENTITY_KINDS = ['ROOM', 'POI'];

const indoorReviewSchema = new mongoose.Schema({
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    required: true,
    index: true
  },
  floor_number: {
    type: Number,
    required: true,
    index: true
  },
  entity_kind: {
    type: String,
    enum: ENTITY_KINDS,
    required: true,
    index: true
  },
  entity_id: {
    type: String,
    required: true,
    trim: true,
    maxlength: 64,
    index: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  comment: {
    type: String,
    default: '',
    maxlength: 2000
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

indoorReviewSchema.index(
  { building_id: 1, floor_number: 1, entity_kind: 1, entity_id: 1, user_id: 1 },
  { unique: true }
);

module.exports = mongoose.model('IndoorReview', indoorReviewSchema);
module.exports.ENTITY_KINDS = ENTITY_KINDS;
