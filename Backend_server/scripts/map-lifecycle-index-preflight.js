require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function duplicates(collection, keys) {
  const id = Object.fromEntries(keys.map((key) => [key, `$${key}`]));
  return collection.aggregate([
    { $group: { _id: id, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
}

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  const db = mongoose.connection.db;
  const floor = db.collection('mapdatas');
  const versions = db.collection('mapversions');
  const floorDuplicates = await duplicates(floor, ['building_id', 'floor_number']);
  const versionDuplicates = await duplicates(versions, ['building_id', 'floor_number', 'version']);
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    floorDuplicates,
    versionDuplicates,
    indexesCreated: false
  };
  if (apply) {
    if (floorDuplicates.length || versionDuplicates.length) {
      throw new Error('Có duplicate; không tạo unique index trước khi xử lý thủ công.');
    }
    await floor.createIndex({ building_id: 1, floor_number: 1 }, { unique: true });
    await versions.createIndex(
      { building_id: 1, floor_number: 1, version: 1 },
      { unique: true }
    );
    report.indexesCreated = true;
  }
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
