/**
 * Phase 4.2d — Unit test sắp xếp bảng tổ chức
 * Chạy: npm run test:phase4-2d
 */

const { sortOrganizations } = require('../../js/orgListSort');

const sample = [
  { name: 'Zeta Org', slug: 'z', plan: 'FREE', is_active: true, building_count: 1, user_count: 2, createdAt: '2026-01-01' },
  { name: 'Alpha Org', slug: 'a', plan: 'PRO', is_active: false, building_count: 5, user_count: 1, createdAt: '2026-06-01' },
  { name: 'Beta Org', slug: 'b', plan: 'ENTERPRISE', is_active: true, building_count: 3, user_count: 10, createdAt: '2026-03-01' }
];

describe('Phase 4.2d — orgListSort', () => {
  test('TC-4.2d-unit-01 sort name asc', () => {
    const out = sortOrganizations(sample, 'name', 'asc');
    expect(out.map((o) => o.name)).toEqual(['Alpha Org', 'Beta Org', 'Zeta Org']);
  });

  test('TC-4.2d-unit-02 sort buildings desc', () => {
    const out = sortOrganizations(sample, 'buildings', 'desc');
    expect(out.map((o) => o.building_count)).toEqual([5, 3, 1]);
  });

  test('TC-4.2d-unit-03 sort created asc', () => {
    const out = sortOrganizations(sample, 'created', 'asc');
    expect(out.map((o) => o.slug)).toEqual(['z', 'b', 'a']);
  });

  test('TC-4.2d-unit-04 sort users desc', () => {
    const out = sortOrganizations(sample, 'users', 'desc');
    expect(out[0].slug).toBe('b');
  });

  test('TC-4.2d-unit-05 không mutate mảng gốc', () => {
    const copy = sample.slice();
    sortOrganizations(sample, 'name', 'asc');
    expect(sample).toEqual(copy);
  });
});
