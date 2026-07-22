const cmsRepository = require('../../repositories/cmsRepository');
const mediaRepository = require('../../repositories/mediaRepository');
const outboxRepository = require('../../repositories/outboxRepository');
const { createStorageAdapter } = require('../../services/storagePlatform');
const { runContentCommand } = require('./runContentCommand');

function error(message, status = 400, code = 'CMS_ERROR') {
  return Object.assign(new Error(message), { status, code });
}

function slugify(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180);
}

function normalizeSeo(value = {}) {
  const keywords = Array.isArray(value.keywords)
    ? value.keywords
    : String(value.keywords || '').split(',');
  return {
    meta_title: String(value.meta_title || '').trim(),
    meta_description: String(value.meta_description || '').trim(),
    keywords: keywords.map((item) => String(item).trim()).filter(Boolean).slice(0, 30),
    canonical_url: String(value.canonical_url || '').trim(),
    og_title: String(value.og_title || '').trim(),
    og_description: String(value.og_description || '').trim(),
    og_image: String(value.og_image || '').trim(),
    robots: String(value.robots || 'index,follow').trim()
  };
}

function articlePayload(payload, existing = {}) {
  const title = String(payload.title ?? existing.title ?? '').trim();
  const type = String(payload.type ?? existing.type ?? 'BLOG').toUpperCase();
  const status = String(payload.status ?? existing.status ?? 'DRAFT').toUpperCase();
  const slug = slugify(payload.slug ?? existing.slug ?? title);
  if (!title || !slug) throw error('Tiêu đề hoặc slug bài viết không hợp lệ.');
  if (!['BLOG', 'NEWS'].includes(type)) throw error('Loại bài viết phải là BLOG hoặc NEWS.');
  if (!['DRAFT', 'PUBLISHED', 'SCHEDULED'].includes(status)) {
    throw error('Trạng thái bài viết không hợp lệ.');
  }
  const publishAt = payload.publish_at !== undefined
    ? (payload.publish_at ? new Date(payload.publish_at) : null)
    : (existing.publish_at || null);
  if (publishAt && Number.isNaN(publishAt.getTime())) throw error('Thời gian xuất bản không hợp lệ.');
  if (status === 'SCHEDULED' && (!publishAt || publishAt <= new Date())) {
    throw error('Bài hẹn lịch cần thời gian xuất bản trong tương lai.');
  }
  return {
    type,
    title,
    slug,
    excerpt: String(payload.excerpt ?? existing.excerpt ?? '').trim(),
    content: String(payload.content ?? existing.content ?? ''),
    featured_image: String(payload.featured_image ?? existing.featured_image ?? '').trim(),
    status,
    publish_at: status === 'PUBLISHED' && !publishAt ? new Date() : publishAt,
    published_at: status === 'PUBLISHED' ? (existing.published_at || new Date()) : null,
    seo: normalizeSeo(payload.seo ?? existing.seo ?? {})
  };
}

function bannerPayload(payload, existing = {}) {
  const name = String(payload.name ?? existing.name ?? '').trim();
  const title = String(payload.title ?? existing.title ?? '').trim();
  if (!name || !title) throw error('Tên và tiêu đề banner là bắt buộc.');
  const startsAt = payload.starts_at !== undefined
    ? (payload.starts_at ? new Date(payload.starts_at) : null)
    : (existing.starts_at || null);
  const endsAt = payload.ends_at !== undefined
    ? (payload.ends_at ? new Date(payload.ends_at) : null)
    : (existing.ends_at || null);
  if ((startsAt && Number.isNaN(startsAt.getTime())) ||
      (endsAt && Number.isNaN(endsAt.getTime()))) {
    throw error('Thời gian banner không hợp lệ.');
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw error('Thời gian kết thúc phải sau thời gian bắt đầu.');
  }
  return {
    name,
    title,
    subtitle: String(payload.subtitle ?? existing.subtitle ?? '').trim(),
    image_url: String(payload.image_url ?? existing.image_url ?? '').trim(),
    mobile_image_url: String(payload.mobile_image_url ?? existing.mobile_image_url ?? '').trim(),
    link_url: String(payload.link_url ?? existing.link_url ?? '').trim(),
    link_label: String(payload.link_label ?? existing.link_label ?? '').trim(),
    placement: String(payload.placement ?? existing.placement ?? 'HOME').toUpperCase(),
    enabled: payload.enabled !== undefined ? payload.enabled !== false : existing.enabled !== false,
    starts_at: startsAt,
    ends_at: endsAt,
    priority: Number(payload.priority ?? existing.priority ?? 0) || 0
  };
}

async function assertMediaAlt(urls, session) {
  const normalized = urls.map((item) => String(item || '').trim()).filter(Boolean);
  if (normalized.length && await cmsRepository.mediaWithoutAlt(normalized, { session })) {
    throw error('Media dùng trong nội dung phải có Alt.');
  }
}

function eventFor(resourceType, item, context) {
  return {
    type: 'CmsContentChanged',
    event_key: `CmsContentChanged:${resourceType}:${item._id}:r${item.revision}`,
    aggregate_type: resourceType,
    aggregate_id: String(item._id),
    actor_user_id: context.actorId,
    correlation_id: context.correlationId,
    payload: {
      resource_type: resourceType,
      resource_id: String(item._id),
      revision: item.revision,
      deleted: Boolean(item.deleted_at) || item.status === 'DELETED'
    }
  };
}

async function recordMutation(resourceType, before, after, action, context, session) {
  const resourceId = resourceType === 'PAGE'
    ? after.slug
    : resourceType === 'CONFIG'
      ? after.key
      : after._id;
  await cmsRepository.appendHistory({
    resourceType,
    resourceId,
    revision: after.revision,
    action,
    snapshot: after,
    actorId: context.actorId,
    label: after.title || after.name,
    before,
    after,
    ip: context.ip,
    correlationId: context.correlationId
  }, { session });
  await outboxRepository.append(eventFor(resourceType, after, context), { session });
}

function formatRelative(date) {
  if (!date) return '—';
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Hôm qua' : `${days} ngày trước`;
}

function pageDto(page, draft = true) {
  return {
    ...page,
    sections: draft ? page.draft_sections : page.published_sections,
    updated_label: formatRelative(page.updatedAt)
  };
}

async function listPages() {
  const pages = await cmsRepository.listAdminPages();
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
  const page = await cmsRepository.findById('PAGE', slug);
  if (!page) throw error('Không tìm thấy trang.', 404, 'CMS_NOT_FOUND');
  return pageDto(page, draft);
}

async function savePageDraft(slug, payload, context) {
  return runContentCommand(async (session) => {
    const before = await cmsRepository.findById('PAGE', slug, { session });
    if (!before) throw error('Không tìm thấy trang.', 404, 'CMS_NOT_FOUND');
    const update = {
      ...(payload.title ? { title: String(payload.title).trim() } : {}),
      ...(Array.isArray(payload.sections) ? { draft_sections: payload.sections } : {}),
      status: 'DRAFT',
      updated_by: context.actorId
    };
    const after = await cmsRepository.compareAndUpdate(
      'PAGE',
      slug,
      before.revision,
      { $set: update },
      { session }
    );
    if (!after) throw error('Trang đã bị thay đổi đồng thời.', 409, 'CMS_CONFLICT');
    await recordMutation('PAGE', before, after, 'UPDATE', context, session);
    return pageDto(after, true);
  });
}

async function publishPage(slug, context) {
  return runContentCommand(async (session) => {
    const before = await cmsRepository.findById('PAGE', slug, { session });
    if (!before) throw error('Không tìm thấy trang.', 404, 'CMS_NOT_FOUND');
    const after = await cmsRepository.compareAndUpdate(
      'PAGE',
      slug,
      before.revision,
      {
        $set: {
          published_sections: before.draft_sections,
          status: 'PUBLISHED',
          published_at: new Date(),
          updated_by: context.actorId
        }
      },
      { session }
    );
    if (!after) throw error('Trang đã bị thay đổi đồng thời.', 409, 'CMS_CONFLICT');
    await recordMutation('PAGE', before, after, 'PUBLISH', context, session);
    return pageDto(after, true);
  });
}

function normalizeNavigation(items) {
  return (Array.isArray(items) ? items : [])
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
    }))
    .sort((left, right) => left.order - right.order);
}

async function getAdminConfig() {
  const config = await cmsRepository.findById('CONFIG', 'default');
  if (!config) throw error('Chưa khởi tạo cấu hình website.', 404, 'CMS_NOT_FOUND');
  return config;
}

async function updateConfig(patch, context) {
  return runContentCommand(async (session) => {
    const before = await cmsRepository.findById('CONFIG', 'default', { session });
    if (!before) throw error('Chưa khởi tạo cấu hình website.', 404, 'CMS_NOT_FOUND');
    const values = {};
    for (const key of ['settings', 'theme', 'seo', 'banner']) {
      if (patch[key] && typeof patch[key] === 'object') {
        values[key] = { ...(before[key] || {}), ...patch[key] };
      }
    }
    if (Array.isArray(patch.navigation)) values.navigation = normalizeNavigation(patch.navigation);
    if (values.banner && /demo|org-trial/i.test(String(values.banner.cta_href || ''))) {
      values.banner.cta_href = '/login';
    }
    values.updated_by = context.actorId;
    const after = await cmsRepository.compareAndUpdate(
      'CONFIG',
      'default',
      before.revision,
      { $set: values },
      { session }
    );
    if (!after) throw error('Cấu hình đã bị thay đổi đồng thời.', 409, 'CMS_CONFLICT');
    await recordMutation('CONFIG', before, after, 'UPDATE', context, session);
    return after;
  });
}

async function createArticle(payload, context) {
  try {
    return await runContentCommand(async (session) => {
      const data = articlePayload(payload);
      await assertMediaAlt([data.featured_image, data.seo.og_image], session);
      const item = await cmsRepository.create('ARTICLE', {
        ...data,
        created_by: context.actorId,
        updated_by: context.actorId,
        revision: 1
      }, { session });
      const action = data.status === 'PUBLISHED'
        ? 'PUBLISH' : data.status === 'SCHEDULED' ? 'SCHEDULE' : 'CREATE';
      await recordMutation('ARTICLE', null, item, action, context, session);
      return item;
    });
  } catch (cause) {
    if (cause?.code === 11000) throw error('Slug bài viết đã tồn tại.', 409, 'CMS_SLUG_CONFLICT');
    throw cause;
  }
}

async function updateArticle(id, payload, context) {
  return runContentCommand(async (session) => {
    const before = await cmsRepository.findById('ARTICLE', id, { session });
    if (!before || before.deleted_at) throw error('Không tìm thấy bài viết.', 404, 'CMS_NOT_FOUND');
    const data = articlePayload(payload, before);
    await assertMediaAlt([data.featured_image, data.seo.og_image], session);
    const after = await cmsRepository.compareAndUpdate(
      'ARTICLE',
      id,
      before.revision,
      { $set: { ...data, updated_by: context.actorId } },
      { session }
    );
    if (!after) throw error('Bài viết đã bị thay đổi đồng thời.', 409, 'CMS_CONFLICT');
    const action = data.status === 'PUBLISHED' && before.status !== 'PUBLISHED'
      ? 'PUBLISH' : data.status === 'SCHEDULED' ? 'SCHEDULE' : 'UPDATE';
    await recordMutation('ARTICLE', before, after, action, context, session);
    return after;
  });
}

async function deleteArticle(id, context) {
  return runContentCommand(async (session) => {
    const before = await cmsRepository.findById('ARTICLE', id, { session });
    if (!before || before.deleted_at) throw error('Không tìm thấy bài viết.', 404, 'CMS_NOT_FOUND');
    const after = await cmsRepository.compareAndUpdate(
      'ARTICLE',
      id,
      before.revision,
      { $set: { status: 'DELETED', deleted_at: new Date(), updated_by: context.actorId } },
      { session }
    );
    if (!after) throw error('Bài viết đã bị thay đổi đồng thời.', 409, 'CMS_CONFLICT');
    await recordMutation('ARTICLE', before, after, 'DELETE', context, session);
  });
}

async function createBanner(payload, context) {
  return runContentCommand(async (session) => {
    const data = bannerPayload(payload);
    await assertMediaAlt([data.image_url, data.mobile_image_url], session);
    const item = await cmsRepository.create('BANNER', {
      ...data,
      created_by: context.actorId,
      updated_by: context.actorId,
      revision: 1
    }, { session });
    await recordMutation('BANNER', null, item, 'CREATE', context, session);
    return item;
  });
}

async function updateBanner(id, payload, context) {
  return runContentCommand(async (session) => {
    const before = await cmsRepository.findById('BANNER', id, { session });
    if (!before || before.deleted_at) throw error('Không tìm thấy banner.', 404, 'CMS_NOT_FOUND');
    const data = bannerPayload(payload, before);
    await assertMediaAlt([data.image_url, data.mobile_image_url], session);
    const after = await cmsRepository.compareAndUpdate(
      'BANNER',
      id,
      before.revision,
      { $set: { ...data, updated_by: context.actorId } },
      { session }
    );
    if (!after) throw error('Banner đã bị thay đổi đồng thời.', 409, 'CMS_CONFLICT');
    await recordMutation('BANNER', before, after, 'UPDATE', context, session);
    return after;
  });
}

async function deleteBanner(id, context) {
  return runContentCommand(async (session) => {
    const before = await cmsRepository.findById('BANNER', id, { session });
    if (!before || before.deleted_at) throw error('Không tìm thấy banner.', 404, 'CMS_NOT_FOUND');
    const after = await cmsRepository.compareAndUpdate(
      'BANNER',
      id,
      before.revision,
      { $set: { deleted_at: new Date(), enabled: false, updated_by: context.actorId } },
      { session }
    );
    if (!after) throw error('Banner đã bị thay đổi đồng thời.', 409, 'CMS_CONFLICT');
    await recordMutation('BANNER', before, after, 'DELETE', context, session);
  });
}

async function listPublicArticles(query = {}) {
  const filter = {};
  if (query.type) {
    const type = String(query.type).toUpperCase();
    if (!['BLOG', 'NEWS'].includes(type)) throw error('Loại bài viết không hợp lệ.');
    filter.type = type;
  }
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
  const page = Math.max(Number(query.page) || 1, 1);
  const result = await cmsRepository.listPublicArticles(
    filter,
    { skip: (page - 1) * limit, limit }
  );
  return { ...result, page, limit };
}

async function getPublicArticle(slug) {
  const item = await cmsRepository.getPublicArticle(slugify(slug));
  if (!item) throw error('Không tìm thấy bài viết đã xuất bản.', 404, 'CMS_NOT_FOUND');
  return item;
}

async function listAdminArticles(query = {}) {
  const filter = {};
  if (query.type) filter.type = String(query.type).toUpperCase();
  if (query.status) filter.status = String(query.status).toUpperCase();
  else filter.deleted_at = null;
  if (query.q) {
    const escaped = String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ title: new RegExp(escaped, 'i') }, { slug: new RegExp(escaped, 'i') }];
  }
  return cmsRepository.listAdminArticles(filter);
}

async function getAdminArticle(id) {
  const item = await cmsRepository.findById('ARTICLE', id);
  if (!item) throw error('Không tìm thấy bài viết.', 404, 'CMS_NOT_FOUND');
  return item;
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
  if (query.placement) filter.placement = String(query.placement).toUpperCase();
  return cmsRepository.listPublicBanners(filter);
}

const listAdminBanners = () => cmsRepository.listAdminBanners();

async function getPublicBundle() {
  const [config, pages, banners, articles] = await Promise.all([
    cmsRepository.getPublicWebsiteConfig(),
    cmsRepository.listPublishedPages(),
    listPublicBanners(),
    listPublicArticles({ limit: 6 })
  ]);
  const safeConfig = config || {
    settings: {},
    theme: {},
    seo: {},
    navigation: [],
    banner: {}
  };
  return {
    settings: safeConfig.settings || {},
    theme: safeConfig.theme || {},
    seo: safeConfig.seo || {},
    navigation: (safeConfig.navigation || [])
      .filter((item) => item.enabled)
      .filter((item) => {
        const href = String(item.href || '').toLowerCase();
        const label = String(item.label || '').toLowerCase();
        return !href.includes('demo') && label !== 'demo';
      })
      .sort((left, right) => left.order - right.order),
    banner: safeConfig.banner || {},
    banners,
    articles: articles.items || [],
    pages: pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      path: page.path,
      sections: page.published_sections || [],
      published_at: page.published_at
    }))
  };
}

async function promoteDueArticles(limit = 100, context = {}) {
  let promoted = 0;
  while (promoted < Math.min(500, Math.max(1, Number(limit) || 100))) {
    const changed = await runContentCommand(async (session) => {
      const after = await cmsRepository.claimDueArticle(new Date(), { session });
      if (!after) return false;
      const before = { ...after, status: 'SCHEDULED', revision: after.revision - 1 };
      await recordMutation('ARTICLE', before, after, 'PUBLISH', {
        actorId: after.updated_by || after.created_by,
        correlationId: `cms-scheduler:${after._id}:r${after.revision}`,
        ...context
      }, session);
      return true;
    });
    if (!changed) break;
    promoted += 1;
  }
  return { promoted };
}

async function restoreFromAudit(auditId, context) {
  return runContentCommand(async (session) => {
    const version = await cmsRepository.getAuditById(auditId);
    if (!version) throw error('Không tìm thấy phiên bản CMS.', 404, 'CMS_NOT_FOUND');
    if (version.resource_type === 'MEDIA') {
      const before = await mediaRepository.findMediaById(version.resource_id, { session });
      const snapshot = version.action === 'DELETE' ? version.before : (version.after || version.before);
      if (!before || !snapshot) throw error('Media gốc không còn tồn tại.', 409, 'CMS_RESTORE_MISSING');
      if (before.storage_asset_id) {
        const asset = await mediaRepository.findAssetById(before.storage_asset_id, { session });
        if (!asset || asset.status === 'PURGED') {
          throw error('Object media không còn trong thời hạn lưu giữ.', 409, 'STORAGE_OBJECT_MISSING');
        }
        if (asset?.key && asset.backend !== 'external') {
          const head = await createStorageAdapter(asset.backend).head({
            key: asset.key,
            bucket: asset.bucket
          });
          if (!head.exists) throw error('Object media không còn trong thời hạn lưu giữ.', 409, 'STORAGE_OBJECT_MISSING');
        }
        await mediaRepository.updateAsset(
          asset._id,
          { status: { $ne: 'PURGED' } },
          {
            $set: { status: 'ACTIVE', deleted_at: null, retention_until: null },
            $inc: { ref_count: 1 }
          },
          { session }
        );
      }
      const values = { ...snapshot, status: 'ACTIVE', deleted_at: null, retention_until: null };
      for (const key of ['_id', '__v', 'createdAt', 'updatedAt', 'revision']) delete values[key];
      const after = await mediaRepository.updateMedia(
        before._id,
        { revision: before.revision, status: { $ne: 'PURGED' } },
        { $set: values, $inc: { revision: 1 } },
        { session }
      );
      if (!after) throw error('Media đã thay đổi trong lúc restore.', 409, 'CMS_CONFLICT');
      await mediaRepository.appendHistory({
        actorId: context.actorId,
        action: 'RESTORE',
        resourceId: after._id,
        label: after.name,
        before,
        after,
        ip: context.ip,
        correlationId: context.correlationId,
        revision: after.revision
      }, { session });
      await outboxRepository.append(eventFor('MEDIA', after, context), { session });
      return after;
    }
    if (!['ARTICLE', 'BANNER', 'PAGE', 'CONFIG'].includes(version.resource_type)) {
      throw error('Loại dữ liệu này dùng restore chuyên biệt.', 409, 'CMS_RESTORE_UNSUPPORTED');
    }
    const snapshot = version.action === 'DELETE' ? version.before : (version.after || version.before);
    const current = await cmsRepository.findById(version.resource_type, version.resource_id, { session });
    if (!current) throw error('Đối tượng gốc không còn tồn tại.', 409, 'CMS_RESTORE_MISSING');
    const values = { ...snapshot };
    for (const key of ['_id', '__v', 'createdAt', 'updatedAt', 'revision']) delete values[key];
    if (version.resource_type === 'ARTICLE') {
      values.deleted_at = null;
      if (values.status === 'DELETED') values.status = 'DRAFT';
    } else if (version.resource_type === 'BANNER') {
      values.deleted_at = null;
    }
    if (version.resource_type === 'CONFIG' && Array.isArray(values.navigation)) {
      values.navigation = normalizeNavigation(values.navigation);
    }
    values.updated_by = context.actorId;
    const resourceIdentity = ['PAGE', 'CONFIG'].includes(version.resource_type)
      ? version.resource_id
      : current._id;
    const after = await cmsRepository.compareAndUpdate(
      version.resource_type,
      resourceIdentity,
      current.revision,
      { $set: values },
      { session }
    );
    if (!after) throw error('Nội dung đã thay đổi trong lúc restore.', 409, 'CMS_CONFLICT');
    await recordMutation(version.resource_type, current, after, 'RESTORE', context, session);
    return after;
  });
}

async function listAuditLogs(query = {}) {
  const filter = {};
  if (query.resource_type) filter.resource_type = String(query.resource_type).toUpperCase();
  if (query.action) filter.action = String(query.action).toUpperCase();
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);
  const result = await cmsRepository.listAudit(
    filter,
    { skip: (page - 1) * limit, limit }
  );
  return {
    ...result,
    page,
    limit,
    total_pages: Math.max(1, Math.ceil(result.total / limit))
  };
}

module.exports = {
  slugify,
  listPages,
  getPage,
  savePageDraft,
  publishPage,
  getAdminConfig,
  updateConfig,
  listPublicArticles,
  getPublicArticle,
  listAdminArticles,
  getAdminArticle,
  createArticle,
  updateArticle,
  deleteArticle,
  listPublicBanners,
  getPublicBundle,
  listAdminBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  promoteDueArticles,
  restoreFromAudit,
  listAuditLogs
};
