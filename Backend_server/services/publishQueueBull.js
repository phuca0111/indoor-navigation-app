const IORedis = require('ioredis');
const { Queue, Worker, QueueEvents } = require('bullmq');

const QUEUE_NAME = process.env.PUBLISH_BULL_QUEUE_NAME || 'map-publish';
let connection;
let queue;
let worker;
let events;

function bullConnection() {
  if (!process.env.REDIS_URL) {
    throw Object.assign(new Error('BullMQ cần REDIS_URL.'), { code: 'REDIS_URL_REQUIRED' });
  }
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true
    });
  }
  return connection;
}

function queueOptions() {
  return {
    attempts: Math.max(1, Number(process.env.PUBLISH_QUEUE_ATTEMPTS) || 5),
    backoff: {
      type: 'exponential',
      delay: Math.max(100, Number(process.env.PUBLISH_QUEUE_BACKOFF_MS) || 1000)
    },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: false
  };
}

function getQueue() {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: bullConnection() });
  return queue;
}

async function enqueue(jobId) {
  await getQueue().add('publish-map', { publishJobId: String(jobId) }, {
    ...queueOptions(),
    jobId: String(jobId)
  });
  return 'bullmq';
}

async function startWorker() {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('Không tự start BullMQ worker trong test.');
  }
  if (worker) return worker;
  const { processPublishJob } = require('../application/mapLifecycle/publishApplicationService');
  worker = new Worker(
    QUEUE_NAME,
    async (bullJob) => processPublishJob(bullJob.data.publishJobId, { throwOnFailure: true }),
    {
      connection: bullConnection(),
      concurrency: Math.max(1, Number(process.env.PUBLISH_WORKER_CONCURRENCY) || 2)
    }
  );
  events = new QueueEvents(QUEUE_NAME, { connection: bullConnection() });
  events.on('failed', ({ jobId, failedReason }) => {
    console.error(`[publishWorker] DEAD/FAILED ${jobId}: ${failedReason}`);
  });
  return worker;
}

async function stopWorker() {
  await Promise.all([
    worker?.close(),
    events?.close(),
    queue?.close()
  ]);
  worker = null;
  events = null;
  queue = null;
  if (connection) await connection.quit().catch(() => connection.disconnect());
  connection = null;
}

module.exports = {
  QUEUE_NAME,
  queueOptions,
  getQueue,
  enqueue,
  startWorker,
  stopWorker
};
