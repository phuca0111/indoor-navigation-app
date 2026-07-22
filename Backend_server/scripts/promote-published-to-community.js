#!/usr/bin/env node
/**
 * Promote PUBLISHED buildings (PRIVATE mặc định cũ) → COMMUNITY
 * để Android public/nearest thấy sau khi wire visibility.
 *
 * Usage:
 *   node scripts/promote-published-to-community.js --dry-run
 *   node scripts/promote-published-to-community.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Building = require('../models/Building');

async function main() {
  const dry = process.argv.includes('--dry-run');
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
  await mongoose.connect(uri);

  const filter = {
    status: 'PUBLISHED',
    is_active: { $ne: false },
    $or: [
      { visibility: { $exists: false } },
      { visibility: null },
      { visibility: 'PRIVATE' }
    ]
  };

  const count = await Building.countDocuments(filter);
  console.log(`Candidates: ${count}${dry ? ' (dry-run)' : ''}`);
  if (!dry && count) {
    const res = await Building.updateMany(filter, { $set: { visibility: 'COMMUNITY' } });
    console.log('Updated:', res.modifiedCount);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
