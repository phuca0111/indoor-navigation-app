const {
  normalizeMapData,
  buildEditorRoundTripSnapshot
} = require('../../services/mapContract');
const {
  COMPARE_EXPIRE_LUA,
  COMPARE_DELETE_LUA
} = require('../../services/floorLockRedisStore');
const { resolveQueueBackend } = require('../../services/publishQueue');
const { queueOptions } = require('../../services/publishQueueBull');
const { draftEtag, parseExpectedVersion } = require('../../services/draftService');
const { normalizeIdempotencyKey } = require('../../services/publishService');
const PublishJob = require('../../models/PublishJob');
const { strictLifecycleFlag } = require('../../utils/mapLifecycleFlags');
const {
  autosaveFingerprint,
  assertFence
} = require('../../domain/mapLifecyclePolicies');

describe('map lifecycle contracts (không DB)', () => {
  const oldEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...oldEnv };
  });

  test('map round-trip giữ toàn bộ editor extras và chỉ bỏ background ở snapshot', () => {
    const input = {
      background_image: '/uploads/map.png',
      bgX: 12,
      bgScaleX: 1.2,
      rooms: [{ id: 'r1', hatch: { pattern: 'ANSI31' }, labelFontSize: 18 }],
      walls: [{ id: 'w1', closed: true, points: [] }],
      pois: [{ id: 'p1', type: 'Thang máy', customStyle: { color: 'red' } }],
      cadPoints: [{ id: 1, style: 'cross' }],
      dimensions: [{ id: 2, type: 'dimlinear' }],
      advancedFeatures: { constraints: [{ id: 'c1' }] }
    };
    const normalized = normalizeMapData(input);
    expect(normalized.schema_version).toBe(1);
    expect(normalized.pois[0]).toMatchObject({
      type: 'Thang máy',
      poi_type: 'ELEVATOR',
      customStyle: { color: 'red' }
    });
    const snapshot = buildEditorRoundTripSnapshot(normalized);
    expect(snapshot.background_image).toBeUndefined();
    expect(snapshot.rooms[0].hatch.pattern).toBe('ANSI31');
    expect(snapshot.walls[0].closed).toBe(true);
    expect(snapshot.dimensions).toEqual(input.dimensions);
    expect(snapshot.advancedFeatures).toEqual(input.advancedFeatures);
  });

  test('revision/ETag parse nhất quán', () => {
    expect(draftEtag(7)).toBe('"draft-7"');
    expect(parseExpectedVersion('"draft-7"')).toBe(7);
    expect(parseExpectedVersion(0)).toBe(0);
    expect(parseExpectedVersion(undefined)).toBeNull();
  });

  test('strict lock/revision chỉ mặc định bật ở production', () => {
    expect(strictLifecycleFlag('DRAFT_REQUIRE_LOCK', { NODE_ENV: 'development' })).toBe(false);
    expect(strictLifecycleFlag('DRAFT_REQUIRE_LOCK', { NODE_ENV: 'test' })).toBe(false);
    expect(strictLifecycleFlag('DRAFT_REQUIRE_LOCK', { NODE_ENV: 'production' })).toBe(true);
    expect(strictLifecycleFlag('DRAFT_REQUIRE_LOCK', {
      NODE_ENV: 'production',
      DRAFT_REQUIRE_LOCK: 'false'
    })).toBe(false);
  });

  test('Lua lock so sánh owner trước expire/release và không dùng KEYS command', () => {
    for (const script of [COMPARE_EXPIRE_LUA, COMPARE_DELETE_LUA]) {
      expect(script).toContain("redis.call('GET', KEYS[1])");
      expect(script).toContain('lock.user_id');
      expect(script).toContain('lock.session_id');
      expect(script).not.toMatch(/redis\.call\(['"]KEYS/);
    }
    expect(COMPARE_EXPIRE_LUA).toContain("'EXPIRE'");
    expect(COMPARE_DELETE_LUA).toContain("'DEL'");
  });

  test('queue chọn BullMQ khi có Redis, legacy chỉ khi feature flag', () => {
    process.env.REDIS_URL = 'redis://safe-test.invalid:6379';
    delete process.env.PUBLISH_QUEUE;
    expect(resolveQueueBackend()).toBe('bullmq');
    process.env.PUBLISH_QUEUE = 'redis-list';
    expect(resolveQueueBackend()).toBe('redis-list');
    process.env.PUBLISH_QUEUE = 'memory';
    expect(resolveQueueBackend()).toBe('memory');
    expect(queueOptions()).toMatchObject({
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnFail: false
    });
  });

  test('idempotency key chuẩn hóa và có unique partial index', () => {
    expect(normalizeIdempotencyKey('  request-123  ')).toBe('request-123');
    expect(normalizeIdempotencyKey('')).toBeNull();
    const index = PublishJob.schema.indexes().find(
      ([keys]) => keys.requested_by === 1 && keys.idempotency_key === 1
    );
    expect(index).toBeDefined();
    expect(index[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { idempotency_key: { $type: 'string' } }
    });
  });

  test('autosave fingerprint ổn định theo key order và lock fence chặn stale owner', () => {
    expect(autosaveFingerprint({ rooms: [], meta: { b: 2, a: 1 } }))
      .toBe(autosaveFingerprint({ meta: { a: 1, b: 2 }, rooms: [] }));
    expect(() => assertFence({ fencing_token: 8 }, 7)).toThrow(
      expect.objectContaining({ code: 'LOCK_FENCE_STALE' })
    );
    expect(() => assertFence({ fencing_token: 8 }, 8)).not.toThrow();
  });
});
