const mockBuildingFind = jest.fn();

jest.mock('../../models/Building', () => ({ find: mockBuildingFind }));
jest.mock('../../models/Organization', () => ({}));
jest.mock('../../models/User', () => ({}));
jest.mock('../../models/Place', () => ({}));
jest.mock('../../models/Floor', () => ({}));
jest.mock('../../models/Invoice', () => ({}));
jest.mock('../../models/CmsArticle', () => ({}));
jest.mock('../../models/LandingMedia', () => ({}));

const {
  MongoSearchProvider,
  createSearchProvider,
  safeRegex,
  decodeCursor,
  encodeCursor,
  normalizeSearchTypes
} = require('../../services/searchProvider');

function queryResult(rows) {
  return {
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(rows)
    })
  };
}

describe('search provider contract', () => {
  beforeEach(() => jest.clearAllMocks());

  test('escape regex injection và giới hạn cursor hợp lệ', () => {
    const regex = safeRegex('a.*(b)');
    expect(regex.test('a.*(b)')).toBe(true);
    expect(regex.test('axxxb')).toBe(false);
    expect(decodeCursor(encodeCursor(25))).toBe(25);
    expect(() => decodeCursor('not-base64')).toThrow('Cursor');
    expect(normalizeSearchTypes(['ROOM', 'poi', 'room', '$where'])).toEqual(['room', 'poi']);
  });

  test('scope tenant tuyệt đối theo organization và assigned buildings', async () => {
    const provider = new MongoSearchProvider();
    mockBuildingFind.mockReturnValue(queryResult([{ _id: 'b1' }, { _id: 'b2' }]));
    await expect(provider.buildingScope(
      { role: 'ORG_ADMIN' },
      { organization_id: 'org-1' }
    )).resolves.toEqual(['b1', 'b2']);
    expect(mockBuildingFind).toHaveBeenCalledWith({ organization_id: 'org-1' });

    await expect(provider.buildingScope(
      { role: 'BUILDING_ADMIN' },
      { assigned_buildings: ['b3'] }
    )).resolves.toEqual(['b3']);
    await expect(provider.buildingScope({ role: 'FINANCE_ADMIN' }, {})).resolves.toEqual([]);
  });

  test('Mongo mặc định và OpenSearch provider-ready', () => {
    expect(createSearchProvider()).toBeInstanceOf(MongoSearchProvider);
    expect(createSearchProvider('opensearch').constructor.name).toBe('OpenSearchProvider');
  });
});
