// Place Platform — Event stub (Promotion / Temporary Close / Construction)
const mongoose = require('mongoose');
const { PLACE_EVENT_TYPE_VALUES, PLACE_EVENT_TYPE } = require('../utils/placePlatform');

const placeEventSchema = new mongoose.Schema({
  place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: PLACE_EVENT_TYPE_VALUES,
    default: PLACE_EVENT_TYPE.PROMOTION,
    index: true
  },
  title: {
    type: String,
    default: '',
    maxlength: 200
  },
  body: {
    type: String,
    default: '',
    maxlength: 2000
  },
  starts_at: { type: Date, default: null },
  ends_at: { type: Date, default: null },
  is_active: { type: Boolean, default: true },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

placeEventSchema.index({ place_id: 1, is_active: 1, starts_at: 1 });

module.exports = mongoose.model('PlaceEvent', placeEventSchema);
