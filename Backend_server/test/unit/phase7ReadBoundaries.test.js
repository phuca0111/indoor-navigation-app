const { QueryScope, SCOPES } = require('../../application/read/QueryScope');
const { READ_ROLE_MATRIX, assertRoleMayUse } = require('../../application/read/readRoleMatrix');
const {
  parseAnalyticsRange,
  READ_BASELINE,
  dateKey
} = require('../../application/read/readDateRange');
const {
  fingerprintPayload,
  isReadV2Enabled,
  runReadVersioned
} = require('../../application/read/readRollout');
const { toCsv } = require('../../services/financeReports');
const analytics = require('../../services/analyticsService');
const {
  getPlatformStatsForUser,
  buildPlatformStatsDto,
  resolvePlatformStatsScope
} = require('../../application/read/platformStatsQueryService');

describe('Phase 7 — QueryScope / baseline / parity contracts', () => {
  test('khóa timezone và custom date range VN', () => {
    expect(READ_BASELINE.timezone).toBe('Asia/Ho_Chi_Minh');
    const parsed = parseAnalyticsRange('custom', '2026-07-01', '2026-07-03');
    expect(parsed.days).toBe(3);
    expect(parsed.start.toISOString()).toBe(READ_BASELINE.analyticsCustomExample.startIso);
    expect(parsed.end.toISOString()).toBe(READ_BASELINE.analyticsCustomExample.endIso);
    expect(analytics.parseRange('custom', '2026-07-01', '2026-07-03').start.toISOString())
      .toBe(READ_BASELINE.analyticsCustomExample.startIso);
  });

  test('role matrix fail-closed', () => {
    expect(READ_ROLE_MATRIX.ORG_ADMIN.financeReports).toEqual([]);
    expect(() => assertRoleMayUse('ORG_ADMIN', 'financeReports', SCOPES.SYSTEM))
      .toThrow(/phạm vi/);
    expect(() => assertRoleMayUse('SUPER_ADMIN', 'analytics', SCOPES.SYSTEM))
      .not.toThrow();
  });

  test('QueryScope SYSTEM không suy diễn từ filter rỗng', () => {
    const system = QueryScope.system({ actorRole: 'FINANCE_ADMIN' });
    expect(system.isSystem).toBe(true);
    expect(system.organizationId).toBeNull();
    expect(() => QueryScope.organization(null)).toThrow();
  });

  test('ORGANIZATION assertBuildingAllowed yêu cầu allow-list', () => {
    const scope = QueryScope.organization('bbbbbbbbbbbbbbbbbbbbbbbb', {
      actorRole: 'ORG_ADMIN'
    });
    expect(() => scope.assertBuildingAllowed('cccccccccccccccccccccccc'))
      .toThrow(/FOREIGN_BUILDING_ID|Thiếu danh sách|ngoài phạm vi/);
    expect(() => scope.assertBuildingAllowed('aaaaaaaaaaaaaaaaaaaaaaaa', {
      allowedBuildingIds: ['aaaaaaaaaaaaaaaaaaaaaaaa']
    })).not.toThrow();
  });

  test('CSV headers giữ nguyên + BOM contract', () => {
    const csv = toCsv(['invoice_number', 'amount'], [
      { invoice_number: 'INV-1', amount: 1000 }
    ]);
    expect(csv.startsWith('invoice_number,amount')).toBe(true);
    expect(csv.includes('\r\n')).toBe(true);
    expect(READ_BASELINE.csv.bom).toBe('\uFEFF');
    const withBom = READ_BASELINE.csv.bom + csv;
    expect(withBom.charCodeAt(0)).toBe(0xfeff);
    expect(withBom.slice(1).startsWith('invoice_number,amount')).toBe(true);
  });

  test('query budget baseline đã khóa', () => {
    expect(READ_BASELINE.queryBudgets.platformStats.maxQueries).toBeLessThanOrEqual(20);
    expect(READ_BASELINE.queryBudgets.dashboardBundle.p95Ms).toBeLessThanOrEqual(6000);
    expect(READ_BASELINE.queryBudgets.analyticsOverview.maxPayloadBytes).toBeLessThanOrEqual(250_000);
    expect(READ_BASELINE.queryBudgets.financeSummary.maxQueries).toBeLessThanOrEqual(12);
  });

  test('FINANCE_ADMIN resolveOrgScope không giả SUPER_ADMIN', async () => {
    const scope = await analytics.resolveOrgScope({
      user: { role: 'FINANCE_ADMIN', organization_id: null },
      query: {}
    });
    expect(scope.role).toBe('FINANCE_ADMIN');
    expect(scope.scopeType).toBe('SYSTEM');
    expect(scope.system).toBe(true);
  });

  test('FINANCE_ADMIN có organization_id vẫn SYSTEM khi không filter query', async () => {
    const scope = await analytics.resolveOrgScope({
      user: {
        role: 'FINANCE_ADMIN',
        organization_id: 'aaaaaaaaaaaaaaaaaaaaaaaa'
      },
      query: {}
    });
    expect(scope.scopeType).toBe('SYSTEM');
    expect(scope.system).toBe(true);
    expect(scope.orgId).toBeNull();
  });

  test('foreign building_id bị từ chối ngoài org', async () => {
    const buildingRepo = require('../../repositories/analyticsReadRepository');
    const spy = jest.spyOn(buildingRepo, 'findBuildingIds')
      .mockResolvedValue(['aaaaaaaaaaaaaaaaaaaaaaaa']);
    await expect(analytics.buildOverview({
      role: 'ORG_ADMIN',
      orgId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      range: '7d',
      buildingId: 'cccccccccccccccccccccccc'
    })).rejects.toMatchObject({ code: 'FOREIGN_BUILDING_ID', status: 403 });
    spy.mockRestore();
  });

  test('shadow fingerprint ổn định và rollout không đổi primary', async () => {
    process.env.READ_MODEL_V2 = 'false';
    process.env.READ_SHADOW_COMPARE = 'false';
    const left = fingerprintPayload({ a: 1, b: [2, 3] });
    const right = fingerprintPayload({ b: [2, 3], a: 1 });
    expect(left).toBe(right);
    expect(isReadV2Enabled('analyticsOverview')).toBe(false);
    const value = await runReadVersioned({
      surface: 'analyticsOverview',
      legacyFn: async () => ({ ok: true }),
      v2Fn: async () => ({ ok: false })
    });
    expect(value).toEqual({ ok: true });
  });

  test('READ_MODEL_V2 bật thì primary dùng V2', async () => {
    process.env.READ_MODEL_V2 = 'true';
    process.env.READ_SHADOW_COMPARE = 'false';
    const value = await runReadVersioned({
      surface: 'platformStats',
      legacyFn: async () => ({ path: 'legacy' }),
      v2Fn: async () => ({ path: 'v2' })
    });
    expect(value).toEqual({ path: 'v2' });
    delete process.env.READ_MODEL_V2;
  });

  test('parity fingerprint legacy/V2 cùng DTO builder', async () => {
    const payload = { scope: 'organization', buildings: { total_active: 1 } };
    expect(fingerprintPayload(payload)).toBe(fingerprintPayload({
      buildings: { total_active: 1 },
      scope: 'organization'
    }));
    expect(typeof buildPlatformStatsDto).toBe('function');
    expect(typeof getPlatformStatsForUser).toBe('function');
    expect(typeof resolvePlatformStatsScope).toBe('function');
  });

  test('dateKey dùng REPORT_TZ', () => {
    expect(dateKey('2026-07-01T17:00:00.000Z')).toBe('2026-07-02');
  });
});
