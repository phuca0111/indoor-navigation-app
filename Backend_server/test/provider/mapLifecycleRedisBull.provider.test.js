const IORedis = require('ioredis');
const redisStore = require('../../services/floorLockRedisStore');
const bull = require('../../services/publishQueueBull');
const { resetRedisForTests } = require('../../utils/redisClient');

describe('Phase 4 Redis/BullMQ provider', () => {
  let redis;

  beforeAll(async () => {
    if (!process.env.REDIS_URL) {
      throw new Error('BLOCKER: REDIS_URL bắt buộc để chạy provider test Phase 4.');
    }
    redis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    await redis.ping();
  });

  afterAll(async () => {
    await bull.stopWorker().catch(() => {});
    resetRedisForTests();
    if (redis) await redis.quit().catch(() => redis.disconnect());
  });

  test('hai acquire đồng thời chỉ một client thắng và fence tăng khi reacquire', async () => {
    const building = `provider-${Date.now()}`;
    const [left, right] = await Promise.all([
      redisStore.kvSetNx(building, 0, { user_id: 'u1', session_id: 's1' }, 30),
      redisStore.kvSetNx(building, 0, { user_id: 'u2', session_id: 's2' }, 30)
    ]);
    expect([left, right].filter(Boolean)).toHaveLength(1);
    const first = left || right;
    await redisStore.kvDel(building, 0);
    const second = await redisStore.kvSetNx(
      building,
      0,
      { user_id: 'u3', session_id: 's3' },
      30
    );
    expect(second.fencing_token).toBeGreaterThan(first.fencing_token);
    await redisStore.kvDel(building, 0);
  });

  test('BullMQ dedupe cùng publishJobId', async () => {
    const id = `provider-job-${Date.now()}`;
    await bull.enqueue(id);
    await bull.enqueue(id);
    const job = await bull.getQueue().getJob(id);
    expect(job.id).toBe(id);
  });
});
