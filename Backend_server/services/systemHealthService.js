/**
 * AD16 — System health snapshot cho Overview (CPU/RAM/DB/Redis/uptime/latency).
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
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

function probeUrl(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const transport = url.startsWith('https:') ? https : http;
    const request = transport.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 400);
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function measureObjectStorage() {
  const backend = String(process.env.STORAGE_BACKEND || 'local').toLowerCase();
  if (backend === 'minio') {
    const protocol = String(process.env.MINIO_USE_SSL).toLowerCase() === 'true' ? 'https' : 'http';
    const host = process.env.MINIO_ENDPOINT || 'localhost';
    const port = Number(process.env.MINIO_PORT) || 9000;
    return { backend, ok: await probeUrl(`${protocol}://${host}:${port}/minio/health/live`) };
  }
  if (backend === 's3') {
    return { backend, ok: Boolean(process.env.S3_BUCKET && process.env.S3_REGION) };
  }
  return { backend, ok: measureDisk().ok };
}

async function measureQueue() {
  if (String(process.env.PUBLISH_QUEUE || '').toLowerCase() !== 'bullmq') {
    return { backend: process.env.PUBLISH_QUEUE || 'memory', ok: true, waiting: 0, failed: 0 };
  }
  try {
    const { getQueue } = require('./publishQueueBull');
    const counts = await getQueue().getJobCounts('wait', 'active', 'delayed', 'failed');
    return {
      backend: 'bullmq',
      ok: true,
      waiting: Number(counts.wait || 0) + Number(counts.delayed || 0),
      active: Number(counts.active || 0),
      failed: Number(counts.failed || 0)
    };
  } catch (_) {
    return { backend: 'bullmq', ok: false, waiting: null, active: null, failed: null };
  }
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
  const [db, redis, objectStorage, queue] = await Promise.all([
    measureDbLatency(),
    measureRedis(),
    measureObjectStorage(),
    measureQueue()
  ]);
  const disk = measureDisk();

  const checks = [
    { key: 'api', ok: true },
    { key: 'db', ok: !!db.ok },
    { key: 'redis', ok: redis.configured ? !!redis.ok : true },
    { key: 'storage', ok: !!objectStorage.ok },
    { key: 'queue', ok: !!queue.ok },
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
    object_storage: objectStorage,
    worker_queue: queue,
    api: {
      ok: true,
      latency_ms: db.latency_ms != null ? round(db.latency_ms, 2) : null
    }
  };
}

module.exports = { buildSystemHealth };
