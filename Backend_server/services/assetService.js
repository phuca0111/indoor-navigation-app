const Asset = require('../models/Asset');
const { createStorageAdapter, validateBuffer, buildObjectKey } = require('./storagePlatform');

const DEFAULT_RETENTION_DAYS = 30;

function retentionDate() {
  const days = Math.max(1, Number(process.env.STORAGE_RETENTION_DAYS) || DEFAULT_RETENTION_DAYS);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function assertQuota({ ownerId, organizationId, incomingBytes }) {
  const quota = Number(process.env.STORAGE_QUOTA_BYTES) || 500 * 1024 * 1024;
  const filter = {
    status: { $in: ['PENDING', 'ACTIVE'] },
    backend: { $ne: 'external' }
  };
  if (organizationId) filter.organization_id = organizationId;
  else filter.owner_id = ownerId;
  const rows = await Asset.aggregate([
    { $match: filter },
    { $group: { _id: null, used: { $sum: '$size' } } }
  ]);
  const used = Number(rows[0]?.used) || 0;
  if (used + incomingBytes > quota) {
    const error = new Error('Đã vượt quota lưu trữ.');
    error.code = 'STORAGE_QUOTA_EXCEEDED';
    error.status = 413;
    throw error;
  }
  return { used, quota };
}

async function storeAsset({
  buffer,
  claimedMime,
  originalName,
  ownerId,
  organizationId = null,
  namespace = 'assets',
  req = null,
  allowedMime
}) {
  const verified = validateBuffer(buffer, claimedMime, { allowedMime });
  await assertQuota({ ownerId, organizationId, incomingBytes: verified.size });
  const backend = String(process.env.STORAGE_BACKEND || 'local').toLowerCase();
  const adapter = createStorageAdapter(backend);
  const owner = organizationId ? `org-${organizationId}` : `user-${ownerId}`;
  const key = buildObjectKey({ namespace, owner, name: originalName, mime: verified.mime });
  const stored = await adapter.put({ key, buffer, mime: verified.mime, checksum: verified.checksum });
  const url = adapter.publicUrl(key, req);
  try {
    return await Asset.create({
      owner_id: ownerId,
      organization_id: organizationId,
      backend,
      bucket: stored.bucket || adapter.bucket || '',
      key,
      url,
      mime: verified.mime,
      size: verified.size,
      checksum: verified.checksum,
      status: 'ACTIVE'
    });
  } catch (error) {
    await adapter.delete({ key }).catch(() => {});
    throw error;
  }
}

async function softDeleteAsset(assetOrId) {
  const asset = typeof assetOrId === 'object' ? assetOrId : await Asset.findById(assetOrId);
  if (!asset) return null;
  if (!['DELETED', 'PURGED'].includes(asset.status)) {
    asset.status = 'DELETED';
    asset.ref_count = Math.max(0, Number(asset.ref_count) - 1);
    asset.deleted_at = new Date();
    asset.retention_until = retentionDate();
    await asset.save();
  }
  return asset;
}

async function objectExists(asset) {
  if (!asset?.key || asset.backend === 'external') return true;
  const adapter = createStorageAdapter(asset.backend);
  return (await adapter.head({ key: asset.key, bucket: asset.bucket })).exists;
}

async function restoreAsset(assetOrId) {
  const asset = typeof assetOrId === 'object' ? assetOrId : await Asset.findById(assetOrId);
  if (!asset) return null;
  if (asset.status === 'PURGED' || !await objectExists(asset)) {
    const error = new Error('Object media không còn trong thời hạn lưu giữ.');
    error.code = 'STORAGE_OBJECT_MISSING';
    error.status = 409;
    throw error;
  }
  const wasDeleted = asset.status === 'DELETED';
  asset.status = 'ACTIVE';
  if (wasDeleted) asset.ref_count = Math.max(1, Number(asset.ref_count) + 1);
  asset.deleted_at = null;
  asset.retention_until = null;
  await asset.save();
  return asset;
}

async function purgeAsset(assetOrId, { force = false } = {}) {
  const asset = typeof assetOrId === 'object' ? assetOrId : await Asset.findById(assetOrId);
  if (!asset || asset.status === 'PURGED') return asset;
  if (!force && (asset.ref_count > 0 || !asset.retention_until || asset.retention_until > new Date())) {
    return null;
  }
  if (asset.key && asset.backend !== 'external') {
    await createStorageAdapter(asset.backend).delete({ key: asset.key, bucket: asset.bucket });
  }
  asset.status = 'PURGED';
  asset.purged_at = new Date();
  await asset.save();
  const LandingMedia = require('../models/LandingMedia');
  await LandingMedia.updateMany(
    { storage_asset_id: asset._id },
    { $set: { status: 'PURGED', purged_at: asset.purged_at } }
  );
  return asset;
}

async function purgeOrphans(limit = 100) {
  const assets = await Asset.find({
    status: 'DELETED',
    ref_count: 0,
    retention_until: { $lte: new Date() }
  }).limit(Math.min(500, Math.max(1, Number(limit) || 100)));
  let purged = 0;
  for (const asset of assets) {
    if (await purgeAsset(asset)) purged += 1;
  }
  return { scanned: assets.length, purged };
}

module.exports = {
  assertQuota,
  storeAsset,
  softDeleteAsset,
  restoreAsset,
  purgeAsset,
  purgeOrphans,
  objectExists,
  retentionDate
};
