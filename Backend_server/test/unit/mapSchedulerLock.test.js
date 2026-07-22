const mockRedis = {
  set: jest.fn(),
  eval: jest.fn().mockResolvedValue(1)
};
jest.mock('../../utils/redisClient', () => ({
  getRedisUrl: () => 'redis://configured',
  ensureRedis: jest.fn(async () => mockRedis)
}));

const {
  withDistributedLock,
  RELEASE_LUA
} = require('../../services/mapLifecycleScheduler');

describe('map lifecycle scheduler distributed lock', () => {
  beforeEach(() => jest.clearAllMocks());

  test('chỉ chạy task khi SET NX EX thành công và release compare token', async () => {
    mockRedis.set.mockResolvedValue('OK');
    const task = jest.fn().mockResolvedValue({ done: true });
    await expect(withDistributedLock('gc', 30, task)).resolves.toEqual({ done: true });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'scheduler:map-lifecycle:gc',
      expect.any(String),
      'EX',
      30,
      'NX'
    );
    expect(task).toHaveBeenCalledTimes(1);
    expect(mockRedis.eval).toHaveBeenCalledWith(
      RELEASE_LUA,
      1,
      'scheduler:map-lifecycle:gc',
      expect.any(String)
    );
  });

  test('không chạy trùng khi instance khác giữ lock', async () => {
    mockRedis.set.mockResolvedValue(null);
    const task = jest.fn();
    await expect(withDistributedLock('gc', 30, task)).resolves.toMatchObject({ skipped: true });
    expect(task).not.toHaveBeenCalled();
  });
});
