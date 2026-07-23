// User favorite Place — My Maps Phase 1
const mongoose = require('mongoose');

const userFavoriteSchema = new mongoose.Schema({
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

userFavoriteSchema.index({ user_id: 1, place_id: 1 }, { unique: true });

module.exports = mongoose.model('UserFavorite', userFavoriteSchema);
