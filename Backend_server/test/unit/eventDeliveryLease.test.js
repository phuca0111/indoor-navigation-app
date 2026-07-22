jest.mock('../../models/DomainEvent', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));
jest.mock('../../models/EventDelivery', () => ({
  updateOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  updateMany: jest.fn()
}));

const DomainEvent = require('../../models/DomainEvent');
const EventDelivery = require('../../models/EventDelivery');
const eventBus = require('../../shared/events/eventBus');

describe('event delivery lease/replay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.resetSubscribersForTests();
  });

  test('worker claim atomic gắn lease owner/expires', async () => {
    const event = {
      type: 'NoSubscribers',
      status: 'PROCESSING',
      attempts: 1,
      save: jest.fn(async () => undefined)
    };
    DomainEvent.findOneAndUpdate.mockResolvedValueOnce(event);
    await eventBus.processPending(1, 'worker-a');
    expect(DomainEvent.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'PROCESSING',
          lease_owner: 'worker-a',
          lease_expires_at: expect.any(Date)
        })
      }),
      expect.any(Object)
    );
    expect(event.status).toBe('COMPLETED');
    expect(event.lease_owner).toBeNull();
  });

  test('event có handler bắt buộc không bị COMPLETED khi worker chưa đăng ký', async () => {
    const event = {
      type: 'PaymentSucceeded',
      status: 'PROCESSING',
      attempts: 1,
      save: jest.fn(async () => undefined)
    };
    DomainEvent.findOneAndUpdate.mockResolvedValueOnce(event);

    await eventBus.processPending(1, 'worker-without-handlers');

    expect(event.status).toBe('RETRY');
    expect(event.last_error).toMatch(/Thiếu handler bắt buộc/);
    expect(event.last_error_class).toBe('Error');
    expect(event.processed_at).toBeUndefined();
  });

  test('admin replay chỉ hồi sinh DEAD và reset delivery dead-letter', async () => {
    DomainEvent.findOneAndUpdate.mockResolvedValueOnce({
      event_id: 'dead-1',
      status: 'PENDING'
    });
    EventDelivery.updateMany.mockResolvedValueOnce({ modifiedCount: 2 });
    const replayed = await eventBus.replayDeadEvent('dead-1', {
      actor_id: '507f1f77bcf86cd799439011',
      reason: 'Đã sửa provider'
    });
    expect(replayed.event_id).toBe('dead-1');
    expect(DomainEvent.findOneAndUpdate.mock.calls[0][0])
      .toEqual({ event_id: 'dead-1', status: 'DEAD' });
    expect(EventDelivery.updateMany).toHaveBeenCalledWith(
      { event_id: 'dead-1', status: 'DEAD' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'RETRY' }),
        $inc: { replay_count: 1 }
      })
    );
  });
});
