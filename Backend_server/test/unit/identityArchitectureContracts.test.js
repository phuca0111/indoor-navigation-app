const { EffectivePrincipal } = require('../../application/identity/EffectivePrincipal');
const { ActorContext } = require('../../application/identity/ActorContext');
const { TenantScope } = require('../../application/identity/TenantScope');
const {
  evaluateAuthenticationEligibility
} = require('../../application/identity/authenticationEligibilityPolicy');
const { accessClaims } = require('../../application/identity/sessionApplicationService');
const { membershipReadMode } = require('../../application/identity/principalApplicationService');

describe('Phase 5 Identity contracts', () => {
  test('principal giữ contract legacy và tenant fail closed', () => {
    expect(() => new EffectivePrincipal({
      userId: 'user-1',
      role: 'ORG_ADMIN'
    })).toThrow('thiếu organization');
    const principal = new EffectivePrincipal({
      userId: 'user-1',
      role: 'BUILDING_ADMIN',
      organizationId: 'org-1',
      buildingIds: ['building-1'],
      sessionId: 'family-1',
      sessionVersion: 3,
      tokenId: 'jti-1'
    });
    expect(principal.toLegacyClaims()).toMatchObject({
      userId: 'user-1',
      role: 'BUILDING_ADMIN',
      organization_id: 'org-1',
      member_building_ids: ['building-1'],
      sid: 'family-1',
      sv: 3,
      jti: 'jti-1'
    });
  });

  test('ActorContext và TenantScope không suy diễn system từ scope trống', () => {
    const principal = new EffectivePrincipal({ userId: 'root', role: 'SUPER_ADMIN' });
    expect(ActorContext.fromRequest({
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest', 'x-request-id': 'request-1' }
    }, principal)).toMatchObject({
      userId: 'root',
      role: 'SUPER_ADMIN',
      ipAddress: '127.0.0.1',
      requestId: 'request-1'
    });
    expect(() => new TenantScope()).toThrow('bắt buộc');
    expect(TenantScope.system()).toMatchObject({ system: true, organizationId: null });
  });

  test('JWT khóa claims v2 đồng thời giữ claims tương thích', () => {
    expect(accessClaims({
      _id: 'user-1',
      role: 'ORG_ADMIN',
      organization_id: 'org-1',
      session_version: 2
    }, 'family-1')).toEqual({
      sub: 'user-1',
      userId: 'user-1',
      role: 'ORG_ADMIN',
      org: 'org-1',
      sv: 2,
      sid: 'family-1'
    });
  });

  test('password, OAuth và complete-2FA dùng cùng eligibility result', () => {
    const input = {
      user: {
        _id: 'user-1',
        role: 'ORG_ADMIN',
        organization_id: 'org-1',
        is_active: true
      },
      organization: { _id: 'org-1', is_active: true },
      member: { status: 'SUSPENDED' },
      quotaLocked: false
    };
    expect(evaluateAuthenticationEligibility(input)).toMatchObject({
      ok: false,
      status: 403,
      code: 'MEMBER_INACTIVE'
    });
  });

  test('member cutover fail closed khi chưa có dấu verify backfill', () => {
    const previousSource = process.env.IDENTITY_MEMBERSHIP_READ_SOURCE;
    const previousVerified = process.env.IDENTITY_MEMBERSHIP_BACKFILL_VERIFIED;
    process.env.IDENTITY_MEMBERSHIP_READ_SOURCE = 'member';
    process.env.IDENTITY_MEMBERSHIP_BACKFILL_VERIFIED = 'false';
    expect(() => membershipReadMode()).toThrow('trước khi backfill');
    if (previousSource === undefined) delete process.env.IDENTITY_MEMBERSHIP_READ_SOURCE;
    else process.env.IDENTITY_MEMBERSHIP_READ_SOURCE = previousSource;
    if (previousVerified === undefined) delete process.env.IDENTITY_MEMBERSHIP_BACKFILL_VERIFIED;
    else process.env.IDENTITY_MEMBERSHIP_BACKFILL_VERIFIED = previousVerified;
  });
});
