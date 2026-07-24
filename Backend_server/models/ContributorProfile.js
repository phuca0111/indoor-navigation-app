// Community — contributor reputation + badges
const mongoose = require('mongoose');

const BADGES = Object.freeze(['EXPLORER', 'MAPPER', 'REVIEWER', 'TOP_CONTRIBUTOR', 'TRUSTED']);

const contributorProfileSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  points: {
    type: Number,
    default: 0,
    min: 0
  },
  badges: {
    type: [String],
    default: []
  },
  tier: {
    type: String,
    enum: ['NEW', 'TRUSTED', 'MAPPER', 'SENIOR_MAPPER'],
    default: 'NEW'
  },
  stats: {
    proposals: { type: Number, default: 0 },
    reviews: { type: Number, default: 0 },
    reports: { type: Number, default: 0 },
    maps_submitted: { type: Number, default: 0 }
  }
}, { timestamps: true });

contributorProfileSchema.statics.BADGES = BADGES;

contributorProfileSchema.statics.tierFromPoints = function tierFromPoints(points) {
  const p = Number(points) || 0;
  if (p >= 500) return 'SENIOR_MAPPER';
  if (p >= 200) return 'MAPPER';
  if (p >= 100) return 'TRUSTED';
  return 'NEW';
};

module.exports = mongoose.model('ContributorProfile', contributorProfileSchema);
