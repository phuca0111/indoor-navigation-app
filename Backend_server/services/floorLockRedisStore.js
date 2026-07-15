// ============================================
// FILE: floorLockRedisStore.js
// Phase 2b — Redis lock (SET NX EX)
// Key: lock:floor:{buildingId}:{floor}
// ============================================

const { ensureRedis } = require('../utils/redisClient');

function lockKey(buildingId, floorNumber) {
  return `lock:floor:${buildingId}:${floorNumber}`;
}

function toLock(buildingId, floorNumber, payload, ttlSec) {
  const expires_at = new Date(Date.now() + ttlSec * 1000);
  return {
    building_id: String(buildingId),
    floor_number: Number(floorNumber),
    user_id: String(payload.user_id),
    user_email: payload.user_email || '',
    session_id: String(payload.session_id),
    expires_at
  };
}

async function kvGet(buildingId, floorNumber) {
  const redis = await ensureRedis();
  if (!redis) throw new Error('REDIS_UNAVAILABLE');
  const raw = await redis.get(lockKey(buildingId, floorNumber));
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const ttl = await redis.ttl(lockKey(buildingId, floorNumber));
  const expires_at =
    ttl > 0 ? new Date(Date.now() + ttl * 1000) : new Date(parsed.expires_at || Date.now());
  return { ...parsed, expires_at };
}

async function kvSetNx(buildingId, floorNumber, payload, ttlSec) {
  const redis = await ensureRedis();
  if (!redis) throw new Error('REDIS_UNAVAILABLE');
  const lock = toLock(buildingId, floorNumber, payload, ttlSec);
  const ok = await redis.set(
    lockKey(buildingId, floorNumber),
    JSON.stringify({
      building_id: lock.building_id,
      floor_number: lock.floor_number,
      user_id: lock.user_id,
      user_email: lock.user_email,
      session_id: lock.session_id,
      expires_at: lock.expires_at.toISOString()
    }),
    'EX',
    ttlSec,
    'NX'
  );
  return ok === 'OK' ? lock : null;
}

async function kvSet(buildingId, floorNumber, payload, ttlSec) {
  const redis = await ensureRedis();
  if (!redis) throw new Error('REDIS_UNAVAILABLE');
  const lock = toLock(buildingId, floorNumber, payload, ttlSec);
  await redis.set(
    lockKey(buildingId, floorNumber),
    JSON.stringify({
      building_id: lock.building_id,
      floor_number: lock.floor_number,
      user_id: lock.user_id,
      user_email: lock.user_email,
      session_id: lock.session_id,
      expires_at: lock.expires_at.toISOString()
    }),
    'EX',
    ttlSec
  );
  return lock;
}

async function kvExpire(buildingId, floorNumber, ttlSec) {
  const redis = await ensureRedis();
  if (!redis) throw new Error('REDIS_UNAVAILABLE');
  const n = await redis.expire(lockKey(buildingId, floorNumber), ttlSec);
  return n === 1;
}

async function kvDel(buildingId, floorNumber) {
  const redis = await ensureRedis();
  if (!redis) throw new Error('REDIS_UNAVAILABLE');
  await redis.del(lockKey(buildingId, floorNumber));
  return true;
}

async function kvClearBuilding(buildingId) {
  const redis = await ensureRedis();
  if (!redis) return;
  const pattern = `lock:floor:${buildingId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
}

module.exports = {
  name: 'redis',
  kvGet,
  kvSetNx,
  kvSet,
  kvExpire,
  kvDel,
  kvClearBuilding
};
