const {
  get,
  set,
  invalidate,
  clearMemoryForTests
} = require('../../services/publicMapCache');

describe('D6 — public map cache', () => {
  beforeEach(clearMemoryForTests);

  test('set/get và invalidate theo building/floor', async () => {
    await set('building-a', 2, { version: 3, map_data: { rooms: [] } });
    expect(await get('building-a', 2)).toMatchObject({ version: 3 });
    expect(await get('building-a', 3)).toBeNull();
    await invalidate('building-a', 2);
    expect(await get('building-a', 2)).toBeNull();
  });
});
