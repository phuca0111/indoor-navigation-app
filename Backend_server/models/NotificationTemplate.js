const mongoose = require('mongoose');

const notificationTemplateSchema = new mongoose.Schema({
  key: { type: String, required: true, uppercase: true, trim: true },
  channel: {
    type: String,
    enum: ['IN_APP', 'EMAIL', 'PUSH', 'SMS'],
    required: true
  },
  locale: { type: String, default: 'vi', lowercase: true },
  subject: { type: String, default: '' },
  body: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  version: { type: Number, min: 1, default: 1 }
}, { timestamps: true });

notificationTemplateSchema.index(
  { key: 1, channel: 1, locale: 1 },
  { unique: true }
);

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
