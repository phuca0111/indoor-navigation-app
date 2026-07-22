const CmsArticle = require('../models/CmsArticle');
const WebsiteBanner = require('../models/WebsiteBanner');
const CmsAuditLog = require('../models/CmsAuditLog');
const CmsRevision = require('../models/CmsRevision');
const AuditLog = require('../models/AuditLog');
const LandingMedia = require('../models/LandingMedia');
const WebsiteConfig = require('../models/WebsiteConfig');
const LandingPage = require('../models/LandingPage');

function opts(session, extra = {}) {
  return session ? { ...extra, session } : extra;
}

function model(resourceType) {
  return {
    ARTICLE: CmsArticle,
    BANNER: WebsiteBanner,
    PAGE: LandingPage,
    CONFIG: WebsiteConfig
  }[resourceType] || null;
}

function identity(resourceType, id) {
  if (resourceType === 'PAGE') return { slug: id };
  if (resourceType === 'CONFIG') return { key: id };
  return { _id: id };
}

async function findById(resourceType, id, { session } = {}) {
  let query = model(resourceType).findOne(identity(resourceType, id));
  if (session) query = query.session(session);
  return query.lean();
}

async function create(resourceType, input, { session } = {}) {
  const [doc] = await model(resourceType).create([input], opts(session));
  return doc.toObject();
}

async function compareAndUpdate(resourceType, id, revision, update, { session } = {}) {
  return model(resourceType).findOneAndUpdate(
    { ...identity(resourceType, id), revision },
    { ...update, $inc: { ...(update.$inc || {}), revision: 1 } },
    opts(session, { new: true, runValidators: true })
  ).lean();
}

async function claimDueArticle(now, { session } = {}) {
  return CmsArticle.findOneAndUpdate(
    { status: 'SCHEDULED', publish_at: { $lte: now } },
    {
      $set: { status: 'PUBLISHED', published_at: now },
      $inc: { revision: 1 }
    },
    opts(session, { sort: { publish_at: 1 }, new: true })
  ).lean();
}

async function listPublicArticles(filter, paging) {
  const safeFilter = { ...filter, status: 'PUBLISHED', deleted_at: null };
  const [items, total] = await Promise.all([
    CmsArticle.find(safeFilter)
      .select('-content -created_by -updated_by')
      .sort({ published_at: -1, createdAt: -1 })
      .skip(paging.skip).limit(paging.limit).lean(),
    CmsArticle.countDocuments(safeFilter)
  ]);
  return { items, total };
}

async function getPublicArticle(slug) {
  return CmsArticle.findOne({ slug, status: 'PUBLISHED', deleted_at: null })
    .select('-created_by -updated_by').lean();
}

async function listAdminArticles(filter) {
  return CmsArticle.find(filter).sort({ updatedAt: -1 }).limit(200).lean();
}

async function listPublicBanners(filter) {
  return WebsiteBanner.find({ ...filter, deleted_at: null })
    .select('-created_by -updated_by')
    .sort({ priority: -1, createdAt: -1 }).lean();
}

async function listAdminBanners() {
  return WebsiteBanner.find({ deleted_at: null })
    .sort({ priority: -1, updatedAt: -1 }).limit(200).lean();
}

async function mediaWithoutAlt(urls, { session } = {}) {
  let query = LandingMedia.findOne({
    url: { $in: urls },
    status: { $nin: ['DELETED', 'PURGED'] },
    $or: [{ alt: '' }, { alt: { $exists: false } }]
  }).select('_id');
  if (session) query = query.session(session);
  return query.lean();
}

async function appendHistory({
  resourceType,
  resourceId,
  revision,
  action,
  snapshot,
  actorId,
  label,
  before,
  after,
  ip,
  correlationId
}, { session } = {}) {
  const [revisionDoc] = await CmsRevision.create([{
    resource_type: resourceType,
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
    resource_type: resourceType,
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
    resource_type: resourceType,
    resource_id: String(resourceId),
    before: before || null,
    after: after || null,
    ip_address: ip || '',
    correlation_id: correlationId || ''
  }], opts(session));
  return { revision: revisionDoc.toObject(), audit: audit.toObject() };
}

async function getAuditById(id) {
  return CmsAuditLog.findById(id).lean();
}

async function listAudit(filter, paging) {
  const [items, total] = await Promise.all([
    CmsAuditLog.find(filter).populate('actor_id', 'full_name email role')
      .sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).lean(),
    CmsAuditLog.countDocuments(filter)
  ]);
  return { items, total };
}

async function getPublicWebsiteConfig() {
  return WebsiteConfig.findOne({ key: 'default' }).lean();
}

async function listPublishedPages() {
  return LandingPage.find({ status: 'PUBLISHED', slug: { $ne: 'demo' } })
    .select('slug title path published_sections published_at')
    .lean();
}

async function listAdminPages() {
  return LandingPage.find({ slug: { $ne: 'demo' } }).sort({ path: 1 }).lean();
}

module.exports = {
  findById,
  create,
  compareAndUpdate,
  claimDueArticle,
  listPublicArticles,
  getPublicArticle,
  listAdminArticles,
  listPublicBanners,
  listAdminBanners,
  mediaWithoutAlt,
  appendHistory,
  getAuditById,
  listAudit,
  getPublicWebsiteConfig,
  listPublishedPages,
  listAdminPages
};
