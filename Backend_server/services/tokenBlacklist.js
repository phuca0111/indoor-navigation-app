/**
 * C3 — JWT access token blacklist (Redis TTL hoặc memory fallback).
 * Key: bl:jwt:{jti}
 */
const { ensureRedis } = require('../utils/redisClient');

const memory = new Map(); // jti -> expiresAtMs

function pruneMemory() {
  const now = Date.now();
  for (const [jti, exp] of memory.entries()) {
    if (exp <= now) memory.delete(jti);
  }
}

async function add(jti, ttlSec) {
  if (!jti) return { backend: 'noop' };
  const ttl = Math.max(1, Math.floor(Number(ttlSec) || 1));
  const redis = await ensureRedis();
  if (redis) {
    try {
      await redis.set(`bl:jwt:${jti}`, '1', 'EX', ttl);
      return { backend: 'redis', ttl };
    } catch (e) {
      console.warn('[tokenBlacklist] redis set fail:', e.message);
    }
  }
  pruneMemory();
  memory.set(String(jti), Date.now() + ttl * 1000);
  return { backend: 'memory', ttl };
}

async function has(jti) {
  if (!jti) return false;
  const redis = await ensureRedis();
  if (redis) {
    try {
      const v = await redis.get(`bl:jwt:${jti}`);
      if (v) return true;
      // Redis miss — vẫn check memory (dev/test)
    } catch (e) {
      console.warn('[tokenBlacklist] redis get fail:', e.message);
    }
  }
  pruneMemory();
  const exp = memory.get(String(jti));
  return !!exp && exp > Date.now();
}

function clearMemoryForTests() {
  memory.clear();
}

module.exports = {
  add,
  has,
  clearMemoryForTests
};
