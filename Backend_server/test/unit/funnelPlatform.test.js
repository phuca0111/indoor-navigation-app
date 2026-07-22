jest.mock('../../repositories/funnelRepository', () => ({
  STAGES: [
    'TrialStarted',
    'CheckoutStarted',
    'PaymentCaptured',
    'SubscriptionActivated',
    'FirstMapPublished',
    'FirstNavigationCompleted'
  ],
  upsertStage: jest.fn(),
  aggregateFunnel: jest.fn()
}));

const funnelRepository = require('../../repositories/funnelRepository');
const { recordStage, recordDomainEvent, getFunnel } = require('../../services/funnelService');

describe('analytics funnel platform', () => {
  beforeEach(() => jest.clearAllMocks());

  test('dedupe theo event_id và giữ tenant/subject', async () => {
    funnelRepository.upsertStage.mockResolvedValue({ event_id: 'e1' });
    await recordStage({
      event_id: 'e1',
      stage: 'CheckoutStarted',
      subject_type: 'Organization',
      subject_id: 'subject-1',
      organization_id: 'tenant-1'
    });
    expect(funnelRepository.upsertStage).toHaveBeenCalledWith(
      { event_id: 'e1' },
      expect.objectContaining({
        organization_id: 'tenant-1',
        subject_id: 'subject-1'
      })
    );
  });

  test('domain event canonical hóa PaymentSucceeded', async () => {
    funnelRepository.upsertStage.mockResolvedValue({ event_id: 'pay-1' });
    await recordDomainEvent({
      event_id: 'pay-1',
      type: 'PaymentSucceeded',
      aggregate_type: 'Invoice',
      aggregate_id: 'invoice-1',
      organization_id: 'tenant-1',
      payload: {}
    });
    expect(funnelRepository.upsertStage.mock.calls[0][1].stage)
      .toBe('PaymentCaptured');
  });

  test('funnel query luôn áp tenant/date filter', async () => {
    funnelRepository.aggregateFunnel.mockResolvedValue([
      { _id: 'TrialStarted', subjects: ['a', 'b'] },
      { _id: 'CheckoutStarted', subjects: ['a'] }
    ]);
    const result = await getFunnel({
      organization_id: 'tenant-1',
      from: '2026-07-01',
      to: '2026-07-31'
    });
    const match = funnelRepository.aggregateFunnel.mock.calls[0][0][0].$match;
    expect(match.organization_id).toBe('tenant-1');
    expect(match.occurred_at).toEqual({
      $gte: new Date('2026-07-01'),
      $lte: new Date('2026-07-31')
    });
    expect(result.stages[1]).toMatchObject({
      stage: 'CheckoutStarted',
      count: 1,
      conversion_from_previous: 50
    });
  });

  test('funnel từ chối scope không tường minh', async () => {
    await expect(getFunnel({})).rejects.toMatchObject({
      code: 'FUNNEL_SCOPE_REQUIRED'
    });
  });

  test('funnel từ chối organization_id=null khi system=false', async () => {
    await expect(getFunnel({ organization_id: null, system: false })).rejects.toMatchObject({
      code: 'FUNNEL_SCOPE_REQUIRED'
    });
  });

  test('funnel system=true không bắt buộc organization_id', async () => {
    funnelRepository.aggregateFunnel.mockResolvedValue([]);
    const result = await getFunnel({ system: true });
    expect(funnelRepository.aggregateFunnel.mock.calls[0][0][0].$match.organization_id)
      .toBeUndefined();
    expect(result.stages).toHaveLength(6);
  });
});
