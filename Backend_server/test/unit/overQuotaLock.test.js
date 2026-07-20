/**
 * Phase 5.3 — overQuotaLock unit tests
 */

const Organization = require('../../models/Organization');
const {
  GRACE_PERIOD_DAYS,
  isPaidPlan,
  shouldEnforceOverQuotaLock,
  normalizeBillingStatus,
  annotateUsersQuotaLockForList
} = require('../../utils/overQuotaLock');

jest.mock('../../models/Organization', () => ({
  find: jest.fn().mockResolvedValue([])
}));

describe('Phase 5.3 — overQuotaLock helpers', () => {
  test('TC-5.3-unit-01 isPaidPlan', () => {
    expect(isPaidPlan('PRO')).toBe(true);
    expect(isPaidPlan('ENTERPRISE')).toBe(true);
    expect(isPaidPlan('FREE')).toBe(false);
  });

  test('TC-5.3-unit-02 shouldEnforceOverQuotaLock', () => {
    expect(shouldEnforceOverQuotaLock({ plan: 'PRO', billing_status: 'ACTIVE' })).toBe(false);
    expect(shouldEnforceOverQuotaLock({ plan: 'FREE', billing_status: 'GRACE_PERIOD' })).toBe(false);
    expect(shouldEnforceOverQuotaLock({ plan: 'FREE', billing_status: 'ACTIVE' })).toBe(true);
    // EXPIRED/ARCHIVED: dùng ma trận quyền billing, không soft-lock quota
    expect(shouldEnforceOverQuotaLock({ plan: 'FREE', billing_status: 'EXPIRED' })).toBe(false);
    expect(shouldEnforceOverQuotaLock({ plan: 'PRO', billing_status: 'EXPIRED' })).toBe(false);
    expect(shouldEnforceOverQuotaLock({ plan: 'BUSINESS', billing_status: 'ARCHIVED' })).toBe(false);
  });

  test('TC-5.3-unit-03 normalizeBillingStatus', () => {
    expect(normalizeBillingStatus('grace_period')).toBe('GRACE_PERIOD');
    expect(normalizeBillingStatus('archived')).toBe('ARCHIVED');
    expect(normalizeBillingStatus('bad')).toBe('ACTIVE');
  });

  test('TC-5.3-unit-04 GRACE_PERIOD_DAYS = 15', () => {
    expect(GRACE_PERIOD_DAYS).toBe(15);
  });

  test('TC-5.3-unit-05 annotateUsersQuotaLockForList bỏ qua organization_id không hợp lệ', async () => {
    const users = [
      { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', organization_id: undefined, role: 'BUILDING_ADMIN' },
      { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', organization_id: 'undefined', role: 'BUILDING_ADMIN' }
    ];
    const result = await annotateUsersQuotaLockForList(users);
    expect(result).toHaveLength(2);
    expect(result.every((u) => u.quota_locked === false)).toBe(true);
    expect(Organization.find).not.toHaveBeenCalled();
  });
});
