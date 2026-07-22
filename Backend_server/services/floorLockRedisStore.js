// ============================================
// FILE: floorLockRedisStore.js
// Phase 2b — Redis lock (SET NX EX)
// Key: lock:floor:{buildingId}:{floor}
// ============================================

const { ensureRedis } = require('../utils/redisClient');

const COMPARE_EXPIRE_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local lock = cjson.decode(raw)
if tostring(lock.user_id) ~= ARGV[1] or tostring(lock.session_id) ~= ARGV[2] then return -1 end
return redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
`;

const COMPARE_DELETE_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local lock = cjson.decode(raw)
if tostring(lock.user_id) ~= ARGV[1] or tostring(lock.session_id) ~= ARGV[2] then return -1 end
return redis.call('DEL', KEYS[1])
`;

const ACQUIRE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 1 then return nil end
local fence = redis.call('INCR', KEYS[2])
local lock = cjson.decode(ARGV[1])
lock.fencing_token = fence
redis.call('SET', KEYS[1], cjson.encode(lock), 'EX', tonumber(ARGV[2]))
return cjson.encode(lock)
`;

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
  const key = lockKey(buildingId, floorNumber);
  const raw = await redis.eval(
    ACQUIRE_LUA,
    2,
    key,
    `${key}:fence`,
    JSON.stringify({
      building_id: lock.building_id,
      floor_number: lock.floor_number,
      user_id: lock.user_id,
      user_email: lock.user_email,
      session_id: lock.session_id,
      expires_at: lock.expires_at.toISOString()
    }),
    String(ttlSec)
  );
  return raw ? { ...JSON.parse(raw), expires_at: lock.expires_at } : null;
}

async function kvSet(buildingId, floorNumber, payload, ttlSec) {
  const redis = await ensureRedis();
  if (!redis) throw new Error('REDIS_UNAVAILABLE');
  const lock = toLock(buildingId, floorNumber, payload, ttlSec);
  const key = lockKey(buildingId, floorNumber);
  const fencing_token = await redis.incr(`${key}:fence`);
  await redis.set(
    key,
    JSON.stringify({
      building_id: lock.building_id,
      floor_number: lock.floor_number,
      user_id: lock.user_id,
      user_email: lock.user_email,
      session_id: lock.session_id,
      expires_at: lock.expires_at.toISOString(),
      fencing_token
    }),
    'EX',
    ttlSec
  );
  return { ...lock, fencing_token };
}

async function kvExpire(buildingId, floorNumber, ttlSec) {
  const redis = await ensureRedis();
  if (!redis) throw new Error('REDIS_UNAVAILABLE');
  const n = await redis.expire(lockKey(buildingId, floorNumber), ttlSec);
  return n === 1;
}

async function kvCompareExpire(buildingId, floorNumber, userId, sessionId, ttlSec) {
  const redis = await ensureRedis();
  if (!redis) throw new Error('REDIS_UNAVAILABLE');
  return redis.eval(
    COMPARE_EXPIRE_LUA,
    1,
    lockKey(buildingId, floorNumber),
    String(userId),
    String(sessionId),
    String(ttlSec)
  );
}

async function kvDel(buildingId, floorNumber) {
  const redis = await ensureRedis();
  if (!redis) throw new Error('REDIS_UNAVAILABLE');
  await redis.del(lockKey(buildingId, floorNumber));
  return true;
}

async function kvCompareDel(buildingId, floorNumber, userId, sessionId) {
  const redis = await ensureRedis();
  if (!redis) throw new Error('REDIS_UNAVAILABLE');
  return redis.eval(
    COMPARE_DELETE_LUA,
    1,
    lockKey(buildingId, floorNumber),
    String(userId),
    String(sessionId)
  );
}

async function kvClearBuilding(buildingId) {
  const redis = await ensureRedis();
  if (!redis) return;
  const pattern = `lock:floor:${buildingId}:*`;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== '0');
}

module.exports = {
  name: 'redis',
  kvGet,
  kvSetNx,
  kvSet,
  kvExpire,
  kvCompareExpire,
  kvDel,
  kvCompareDel,
  kvClearBuilding,
  COMPARE_EXPIRE_LUA,
  COMPARE_DELETE_LUA,
  ACQUIRE_LUA
};
