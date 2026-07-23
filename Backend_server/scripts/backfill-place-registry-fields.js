/**
 * Backfill slug / publication_status / owner_type / radius cho Place cũ.
 * node scripts/backfill-place-registry-fields.js [--dry-run]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Place = require('../models/Place');
const { ensureUniquePlaceSlug } = require('../utils/placeRegistry');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep');
  const places = await Place.find({}).select('_id name slug publication_status owner_type radius owner_org_id').lean();
  console.log('Places:', places.length, dryRun ? '(dry-run)' : '');

  let updated = 0;
  for (const p of places) {
    const patch = {};
    if (!p.slug) patch.slug = await ensureUniquePlaceSlug(Place, p.name, p._id);
    if (!p.publication_status) patch.publication_status = 'PUBLIC';
    if (!p.owner_type) patch.owner_type = p.owner_org_id ? 'ORGANIZATION' : 'UNCLAIMED';
    if (p.radius == null) patch.radius = 80;
    if (!Object.keys(patch).length) continue;
    updated += 1;
    if (!dryRun) {
      await Place.updateOne({ _id: p._id }, { $set: patch });
    }
  }
  console.log({ updated, dryRun });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
