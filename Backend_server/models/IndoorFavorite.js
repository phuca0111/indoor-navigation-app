// Engagement trong nhà — lưu yêu thích phòng / POI
const mongoose = require('mongoose');

const ENTITY_KINDS = ['ROOM', 'POI'];

const indoorFavoriteSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  building_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    required: true,
    index: true
  },
  floor_number: {
    type: Number,
    required: true
  },
  entity_kind: {
    type: String,
    enum: ENTITY_KINDS,
    required: true
  },
  entity_id: {
    type: String,
    required: true,
    trim: true,
    maxlength: 64
  },
  entity_name: {
    type: String,
    default: '',
    maxlength: 200
  }
}, { timestamps: true });

indoorFavoriteSchema.index(
  { user_id: 1, building_id: 1, floor_number: 1, entity_kind: 1, entity_id: 1 },
  { unique: true }
);

module.exports = mongoose.model('IndoorFavorite', indoorFavoriteSchema);
module.exports.ENTITY_KINDS = ENTITY_KINDS;
