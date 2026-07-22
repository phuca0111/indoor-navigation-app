const {
  restoreSnapshotForAudit,
  restoreModelForType
} = require('../../services/cmsContentService');

describe('CMS generic restore policy', () => {
  test.each(['ARTICLE', 'BANNER', 'MEDIA', 'PAGE', 'CONFIG'])(
    'map đúng model cho %s',
    (resourceType) => {
      expect(restoreModelForType(resourceType)).toBeTruthy();
    }
  );

  test('DELETE phục hồi before; action khác phục hồi after', () => {
    expect(restoreSnapshotForAudit({
      action: 'DELETE',
      before: { title: 'before' },
      after: { title: 'deleted' }
    })).toEqual({ title: 'before' });
    expect(restoreSnapshotForAudit({
      action: 'UPDATE',
      before: { title: 'before' },
      after: { title: 'after' }
    })).toEqual({ title: 'after' });
  });

  test('không map loại ngoài allowlist', () => {
    expect(restoreModelForType('USER')).toBeNull();
  });
});
