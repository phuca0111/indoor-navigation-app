// GĐ2 — Review cộng đồng trên Place (DB order: sau Claim)
const mongoose = require('mongoose');

const placeReviewSchema = new mongoose.Schema({
  place_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Place',
    required: true,
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

placeReviewSchema.index({ place_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('PlaceReview', placeReviewSchema);
