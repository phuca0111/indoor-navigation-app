jest.mock('../../utils/redisClient', () => ({
  getRedisUrl: () => 'redis://configured.invalid'
}));
jest.mock('../../services/floorLockRedisStore', () => ({
  name: 'redis',
  kvGet: jest.fn().mockRejectedValue(new Error('redis down'))
}));
jest.mock('../../models/FloorEditLock', () => ({
  deleteMany: jest.fn()
}));

const floorEditLock = require('../../services/floorEditLock');

describe('floor lock fail-closed', () => {
  beforeEach(() => {
    delete process.env.FLOOR_LOCK_BACKEND;
  });

  test('Redis đã cấu hình mà lỗi thì trả 503, không tạo memory lock', async () => {
    await expect(floorEditLock.acquire({
      buildingId: 'b1',
      floor: 1,
      userId: 'u1',
      sessionId: 's1'
    })).rejects.toMatchObject({
      status: 503,
      code: 'LOCK_SERVICE_UNAVAILABLE'
    });
  });
});
