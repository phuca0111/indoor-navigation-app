const mongoose = require('mongoose');
const DomainEvent = require('../../models/DomainEvent');
const EventDelivery = require('../../models/EventDelivery');
const eventBus = require('../../shared/events/eventBus');
const { resolveTestMongoUri } = require('../support/testDatabase');

describe('D1 — Mongo outbox domain event bus', () => {
  const prefix = `d1-${Date.now()}`;

  beforeAll(async () => {
    require('dotenv').config();
    const uri = resolveTestMongoUri();
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
  });

  afterEach(() => eventBus.resetSubscribersForTests());

  afterAll(async () => {
    const events = await DomainEvent.find({ event_key: new RegExp(`^${prefix}`) })
      .select('event_id')
      .lean();
    await EventDelivery.deleteMany({
      event_id: { $in: events.map((event) => event.event_id) }
    });
    await DomainEvent.deleteMany({ event_key: new RegExp(`^${prefix}`) });
  });

  test('TC-D1-01 publish idempotent theo event_key', async () => {
    const input = {
      type: 'TestCreated',
      event_key: `${prefix}:idempotent`,
      aggregate_type: 'Test',
      aggregate_id: 'one',
      payload: { value: 1 }
    };
    const first = await eventBus.publish(input);
    const second = await eventBus.publish(input);

    expect(first.duplicated).toBe(false);
    expect(second.duplicated).toBe(true);
    expect(second.event.event_id).toBe(first.event.event_id);
    expect(await DomainEvent.countDocuments({ event_key: input.event_key })).toBe(1);
  });

  test('TC-D1-02 delivery retry không chạy lại handler đã thành công', async () => {
    let successfulCalls = 0;
    let flakyCalls = 0;
    eventBus.subscribe('TestRetry', 'successful-handler', async () => {
      successfulCalls += 1;
    });
    eventBus.subscribe('TestRetry', 'flaky-handler', async () => {
      flakyCalls += 1;
      if (flakyCalls === 1) throw new Error('temporary failure');
    });

    const { event } = await eventBus.publish({
      type: 'TestRetry',
      event_key: `${prefix}:retry`,
      aggregate_type: 'Test',
      aggregate_id: 'retry'
    });
    await eventBus.processEvent(await DomainEvent.findById(event._id));

    let failed = await DomainEvent.findById(event._id);
    expect(failed.status).toBe('RETRY');
    expect(successfulCalls).toBe(1);
    expect(flakyCalls).toBe(1);

    failed.available_at = new Date(0);
    await failed.save();
    await eventBus.processEvent(await DomainEvent.findById(event._id));

    const completed = await DomainEvent.findById(event._id);
    expect(completed.status).toBe('COMPLETED');
    expect(successfulCalls).toBe(1);
    expect(flakyCalls).toBe(2);
    expect(
      await EventDelivery.countDocuments({
        event_id: event.event_id,
        status: 'DELIVERED'
      })
    ).toBe(2);
  });
});
