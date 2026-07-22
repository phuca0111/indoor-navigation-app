/**
 * Map Governance P0 — Backfill Place cho Building chưa có place_id.
 * Mỗi Building → 1 Place (name/GPS/address từ Building); gắn place_id.
 * Idempotent: bỏ qua Building đã có place_id.
 *
 * Chạy: node scripts/backfill-places.js
 * Dry-run: node scripts/backfill-places.js --dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Building = require('../models/Building');
const Place = require('../models/Place');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
  await mongoose.connect(uri);
  console.log('Connected:', uri.replace(/\/\/.*@/, '//***@'));
  console.log(dryRun ? 'Mode: DRY-RUN' : 'Mode: WRITE');

  const buildings = await Building.find({
    $or: [{ place_id: null }, { place_id: { $exists: false } }]
  }).select('_id name address gps_location organization_id created_by visibility').lean();

  console.log('Buildings without place_id:', buildings.length);

  let created = 0;
  let linked = 0;
  let errors = 0;

  for (const b of buildings) {
    try {
      const lat = Number(b.gps_location?.lat) || 0;
      const lng = Number(b.gps_location?.lng) || 0;
      const placePayload = {
        name: b.name || 'Unnamed Place',
        aliases: [],
        latitude: lat,
        longitude: lng,
        address: b.address || '',
        category: '',
        verified: false,
        owner_org_id: b.organization_id || null,
        status: 'ACTIVE',
        created_by: b.created_by || null,
        notes: 'Backfill từ Building ' + String(b._id)
      };

      if (dryRun) {
        created += 1;
        linked += 1;
        continue;
      }

      const place = await Place.create(placePayload);
      await Building.updateOne(
        { _id: b._id },
        {
          $set: {
            place_id: place._id,
            visibility: b.visibility || 'PRIVATE'
          }
        }
      );
      created += 1;
      linked += 1;
    } catch (e) {
      errors += 1;
      console.error('Fail building', b._id, e.message);
    }
  }

  const [placeCount, stillMissing] = await Promise.all([
    Place.countDocuments(),
    Building.countDocuments({ $or: [{ place_id: null }, { place_id: { $exists: false } }] })
  ]);

  console.log(JSON.stringify({
    dryRun,
    processed: buildings.length,
    placesCreated: created,
    buildingsLinked: linked,
    errors,
    totalPlaces: placeCount,
    buildingsStillMissingPlace: stillMissing
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
