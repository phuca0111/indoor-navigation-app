const mongoose = require('mongoose');

const websiteBannerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  subtitle: { type: String, default: '', trim: true, maxlength: 1000 },
  image_url: { type: String, default: '', trim: true },
  mobile_image_url: { type: String, default: '', trim: true },
  link_url: { type: String, default: '', trim: true },
  link_label: { type: String, default: '', trim: true, maxlength: 80 },
  placement: { type: String, default: 'HOME', trim: true, uppercase: true, index: true },
  enabled: { type: Boolean, default: true, index: true },
  starts_at: { type: Date, default: null, index: true },
  ends_at: { type: Date, default: null, index: true },
  priority: { type: Number, default: 0 },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deleted_at: { type: Date, default: null, index: true },
  revision: { type: Number, default: 1, min: 1 }
}, { timestamps: true });

websiteBannerSchema.index({ placement: 1, enabled: 1, priority: -1 });

module.exports = mongoose.model('WebsiteBanner', websiteBannerSchema);
