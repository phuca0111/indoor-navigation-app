const Asset = require('../models/Asset');
const LandingMedia = require('../models/LandingMedia');
const StorageUploadIntent = require('../models/StorageUploadIntent');
const CmsRevision = require('../models/CmsRevision');
const CmsAuditLog = require('../models/CmsAuditLog');
const AuditLog = require('../models/AuditLog');
const CmsArticle = require('../models/CmsArticle');
const WebsiteBanner = require('../models/WebsiteBanner');
const LandingPage = require('../models/LandingPage');
const WebsiteConfig = require('../models/WebsiteConfig');
const Building = require('../models/Building');
const Organization = require('../models/Organization');

function opts(session, extra = {}) {
  return session ? { ...extra, session } : extra;
}

function dto(value) {
  return value?.toObject ? value.toObject() : value;
}

async function storageUsage(filter, { session } = {}) {
  let aggregate = Asset.aggregate([
    { $match: filter },
    { $group: { _id: null, used: { $sum: '$size' } } }
  ]);
  if (session) aggregate = aggregate.session(session);
  const rows = await aggregate;
  return Number(rows[0]?.used) || 0;
}

async function createAsset(input, { session } = {}) {
  const [doc] = await Asset.create([input], opts(session));
  return dto(doc);
}

async function findAssetById(id, { session } = {}) {
  let query = Asset.findById(id);
  if (session) query = query.session(session);
  return query.lean();
}

async function updateAsset(id, expected, update, { session } = {}) {
  return Asset.findOneAndUpdate(
    { _id: id, ...expected },
    update,
    opts(session, { new: true, runValidators: true })
  ).lean();
}

async function updateAssetByLocation(backend, key, update, { session } = {}) {
  return Asset.findOneAndUpdate(
    { backend, key },
    update,
    opts(session, { new: true, runValidators: true })
  ).lean();
}

async function findBuildingForUpload(id) {
  return Building.findById(id).select('organization_id total_floors').lean();
}

async function findOrganizationForUpload(id) {
  return Organization.findById(id).lean();
}

async function findPurgeCandidates(now, limit, { session } = {}) {
  let query = Asset.find({
    status: 'DELETED',
    ref_count: 0,
    retention_until: { $lte: now }
  }).sort({ retention_until: 1 }).limit(limit);
  if (session) query = query.session(session);
  return query.lean();
}

async function countMediaReferences(assetId, { excludeMediaId, session } = {}) {
  const filter = {
    storage_asset_id: assetId,
    status: 'ACTIVE'
  };
  if (excludeMediaId) filter._id = { $ne: excludeMediaId };
  let query = LandingMedia.countDocuments(filter);
  if (session) query = query.session(session);
  return query;
}

function containsUrl(value, url) {
  if (typeof value === 'string') return value.includes(url);
  if (Array.isArray(value)) return value.some((item) => containsUrl(item, url));
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => containsUrl(item, url));
  }
  return false;
}

async function countContentReferences(url, { session } = {}) {
  const escaped = String(url || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped);
  const articleQuery = CmsArticle.countDocuments({
    deleted_at: null,
    $or: [{ featured_image: url }, { 'seo.og_image': url }, { content: regex }]
  });
  const bannerQuery = WebsiteBanner.countDocuments({
    deleted_at: null,
    $or: [{ image_url: url }, { mobile_image_url: url }]
  });
  let pagesQuery = LandingPage.find({}).select('draft_sections published_sections');
  let configQuery = WebsiteConfig.find({}).select('settings theme seo navigation banner');
  if (session) {
    articleQuery.session(session);
    bannerQuery.session(session);
    pagesQuery = pagesQuery.session(session);
    configQuery = configQuery.session(session);
  }
  const [articles, banners, pages, configs] = await Promise.all([
    articleQuery,
    bannerQuery,
    pagesQuery.lean(),
    configQuery.lean()
  ]);
  return Number(articles) + Number(banners) +
    pages.filter((page) => containsUrl(page, url)).length +
    configs.filter((config) => containsUrl(config, url)).length;
}

async function createMedia(input, { session } = {}) {
  const [doc] = await LandingMedia.create([input], opts(session));
  return dto(doc);
}

async function findMediaById(id, { session } = {}) {
  let query = LandingMedia.findById(id);
  if (session) query = query.session(session);
  return query.lean();
}

async function findMediaByAssetId(assetId, { session } = {}) {
  let query = LandingMedia.find({ storage_asset_id: assetId }).select('url status');
  if (session) query = query.session(session);
  return query.lean();
}

async function updateMedia(id, expected, update, { session } = {}) {
  return LandingMedia.findOneAndUpdate(
    { _id: id, ...expected },
    update,
    opts(session, { new: true, runValidators: true })
  ).lean();
}

async function listMedia(filter, paging, { session } = {}) {
  let query = LandingMedia.find(filter)
    .sort({ createdAt: -1 })
    .skip(paging.skip)
    .limit(paging.limit);
  if (session) query = query.session(session);
  let count = LandingMedia.countDocuments(filter);
  if (session) count = count.session(session);
  const [items, total] = await Promise.all([query.lean(), count]);
  return { items, total };
}

async function createIntent(input, { session } = {}) {
  const [doc] = await StorageUploadIntent.create([input], opts(session));
  return dto(doc);
}

async function findIntent(filter, { session } = {}) {
  let query = StorageUploadIntent.findOne(filter);
  if (session) query = query.session(session);
  return query.lean();
}

async function updateIntent(id, expected, update, { session } = {}) {
  return StorageUploadIntent.findOneAndUpdate(
    { _id: id, ...expected },
    update,
    opts(session, { new: true })
  ).lean();
}

async function findStaleIntents(now, staleBefore, limit) {
  return StorageUploadIntent.find({
    $or: [
      { status: 'PENDING', expires_at: { $lte: now } },
      { status: 'COMPLETING', claimed_at: { $lte: staleBefore } }
    ]
  }).sort({ updatedAt: 1 }).limit(limit).lean();
}

async function appendHistory({
  actorId,
  action,
  resourceId,
  label,
  before,
  after,
  ip,
  correlationId,
  revision
}, { session } = {}) {
  const snapshot = after || before;
  const [revisionDoc] = await CmsRevision.create([{
    resource_type: 'MEDIA',
    resource_id: String(resourceId),
    revision,
    action,
    snapshot,
    actor_id: actorId,
    correlation_id: correlationId || ''
  }], opts(session));
  const [audit] = await CmsAuditLog.create([{
    actor_id: actorId,
    action,
    resource_type: 'MEDIA',
    resource_id: String(resourceId),
    resource_label: label || '',
    before: before || null,
    after: after || null,
    ip_address: ip || '',
    revision_id: revisionDoc._id,
    resource_version: revision
  }], opts(session));
  await AuditLog.create([{
    source: 'CMS_AUDIT_LOG',
    source_id: audit._id,
    actor_type: 'USER',
    actor_id: String(actorId),
    action: `CMS_${action}`,
    resource_type: 'MEDIA',
    resource_id: String(resourceId),
    before: before || null,
    after: after || null,
    ip_address: ip || '',
    correlation_id: correlationId || ''
  }], opts(session));
  return dto(revisionDoc);
}

module.exports = {
  storageUsage,
  createAsset,
  findAssetById,
  updateAsset,
  updateAssetByLocation,
  findBuildingForUpload,
  findOrganizationForUpload,
  findPurgeCandidates,
  countMediaReferences,
  countContentReferences,
  createMedia,
  findMediaById,
  findMediaByAssetId,
  updateMedia,
  listMedia,
  createIntent,
  findIntent,
  updateIntent,
  findStaleIntents,
  appendHistory
};
