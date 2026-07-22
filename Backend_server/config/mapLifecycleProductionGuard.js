const mongoose = require('mongoose');
const { ensureRedis } = require('../utils/redisClient');
const { getQueue } = require('../services/publishQueueBull');

async function assertMapLifecycleProductionReady() {
  if (process.env.NODE_ENV !== 'production') return true;
  if (!process.env.REDIS_URL) {
    throw Object.assign(new Error('Phase 4 production bắt buộc REDIS_URL.'), {
      code: 'MAP_LIFECYCLE_REDIS_REQUIRED'
    });
  }
  if (String(process.env.PUBLISH_QUEUE || 'bullmq').toLowerCase() !== 'bullmq') {
    throw Object.assign(new Error('Phase 4 production bắt buộc BullMQ.'), {
      code: 'MAP_LIFECYCLE_BULLMQ_REQUIRED'
    });
  }
  if (String(process.env.FLOOR_LOCK_BACKEND || 'redis').toLowerCase() !== 'redis') {
    throw Object.assign(new Error('Phase 4 production bắt buộc Redis lock.'), {
      code: 'MAP_LIFECYCLE_REDIS_LOCK_REQUIRED'
    });
  }
  if (String(process.env.MAP_LIFECYCLE_TRANSACTIONS_ENABLED || 'true') !== 'true') {
    throw Object.assign(new Error('Phase 4 production bắt buộc Mongo transaction.'), {
      code: 'MAP_LIFECYCLE_TRANSACTION_REQUIRED'
    });
  }
  const topology = mongoose.connection.client?.topology?.description?.type || '';
  if (!/ReplicaSet|Sharded/i.test(topology)) {
    throw Object.assign(new Error(`Mongo topology ${topology || 'unknown'} không hỗ trợ transaction.`), {
      code: 'MAP_LIFECYCLE_TRANSACTION_UNAVAILABLE'
    });
  }
  const redis = await ensureRedis();
  if (!redis || await redis.ping() !== 'PONG') {
    throw Object.assign(new Error('Redis không sẵn sàng.'), {
      code: 'MAP_LIFECYCLE_REDIS_UNAVAILABLE'
    });
  }
  await getQueue().waitUntilReady();
  return true;
}

module.exports = { assertMapLifecycleProductionReady };
