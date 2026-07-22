/**
 * Map Governance P2 — unit Merge Engine helpers
 */
const {
  uniqAliases,
  pickProposedChanges,
  CHANGEABLE_FIELDS
} = require('../../services/placeMergeEngine');

describe('placeMergeEngine helpers', () => {
  test('uniqAliases bỏ trống + trùng + trim', () => {
    expect(uniqAliases([' AEON ', 'AEON', '', null, 'AEON BD'])).toEqual(['AEON', 'AEON BD']);
  });

  test('pickProposedChanges chỉ lấy field được phép', () => {
    const picked = pickProposedChanges({
      name: 'X',
      aliases: ['a'],
      hack: 1,
      latitude: 1,
      longitude: 2
    });
    expect(picked).toEqual({ name: 'X', aliases: ['a'], latitude: 1, longitude: 2 });
    expect(picked.hack).toBeUndefined();
    expect(CHANGEABLE_FIELDS).toEqual(
      expect.arrayContaining(['name', 'aliases', 'latitude', 'longitude', 'address', 'category', 'notes'])
    );
  });

  test('pickProposedChanges empty → null', () => {
    expect(pickProposedChanges({})).toBeNull();
    expect(pickProposedChanges(null)).toBeNull();
  });
});
