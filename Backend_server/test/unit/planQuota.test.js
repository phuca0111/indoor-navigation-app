/**
 * Phase 5.1 — planQuota unit tests
 * Chạy: npm run test:phase5-1
 */

const {
  PLAN_LIMITS,
  normalizePlan,
  getPlanLimits
} = require('../../utils/planQuota');

describe('Phase 5.1 — planQuota helpers', () => {
  test('TC-5.1-unit-01 PLAN_LIMITS FREE/PRO/ENTERPRISE', () => {
    expect(PLAN_LIMITS.FREE.maxBuildings).toBe(2);
    expect(PLAN_LIMITS.FREE.maxUsers).toBe(5);
    expect(PLAN_LIMITS.PRO.maxBuildings).toBe(20);
    expect(PLAN_LIMITS.PRO.maxUsers).toBe(50);
    expect(PLAN_LIMITS.ENTERPRISE.maxBuildings).toBeNull();
    expect(PLAN_LIMITS.ENTERPRISE.maxUsers).toBeNull();
  });

  test('TC-5.1-unit-02 normalizePlan supports custom catalog codes', () => {
    expect(normalizePlan('PRO')).toBe('PRO');
    expect(normalizePlan('enterprise')).toBe('ENTERPRISE');
    expect(normalizePlan('xyz')).toBe('XYZ');
    expect(normalizePlan('invalid-code!')).toBe('FREE');
    expect(normalizePlan(null)).toBe('FREE');
  });

  test('TC-5.1-unit-03 getPlanLimits', () => {
    expect(getPlanLimits('FREE').maxBuildings).toBe(2);
    expect(getPlanLimits('ENTERPRISE').maxUsers).toBeNull();
  });
});
