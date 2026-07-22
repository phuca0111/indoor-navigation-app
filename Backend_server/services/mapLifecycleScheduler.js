const crypto = require('crypto');
const { ensureRedis, getRedisUrl } = require('../utils/redisClient');
const PublishJob = require('../models/PublishJob');
const MapVersion = require('../models/MapVersion');
const { purgeExpired } = require('./draftService');
const { applyRetentionForFloor } = require('../utils/mapVersionRetention');

const RELEASE_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
let timer = null;
let running = false;

async function withDistributedLock(name, ttlSec, task) {
  const redis = getRedisUrl() ? await ensureRedis() : null;
  if (getRedisUrl() && !redis) {
    throw Object.assign(new Error('Scheduler lock Redis không khả dụng.'), {
      code: 'SCHEDULER_LOCK_UNAVAILABLE'
    });
  }
  if (!redis) return task();
  const key = `scheduler:map-lifecycle:${name}`;
  const token = crypto.randomUUID();
  const acquired = await redis.set(key, token, 'EX', ttlSec, 'NX');
  if (acquired !== 'OK') return { skipped: true, reason: 'LOCKED' };
  try {
    return await task();
  } finally {
    await redis.eval(RELEASE_LUA, 1, key, token);
  }
}

async function recoverStalePublishJobs(now = new Date()) {
  const staleBefore = new Date(now.getTime() - (Number(process.env.PUBLISH_JOB_STALE_MS) || 15 * 60000));
  const jobs = await PublishJob.find({
    status: 'RUNNING',
    started_at: { $lte: staleBefore },
    $expr: { $lt: ['$attempts', '$max_attempts'] }
  }).select('_id');
  const { enqueuePublishWork } = require('./publishQueue');
  for (const job of jobs) {
    const changed = await PublishJob.updateOne(
      { _id: job._id, status: 'RUNNING' },
      { $set: { status: 'QUEUED', started_at: null } }
    );
    if (changed.modifiedCount) await enqueuePublishWork(String(job._id));
  }
  await PublishJob.updateMany(
    {
      status: { $in: ['RUNNING', 'FAILED'] },
      $expr: { $gte: ['$attempts', '$max_attempts'] },
      dead_lettered_at: null
    },
    { $set: { status: 'FAILED', dead_lettered_at: now, finished_at: now } }
  );
  return jobs.length;
}

async function retainMapVersions() {
  const floors = await MapVersion.aggregate([
    { $group: { _id: { building_id: '$building_id', floor_number: '$floor_number' } } }
  ]);
  for (const item of floors) {
    await applyRetentionForFloor(item._id.building_id, item._id.floor_number, {});
  }
  return floors.length;
}

async function runProviderHook(name) {
  const modulePath = process.env[name];
  if (!modulePath) return { skipped: true, providerReady: true };
  const provider = require(modulePath);
  return provider.run();
}

async function runOnce() {
  return withDistributedLock('maintenance', 300, async () => ({
    draftsPurged: await purgeExpired(),
    staleJobsRecovered: await recoverStalePublishJobs(),
    floorsRetained: await retainMapVersions(),
    assetGc: await runProviderHook('MAP_ASSET_GC_PROVIDER'),
    backup: await runProviderHook('MAP_BACKUP_PROVIDER')
  }));
}

function startMapLifecycleScheduler() {
  if (process.env.NODE_ENV === 'test' || timer) return;
  const interval = Math.max(60000, Number(process.env.MAP_LIFECYCLE_INTERVAL_MS) || 3600000);
  timer = setInterval(() => {
    if (running) return;
    running = true;
    runOnce().catch((error) => console.error('[mapLifecycleScheduler]', error))
      .finally(() => { running = false; });
  }, interval);
  timer.unref?.();
}

function stopMapLifecycleScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  RELEASE_LUA,
  withDistributedLock,
  recoverStalePublishJobs,
  retainMapVersions,
  runOnce,
  startMapLifecycleScheduler,
  stopMapLifecycleScheduler
};
