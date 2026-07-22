const mongoose = require('mongoose');

const seoSchema = new mongoose.Schema({
  meta_title: { type: String, default: '', trim: true },
  meta_description: { type: String, default: '', trim: true },
  keywords: { type: [String], default: [] },
  canonical_url: { type: String, default: '', trim: true },
  og_title: { type: String, default: '', trim: true },
  og_description: { type: String, default: '', trim: true },
  og_image: { type: String, default: '', trim: true },
  robots: { type: String, default: 'index,follow', trim: true }
}, { _id: false });

const cmsArticleSchema = new mongoose.Schema({
  type: { type: String, enum: ['BLOG', 'NEWS'], required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 240 },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
  excerpt: { type: String, default: '', trim: true, maxlength: 1000 },
  content: { type: String, default: '' },
  featured_image: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED', 'SCHEDULED', 'DELETED'],
    default: 'DRAFT',
    index: true
  },
  publish_at: { type: Date, default: null, index: true },
  published_at: { type: Date, default: null },
  seo: { type: seoSchema, default: () => ({}) },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  revision: { type: Number, default: 1, min: 1 },
  deleted_at: { type: Date, default: null, index: true }
}, { timestamps: true });

cmsArticleSchema.index({ type: 1, status: 1, published_at: -1 });
cmsArticleSchema.index({ status: 1, title: 1, updatedAt: -1 });

module.exports = mongoose.model('CmsArticle', cmsArticleSchema);
