/**
 * Backfill IndoorWorkspace 1:1 cho Building đã có place_id.
 * node scripts/backfill-indoor-workspaces.js [--dry-run]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Building = require('../models/Building');
const IndoorWorkspace = require('../models/IndoorWorkspace');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep');

  const buildings = await Building.find({
    place_id: { $ne: null },
    $or: [{ workspace_id: null }, { workspace_id: { $exists: false } }]
  }).select('_id name place_id organization_id owner_user_id created_by visibility status').lean();

  console.log('Buildings needing workspace:', buildings.length, dryRun ? '(dry-run)' : '');

  let created = 0;
  for (const b of buildings) {
    const exists = await IndoorWorkspace.findOne({ building_id: b._id }).select('_id').lean();
    if (exists) {
      if (!dryRun) {
        await Building.updateOne({ _id: b._id }, { $set: { workspace_id: exists._id } });
      }
      continue;
    }

    const kind = b.visibility === 'OFFICIAL' ? 'OFFICIAL'
      : b.visibility === 'COMMUNITY' ? 'COMMUNITY'
        : (b.organization_id ? 'ORG' : 'PERSONAL');

    if (dryRun) {
      created += 1;
      continue;
    }

    const ws = await IndoorWorkspace.create({
      name: b.name,
      kind,
      status: b.status === 'PUBLISHED' ? 'ACTIVE' : 'DRAFT',
      place_id: b.place_id,
      building_id: b._id,
      organization_id: b.organization_id || null,
      owner_user_id: b.owner_user_id || null,
      created_by: b.created_by || null,
      description: 'Backfill legacy Building ≈ Workspace'
    });
    await Building.updateOne({ _id: b._id }, { $set: { workspace_id: ws._id } });
    created += 1;
  }

  console.log({ created, dryRun, totalWorkspaces: await IndoorWorkspace.countDocuments() });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
