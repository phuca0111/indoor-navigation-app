const mongoose = require('mongoose');

const identityChallengeSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  purpose: {
    type: String,
    enum: ['EMAIL_VERIFY', 'TWO_FACTOR_LOGIN', 'TWO_FACTOR_DISABLE', 'TWO_FACTOR_RECOVERY'],
    required: true,
    index: true
  },
  challenge_hash: { type: String, required: true, select: false },
  expires_at: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  attempts: { type: Number, default: 0 },
  max_attempts: { type: Number, default: 5 },
  consumed_at: { type: Date, default: null },
  delivery_provider: { type: String, default: 'mock' },
  requested_ip_hash: { type: String, default: '' }
}, { timestamps: true });

identityChallengeSchema.index({ user_id: 1, purpose: 1, createdAt: -1 });

module.exports = mongoose.model('IdentityChallenge', identityChallengeSchema);
