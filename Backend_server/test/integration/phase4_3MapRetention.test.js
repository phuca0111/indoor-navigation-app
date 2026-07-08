/**
 * Phase 4.3 — Unit + integration retention map versions
 * Chạy: npm run test:phase4-3
 */

const mongoose = require('mongoose');
const MapVersion = require('../../models/MapVersion');
const Building = require('../../models/Building');
const {
  getRetentionMax,
  applyMapVersionRetention,
  DEFAULT_MAX
} = require('../../utils/mapVersionRetention');

describe('Phase 4.3 — map version retention', () => {
  let testBuildingId;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const building = await Building.findOne({ is_active: { $ne: false } }).select('_id organization_id').lean();
    if (!building) throw new Error('Thiếu building test');
    testBuildingId = building._id;
  });

  afterAll(async () => {
    if (testBuildingId) {
      await MapVersion.deleteMany({
        building_id: testBuildingId,
        floor_number: 99
      });
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-4.3-unit-01 getRetentionMax mặc định 50', () => {
    const prev = process.env.MAP_VERSION_RETENTION_MAX;
    delete process.env.MAP_VERSION_RETENTION_MAX;
    expect(getRetentionMax()).toBe(DEFAULT_MAX);
    if (prev != null) process.env.MAP_VERSION_RETENTION_MAX = prev;
  });

  test('TC-4.3-unit-02 getRetentionMax tôn trọng env', () => {
    const prev = process.env.MAP_VERSION_RETENTION_MAX;
    process.env.MAP_VERSION_RETENTION_MAX = '10';
    expect(getRetentionMax()).toBe(10);
    if (prev != null) process.env.MAP_VERSION_RETENTION_MAX = prev;
    else delete process.env.MAP_VERSION_RETENTION_MAX;
  });

  test('TC-4.3-int-01 giữ max 3 bản, xóa bản cũ nhất', async () => {
    const floor = 99;
    await MapVersion.deleteMany({ building_id: testBuildingId, floor_number: floor });

    const docs = [];
    for (let v = 1; v <= 5; v++) {
      docs.push({
        building_id: testBuildingId,
        floor_number: floor,
        version: v,
        rooms_count: 1,
        nodes_count: 0,
        edges_count: 0,
        published_at: new Date(Date.now() + v * 1000)
      });
    }
    await MapVersion.insertMany(docs);

    const result = await applyMapVersionRetention(testBuildingId, floor, { maxKeep: 3 });
    expect(result.deleted).toBe(2);
    expect(result.kept).toBe(3);
    expect(result.deleted_versions.sort((a, b) => a - b)).toEqual([1, 2]);

    const remaining = await MapVersion.find({
      building_id: testBuildingId,
      floor_number: floor
    })
      .sort({ version: 1 })
      .lean();
    expect(remaining.map((r) => r.version)).toEqual([3, 4, 5]);

    await MapVersion.deleteMany({ building_id: testBuildingId, floor_number: floor });
  });

  test('TC-4.3-int-02 không xóa khi chưa vượt ngưỡng', async () => {
    const floor = 99;
    await MapVersion.deleteMany({ building_id: testBuildingId, floor_number: floor });
    await MapVersion.create({
      building_id: testBuildingId,
      floor_number: floor,
      version: 1,
      rooms_count: 0,
      nodes_count: 0,
      edges_count: 0
    });

    const result = await applyMapVersionRetention(testBuildingId, floor, { maxKeep: 5 });
    expect(result.deleted).toBe(0);
    expect(result.kept).toBe(1);

    await MapVersion.deleteMany({ building_id: testBuildingId, floor_number: floor });
  });
});
