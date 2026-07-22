const LandingPage = require('../models/LandingPage');
const WebsiteConfig = require('../models/WebsiteConfig');
const LandingMedia = require('../models/LandingMedia');
const Asset = require('../models/Asset');
const StorageUploadIntent = require('../models/StorageUploadIntent');
const crypto = require('crypto');
const {
  storeAsset,
  softDeleteAsset,
  purgeAsset,
  assertQuota
} = require('./assetService');
const {
  createStorageAdapter,
  buildObjectKey,
  assertSafeKey,
  detectMime
} = require('./storagePlatform');
const { audit } = require('./cmsContentService');
const {
  listPublicArticles,
  listPublicBanners
} = require('../application/content/cmsApplicationService');

async function recordAudit(data) {
  if (data.actorId) await audit(data);
}

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

function normalizeNavigation(items) {
  const cleaned = (Array.isArray(items) ? items : [])
    .filter((item) => {
      const href = String(item?.href || '').toLowerCase();
      const label = String(item?.label || '').toLowerCase();
      return !href.includes('demo') && label !== 'demo';
    })
    .map((item, index) => ({
      id: item.id || `nav-${index}`,
      label: String(item.label || '').trim() || 'Mục',
      href: String(item.href || '/').trim() || '/',
      order: Number(item.order) || index + 1,
      enabled: item.enabled !== false
    }));
  const hrefs = new Set(cleaned.map((item) => item.href.replace(/\/+$/, '') || '/'));
  for (const item of DEFAULT_NAV) {
    const href = item.href.replace(/\/+$/, '') || '/';
    if (!hrefs.has(href)) cleaned.push({ ...item });
  }
  return cleaned.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function navigationSignature(items) {
  return JSON.stringify(normalizeNavigation(items).map(({ id, label, href, order, enabled }) => ({
    id, label, href, order, enabled
  })));
}

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
      doc.navigation = normalizeNavigation(DEFAULT_NAV);
      dirty = true;
    } else {
      // Bỏ Demo và khôi phục các route Landing lõi nếu bị xóa nhầm.
      const normalized = normalizeNavigation(doc.navigation);
      const current = Array.from(doc.navigation || []).map((item) => ({
        id: item.id,
        label: item.label,
        href: item.href,
        order: item.order,
        enabled: item.enabled
      }));
      if (navigationSignature(normalized) !== JSON.stringify(current)) {
        doc.navigation = normalized;
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
  const pages = await LandingPage.find({ slug: { $ne: 'demo' } }).sort({ path: 1 }).lean();
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
  await assertContentMediaAlt(sections);
  const page = await LandingPage.findOne({ slug });
  if (!page) {
    const err = new Error('Không tìm thấy trang.');
    err.status = 404;
    throw err;
  }
  const before = page.toObject();
  if (title) page.title = String(title).trim();
  if (Array.isArray(sections)) page.draft_sections = sections;
  page.status = 'DRAFT';
  page.updated_by = userId || null;
  await page.save();
  await recordAudit({
    actorId: userId,
    action: 'UPDATE',
    resourceType: 'PAGE',
    resourceId: page.slug,
    label: page.title,
    before,
    after: page.toObject()
  });
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
  const before = page.toObject();
  page.published_sections = page.draft_sections;
  page.status = 'PUBLISHED';
  page.published_at = new Date();
  page.updated_by = userId || null;
  await page.save();
  await recordAudit({
    actorId: userId,
    action: 'PUBLISH',
    resourceType: 'PAGE',
    resourceId: page.slug,
    label: page.title,
    before,
    after: page.toObject()
  });
  return getPage(slug, { draft: true });
}

async function getPublicBundle() {
  await Promise.all([ensureWebsiteConfig(), ensureLandingPages()]);
  const [config, pages, banners, articleResult] = await Promise.all([
    WebsiteConfig.findOne({ key: 'default' }).lean(),
    LandingPage.find({ status: 'PUBLISHED', slug: { $ne: 'demo' } })
      .select('slug title path published_sections published_at')
      .lean(),
    listPublicBanners(),
    listPublicArticles({ limit: 6 })
  ]);
  return {
    settings: config.settings,
    theme: config.theme,
    seo: config.seo,
    navigation: (config.navigation || [])
      .filter((item) => item.enabled)
      .filter((n) => {
        const href = String(n.href || '').toLowerCase();
        const label = String(n.label || '').toLowerCase();
        return !href.includes('demo') && label !== 'demo';
      })
      .sort((a, b) => a.order - b.order),
    banner: config.banner,
    banners,
    articles: articleResult.items || [],
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
  await assertContentMediaAlt(patch);
  const before = doc.toObject();
  ['settings', 'theme', 'seo', 'banner'].forEach((key) => {
    if (patch[key] && typeof patch[key] === 'object') {
      doc[key] = { ...(doc[key]?.toObject?.() || doc[key] || {}), ...patch[key] };
    }
  });
  if (Array.isArray(patch.navigation)) {
    doc.navigation = normalizeNavigation(patch.navigation);
  }
  if (doc.banner && String(doc.banner.cta_href || '').includes('org-trial')) {
    doc.banner.cta_href = '/login';
  }
  if (doc.banner && String(doc.banner.cta_href || '').includes('demo')) {
    doc.banner.cta_href = '/login';
  }
  doc.updated_by = userId || null;
  await doc.save();
  await recordAudit({
    actorId: userId,
    action: 'UPDATE',
    resourceType: 'CONFIG',
    resourceId: doc.key,
    label: 'Website config',
    before,
    after: doc.toObject()
  });
  return doc.toObject();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectUrls(value, output = []) {
  if (typeof value === 'string' && (/^https?:\/\//i.test(value) || value.startsWith('/uploads/'))) {
    output.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, output));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectUrls(item, output));
  }
  return output;
}

async function assertContentMediaAlt(value) {
  const urls = [...new Set(collectUrls(value))];
  if (!urls.length) return;
  const missing = await LandingMedia.findOne({
    url: { $in: urls },
    status: { $nin: ['DELETED', 'PURGED'] },
    $or: [{ alt: '' }, { alt: { $exists: false } }]
  }).select('_id').lean();
  if (missing) {
    const error = new Error('Media dùng trong nội dung phải có Alt.');
    error.status = 400;
    throw error;
  }
}

async function listMedia({ kind, q, page = 1, limit = 24, include_deleted = false } = {}) {
  const filter = include_deleted ? {} : { status: { $nin: ['DELETED', 'PURGED'] } };
  if (kind) filter.kind = kind;
  if (q) filter.$or = [
    { name: new RegExp(escapeRegex(String(q).slice(0, 80)), 'i') },
    { alt: new RegExp(escapeRegex(String(q).slice(0, 80)), 'i') }
  ];
  page = Math.max(1, Number(page) || 1);
  limit = Math.min(50, Math.max(1, Number(limit) || 24));
  const [items, total] = await Promise.all([
    LandingMedia.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    LandingMedia.countDocuments(filter)
  ]);
  return { items, total, page, limit, total_pages: Math.max(1, Math.ceil(total / limit)) };
}

async function createMedia(payload, userId) {
  const name = String(payload.name || '').trim();
  const url = String(payload.url || '').trim();
  if (!name || !url) {
    const err = new Error('Thiếu tên hoặc URL media.');
    err.status = 400;
    throw err;
  }
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) {
    const err = new Error('URL media phải dùng HTTP(S) hoặc /uploads/.');
    err.status = 400;
    throw err;
  }
  const asset = await Asset.create({
    owner_id: userId || null,
    backend: 'external',
    url,
    mime: payload.mime || 'application/octet-stream',
    size: Number(payload.size) || 0,
    checksum: payload.checksum || '',
    status: 'ACTIVE',
    ref_count: 1
  });
  let item;
  try {
    item = await LandingMedia.create({
      name,
      url,
      kind: payload.kind || 'image',
      mime: payload.mime || '',
      size: Number(payload.size) || 0,
      checksum: payload.checksum || '',
      alt: payload.alt || '',
      storage_asset_id: asset._id,
      storage_backend: 'external',
      created_by: userId || null
    });
  } catch (error) {
    await Asset.deleteOne({ _id: asset._id }).catch(() => {});
    throw error;
  }
  await recordAudit({
    actorId: userId,
    action: 'CREATE',
    resourceType: 'MEDIA',
    resourceId: item._id,
    label: item.name,
    after: item.toObject()
  });
  return item;
}

async function deleteMedia(id, userId) {
  const doc = await LandingMedia.findById(id);
  if (!doc) {
    const err = new Error('Không tìm thấy media.');
    err.status = 404;
    throw err;
  }
  const before = doc.toObject();
  doc.status = 'DELETED';
  doc.deleted_at = new Date();
  doc.retention_until = new Date(Date.now() + (Number(process.env.STORAGE_RETENTION_DAYS) || 30) * 86400000);
  await doc.save();
  if (doc.storage_asset_id) await softDeleteAsset(doc.storage_asset_id);
  await recordAudit({
    actorId: userId,
    action: 'DELETE',
    resourceType: 'MEDIA',
    resourceId: doc._id,
    label: doc.name,
    before,
    after: doc.toObject()
  });
  return { ok: true };
}

function mediaKindForMime(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

async function uploadMedia(file, payload, context) {
  if (!file) {
    const error = new Error('Thiếu file upload.');
    error.status = 400;
    throw error;
  }
  const asset = await storeAsset({
    buffer: file.buffer,
    claimedMime: file.mimetype,
    originalName: file.originalname,
    ownerId: context.actorId,
    organizationId: context.organizationId,
    namespace: 'cms-media',
    req: context.req
  });
  try {
    const item = await LandingMedia.create({
      name: String(payload.name || file.originalname).trim(),
      url: asset.url,
      kind: payload.kind || mediaKindForMime(asset.mime),
      mime: asset.mime,
      size: asset.size,
      checksum: asset.checksum,
      alt: String(payload.alt || '').trim(),
      storage_asset_id: asset._id,
      storage_backend: asset.backend,
      storage_bucket: asset.bucket,
      storage_key: asset.key,
      status: 'ACTIVE',
      created_by: context.actorId,
      organization_id: context.organizationId
    });
    asset.ref_count = 1;
    await asset.save();
    await recordAudit({
      actorId: context.actorId,
      action: 'CREATE',
      resourceType: 'MEDIA',
      resourceId: item._id,
      label: item.name,
      after: item.toObject()
    });
    return item;
  } catch (error) {
    await purgeAsset(asset, { force: true }).catch(() => {});
    throw error;
  }
}

function validateUploadIntentInput(payload) {
  const size = Number(payload.size);
  const mime = String(payload.mime || '').toLowerCase();
  const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'video/mp4'];
  if (!allowed.includes(mime) || !Number.isSafeInteger(size) || size < 1) {
    const error = new Error('MIME hoặc kích thước upload không hợp lệ.');
    error.status = 400;
    error.code = 'STORAGE_INTENT_INPUT';
    throw error;
  }
  const maxBytes = Number(process.env.STORAGE_MAX_BYTES) || 5 * 1024 * 1024;
  if (size > maxBytes) {
    const error = new Error(`File vượt giới hạn ${maxBytes} bytes.`);
    error.status = 413;
    error.code = 'STORAGE_TOO_LARGE';
    throw error;
  }
  return { size, mime };
}

async function createUploadIntent(payload, context) {
  const backend = String(process.env.STORAGE_BACKEND || 'local').toLowerCase();
  if (!['minio', 's3'].includes(backend)) {
    const error = new Error('Local storage dùng multipart upload qua backend.');
    error.status = 409;
    error.code = 'STORAGE_LOCAL_MULTIPART';
    throw error;
  }
  const { size, mime } = validateUploadIntentInput(payload);
  await assertQuota({ ownerId: context.actorId, organizationId: context.organizationId, incomingBytes: size });
  const adapter = createStorageAdapter(backend);
  const owner = context.organizationId ? `org-${context.organizationId}` : `user-${context.actorId}`;
  const key = assertSafeKey(buildObjectKey({
    namespace: 'cms-media',
    owner,
    name: payload.name || 'asset',
    mime
  }), 'cms-media');
  const ttl = Math.min(900, Math.max(60, Number(process.env.STORAGE_INTENT_TTL_SECONDS) || 300));
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const intent = await StorageUploadIntent.create({
    token_hash: tokenHash,
    owner_id: context.actorId,
    organization_id: context.organizationId,
    backend,
    bucket: adapter.bucket,
    key,
    expected_mime: mime,
    expected_size: size,
    expires_at: new Date(Date.now() + ttl * 1000)
  });
  const uploadUrl = await adapter.presignPut({ key, mime, expiresSeconds: ttl });
  return { intent_id: intent._id, token, key, upload_url: uploadUrl, expires_in: ttl };
}

async function completeUploadIntent(payload, context) {
  const tokenHash = crypto.createHash('sha256').update(String(payload.token || '')).digest('hex');
  const intent = await StorageUploadIntent.findOne({
    _id: payload.intent_id,
    token_hash: tokenHash,
    owner_id: context.actorId,
    status: 'PENDING',
    expires_at: { $gt: new Date() }
  });
  if (!intent) {
    const error = new Error('Upload intent không hợp lệ hoặc đã hết hạn.');
    error.status = 409;
    throw error;
  }
  const adapter = createStorageAdapter(intent.backend);
  const head = await adapter.head({ key: intent.key, bucket: intent.bucket });
  if (!head.exists || Number(head.size) !== intent.expected_size) {
    const error = new Error('Object upload không tồn tại hoặc sai kích thước.');
    error.status = 409;
    throw error;
  }
  const objectBuffer = await adapter.readPrefix({
    key: intent.key,
    bucket: intent.bucket,
    bytes: intent.expected_size
  });
  const detectedMime = detectMime(objectBuffer);
  if (detectedMime !== intent.expected_mime) {
    const error = new Error('Object upload có nội dung không khớp MIME intent.');
    error.status = 409;
    error.code = 'STORAGE_MIME_SPOOF';
    throw error;
  }
  const checksum = crypto.createHash('sha256').update(objectBuffer).digest('hex');
  if (payload.checksum && String(payload.checksum).toLowerCase() !== checksum) {
    const error = new Error('Checksum object không khớp yêu cầu hoàn tất.');
    error.status = 409;
    error.code = 'STORAGE_CHECKSUM_MISMATCH';
    throw error;
  }
  const claimed = await StorageUploadIntent.updateOne(
    { _id: intent._id, status: 'PENDING', expires_at: { $gt: new Date() } },
    { $set: { status: 'COMPLETING' } }
  );
  if (claimed.modifiedCount !== 1) {
    const error = new Error('Upload intent đang được hoàn tất hoặc đã sử dụng.');
    error.status = 409;
    throw error;
  }
  let asset;
  let item;
  try {
    asset = await Asset.create({
      owner_id: context.actorId,
      organization_id: context.organizationId,
      backend: intent.backend,
      bucket: intent.bucket,
      key: intent.key,
      url: adapter.publicUrl(intent.key),
      mime: intent.expected_mime,
      size: intent.expected_size,
      checksum,
      status: 'ACTIVE',
      ref_count: 1
    });
    item = await LandingMedia.create({
      name: String(payload.name || 'Media').trim(),
      url: asset.url,
      kind: payload.kind || mediaKindForMime(asset.mime),
      mime: asset.mime,
      size: asset.size,
      checksum: asset.checksum,
      alt: String(payload.alt || '').trim(),
      storage_asset_id: asset._id,
      storage_backend: asset.backend,
      storage_bucket: asset.bucket,
      storage_key: asset.key,
      created_by: context.actorId,
      organization_id: context.organizationId
    });
    intent.status = 'COMPLETED';
    intent.completed_at = new Date();
    await intent.save();
  } catch (error) {
    if (asset && !item) await Asset.deleteOne({ _id: asset._id }).catch(() => {});
    await StorageUploadIntent.updateOne(
      { _id: intent._id, status: 'COMPLETING', expires_at: { $gt: new Date() } },
      { $set: { status: 'PENDING' } }
    ).catch(() => {});
    throw error;
  }
  await recordAudit({
    actorId: context.actorId,
    action: 'CREATE',
    resourceType: 'MEDIA',
    resourceId: item._id,
    label: item.name,
    after: item.toObject()
  });
  return item;
}

async function purgeMedia(id, userId) {
  const doc = await LandingMedia.findById(id);
  if (!doc) {
    const error = new Error('Không tìm thấy media.');
    error.status = 404;
    throw error;
  }
  if (doc.storage_asset_id) await purgeAsset(doc.storage_asset_id, { force: true });
  const before = doc.toObject();
  doc.status = 'PURGED';
  doc.purged_at = new Date();
  await doc.save();
  await recordAudit({
    actorId: userId,
    action: 'PURGE',
    resourceType: 'MEDIA',
    resourceId: doc._id,
    label: doc.name,
    before,
    after: doc.toObject()
  });
  return doc;
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
  uploadMedia,
  validateUploadIntentInput,
  createUploadIntent,
  completeUploadIntent,
  purgeMedia,
  formInboxSummary
};
