const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, required: true },
  label: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  props: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const landingPageSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    enum: ['home', 'features', 'pricing', 'contact', 'demo']
  },
  title: { type: String, required: true },
  path: { type: String, required: true },
  status: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED'],
    default: 'PUBLISHED',
    index: true
  },
  draft_sections: { type: [sectionSchema], default: [] },
  published_sections: { type: [sectionSchema], default: [] },
  published_at: { type: Date, default: null },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

module.exports = mongoose.model('LandingPage', landingPageSchema);
