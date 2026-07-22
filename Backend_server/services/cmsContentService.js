const mongoose = require('mongoose');
const CmsArticle = require('../models/CmsArticle');
const WebsiteBanner = require('../models/WebsiteBanner');
const CmsAuditLog = require('../models/CmsAuditLog');
const WebsiteConfig = require('../models/WebsiteConfig');
const LandingPage = require('../models/LandingPage');
const LandingMedia = require('../models/LandingMedia');
const { restoreAsset, objectExists } = require('./assetService');

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function plain(doc) {
  if (!doc) return null;
  const value = doc.toObject ? doc.toObject() : { ...doc };
  delete value.__v;
  return value;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function normalizeKeywords(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(',');
  return items.map((item) => String(item).trim()).filter(Boolean).slice(0, 30);
}

function normalizeSeo(value = {}) {
  return {
    meta_title: String(value.meta_title || '').trim(),
    meta_description: String(value.meta_description || '').trim(),
    keywords: normalizeKeywords(value.keywords),
    canonical_url: String(value.canonical_url || '').trim(),
    og_title: String(value.og_title || '').trim(),
    og_description: String(value.og_description || '').trim(),
    og_image: String(value.og_image || '').trim(),
    robots: String(value.robots || 'index,follow').trim()
  };
}

async function assertMediaAlt(urls) {
  const normalized = urls.map((value) => String(value || '').trim()).filter(Boolean);
  if (!normalized.length) return;
  const media = await LandingMedia.find({
    url: { $in: normalized },
    status: { $nin: ['DELETED', 'PURGED'] }
  })
    .select('url alt').lean();
  const missing = media.find((item) => !String(item.alt || '').trim());
  if (missing) throw httpError('Media dùng trong nội dung phải có Alt.', 400);
}

function articlePayload(payload, existing) {
  const title = String(payload.title ?? existing?.title ?? '').trim();
  const type = String(payload.type ?? existing?.type ?? 'BLOG').trim().toUpperCase();
  const status = String(payload.status ?? existing?.status ?? 'DRAFT').trim().toUpperCase();
  const slug = slugify(payload.slug ?? existing?.slug ?? title);
  if (!title) throw httpError('Tiêu đề bài viết là bắt buộc.');
  if (!slug) throw httpError('Slug bài viết không hợp lệ.');
  if (!['BLOG', 'NEWS'].includes(type)) throw httpError('Loại bài viết phải là BLOG hoặc NEWS.');
  if (!['DRAFT', 'PUBLISHED', 'SCHEDULED'].includes(status)) {
    throw httpError('Trạng thái bài viết không hợp lệ.');
  }

  let publishAt = payload.publish_at !== undefined
    ? (payload.publish_at ? new Date(payload.publish_at) : null)
    : (existing?.publish_at || null);
  if (publishAt && Number.isNaN(publishAt.getTime())) throw httpError('Thời gian xuất bản không hợp lệ.');
  if (status === 'SCHEDULED' && (!publishAt || publishAt.getTime() <= Date.now())) {
    throw httpError('Bài hẹn lịch cần thời gian xuất bản trong tương lai.');
  }
  if (status === 'PUBLISHED' && !publishAt) publishAt = new Date();

  return {
    type,
    title,
    slug,
    excerpt: String(payload.excerpt ?? existing?.excerpt ?? '').trim(),
    content: String(payload.content ?? existing?.content ?? ''),
    featured_image: String(payload.featured_image ?? existing?.featured_image ?? '').trim(),
    status,
    publish_at: publishAt,
    published_at: status === 'PUBLISHED'
      ? (existing?.published_at || new Date())
      : null,
    seo: normalizeSeo(payload.seo ?? existing?.seo ?? {})
  };
}

async function audit({ actorId, action, resourceType, resourceId, label, before, after, ip }) {
  await CmsAuditLog.create({
    actor_id: actorId,
    action,
    resource_type: resourceType,
    resource_id: String(resourceId),
    resource_label: label || '',
    before: before || null,
    after: after || null,
    ip_address: ip || ''
  });
}

async function promoteDueArticles() {
  const now = new Date();
  let promoted = 0;
  while (promoted < 100) {
    const item = await CmsArticle.findOneAndUpdate(
      { status: 'SCHEDULED', publish_at: { $lte: now } },
      { $set: { status: 'PUBLISHED', published_at: now } },
      { returnDocument: 'before' }
    );
    if (!item) break;
    const after = {
      ...plain(item),
      status: 'PUBLISHED',
      published_at: now
    };
    await audit({
      actorId: item.updated_by || item.created_by,
      action: 'PUBLISH',
      resourceType: 'ARTICLE',
      resourceId: item._id,
      label: item.title,
      before: plain(item),
      after
    });
    promoted += 1;
  }
  return { promoted };
}

async function listPublicArticles(query = {}) {
  await promoteDueArticles();
  const filter = { status: 'PUBLISHED' };
  if (query.type) {
    const type = String(query.type).toUpperCase();
    if (!['BLOG', 'NEWS'].includes(type)) throw httpError('Loại bài viết không hợp lệ.');
    filter.type = type;
  }
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
  const page = Math.max(Number(query.page) || 1, 1);
  const [items, total] = await Promise.all([
    CmsArticle.find(filter)
      .select('-content -created_by -updated_by')
      .sort({ published_at: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CmsArticle.countDocuments(filter)
  ]);
  return { items, total, page, limit };
}

async function getPublicArticle(slug) {
  await promoteDueArticles();
  const item = await CmsArticle.findOne({ slug: slugify(slug), status: 'PUBLISHED' })
    .select('-created_by -updated_by')
    .lean();
  if (!item) throw httpError('Không tìm thấy bài viết đã xuất bản.', 404);
  return item;
}

async function listAdminArticles(query = {}) {
  const filter = {};
  if (query.type) filter.type = String(query.type).toUpperCase();
  if (query.status) filter.status = String(query.status).toUpperCase();
  if (query.q) {
    const escaped = String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ title: new RegExp(escaped, 'i') }, { slug: new RegExp(escaped, 'i') }];
  }
  return CmsArticle.find(filter).sort({ updatedAt: -1 }).limit(200).lean();
}

async function getAdminArticle(id) {
  if (!mongoose.isValidObjectId(id)) throw httpError('ID bài viết không hợp lệ.');
  const item = await CmsArticle.findById(id).lean();
  if (!item) throw httpError('Không tìm thấy bài viết.', 404);
  return item;
}

async function createArticle(payload, context) {
  try {
    const data = articlePayload(payload);
    await assertMediaAlt([data.featured_image, data.seo.og_image]);
    const item = await CmsArticle.create({
      ...data,
      created_by: context.actorId,
      updated_by: context.actorId
    });
    const after = plain(item);
    await audit({
      actorId: context.actorId,
      action: data.status === 'PUBLISHED' ? 'PUBLISH' : (data.status === 'SCHEDULED' ? 'SCHEDULE' : 'CREATE'),
      resourceType: 'ARTICLE',
      resourceId: item._id,
      label: item.title,
      after,
      ip: context.ip
    });
    return after;
  } catch (error) {
    if (error?.code === 11000) throw httpError('Slug bài viết đã tồn tại.', 409);
    throw error;
  }
}

async function updateArticle(id, payload, context) {
  if (!mongoose.isValidObjectId(id)) throw httpError('ID bài viết không hợp lệ.');
  const item = await CmsArticle.findById(id);
  if (!item) throw httpError('Không tìm thấy bài viết.', 404);
  const before = plain(item);
  const data = articlePayload(payload, before);
  await assertMediaAlt([data.featured_image, data.seo.og_image]);
  Object.assign(item, data, { updated_by: context.actorId });
  try {
    await item.save();
  } catch (error) {
    if (error?.code === 11000) throw httpError('Slug bài viết đã tồn tại.', 409);
    throw error;
  }
  const after = plain(item);
  const action = data.status === 'PUBLISHED' && before.status !== 'PUBLISHED'
    ? 'PUBLISH'
    : (data.status === 'SCHEDULED' ? 'SCHEDULE' : 'UPDATE');
  await audit({
    actorId: context.actorId,
    action,
    resourceType: 'ARTICLE',
    resourceId: item._id,
    label: item.title,
    before,
    after,
    ip: context.ip
  });
  return after;
}

async function deleteArticle(id, context) {
  if (!mongoose.isValidObjectId(id)) throw httpError('ID bài viết không hợp lệ.');
  const item = await CmsArticle.findByIdAndDelete(id);
  if (!item) throw httpError('Không tìm thấy bài viết.', 404);
  const before = plain(item);
  await audit({
    actorId: context.actorId,
    action: 'DELETE',
    resourceType: 'ARTICLE',
    resourceId: item._id,
    label: item.title,
    before,
    ip: context.ip
  });
}

function bannerPayload(payload, existing) {
  const name = String(payload.name ?? existing?.name ?? '').trim();
  const title = String(payload.title ?? existing?.title ?? '').trim();
  if (!name || !title) throw httpError('Tên và tiêu đề banner là bắt buộc.');
  const startsAt = payload.starts_at !== undefined
    ? (payload.starts_at ? new Date(payload.starts_at) : null)
    : (existing?.starts_at || null);
  const endsAt = payload.ends_at !== undefined
    ? (payload.ends_at ? new Date(payload.ends_at) : null)
    : (existing?.ends_at || null);
  if (startsAt && Number.isNaN(startsAt.getTime())) throw httpError('Thời gian bắt đầu không hợp lệ.');
  if (endsAt && Number.isNaN(endsAt.getTime())) throw httpError('Thời gian kết thúc không hợp lệ.');
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw httpError('Thời gian kết thúc phải sau thời gian bắt đầu.');
  }
  return {
    name,
    title,
    subtitle: String(payload.subtitle ?? existing?.subtitle ?? '').trim(),
    image_url: String(payload.image_url ?? existing?.image_url ?? '').trim(),
    mobile_image_url: String(payload.mobile_image_url ?? existing?.mobile_image_url ?? '').trim(),
    link_url: String(payload.link_url ?? existing?.link_url ?? '').trim(),
    link_label: String(payload.link_label ?? existing?.link_label ?? '').trim(),
    placement: String(payload.placement ?? existing?.placement ?? 'HOME').trim().toUpperCase(),
    enabled: payload.enabled !== undefined ? payload.enabled !== false : existing?.enabled !== false,
    starts_at: startsAt,
    ends_at: endsAt,
    priority: Number(payload.priority ?? existing?.priority ?? 0) || 0
  };
}

async function listPublicBanners(query = {}) {
  const now = new Date();
  const filter = {
    enabled: true,
    $and: [
      { $or: [{ starts_at: null }, { starts_at: { $lte: now } }] },
      { $or: [{ ends_at: null }, { ends_at: { $gt: now } }] }
    ]
  };
  if (query.placement) filter.placement = String(query.placement).trim().toUpperCase();
  return WebsiteBanner.find(filter)
    .select('-created_by -updated_by')
    .sort({ priority: -1, createdAt: -1 })
    .lean();
}

async function listAdminBanners() {
  return WebsiteBanner.find({}).sort({ priority: -1, updatedAt: -1 }).limit(200).lean();
}

async function createBanner(payload, context) {
  const data = bannerPayload(payload);
  await assertMediaAlt([data.image_url, data.mobile_image_url]);
  const item = await WebsiteBanner.create({
    ...data,
    created_by: context.actorId,
    updated_by: context.actorId
  });
  const after = plain(item);
  await audit({
    actorId: context.actorId,
    action: 'CREATE',
    resourceType: 'BANNER',
    resourceId: item._id,
    label: item.name,
    after,
    ip: context.ip
  });
  return after;
}

async function updateBanner(id, payload, context) {
  if (!mongoose.isValidObjectId(id)) throw httpError('ID banner không hợp lệ.');
  const item = await WebsiteBanner.findById(id);
  if (!item) throw httpError('Không tìm thấy banner.', 404);
  const before = plain(item);
  const data = bannerPayload(payload, before);
  await assertMediaAlt([data.image_url, data.mobile_image_url]);
  Object.assign(item, data, { updated_by: context.actorId });
  await item.save();
  const after = plain(item);
  await audit({
    actorId: context.actorId,
    action: 'UPDATE',
    resourceType: 'BANNER',
    resourceId: item._id,
    label: item.name,
    before,
    after,
    ip: context.ip
  });
  return after;
}

async function deleteBanner(id, context) {
  if (!mongoose.isValidObjectId(id)) throw httpError('ID banner không hợp lệ.');
  const item = await WebsiteBanner.findByIdAndDelete(id);
  if (!item) throw httpError('Không tìm thấy banner.', 404);
  const before = plain(item);
  await audit({
    actorId: context.actorId,
    action: 'DELETE',
    resourceType: 'BANNER',
    resourceId: item._id,
    label: item.name,
    before,
    ip: context.ip
  });
}

async function listAuditLogs(query = {}) {
  const filter = {};
  if (query.resource_type) filter.resource_type = String(query.resource_type).toUpperCase();
  if (query.action) filter.action = String(query.action).toUpperCase();
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);
  const [items, total] = await Promise.all([
    CmsAuditLog.find(filter)
      .populate('actor_id', 'full_name email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CmsAuditLog.countDocuments(filter)
  ]);
  return {
    items,
    total,
    page,
    limit,
    total_pages: Math.max(1, Math.ceil(total / limit))
  };
}

function restoreSnapshotForAudit(version) {
  return version.action === 'DELETE' ? version.before : (version.after || version.before);
}

function restoreModelForType(resourceType) {
  return {
    ARTICLE: CmsArticle,
    BANNER: WebsiteBanner,
    MEDIA: LandingMedia,
    PAGE: LandingPage,
    CONFIG: WebsiteConfig
  }[resourceType] || null;
}

async function restoreFromAudit(id, context) {
  if (!mongoose.isValidObjectId(id)) throw httpError('ID nhật ký không hợp lệ.');
  const version = await CmsAuditLog.findById(id).lean();
  if (!version) throw httpError('Không tìm thấy phiên bản CMS.', 404);
  const snapshot = restoreSnapshotForAudit(version);
  if (!snapshot || typeof snapshot !== 'object') {
    throw httpError('Nhật ký này không có dữ liệu để khôi phục.');
  }

  const Model = restoreModelForType(version.resource_type);
  if (!Model) throw httpError('Loại dữ liệu CMS này chưa hỗ trợ khôi phục.');

  const lookup = version.resource_type === 'PAGE'
    ? { slug: version.resource_id }
    : version.resource_type === 'CONFIG'
      ? { key: version.resource_id }
      : { _id: version.resource_id };
  let doc = await Model.findOne(lookup);
  const before = plain(doc);
  if (version.resource_type === 'MEDIA' && snapshot.storage_asset_id) {
    await restoreAsset(snapshot.storage_asset_id);
  } else if (
    version.resource_type === 'MEDIA' &&
    snapshot.storage_key &&
    !await objectExists({
      key: snapshot.storage_key,
      bucket: snapshot.storage_bucket,
      backend: snapshot.storage_backend
    })
  ) {
    throw httpError('Object media không còn trong thời hạn lưu giữ.', 409);
  }
  const values = {};
  Object.keys(Model.schema.paths).forEach((path) => {
    if (['_id', '__v', 'createdAt', 'updatedAt'].includes(path)) return;
    const value = path.split('.').reduce(
      (current, part) => current === undefined || current === null ? undefined : current[part],
      snapshot
    );
    if (value !== undefined) values[path] = value;
  });
  if (version.resource_type === 'CONFIG' && Array.isArray(values.navigation)) {
    values.navigation = values.navigation.filter((item) => {
      const href = String(item.href || '').toLowerCase();
      const label = String(item.label || '').toLowerCase();
      return !href.includes('demo') && label !== 'demo';
    });
  }
  if (Model.schema.path('updated_by')) values.updated_by = context.actorId;
  if (doc) {
    Object.entries(values).forEach(([path, value]) => doc.set(path, value));
  } else {
    doc = new Model({
      ...values,
      ...(snapshot._id && mongoose.isValidObjectId(snapshot._id) ? { _id: snapshot._id } : {})
    });
  }
  try {
    await doc.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw httpError('Không thể khôi phục vì slug hoặc dữ liệu duy nhất đã được sử dụng.', 409);
    }
    throw error;
  }
  const after = plain(doc);
  await audit({
    actorId: context.actorId,
    action: 'RESTORE',
    resourceType: version.resource_type,
    resourceId: version.resource_id,
    label: `Khôi phục ${version.resource_label || version.resource_id}`,
    before,
    after,
    ip: context.ip
  });
  return after;
}

module.exports = {
  slugify,
  audit,
  promoteDueArticles,
  listPublicArticles,
  getPublicArticle,
  listAdminArticles,
  getAdminArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  listPublicBanners,
  listAdminBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  listAuditLogs,
  restoreSnapshotForAudit,
  restoreModelForType,
  restoreFromAudit
};
