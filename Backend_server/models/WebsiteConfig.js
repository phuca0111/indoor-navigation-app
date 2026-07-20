const mongoose = require('mongoose');

const navItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  href: { type: String, required: true },
  order: { type: Number, default: 0 },
  enabled: { type: Boolean, default: true }
}, { _id: false });

const websiteConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'default' },
  settings: {
    site_name: { type: String, default: 'IndoorNav' },
    logo_url: { type: String, default: '' },
    email: { type: String, default: '' },
    hotline: { type: String, default: '' },
    facebook: { type: String, default: '' },
    youtube: { type: String, default: '' },
    google_map: { type: String, default: '' },
    footer_text: { type: String, default: '© IndoorNav — Hệ thống bản đồ & dẫn đường trong nhà.' }
  },
  theme: {
    primary: { type: String, default: '#2563eb' },
    secondary: { type: String, default: '#0f172a' },
    mode: { type: String, enum: ['light', 'dark'], default: 'light' },
    font: { type: String, default: 'Be Vietnam Pro' },
    radius: { type: String, default: '12px' }
  },
  seo: {
    meta_title: { type: String, default: 'IndoorNav — Bản đồ & dẫn đường trong nhà' },
    description: {
      type: String,
      default: 'Hệ thống indoor navigation SaaS: Dashboard, Web Map Editor và ứng dụng Android.'
    },
    og_image: { type: String, default: '' },
    keywords: { type: String, default: 'indoor navigation, bản đồ trong nhà, SaaS' },
    robots: { type: String, default: 'index,follow' },
    favicon: { type: String, default: '' },
    analytics_code: { type: String, default: '' }
  },
  navigation: { type: [navItemSchema], default: [] },
  banner: {
    homepage_title: { type: String, default: 'Bản đồ trong nhà — từ vẽ đến chỉ đường trên điện thoại' },
    homepage_subtitle: {
      type: String,
      default: 'Quản trị tổ chức trên Dashboard, soạn bản đồ bằng Web Map Editor, người dùng cuối đi trong tòa nhà qua app Android.'
    },
    hero_image: { type: String, default: '' },
    hero_video: { type: String, default: '' },
    cta_label: { type: String, default: 'Dùng thử miễn phí' },
    cta_href: { type: String, default: '/login' },
    background: { type: String, default: '' }
  },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

module.exports = mongoose.model('WebsiteConfig', websiteConfigSchema);
