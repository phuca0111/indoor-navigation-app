describe('Phase 6 content boundaries', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('public CMS query chỉ đọc, không tự promote lịch', async () => {
    const repository = {
      listPublicArticles: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      claimDueArticle: jest.fn()
    };
    jest.doMock('../../repositories/cmsRepository', () => repository);
    jest.doMock('../../repositories/outboxRepository', () => ({ append: jest.fn() }));
    const cms = require('../../application/content/cmsApplicationService');

    await expect(cms.listPublicArticles()).resolves.toMatchObject({ items: [], total: 0 });
    expect(repository.claimDueArticle).not.toHaveBeenCalled();
  });

  test('upload object thành công nhưng DB lỗi để lại FAILED cho reconciler', async () => {
    const adapter = {
      bucket: '',
      put: jest.fn().mockResolvedValue({}),
      delete: jest.fn(),
      publicUrl: jest.fn().mockReturnValue('/uploads/cms-media/a.png')
    };
    const repository = {
      storageUsage: jest.fn().mockResolvedValue(0),
      createAsset: jest.fn().mockResolvedValue({
        _id: 'asset-1',
        backend: 'local',
        key: 'cms-media/a.png',
        url: '/uploads/cms-media/a.png',
        mime: 'image/png',
        size: 16,
        checksum: 'a'.repeat(64)
      }),
      createMedia: jest.fn().mockRejectedValue(new Error('DB unavailable')),
      updateAsset: jest.fn().mockResolvedValue({})
    };
    jest.doMock('../../repositories/mediaRepository', () => repository);
    jest.doMock('../../repositories/outboxRepository', () => ({ append: jest.fn() }));
    jest.doMock('../../services/storagePlatform', () => ({
      createStorageAdapter: jest.fn(() => adapter),
      validateBuffer: jest.fn(() => ({
        mime: 'image/png',
        size: 16,
        checksum: 'a'.repeat(64)
      })),
      buildObjectKey: jest.fn(() => 'cms-media/a.png'),
      assertSafeKey: jest.fn((value) => value),
      detectMime: jest.fn(() => 'image/png')
    }));
    const media = require('../../application/content/mediaApplicationService');

    await expect(media.uploadMedia({
      buffer: Buffer.alloc(16),
      mimetype: 'image/png',
      originalname: 'a.png'
    }, {}, { actorId: 'u1' })).rejects.toThrow('DB unavailable');
    expect(adapter.put).toHaveBeenCalledTimes(1);
    expect(adapter.delete).not.toHaveBeenCalled();
    expect(repository.updateAsset).toHaveBeenLastCalledWith(
      'asset-1',
      { status: 'PENDING' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'FAILED' }) })
    );
  });

  test('search policy không cấp dữ liệu tenant cho FINANCE_ADMIN', async () => {
    const { allowedTypes, buildScope, projectionScopeFilter } =
      require('../../application/search/searchPolicy');
    const repository = { buildingIds: jest.fn() };
    expect(allowedTypes(
      { role: 'FINANCE_ADMIN' },
      ['organization', 'invoice', 'building', 'user']
    )).toEqual(['organization', 'invoice']);
    await expect(buildScope(
      { role: 'ORG_ADMIN' },
      { organization_id: 'org-1' },
      { buildingIds: jest.fn().mockResolvedValue(['b1']) }
    )).resolves.toEqual({
      platform: false,
      organizationId: 'org-1',
      buildingIds: ['b1']
    });
    expect(projectionScopeFilter({
      platform: false,
      organizationId: 'org-1',
      buildingIds: ['b1']
    })).toEqual({
      $or: [
        { visibility: 'PUBLIC' },
        { organization_id: 'org-1' },
        { building_id: { $in: ['b1'] } }
      ]
    });
    expect(repository.buildingIds).not.toHaveBeenCalled();
  });

  test('purge từ chối khi nội dung CMS còn tham chiếu URL media', async () => {
    const adapter = { delete: jest.fn() };
    jest.doMock('../../repositories/mediaRepository', () => ({
      findMediaById: jest.fn().mockResolvedValue({
        _id: 'media-1',
        status: 'DELETED',
        retention_until: new Date(0),
        storage_asset_id: 'asset-1',
        url: '/uploads/cms-media/a.png'
      }),
      countMediaReferences: jest.fn().mockResolvedValue(0),
      countContentReferences: jest.fn().mockResolvedValue(1)
    }));
    jest.doMock('../../repositories/outboxRepository', () => ({ append: jest.fn() }));
    jest.doMock('../../services/storagePlatform', () => ({
      createStorageAdapter: jest.fn(() => adapter),
      validateBuffer: jest.fn(),
      buildObjectKey: jest.fn(),
      assertSafeKey: jest.fn(),
      detectMime: jest.fn()
    }));
    const media = require('../../application/content/mediaApplicationService');
    await expect(media.purgeMedia('media-1', { actorId: 'u1' })).rejects.toMatchObject({
      code: 'MEDIA_REFERENCED',
      status: 409
    });
    expect(adapter.delete).not.toHaveBeenCalled();
  });

  test('OpenSearch fail-closed nếu thiếu endpoint hoặc credential', async () => {
    const { OpenSearchProvider } = require('../../application/search/searchProviders');
    await expect(new OpenSearchProvider({ endpoint: '', apiKey: '' }).search({
      query: 'abc',
      limit: 10,
      offset: 0,
      types: ['article'],
      scope: { platform: true }
    })).rejects.toMatchObject({
      code: 'OPENSEARCH_NOT_CONFIGURED',
      status: 503
    });
  });

  test('search rebuild lưu checkpoint và resume theo source id', async () => {
    const repository = {
      getCheckpoint: jest.fn().mockResolvedValue({
        last_id: 'a0',
        processed: 3,
        completed: false
      }),
      listProjectionSources: jest.fn()
        .mockResolvedValueOnce([
          { _id: 'a1', title: 'Một', slug: 'mot', status: 'PUBLISHED', revision: 1 },
          { _id: 'a2', title: 'Hai', slug: 'hai', status: 'DRAFT', revision: 2 }
        ])
        .mockResolvedValueOnce([]),
      upsertProjection: jest.fn().mockResolvedValue({}),
      saveCheckpoint: jest.fn().mockResolvedValue({})
    };
    jest.doMock('../../repositories/searchRepository', () => repository);
    const { rebuildIndex } =
      require('../../application/search/searchApplicationService');
    await expect(rebuildIndex({ type: 'article', batchSize: 2 }))
      .resolves.toEqual({ article: 5 });
    expect(repository.listProjectionSources).toHaveBeenNthCalledWith(1, 'article', 'a0', 2);
    expect(repository.listProjectionSources).toHaveBeenNthCalledWith(2, 'article', 'a2', 2);
    expect(repository.upsertProjection).toHaveBeenCalledTimes(2);
    expect(repository.saveCheckpoint).toHaveBeenLastCalledWith(
      'search-rebuild:article:v1',
      expect.objectContaining({ last_id: 'a2', processed: 5, completed: true })
    );
  });
});
