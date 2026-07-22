/**
 * Queue adapter: BullMQ mặc định khi có Redis; legacy memory/redis-list chỉ qua feature flag.
 */
const { ensureRedis } = require('../utils/redisClient');

const REDIS_KEY = 'publish:jobs';
let draining = false;

function preferRedis() {
  return resolveQueueBackend() === 'redis-list';
}

function resolveQueueBackend() {
  const mode = String(process.env.PUBLISH_QUEUE || '').trim().toLowerCase();
  if (mode === 'memory') return 'memory';
  if (mode === 'redis' || mode === 'redis-list') return 'redis-list';
  if (mode === 'bullmq') return 'bullmq';
  return (process.env.REDIS_URL || '').trim() ? 'bullmq' : 'memory';
}

async function drainOnce() {
  if (draining) return;
  draining = true;
  try {
    const { processPublishJob } = require('../application/mapLifecycle/publishApplicationService');
    const redis = preferRedis() ? await ensureRedis() : null;
    if (redis) {
      while (true) {
        const id = await redis.rpop(REDIS_KEY);
        if (!id) break;
        await processPublishJob(String(id)).catch((e) => {
          console.warn('[publishQueue] job failed:', id, e.message);
        });
      }
      return;
    }
  } finally {
    draining = false;
  }
}

/**
 * Xếp job vào hàng đợi (không block HTTP).
 * @returns {'redis'|'memory'}
 */
async function enqueuePublishWork(jobId) {
  const id = String(jobId);
  const { processPublishJob } = require('../application/mapLifecycle/publishApplicationService');
  const mode = resolveQueueBackend();

  if (mode === 'bullmq') {
    const bull = require('./publishQueueBull');
    return bull.enqueue(id);
  }

  if (mode === 'redis-list') {
    const redis = await ensureRedis();
    if (redis) {
      try {
        await redis.lpush(REDIS_KEY, id);
        setImmediate(() => {
          drainOnce().catch((e) => console.warn('[publishQueue] drain:', e.message));
        });
        return 'redis-list';
      } catch (e) {
        console.warn('[publishQueue] redis enqueue fail, fallback memory:', e.message);
      }
    }
  }

  setImmediate(() => {
    processPublishJob(id).catch((e) => {
      console.warn('[publishQueue] job failed:', id, e.message);
    });
  });
  return 'memory';
}

module.exports = {
  enqueuePublishWork,
  preferRedis,
  resolveQueueBackend,
  REDIS_KEY
};
