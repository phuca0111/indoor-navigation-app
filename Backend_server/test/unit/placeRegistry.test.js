/**
 * Place Registry PHASE 1 — unit slug/enums + integration search public
 */
const {
  slugifyPlaceName,
  normalizeOwnerType,
  normalizePublicationStatus,
  PLACE_OWNER_TYPES,
  PLACE_PUBLICATION_STATUS
} = require('../../utils/placeRegistry');

describe.skip('placeRegistry utils', () => {
  test('slugify bỏ dấu tiếng Việt', () => {
    expect(slugifyPlaceName('Vincom Đồng Khởi')).toBe('vincom-dong-khoi');
    expect(slugifyPlaceName('  AEON Mall BD  ')).toBe('aeon-mall-bd');
  });

  test('normalize enums', () => {
    expect(normalizeOwnerType('organization')).toBe('ORGANIZATION');
    expect(normalizeOwnerType('x')).toBe('UNCLAIMED');
    expect(normalizePublicationStatus('public')).toBe('PUBLIC');
    expect(normalizePublicationStatus('nope')).toBe('PUBLIC');
    expect(PLACE_OWNER_TYPES).toContain('PLATFORM');
    expect(PLACE_PUBLICATION_STATUS).toContain('ARCHIVED');
  });
});
