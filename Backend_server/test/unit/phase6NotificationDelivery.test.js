const mockRepository = {
  findPreference: jest.fn(),
  findTemplate: jest.fn(),
  upsertDelivery: jest.fn(),
  claimDelivery: jest.fn(),
  completeDelivery: jest.fn()
};

jest.mock('../../repositories/notificationRepository', () => mockRepository);
jest.mock('../../services/mailService', () => ({ getTransporter: jest.fn() }));

const deliveryService =
  require('../../application/notification/notificationDeliveryApplicationService');

describe('Phase 6 notification delivery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.completeDelivery.mockImplementation(async (id, owner, update) => ({
      _id: id,
      owner,
      ...update.$set
    }));
  });

  test('enqueue idempotent dùng khóa ổn định theo notification/channel', async () => {
    mockRepository.findPreference.mockResolvedValue(null);
    mockRepository.upsertDelivery.mockImplementation(async (_, __, input) => input);
    const notification = {
      _id: 'notification-1',
      user_id: 'user-1',
      title: 'A',
      body: 'B',
      data: {}
    };
    const first = await deliveryService.enqueueForNotification(notification, {
      channels: ['IN_APP']
    });
    const second = await deliveryService.enqueueForNotification(notification, {
      channels: ['IN_APP']
    });
    expect(first[0].idempotency_key).toBe(second[0].idempotency_key);
    expect(first[0].idempotency_key).toMatch(/^[a-f0-9]{64}$/);
  });

  test('provider crash chuyển RETRY và giải phóng lease', async () => {
    deliveryService.setAdapterForTests('PUSH', async () => {
      throw new Error('provider timeout');
    }, { idempotency: true });
    const result = await deliveryService.processDelivery({
      _id: 'delivery-1',
      channel: 'PUSH',
      lease_owner: 'worker-1',
      attempts: 1,
      idempotency_key: 'key-1'
    }, 'worker-1');
    expect(result).toMatchObject({
      status: 'RETRY',
      lease_owner: null,
      lease_expires_at: null,
      last_error: 'provider timeout',
      delivery_semantics: 'EXACTLY_ONCE_PROVIDER'
    });
  });

  test('mất lease sau khi provider trả về không ghi SENT giả', async () => {
    deliveryService.setAdapterForTests(
      'PUSH',
      async () => ({ provider_message_id: 'p-1' }),
      { idempotency: true }
    );
    mockRepository.completeDelivery.mockResolvedValueOnce(null);
    await expect(deliveryService.processDelivery({
      _id: 'delivery-2',
      channel: 'PUSH',
      lease_owner: 'worker-old',
      attempts: 1,
      idempotency_key: 'key-2'
    }, 'worker-old')).rejects.toMatchObject({ code: 'NOTIFICATION_LEASE_LOST' });
  });
});
