const mongoose = require('mongoose');

const notificationPreferenceSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
    index: true
  },
  organization_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },
  category: { type: String, required: true, uppercase: true, trim: true },
  channels: {
    IN_APP: { type: Boolean, default: true },
    EMAIL: { type: Boolean, default: true },
    PUSH: { type: Boolean, default: false },
    SMS: { type: Boolean, default: false }
  }
}, { timestamps: true });

notificationPreferenceSchema.index({ user_id: 1, category: 1 }, { unique: true });
notificationPreferenceSchema.index({ organization_id: 1, updatedAt: -1 });

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
