require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Floor = require('../models/Floor');
const Draft = require('../models/Draft');

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  const candidates = await Floor.find({ draft_map_data: { $ne: null } })
    .select('building_id floor_number draft_map_data draft_updated_by')
    .lean();
  let missing = 0;
  for (const floor of candidates) {
    const exists = await Draft.exists({
      building_id: floor.building_id,
      floor_number: floor.floor_number
    });
    if (exists) continue;
    missing += 1;
    if (apply) {
      await Draft.updateOne(
        { building_id: floor.building_id, floor_number: floor.floor_number },
        {
          $setOnInsert: {
            payload: floor.draft_map_data,
            version: 1,
            created_by: floor.draft_updated_by,
            updated_by: floor.draft_updated_by
          }
        },
        { upsert: true }
      );
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', candidates: candidates.length, missing }));
  await mongoose.disconnect();
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
