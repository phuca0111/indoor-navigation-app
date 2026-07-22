const {
  expectedMemberProjection,
  memberMatchesUser
} = require('../../scripts/backfill-organization-members');

describe('Phase 5 membership backfill verification', () => {
  const user = {
    role: 'BUILDING_ADMIN',
    assigned_buildings: ['b2', 'b1'],
    is_active: true
  };

  test('projection backfill ổn định và không phụ thuộc thứ tự building', () => {
    expect(expectedMemberProjection(user)).toEqual({
      role: 'BUILDING_ADMIN',
      building_ids: ['b1', 'b2'],
      status: 'ACTIVE'
    });
    expect(memberMatchesUser({
      role: 'BUILDING_ADMIN',
      building_ids: ['b1', 'b2'],
      status: 'ACTIVE'
    }, user)).toBe(true);
  });

  test.each([
    [{ role: 'ORG_ADMIN', building_ids: ['b1', 'b2'], status: 'ACTIVE' }],
    [{ role: 'BUILDING_ADMIN', building_ids: ['b1'], status: 'ACTIVE' }],
    [{ role: 'BUILDING_ADMIN', building_ids: ['b1', 'b2'], status: 'SUSPENDED' }],
    [null]
  ])('verify chặn member thiếu hoặc drift: %p', (member) => {
    expect(memberMatchesUser(member, user)).toBe(false);
  });
});
