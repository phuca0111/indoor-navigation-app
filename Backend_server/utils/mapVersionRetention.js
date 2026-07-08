/**
 * Phase 4.3 — Retention phiên bản map (giữ tối đa N bản / tầng)
 */

const MapVersion = require('../models/MapVersion');

const DEFAULT_MAX = 50;
const MIN_KEEP = 5;
const ABSOLUTE_MAX = 500;

function getRetentionMax() {
  const raw = process.env.MAP_VERSION_RETENTION_MAX;
  const n = parseInt(raw != null && raw !== '' ? raw : String(DEFAULT_MAX), 10);
  if (!Number.isFinite(n)) return DEFAULT_MAX;
  return Math.max(MIN_KEEP, Math.min(n, ABSOLUTE_MAX));
}

function floorNumberQuery(floorNumber) {
  const n = parseInt(floorNumber, 10);
  return { $in: [n, String(n)] };
}

/**
 * Xóa các MapVersion cũ nhất khi vượt maxKeep (theo số version giảm dần).
 * @returns {{ deleted: number, kept: number, maxKeep: number, deleted_versions: number[] }}
 */
async function applyMapVersionRetention(buildingId, floorNumber, options = {}) {
  const maxKeep = options.maxKeep ?? getRetentionMax();
  const versions = await MapVersion.find({
    building_id: buildingId,
    floor_number: floorNumberQuery(floorNumber)
  })
    .sort({ version: -1 })
    .select('_id version')
    .lean();

  if (versions.length <= maxKeep) {
    return { deleted: 0, kept: versions.length, maxKeep, deleted_versions: [] };
  }

  const toDelete = versions.slice(maxKeep);
  const ids = toDelete.map((v) => v._id);
  const result = await MapVersion.deleteMany({ _id: { $in: ids } });

  return {
    deleted: result.deletedCount || 0,
    kept: maxKeep,
    maxKeep,
    deleted_versions: toDelete.map((v) => v.version)
  };
}

async function logMapVersionRetention(retention, ctx) {
  if (!retention.deleted || !ctx?.userId) return;
  const Building = require('../models/Building');
  const ActivityLog = require('../models/ActivityLog');
  const building = await Building.findById(ctx.buildingId).select('organization_id').lean();
  await ActivityLog.create({
    user_id: ctx.userId,
    action: 'MAP_VERSION_RETENTION',
    target_type: 'floor',
    target_id: String(ctx.buildingId),
    target: `Building ${ctx.buildingId} - Tầng ${ctx.floorNumber}`,
    details: {
      message: `Dọn ${retention.deleted} phiên bản cũ (giữ tối đa ${retention.maxKeep}/tầng)`,
      deleted_versions: retention.deleted_versions,
      max_keep: retention.maxKeep
    },
    ip_address: ctx.ip || '',
    organization_id: building?.organization_id || null
  }).catch(() => {});
}

async function applyRetentionForFloor(buildingId, floorNumber, logCtx) {
  const retention = await applyMapVersionRetention(buildingId, floorNumber);
  if (logCtx) await logMapVersionRetention(retention, { ...logCtx, buildingId, floorNumber });
  return retention;
}

module.exports = {
  getRetentionMax,
  applyMapVersionRetention,
  applyRetentionForFloor,
  DEFAULT_MAX,
  MIN_KEEP
};
