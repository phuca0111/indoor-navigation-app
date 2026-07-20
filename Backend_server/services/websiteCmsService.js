const LandingPage = require('../models/LandingPage');
const WebsiteConfig = require('../models/WebsiteConfig');
const LandingMedia = require('../models/LandingMedia');

const FIXED_PAGES = [
  { slug: 'home', title: 'Tổng quan', path: '/' },
  { slug: 'features', title: 'Tính năng', path: '/features' },
  { slug: 'pricing', title: 'Bảng giá', path: '/pricing' },
  { slug: 'contact', title: 'Liên hệ', path: '/contact' }
];

const DEFAULT_NAV = [
  { id: 'nav-home', label: 'Tổng quan', href: '/', order: 1, enabled: true },
  { id: 'nav-features', label: 'Tính năng', href: '/features', order: 2, enabled: true },
  { id: 'nav-pricing', label: 'Giá', href: '/pricing', order: 3, enabled: true },
  { id: 'nav-contact', label: 'Liên hệ', href: '/contact', order: 4, enabled: true }
];

function section(id, type, label, props) {
  return { id, type, label, enabled: true, props: props || {} };
}

function defaultSections(slug) {
  if (slug === 'home') {
    return [
      section('hero', 'hero', 'Hero', {
        eyebrow: 'SaaS Indoor Navigation',
        title: 'Bản đồ trong nhà — từ vẽ đến chỉ đường trên điện thoại',
        subtitle: 'Dashboard quản trị, Web Map Editor và ứng dụng Android với QR, PDR/TPF và A*.',
        primary_cta: 'Đăng nhập Admin',
        primary_href: '/login',
        secondary_cta: 'Dùng thử miễn phí',
        secondary_href: '/login',
        image: '',
        background: ''
      }),
      section('features', 'features', 'Feature', {
        title: 'Tính năng nổi bật',
        subtitle: 'Đủ cho luận văn demo và vận hành tổ chức nhiều tòa nhà.',
        items: [
          { title: 'Quản lý tòa nhà', text: 'Nhiều tầng, metadata, draft / published.' },
          { title: 'Web Map Editor', text: 'Vẽ phòng, đường đi, POI, QR; Draft/Publish.' },
          { title: 'App Android', text: 'QR neo vị trí, PDR/TPF, A* tìm đường.' }
        ]
      }),
      section('why', 'why', 'Why Choose Us', {
        title: 'Vì sao chọn IndoorNav',
        items: [
          { title: 'Một hệ thống liền mạch', text: 'Dashboard → Editor → Android.' },
          { title: 'SaaS đa tổ chức', text: 'Gói, quota và billing tách rõ.' },
          { title: 'Draft/Publish', text: 'An toàn khi nhiều người cùng sửa bản đồ.' }
        ]
      }),
      section('stats', 'stats', 'Statistics', {
        title: 'Số liệu nổi bật',
        items: [
          { label: 'Thành phần chính', value: '3' },
          { label: 'Nền tảng', value: 'Web + Android' },
          { label: 'Mô hình', value: 'SaaS' }
        ]
      }),
      section('faq', 'faq', 'FAQ', {
        title: 'Câu hỏi thường gặp',
        items: [
          { q: 'Có dùng thử không?', a: 'Có — đăng ký Demo / dùng thử miễn phí.' },
          { q: 'Giá lấy từ đâu?', a: 'Bảng giá đọc từ danh mục gói Billing — không sửa giá trong CMS.' }
        ]
      }),
      section('footer', 'footer', 'Footer', {
        text: '© IndoorNav — Hệ thống bản đồ & dẫn đường trong nhà.'
      })
    ];
  }
  if (slug === 'features') {
    return [
      section('hero', 'hero', 'Hero', {
        title: 'Tính năng sản phẩm',
        subtitle: 'Dashboard, Editor và Android Navigation.',
        primary_cta: 'Xem bảng giá',
        primary_href: '/pricing'
      }),
      section('features', 'features', 'Feature', {
        title: 'Chi tiết tính năng',
        items: [
          { title: 'Draft / Lock / Publish', text: 'Quy trình soạn bản đồ an toàn.' },
          { title: 'QR & POI', text: 'Neo vị trí và điểm quan tâm.' },
          { title: 'Billing & quota', text: 'Gói FREE / PRO / ENTERPRISE.' }
        ]
      }),
      section('footer', 'footer', 'Footer', { text: '© IndoorNav' })
    ];
  }
  if (slug === 'pricing') {
    return [
      section('hero', 'hero', 'Hero', {
        title: 'Bảng giá',
        subtitle: 'Giá và hạn mức lấy từ danh mục gói Billing (nguồn sự thật duy nhất).',
        primary_cta: 'Dùng thử miễn phí',
        primary_href: '/login'
      }),
      section('pricing_note', 'note', 'Ghi chú giá', {
        text: 'CMS chỉ chỉnh mô tả / bố cục trang Giá. Không chỉnh số tiền hoặc quota tại đây.'
      }),
      section('footer', 'footer', 'Footer', { text: '© IndoorNav' })
    ];
  }
  if (slug === 'contact') {
    return [
      section('hero', 'hero', 'Hero', {
        title: 'Liên hệ',
        subtitle: 'Gửi yêu cầu tư vấn hoặc hỗ trợ triển khai.'
      }),
      section('contact_form', 'form', 'Form liên hệ', {
        form_type: 'CONTACT',
        submit_label: 'Gửi liên hệ'
      }),
      section('footer', 'footer', 'Footer', { text: '© IndoorNav' })
    ];
  }
  return [
    section('hero', 'hero', 'Hero', {
      title: 'Đăng ký Demo',
      subtitle: 'Dùng thử IndoorNav cho tổ chức của bạn.',
      primary_cta: 'Đăng nhập để dùng thử',
      primary_href: '/login'
    }),
    section('demo_form', 'form', 'Form Demo', {
      form_type: 'DEMO',
      submit_label: 'Đăng ký Demo'
    }),
    section('footer', 'footer', 'Footer', { text: '© IndoorNav' })
  ];
}

async function ensureWebsiteConfig() {
  let doc = await WebsiteConfig.findOne({ key: 'default' });
  if (!doc) {
    doc = await WebsiteConfig.create({
      key: 'default',
      navigation: DEFAULT_NAV,
      banner: { cta_label: 'Dùng thử miễn phí', cta_href: '/login' }
    });
  } else {
    let dirty = false;
    if (!Array.isArray(doc.navigation) || !doc.navigation.length) {
      doc.navigation = DEFAULT_NAV;
      dirty = true;
    } else {
      // Bỏ tab Demo khỏi nav đã lưu (đồng bộ landing)
      const filtered = doc.navigation.filter((n) => {
        const href = String(n.href || '').toLowerCase();
        const label = String(n.label || '').toLowerCase();
        return !href.includes('demo') && label !== 'demo';
      });
      if (filtered.length !== doc.navigation.length) {
        doc.navigation = filtered;
        dirty = true;
      }
    }
    if (doc.banner && String(doc.banner.cta_href || '').includes('org-trial')) {
      doc.banner.cta_href = '/login';
      dirty = true;
    }
    if (dirty) await doc.save();
  }
  return doc;
}

async function ensureLandingPages() {
  const pages = [];
  for (const meta of FIXED_PAGES) {
    let page = await LandingPage.findOne({ slug: meta.slug });
    if (!page) {
      const sections = defaultSections(meta.slug);
      page = await LandingPage.create({
        ...meta,
        status: 'PUBLISHED',
        draft_sections: sections,
        published_sections: sections,
        published_at: new Date()
      });
    }
    pages.push(page);
  }
  return pages;
}

function formatRelative(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return mins + ' phút trước';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + ' giờ trước';
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hôm qua';
  if (days < 30) return days + ' ngày trước';
  return new Date(date).toLocaleDateString('vi-VN');
}

async function listPages() {
  await ensureLandingPages();
  const pages = await LandingPage.find({}).sort({ path: 1 }).lean();
  return pages.map((page) => ({
    slug: page.slug,
    title: page.title,
    path: page.path,
    status: page.status,
    updated_at: page.updatedAt,
    updated_label: formatRelative(page.updatedAt),
    published_at: page.published_at,
    section_count: (page.draft_sections || []).length
  }));
}

async function getPage(slug, { draft = true } = {}) {
  await ensureLandingPages();
  const page = await LandingPage.findOne({ slug }).lean();
  if (!page) {
    const err = new Error('Không tìm thấy trang.');
    err.status = 404;
    throw err;
  }
  return {
    ...page,
    sections: draft ? page.draft_sections : page.published_sections,
    updated_label: formatRelative(page.updatedAt)
  };
}

async function savePageDraft(slug, { sections, title }, userId) {
  await ensureLandingPages();
  const page = await LandingPage.findOne({ slug });
  if (!page) {
    const err = new Error('Không tìm thấy trang.');
    err.status = 404;
    throw err;
  }
  if (title) page.title = String(title).trim();
  if (Array.isArray(sections)) page.draft_sections = sections;
  page.status = 'DRAFT';
  page.updated_by = userId || null;
  await page.save();
  return getPage(slug, { draft: true });
}

async function publishPage(slug, userId) {
  await ensureLandingPages();
  const page = await LandingPage.findOne({ slug });
  if (!page) {
    const err = new Error('Không tìm thấy trang.');
    err.status = 404;
    throw err;
  }
  page.published_sections = page.draft_sections;
  page.status = 'PUBLISHED';
  page.published_at = new Date();
  page.updated_by = userId || null;
  await page.save();
  return getPage(slug, { draft: true });
}

async function getPublicBundle() {
  await Promise.all([ensureWebsiteConfig(), ensureLandingPages()]);
  const [config, pages] = await Promise.all([
    WebsiteConfig.findOne({ key: 'default' }).lean(),
    LandingPage.find({ status: 'PUBLISHED' }).select('slug title path published_sections published_at').lean()
  ]);
  return {
    settings: config.settings,
    theme: config.theme,
    seo: config.seo,
    navigation: (config.navigation || []).filter((item) => item.enabled).sort((a, b) => a.order - b.order),
    banner: config.banner,
    pages: pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      path: page.path,
      sections: page.published_sections || [],
      published_at: page.published_at
    }))
  };
}

async function updateConfig(patch, userId) {
  const doc = await ensureWebsiteConfig();
  ['settings', 'theme', 'seo', 'banner'].forEach((key) => {
    if (patch[key] && typeof patch[key] === 'object') {
      doc[key] = { ...(doc[key]?.toObject?.() || doc[key] || {}), ...patch[key] };
    }
  });
  if (Array.isArray(patch.navigation)) {
    doc.navigation = patch.navigation.map((item, index) => ({
      id: item.id || ('nav-' + index),
      label: String(item.label || '').trim() || 'Mục',
      href: String(item.href || '/').trim() || '/',
      order: Number(item.order) || index + 1,
      enabled: item.enabled !== false
    }));
  }
  doc.updated_by = userId || null;
  await doc.save();
  return doc.toObject();
}

async function listMedia({ kind } = {}) {
  const filter = {};
  if (kind) filter.kind = kind;
  return LandingMedia.find(filter).sort({ createdAt: -1 }).limit(200).lean();
}

async function createMedia(payload, userId) {
  const name = String(payload.name || '').trim();
  const url = String(payload.url || '').trim();
  if (!name || !url) {
    const err = new Error('Thiếu tên hoặc URL media.');
    err.status = 400;
    throw err;
  }
  return LandingMedia.create({
    name,
    url,
    kind: payload.kind || 'image',
    mime: payload.mime || '',
    size: Number(payload.size) || 0,
    alt: payload.alt || '',
    created_by: userId || null
  });
}

async function deleteMedia(id) {
  const doc = await LandingMedia.findByIdAndDelete(id);
  if (!doc) {
    const err = new Error('Không tìm thấy media.');
    err.status = 404;
    throw err;
  }
  return { ok: true };
}

async function formInboxSummary() {
  const { contactStats } = require('./contactCrmService');
  const stats = await contactStats();
  return {
    status: stats.status,
    types: Object.entries(stats.types || {}).map(([key, total]) => ({
      request_type: key,
      total
    })),
    month_count: stats.month_count,
    avg_reply_hours: stats.avg_reply_hours
  };
}

module.exports = {
  FIXED_PAGES,
  ensureWebsiteConfig,
  ensureLandingPages,
  listPages,
  getPage,
  savePageDraft,
  publishPage,
  getPublicBundle,
  updateConfig,
  listMedia,
  createMedia,
  deleteMedia,
  formInboxSummary
};
