// Optional Redis client (Phase 2b). Null when REDIS_URL missing / connect fail.
const Redis = require('ioredis');

let client = null;
let initTried = false;
let available = false;

function getRedisUrl() {
  return (process.env.REDIS_URL || '').trim() || null;
}

function getRedis() {
  if (initTried) return available ? client : null;
  initTried = true;

  const url = getRedisUrl();
  if (!url) return null;

  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 2000
    });
    // sync connect for first use is handled in ensureRedis()
    available = true;
    return client;
  } catch (e) {
    console.warn('[redis] init failed:', e.message);
    available = false;
    client = null;
    return null;
  }
}

async function ensureRedis() {
  const c = getRedis();
  if (!c) return null;
  try {
    if (c.status === 'wait' || c.status === 'end') {
      await c.connect();
    }
    await c.ping();
    return c;
  } catch (e) {
    console.warn('[redis] unavailable:', e.message);
    available = false;
    return null;
  }
}

function resetRedisForTests() {
  initTried = false;
  available = false;
  if (client) {
    try {
      client.disconnect();
    } catch (_) {
      /* ignore */
    }
  }
  client = null;
}

module.exports = {
  getRedis,
  ensureRedis,
  getRedisUrl,
  resetRedisForTests
};
