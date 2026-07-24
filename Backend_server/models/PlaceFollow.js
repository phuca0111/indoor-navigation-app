// Community — follow a Place
const mongoose = require('mongoose');

const placeFollowSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    required: true,
    index: true
  }
}, { timestamps: true });

placeFollowSchema.index({ user_id: 1, place_id: 1 }, { unique: true });

module.exports = mongoose.model('PlaceFollow', placeFollowSchema);
