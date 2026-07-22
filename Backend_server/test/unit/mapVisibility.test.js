/**
 * Map Governance P0/P4 — unit: visibility matrix
 */
const {
  MAP_VISIBILITY,
  MAP_VISIBILITY_VALUES,
  PLACE_STATUS_VALUES,
  isCommunitySearchable,
  isLinkAccessible,
  normalizeVisibility,
  normalizePlaceStatus,
  requiresPublishedStatus,
  assertVisibilityAllowedForStatus,
  visibilityAfterStatusChange,
  communityPublicMongoFilter
} = require('../../utils/mapVisibility');

describe('mapVisibility utils', () => {
  test('enum đủ 4 visibility + 4 place status', () => {
    expect(MAP_VISIBILITY_VALUES).toEqual(['PRIVATE', 'UNLISTED', 'COMMUNITY', 'OFFICIAL']);
    expect(PLACE_STATUS_VALUES).toEqual(['DRAFT', 'ACTIVE', 'LOCKED', 'MERGED']);
  });

  test.each([
    [{ status: 'PUBLISHED', visibility: 'COMMUNITY', is_active: true }, true],
    [{ status: 'PUBLISHED', visibility: 'OFFICIAL', is_active: true }, true],
    [{ status: 'PUBLISHED', visibility: 'UNLISTED', is_active: true }, false],
    [{ status: 'PUBLISHED', visibility: 'PRIVATE', is_active: true }, false],
    [{ status: 'DRAFT', visibility: 'COMMUNITY', is_active: true }, false],
    [{ status: 'PUBLISHED', visibility: 'COMMUNITY', is_active: false }, false],
    [null, false],
    [{ status: 'PUBLISHED' }, false]
  ])('isCommunitySearchable(%j) → %s', (b, expected) => {
    expect(isCommunitySearchable(b)).toBe(expected);
  });

  test.each([
    [{ status: 'PUBLISHED', visibility: 'PRIVATE', is_active: true }, false],
    [{ status: 'PUBLISHED', visibility: 'UNLISTED', is_active: true }, true],
    [{ status: 'PUBLISHED', visibility: 'COMMUNITY', is_active: true }, true],
    [{ status: 'PUBLISHED', visibility: 'OFFICIAL', is_active: true }, true],
    [{ status: 'DRAFT', visibility: 'UNLISTED', is_active: true }, false],
    [{ status: 'PUBLISHED', visibility: 'UNLISTED', is_active: false }, false]
  ])('isLinkAccessible(%j) → %s', (b, expected) => {
    expect(isLinkAccessible(b)).toBe(expected);
  });

  test('normalizeVisibility', () => {
    expect(normalizeVisibility('community')).toBe('COMMUNITY');
    expect(normalizeVisibility('  official ')).toBe('OFFICIAL');
    expect(normalizeVisibility('nope')).toBe(MAP_VISIBILITY.PRIVATE);
    expect(normalizeVisibility('nope', 'UNLISTED')).toBe('UNLISTED');
    expect(normalizeVisibility('')).toBe('PRIVATE');
  });

  test('normalizePlaceStatus', () => {
    expect(normalizePlaceStatus('locked')).toBe('LOCKED');
    expect(normalizePlaceStatus('x', 'DRAFT')).toBe('DRAFT');
  });

  test('requiresPublishedStatus + assertVisibilityAllowedForStatus', () => {
    expect(requiresPublishedStatus('COMMUNITY')).toBe(true);
    expect(requiresPublishedStatus('PRIVATE')).toBe(false);
    expect(assertVisibilityAllowedForStatus('DRAFT', 'COMMUNITY').ok).toBe(false);
    expect(assertVisibilityAllowedForStatus('DRAFT', 'COMMUNITY').code).toBe('VISIBILITY_REQUIRES_PUBLISHED');
    expect(assertVisibilityAllowedForStatus('PUBLISHED', 'COMMUNITY').ok).toBe(true);
    expect(assertVisibilityAllowedForStatus('DRAFT', 'PRIVATE').ok).toBe(true);
  });

  test('visibilityAfterStatusChange downgrade COMMUNITY khi DRAFT', () => {
    expect(visibilityAfterStatusChange('DRAFT', 'COMMUNITY')).toEqual({
      visibility: 'PRIVATE',
      downgraded: true
    });
    expect(visibilityAfterStatusChange('PUBLISHED', 'COMMUNITY').downgraded).toBe(false);
  });

  test('communityPublicMongoFilter', () => {
    expect(communityPublicMongoFilter()).toMatchObject({
      status: 'PUBLISHED',
      visibility: { $in: ['COMMUNITY', 'OFFICIAL'] }
    });
  });
});
