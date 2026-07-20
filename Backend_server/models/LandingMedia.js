const mongoose = require('mongoose');

const landingMediaSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  url: { type: String, required: true, trim: true },
  kind: {
    type: String,
    enum: ['logo', 'icon', 'image', 'video', 'pdf', 'other'],
    default: 'image',
    index: true
  },
  mime: { type: String, default: '' },
  size: { type: Number, default: 0 },
  alt: { type: String, default: '' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

landingMediaSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LandingMedia', landingMediaSchema);
