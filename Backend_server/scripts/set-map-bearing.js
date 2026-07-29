/**
 * Căn Bắc map: set map_data.map_bearing_offset cho mọi tầng của 1 building.
 * Ước lượng từ test thực tế (hành lang dọc map, la bàn ~26°/202°) → ~30°.
 *
 * Usage: node scripts/set-map-bearing.js [buildingId] [offsetDeg]
 */
require('dotenv').config();
const mongoose = require('mongoose');

const buildingId = process.argv[2] || '69e8e1c39d09fb85ed1195df';
const offsetDeg = Number(process.argv[3] ?? 30);

(async () => {
  if (!Number.isFinite(offsetDeg)) {
    throw new Error('offsetDeg không hợp lệ');
  }
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection('mapdatas');
  const oid = new mongoose.Types.ObjectId(buildingId);

  const before = await col
    .find(
      { building_id: oid },
      { projection: { floor_number: 1, version: 1, 'map_data.map_bearing_offset': 1 } },
    )
    .toArray();
  console.log('BEFORE:', JSON.stringify(before, null, 2));

  // Bump version để publicMapCache (so sánh version) không trả body cũ còn offset=0.
  const result = await col.updateMany(
    { building_id: oid },
    [
      {
        $set: {
          'map_data.map_bearing_offset': offsetDeg,
          version: { $add: [{ $ifNull: ['$version', 0] }, 1] },
        },
      },
    ],
  );
  console.log(`matched=${result.matchedCount} modified=${result.modifiedCount} offset=${offsetDeg}`);

  // Xóa Redis public-map:* (memory cache của process server sẽ miss nhờ version mismatch).
  try {
    const { ensureRedis } = require('../utils/redisClient');
    const redis = await ensureRedis();
    if (redis) {
      for (const f of before) {
        const k = `public-map:${buildingId}:${f.floor_number}`;
        await redis.del(k);
        console.log('redis del', k);
      }
    } else {
      console.log('redis unavailable — rely on version bump');
    }
  } catch (e) {
    console.log('cache clear skipped:', e.message);
  }

  const after = await col
    .find(
      { building_id: oid },
      { projection: { floor_number: 1, version: 1, 'map_data.map_bearing_offset': 1 } },
    )
    .toArray();
  console.log('AFTER:', JSON.stringify(after, null, 2));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
