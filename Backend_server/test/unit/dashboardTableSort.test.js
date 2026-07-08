/**
 * Phase 4.5 — Unit test sắp xếp bảng Tòa nhà & Tài khoản
 * Chạy: npm run test:phase4-5
 */

const { sortBuildings, sortUsers } = require('../../js/dashboardTableSort');

const buildings = [
  { name: 'Tòa C', address: 'Hà Nội', total_floors: 2, status: 'DRAFT', organization_id: 'org2', updatedAt: '2026-01-01' },
  { name: 'Tòa A', address: 'TP.HCM', total_floors: 5, status: 'PUBLISHED', organization_id: 'org1', updatedAt: '2026-06-01' },
  { name: 'Tòa B', address: 'Đà Nẵng', total_floors: 3, status: 'PUBLISHED', organization_id: 'org1', updatedAt: '2026-03-01' }
];

const orgLabel = (id) => (id === 'org1' ? 'Alpha' : 'Beta');

const users = [
  { email: 'z@x.com', full_name: 'Zed', phone: '090', role: 'BUILDING_ADMIN', is_active: true, organization_id: 'org2', createdAt: '2026-01-01' },
  { email: 'a@x.com', full_name: 'An', phone: '091', role: 'ORG_ADMIN', is_active: false, organization_id: 'org1', createdAt: '2026-06-01' },
  { email: 'b@x.com', full_name: 'Binh', phone: '092', role: 'SUPER_ADMIN', is_active: true, organization_id: null, createdAt: '2026-03-01' }
];

describe('Phase 4.5 — dashboardTableSort', () => {
  test('TC-4.5-unit-01 sort buildings name asc', () => {
    const out = sortBuildings(buildings, 'name', 'asc', orgLabel);
    expect(out.map((b) => b.name)).toEqual(['Tòa A', 'Tòa B', 'Tòa C']);
  });

  test('TC-4.5-unit-02 sort buildings floors desc', () => {
    const out = sortBuildings(buildings, 'floors', 'desc', orgLabel);
    expect(out.map((b) => b.total_floors)).toEqual([5, 3, 2]);
  });

  test('TC-4.5-unit-03 sort buildings organization asc', () => {
    const out = sortBuildings(buildings, 'organization', 'asc', orgLabel);
    expect(out.map((b) => b.name)).toEqual(['Tòa A', 'Tòa B', 'Tòa C']);
  });

  test('TC-4.5-unit-04 sort users email asc', () => {
    const out = sortUsers(users, 'email', 'asc', orgLabel);
    expect(out.map((u) => u.email)).toEqual(['a@x.com', 'b@x.com', 'z@x.com']);
  });

  test('TC-4.5-unit-05 sort users role desc', () => {
    const out = sortUsers(users, 'role', 'desc', orgLabel);
    expect(out[0].role).toBe('SUPER_ADMIN');
  });

  test('TC-4.5-unit-06 không mutate mảng gốc', () => {
    const copy = buildings.slice();
    sortBuildings(buildings, 'name', 'asc', orgLabel);
    expect(buildings).toEqual(copy);
  });
});
