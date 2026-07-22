const {
  legacyMemberFromUser,
  effectiveMember
} = require('../../services/organizationMembership');
const {
  isSafeHttpUrl,
  validateProfilePatch
} = require('../../utils/identityValidation');

describe('identity legacy compatibility và validation', () => {
  const legacyUser = {
    _id: 'u1',
    organization_id: 'o1',
    role: 'BUILDING_ADMIN',
    assigned_buildings: ['b1'],
    is_active: true
  };

  test('dual-read fallback ánh xạ User legacy khi chưa có member', () => {
    expect(legacyMemberFromUser(legacyUser)).toMatchObject({
      organization_id: 'o1',
      user_id: 'u1',
      role: 'BUILDING_ADMIN',
      building_ids: ['b1'],
      source: 'legacy_user'
    });
    expect(effectiveMember(null, legacyUser).source).toBe('legacy_user');
  });

  test('OrganizationMember active được ưu tiên', () => {
    const member = { organization_id: 'o1', user_id: 'u1', role: 'ORG_ADMIN', status: 'ACTIVE' };
    expect(effectiveMember(member, legacyUser)).toMatchObject({
      role: 'ORG_ADMIN',
      source: 'organization_member'
    });
  });

  test('profile chỉ nhận URL và object key an toàn', () => {
    expect(isSafeHttpUrl('https://cdn.example/avatar.png')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(validateProfilePatch({
      avatar_url: 'javascript:alert(1)',
      avatar_object_key: '../secret',
      preferences: { theme: 'neon' }
    })).toHaveLength(3);
    expect(validateProfilePatch({
      avatar_url: 'https://cdn.example/avatar.png',
      avatar_object_key: 'avatars/u1/file.png',
      preferences: { theme: 'dark', locale: 'vi' },
      notification_preferences: { email_security: true, in_app: false }
    })).toEqual([]);
  });
});
