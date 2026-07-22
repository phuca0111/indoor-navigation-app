const mongoose = require('mongoose');

const featureFlagSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    enabled: { type: Boolean, default: false },
    description: { type: String, default: '' },
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null
    },
    rules: { type: Object, default: {} },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { timestamps: true }
);

featureFlagSchema.index({ key: 1, organization_id: 1 }, { unique: true });

module.exports = mongoose.model('FeatureFlag', featureFlagSchema);
