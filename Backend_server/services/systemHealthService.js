/**
 * AD16 — System health snapshot cho Overview (CPU/RAM/DB/Redis/uptime/latency).
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { ensureRedis, getRedisUrl } = require('../utils/redisClient');

function round(n, digits = 1) {
  const p = 10 ** digits;
  return Math.round(Number(n || 0) * p) / p;
}

async function measureDbLatency() {
  const t0 = process.hrtime.bigint();
  const state = mongoose.connection.readyState; // 1 = connected
  if (state !== 1) {
    return { ok: false, latency_ms: null, state };
  }
  await mongoose.connection.db.admin().command({ ping: 1 });
  const t1 = process.hrtime.bigint();
  return {
    ok: true,
    latency_ms: Number(t1 - t0) / 1e6,
    state
  };
}

async function measureRedis() {
  if (!getRedisUrl()) {
    return { ok: false, configured: false, latency_ms: null };
  }
  const t0 = process.hrtime.bigint();
  const client = await ensureRedis();
  if (!client) {
    return { ok: false, configured: true, latency_ms: null };
  }
  await client.ping();
  const t1 = process.hrtime.bigint();
  return {
    ok: true,
    configured: true,
    latency_ms: Number(t1 - t0) / 1e6
  };
}

function measureDisk() {
  try {
    const root = process.cwd();
    const stat = fs.statfsSync ? fs.statfsSync(root) : null;
    if (stat && stat.bsize && stat.blocks) {
      const total = Number(stat.blocks) * Number(stat.bsize);
      const free = Number(stat.bfree) * Number(stat.bsize);
      const used = total - free;
      return {
        ok: true,
        path: root,
        total_bytes: total,
        used_bytes: used,
        free_bytes: free,
        used_pct: total > 0 ? round((used / total) * 100) : null
      };
    }
  } catch (_) {
    /* ignore */
  }
  // Fallback: uploads folder size estimate not available — report process cwd only
  return {
    ok: false,
    path: path.resolve(process.cwd()),
    total_bytes: null,
    used_bytes: null,
    free_bytes: null,
    used_pct: null,
    message: 'OS không hỗ trợ statfs — chỉ báo đường dẫn làm việc.'
  };
}

async function buildSystemHealth() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const load = os.loadavg();
  const cpus = os.cpus() || [];
  const cpuCount = cpus.length || 1;
  // Rough CPU busy estimate from load[0] / cores
  const cpuPct = Math.min(100, round((load[0] / cpuCount) * 100));

  const procMem = process.memoryUsage();
  const [db, redis] = await Promise.all([measureDbLatency(), measureRedis()]);
  const disk = measureDisk();

  const checks = [
    { key: 'api', ok: true },
    { key: 'db', ok: !!db.ok },
    { key: 'redis', ok: redis.configured ? !!redis.ok : true },
    { key: 'disk', ok: disk.ok !== false || disk.used_pct == null }
  ];
  const failed = checks.filter((c) => !c.ok).length;
  const status = failed === 0 ? 'healthy' : (failed >= 2 ? 'critical' : 'degraded');

  return {
    status,
    generated_at: new Date().toISOString(),
    uptime_sec: Math.round(process.uptime()),
    node: process.version,
    cpu: {
      cores: cpuCount,
      load_1m: round(load[0], 2),
      load_5m: round(load[1], 2),
      used_pct: cpuPct
    },
    memory: {
      total_bytes: totalMem,
      used_bytes: usedMem,
      free_bytes: freeMem,
      used_pct: totalMem > 0 ? round((usedMem / totalMem) * 100) : null,
      process_rss_bytes: procMem.rss,
      process_heap_used_bytes: procMem.heapUsed
    },
    db: {
      ok: !!db.ok,
      ready_state: db.state,
      latency_ms: db.latency_ms != null ? round(db.latency_ms, 2) : null
    },
    redis: {
      configured: !!redis.configured,
      ok: !!redis.ok,
      latency_ms: redis.latency_ms != null ? round(redis.latency_ms, 2) : null
    },
    storage: disk,
    api: {
      ok: true,
      latency_ms: db.latency_ms != null ? round(db.latency_ms, 2) : null
    }
  };
}

module.exports = { buildSystemHealth };
