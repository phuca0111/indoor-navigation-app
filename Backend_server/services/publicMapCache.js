const { ensureRedis } = require('../utils/redisClient');

const memory = new Map();
const TTL_SEC = Math.max(10, Number(process.env.PUBLIC_MAP_CACHE_TTL_SEC) || 300);

function key(buildingId, floor) {
  return `public-map:${buildingId}:${floor}`;
}

async function get(buildingId, floor) {
  const cacheKey = key(buildingId, floor);
  const local = memory.get(cacheKey);
  if (local && local.expires > Date.now()) return local.value;
  if (local) memory.delete(cacheKey);
  const redis = await ensureRedis();
  if (!redis) return null;
  const raw = await redis.get(cacheKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    memory.set(cacheKey, { value, expires: Date.now() + TTL_SEC * 1000 });
    return value;
  } catch (_) {
    await redis.del(cacheKey);
    return null;
  }
}

async function set(buildingId, floor, value) {
  const cacheKey = key(buildingId, floor);
  memory.set(cacheKey, { value, expires: Date.now() + TTL_SEC * 1000 });
  const redis = await ensureRedis();
  if (redis) await redis.set(cacheKey, JSON.stringify(value), 'EX', TTL_SEC);
}

async function invalidate(buildingId, floor) {
  const cacheKey = key(buildingId, floor);
  memory.delete(cacheKey);
  const redis = await ensureRedis();
  if (redis) await redis.del(cacheKey);
}

function clearMemoryForTests() {
  memory.clear();
}

module.exports = { get, set, invalidate, clearMemoryForTests };
