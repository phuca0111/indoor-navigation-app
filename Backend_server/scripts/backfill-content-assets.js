const mongoose = require('mongoose');
const path = require('path');
const fsp = require('fs').promises;
const { requireSafeMigrationUri } = require('./migration-safety');
const LandingMedia = require('../models/LandingMedia');
const Asset = require('../models/Asset');
const { getLocalRoot } = require('../services/objectStorage');

const apply = process.argv.includes('--apply');

async function listFiles(root, prefix = '') {
  const result = [];
  let entries = [];
  try {
    entries = await fsp.readdir(path.join(root, prefix), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return result;
    throw error;
  }
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, relative));
    else if (entry.isFile()) result.push(relative.replace(/\\/g, '/'));
  }
  return result;
}

async function run() {
  const uri = requireSafeMigrationUri();
  await mongoose.connect(uri);
  const mediaRows = await LandingMedia.find({
    $or: [{ storage_asset_id: null }, { storage_asset_id: { $exists: false } }]
  });
  let backfilled = 0;
  for (const media of mediaRows) {
    const localMatch = String(media.url || '').match(/\/uploads\/([^?#]+)/);
    const backend = localMatch ? 'local' : 'external';
    const key = localMatch ? decodeURIComponent(localMatch[1]) : '';
    if (apply) {
      const asset = await Asset.findOneAndUpdate(
        key ? { backend, bucket: '', key } : { backend, url: media.url, key: '' },
        {
          $setOnInsert: {
            owner_id: media.created_by,
            organization_id: media.organization_id,
            backend,
            bucket: '',
            key,
            url: media.url,
            mime: media.mime || 'application/octet-stream',
            size: media.size || 0,
            checksum: media.checksum || '',
            status: media.status || 'ACTIVE'
          }
        },
        { upsert: true, new: true }
      );
      media.storage_asset_id = asset._id;
      media.storage_backend = backend;
      media.storage_key = key;
      await media.save();
    }
    backfilled += 1;
  }

  const [files, tracked] = await Promise.all([
    listFiles(getLocalRoot()),
    Asset.find({ backend: 'local', key: { $ne: '' }, status: { $ne: 'PURGED' } }).select('key').lean()
  ]);
  const trackedKeys = new Set(tracked.map((item) => item.key));
  const orphanFiles = files.filter((key) => !trackedKeys.has(key));
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    media_candidates: mediaRows.length,
    backfilled: apply ? backfilled : 0,
    local_files: files.length,
    orphan_count: orphanFiles.length,
    orphan_files: orphanFiles
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
