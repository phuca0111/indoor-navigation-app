const mongoose = require('mongoose');
const Building = require('../../models/Building');
const PublishJob = require('../../models/PublishJob');
const ActivityLog = require('../../models/ActivityLog');
const DomainEvent = require('../../models/DomainEvent');
const outbox = require('../../repositories/outboxRepository');
const {
  requestPublish
} = require('../../application/mapLifecycle/publishApplicationService');

describe('Phase 4 map lifecycle transaction/race', () => {
  let building;
  const actorId = new mongoose.Types.ObjectId();
  const mapData = { rooms: [{ id: 'r1', name: 'A' }], nodes: [], edges: [] };

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.TEST_MONGO_REPLICA_URI);
    }
    building = await Building.create({
      name: `phase4-transaction-${Date.now()}`,
      total_floors: 1,
      created_by: actorId
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (!building) return;
    await Promise.all([
      PublishJob.deleteMany({ building_id: building._id }),
      ActivityLog.deleteMany({ target: { $regex: String(building._id) } }),
      DomainEvent.deleteMany({ aggregate_type: 'PublishJob' })
    ]);
  });

  afterAll(async () => {
    if (building) await Building.deleteOne({ _id: building._id });
  });

  test('crash sau Audit trước Outbox rollback toàn bộ publish request', async () => {
    jest.spyOn(outbox, 'append').mockRejectedValueOnce(new Error('fault-after-audit'));
    await expect(requestPublish({
      actor: { userId: actorId, role: 'SUPER_ADMIN' },
      buildingId: building._id,
      floorNumber: 0,
      body: { map_data: mapData },
      idempotencyKey: 'fault-request'
    })).rejects.toThrow('fault-after-audit');

    await expect(PublishJob.countDocuments({ building_id: building._id })).resolves.toBe(0);
    await expect(ActivityLog.countDocuments({
      action: 'PUBLISH_MAP_REQUESTED',
      target: { $regex: String(building._id) }
    })).resolves.toBe(0);
  });

  test('retry cùng idempotency key chỉ tạo một job và một outbox', async () => {
    const input = {
      actor: { userId: actorId, role: 'SUPER_ADMIN' },
      buildingId: building._id,
      floorNumber: 0,
      body: { map_data: mapData },
      idempotencyKey: 'same-request'
    };
    const first = await requestPublish(input);
    const replay = await requestPublish(input);

    expect(String(replay._id)).toBe(String(first._id));
    expect(replay.was_idempotent_replay).toBe(true);
    await expect(PublishJob.countDocuments({ building_id: building._id })).resolves.toBe(1);
    await expect(DomainEvent.countDocuments({
      type: 'PublishRequested',
      aggregate_id: String(first._id)
    })).resolves.toBe(1);
  });
});
