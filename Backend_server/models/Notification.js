const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true
    },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '', trim: true },
    severity: {
      type: String,
      enum: ['info', 'success', 'warning', 'error'],
      default: 'info'
    },
    link: { type: String, default: '' },
    data: { type: Object, default: {} },
    event_id: { type: String, default: '', index: true },
    dedupe_key: { type: String, required: true },
    read_at: { type: Date, default: null, index: true },
    expires_at: { type: Date, default: null }
  },
  { timestamps: true }
);

notificationSchema.index({ user_id: 1, dedupe_key: 1 }, { unique: true });
notificationSchema.index({ user_id: 1, read_at: 1, createdAt: -1 });
notificationSchema.index(
  { expires_at: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { expires_at: { $type: 'date' } } }
);

module.exports = mongoose.model('Notification', notificationSchema);
