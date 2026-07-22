const mockAggregate = jest.fn();
const mockCreate = jest.fn();
const mockFindById = jest.fn();

jest.mock('../../models/Asset', () => ({
  aggregate: mockAggregate,
  create: mockCreate,
  findById: mockFindById
}));
jest.mock('../../models/LandingMedia', () => ({
  updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 })
}));

const mockAdapter = {
  backend: 'local',
  bucket: '',
  put: jest.fn().mockResolvedValue({ key: 'cms-media/u/a.png', bucket: '' }),
  head: jest.fn().mockResolvedValue({ exists: true, size: 16 }),
  delete: jest.fn().mockResolvedValue(true),
  publicUrl: jest.fn().mockReturnValue('/uploads/cms-media/u/a.png')
};

jest.mock('../../services/storagePlatform', () => {
  const actual = jest.requireActual('../../services/storagePlatform');
  return {
    ...actual,
    createStorageAdapter: jest.fn(() => mockAdapter),
    buildObjectKey: jest.fn(() => 'cms-media/u/a.png')
  };
});

const {
  assertQuota,
  storeAsset,
  softDeleteAsset,
  restoreAsset,
  purgeAsset
} = require('../../services/assetService');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('asset lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STORAGE_BACKEND = 'local';
    process.env.STORAGE_QUOTA_BYTES = '100';
  });

  test('quota tính tổng asset đang hoạt động và chặn vượt hạn mức', async () => {
    mockAggregate.mockResolvedValue([{ used: 90 }]);
    await expect(assertQuota({ ownerId: 'u', incomingBytes: 11 })).rejects.toMatchObject({
      code: 'STORAGE_QUOTA_EXCEEDED',
      status: 413
    });
  });

  test('upload tạo checksum và metadata Asset sau khi lưu object', async () => {
    mockAggregate.mockResolvedValue([{ used: 0 }]);
    mockCreate.mockImplementation(async (value) => ({ _id: 'asset-1', ...value }));
    const asset = await storeAsset({
      buffer: PNG,
      claimedMime: 'image/png',
      originalName: 'logo.png',
      ownerId: 'u',
      namespace: 'cms-media'
    });
    expect(asset.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(asset.size).toBe(PNG.length);
    expect(mockAdapter.put).toHaveBeenCalledWith(expect.objectContaining({
      mime: 'image/png',
      checksum: asset.checksum
    }));
  });

  test('soft delete, restore khi object còn và purge xóa vật lý', async () => {
    const asset = {
      key: 'cms-media/u/a.png',
      backend: 'local',
      status: 'ACTIVE',
      ref_count: 0,
      retention_until: null,
      save: jest.fn().mockResolvedValue(undefined)
    };
    await softDeleteAsset(asset);
    expect(asset.status).toBe('DELETED');
    expect(asset.retention_until).toBeInstanceOf(Date);
    await restoreAsset(asset);
    expect(asset.status).toBe('ACTIVE');
    expect(asset.ref_count).toBe(1);
    await softDeleteAsset(asset);
    asset.retention_until = new Date(0);
    await purgeAsset(asset);
    expect(mockAdapter.delete).toHaveBeenCalledWith({ key: asset.key, bucket: undefined });
    expect(asset.status).toBe('PURGED');
  });
});
