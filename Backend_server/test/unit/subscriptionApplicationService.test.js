jest.mock('../../shared/persistence/mongoUnitOfWork', () => ({
  withMongoUnitOfWork: jest.fn()
}));

jest.mock('../../services/subscriptionLifecycle', () => ({
  activateOrRenewSubscription: jest.fn(),
  applyBillingEventToSubscription: jest.fn(),
  markSubscriptionPastDue: jest.fn(),
  expireCurrentSubscription: jest.fn(),
  cancelCurrentSubscription: jest.fn(),
  createOpenInvoice: jest.fn(),
  markInvoicePaid: jest.fn(),
  getCurrentSubscription: jest.fn(),
  syncOrganizationFromSubscription: jest.fn(),
  refreshSubscriptionStatus: jest.fn()
}));

const {
  withMongoUnitOfWork
} = require('../../shared/persistence/mongoUnitOfWork');
const lifecycle = require('../../services/subscriptionLifecycle');
const application = require('../../application/billing/subscriptionApplicationService');

describe('Subscription Application Service', () => {
  const previousFlag = process.env.BILLING_TRANSACTIONS_ENABLED;

  afterEach(() => {
    jest.clearAllMocks();
    if (previousFlag === undefined) {
      delete process.env.BILLING_TRANSACTIONS_ENABLED;
    } else {
      process.env.BILLING_TRANSACTIONS_ENABLED = previousFlag;
    }
  });

  test('chạy trực tiếp khi transaction billing chưa bật', async () => {
    process.env.BILLING_TRANSACTIONS_ENABLED = 'false';
    lifecycle.activateOrRenewSubscription.mockResolvedValue({ ok: true });

    const result = await application.activateOrRenewSubscription({ plan: 'PRO' });

    expect(result).toEqual({ ok: true });
    expect(withMongoUnitOfWork).not.toHaveBeenCalled();
    expect(lifecycle.activateOrRenewSubscription).toHaveBeenCalledWith({
      plan: 'PRO',
      session: null
    });
  });

  test('Application Service sở hữu Unit of Work khi feature flag bật', async () => {
    process.env.BILLING_TRANSACTIONS_ENABLED = 'true';
    const session = { id: 'billing-session' };
    withMongoUnitOfWork.mockImplementation(async (work) => work(session));
    lifecycle.activateOrRenewSubscription.mockResolvedValue({ ok: true });

    await application.activateOrRenewSubscription({ plan: 'ENTERPRISE' });

    expect(withMongoUnitOfWork).toHaveBeenCalledTimes(1);
    expect(lifecycle.activateOrRenewSubscription).toHaveBeenCalledWith({
      plan: 'ENTERPRISE',
      session
    });
  });

  test('session từ caller được truyền xuyên suốt mà không mở Unit of Work mới', async () => {
    process.env.BILLING_TRANSACTIONS_ENABLED = 'true';
    const session = { id: 'external-session' };

    await application.cancelCurrentSubscription(
      { _id: 'org-1' },
      { immediate: true },
      { session }
    );

    expect(withMongoUnitOfWork).not.toHaveBeenCalled();
    expect(lifecycle.cancelCurrentSubscription).toHaveBeenCalledWith(
      { _id: 'org-1' },
      { immediate: true, session }
    );
  });
});
