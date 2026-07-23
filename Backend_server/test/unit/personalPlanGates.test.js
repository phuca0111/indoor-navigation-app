/**
 * Unit — Demo / personal plan gates
 */
const {
  resolvePersonalPlanCode,
  displayPlanFor,
  capabilitiesFor,
  assertCanRequestOfficial,
  assertCanUseWorkspaceKind,
  limitsFor
} = require('../../services/personalPlanGates');

describe('personalPlanGates', () => {
  test('FREE → Demo display + no Official/Team', () => {
    const u = { plan: 'FREE' };
    expect(resolvePersonalPlanCode(u)).toBe('FREE');
    expect(displayPlanFor('FREE')).toEqual({ code: 'DEMO', label: 'Demo' });
    const caps = capabilitiesFor(u);
    expect(caps.canSubmitCommunity).toBe(true);
    expect(caps.canRequestOfficial).toBe(false);
    expect(caps.canCreateOrg).toBe(false);
    expect(assertCanRequestOfficial(u).code).toBe('PLAN_OFFICIAL_DENIED');
    expect(assertCanUseWorkspaceKind(u, 'OFFICIAL').ok).toBe(false);
    expect(assertCanUseWorkspaceKind(u, 'COMMUNITY').ok).toBe(true);
    const lim = limitsFor(u);
    expect(lim.maxWorkspaces).toBe(1);
    expect(lim.maxFloorsPerBuilding).toBe(2);
    expect(lim.maxQr).toBe(20);
  });

  test('active PRO → can Official + Org', () => {
    const u = { plan: 'PRO', plan_expires_at: new Date(Date.now() + 86400000) };
    const caps = capabilitiesFor(u);
    expect(caps.canRequestOfficial).toBe(true);
    expect(caps.canCreateOrg).toBe(true);
    expect(assertCanRequestOfficial(u).ok).toBe(true);
  });
});
