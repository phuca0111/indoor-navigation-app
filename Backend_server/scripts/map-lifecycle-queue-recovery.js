require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { ensureRedis } = require('../utils/redisClient');
const { REDIS_KEY } = require('../services/publishQueue');
const PublishJob = require('../models/PublishJob');

async function main() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  const redis = await ensureRedis();
  if (!redis) throw new Error('Queue recovery cần REDIS_URL an toàn.');
  // Chỉ đọc legacy list; không RPOP/LTRIM nên không làm mất job cũ.
  const legacyIds = await redis.lrange(REDIS_KEY, 0, -1);
  const staleIds = await PublishJob.find({ status: 'QUEUED' }).distinct('_id');
  const ids = [...new Set([...legacyIds, ...staleIds.map(String)])];
  if (apply) {
    const bull = require('../services/publishQueueBull');
    for (const id of ids) await bull.enqueue(id);
    await bull.stopWorker();
  }
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    legacyListCount: legacyIds.length,
    queuedMongoCount: staleIds.length,
    recoverableUniqueCount: ids.length,
    legacyListPreserved: true
  }));
  await mongoose.disconnect();
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
