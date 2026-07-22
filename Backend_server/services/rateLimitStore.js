/**
 * C3 — express-rate-limit store: Redis khi có, không thì memory.
 * Tương thích express-rate-limit v8 (increment → { totalHits, resetTime }).
 */
const { ensureRedis } = require('../utils/redisClient');

class HybridRateLimitStore {
  constructor(options = {}) {
    this.prefix = options.prefix || 'rl:';
    this.windowMs = options.windowMs || 60_000;
    this.memory = new Map(); // key -> { count, resetTime }
  }

  init(options) {
    if (options?.windowMs) this.windowMs = options.windowMs;
  }

  #memHit(key) {
    const now = Date.now();
    let row = this.memory.get(key);
    if (!row || row.resetTime <= now) {
      row = { count: 0, resetTime: now + this.windowMs };
      this.memory.set(key, row);
    }
    row.count += 1;
    return { totalHits: row.count, resetTime: new Date(row.resetTime) };
  }

  async increment(key) {
    const redis = await ensureRedis();
    if (redis) {
      try {
        const rkey = `${this.prefix}${key}`;
        const count = await redis.incr(rkey);
        if (count === 1) {
          await redis.pexpire(rkey, this.windowMs);
        }
        const pttl = await redis.pttl(rkey);
        const resetMs = pttl > 0 ? Date.now() + pttl : Date.now() + this.windowMs;
        return { totalHits: count, resetTime: new Date(resetMs) };
      } catch (e) {
        console.warn('[rateLimitStore] redis fail, memory:', e.message);
      }
    }
    return this.#memHit(key);
  }

  async decrement(key) {
    const redis = await ensureRedis();
    if (redis) {
      try {
        const rkey = `${this.prefix}${key}`;
        const n = await redis.decr(rkey);
        if (n <= 0) await redis.del(rkey);
        return;
      } catch (_) {
        /* fallthrough */
      }
    }
    const row = this.memory.get(key);
    if (row) {
      row.count = Math.max(0, row.count - 1);
    }
  }

  async resetKey(key) {
    const redis = await ensureRedis();
    if (redis) {
      try {
        await redis.del(`${this.prefix}${key}`);
      } catch (_) {
        /* ignore */
      }
    }
    this.memory.delete(key);
  }
}

function createHybridStore(prefix, windowMs) {
  return new HybridRateLimitStore({ prefix, windowMs });
}

module.exports = {
  HybridRateLimitStore,
  createHybridStore
};
