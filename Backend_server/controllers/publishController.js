// ============================================
// FILE: publishController.js
// Phase 2c — Validate + Publish async (202) + job status
// ============================================

const Building = require('../models/Building');
const Organization = require('../models/Organization');
const { assertFloorInRange } = require('../services/floorLifecycle');
const { assertBuildingWritable } = require('../utils/overQuotaLock');
const { assertOrgCanPublish } = require('../services/publishPermit');
const { assertCanPublish } = require('../services/floorEditLock');
const { assertPersonalMapQrQuota } = require('../utils/planQuota');
const {
  validateMapData,
  resolvePublishMapData,
  enqueuePublishJob,
  getPublishJob
} = require('../services/publishService');

function parseFloor(params) {
  const floorNum = parseInt(params.floor, 10);
  if (!Number.isFinite(floorNum)) {
    return { error: { status: 400, message: 'Số tầng không hợp lệ.' } };
  }
  return { floorNum };
}

function resolveEditSessionId(req) {
  const header = req.headers['x-edit-session'];
  if (header && String(header).trim()) return String(header).trim();
  if (req.body?.edit_session_id) return String(req.body.edit_session_id).trim();
  if (req.body?.session_id) return String(req.body.session_id).trim();
  return '';
}

async function runPublishGuards(req, res, buildingId, floorNum) {
  const buildingMeta = await Building.findById(buildingId)
    .select('organization_id total_floors')
    .lean();
  if (!buildingMeta) {
    res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
    return null;
  }

  try {
    assertFloorInRange(floorNum, buildingMeta.total_floors);
  } catch (e) {
    res.status(e.status || 400).json({
      message: e.message,
      code: e.code || 'FLOOR_OUT_OF_RANGE',
      floor_number: e.floor_number,
      total_floors: e.total_floors
    });
    return null;
  }

  if (req.user?.role !== 'SUPER_ADMIN') {
    if (buildingMeta.organization_id) {
      const org = await Organization.findById(buildingMeta.organization_id);
      const writable = await assertBuildingWritable(buildingId, org);
      if (!writable.ok) {
        res.status(403).json({ message: writable.message, code: writable.code });
        return null;
      }
    }
  }

  if (buildingMeta.organization_id) {
    const orgForPermit = await Organization.findById(buildingMeta.organization_id);
    if (orgForPermit) {
      const permit = assertOrgCanPublish(orgForPermit);
      if (!permit.ok) {
        res.status(403).json({ message: permit.message, code: permit.code });
        return null;
      }
    }
  }

  const editSessionId = resolveEditSessionId(req);
  const lockCheck = await assertCanPublish(
    buildingId,
    floorNum,
    req.user?.userId,
    editSessionId || null
  );
  if (!lockCheck.ok) {
    res.status(409).json({
      message: lockCheck.message,
      code: lockCheck.code,
      holder: lockCheck.holder
    });
    return null;
  }

  return { buildingMeta, editSessionId };
}

// POST .../publish/validate
async function validatePublish(req, res) {
  try {
    const { buildingId } = req.params;
    const { floorNum, error } = parseFloor(req.params);
    if (error) return res.status(error.status).json({ message: error.message });

    const resolved = await resolvePublishMapData(buildingId, floorNum, req.body || {});
    if (!resolved.ok) {
      return res.status(400).json({
        ok: false,
        code: resolved.code,
        message: resolved.message,
        errors: [{ code: resolved.code, message: resolved.message }]
      });
    }

    const result = validateMapData(resolved.map_data);
    return res.status(result.ok ? 200 : 400).json({
      ok: result.ok,
      source: resolved.source,
      errors: result.errors
    });
  } catch (e) {
    return res.status(500).json({ message: 'Lỗi validate: ' + e.message });
  }
}

// POST .../publish → 202
async function enqueuePublish(req, res) {
  try {
    const { buildingId } = req.params;
    const { floorNum, error } = parseFloor(req.params);
    if (error) return res.status(error.status).json({ message: error.message });

    const guards = await runPublishGuards(req, res, buildingId, floorNum);
    if (!guards) return;

    const resolved = await resolvePublishMapData(buildingId, floorNum, req.body || {});
    if (!resolved.ok) {
      return res.status(400).json({
        message: resolved.message,
        code: resolved.code
      });
    }

    const validation = validateMapData(resolved.map_data);
    if (!validation.ok) {
      return res.status(400).json({
        message: 'Validate map thất bại.',
        code: 'VALIDATE_FAILED',
        errors: validation.errors
      });
    }

    // Personal Workspace: giới hạn Map/QR theo gói cá nhân
    const mapQrQuota = await assertPersonalMapQrQuota(buildingId, floorNum, resolved.map_data);
    if (!mapQrQuota.ok) {
      return res.status(403).json({
        message: mapQrQuota.message,
        code: mapQrQuota.code,
        usage: mapQrQuota.usage
      });
    }

    const job = await enqueuePublishJob({
      buildingId,
      floorNum,
      map_data: resolved.map_data,
      userId: req.user?.userId,
      editSessionId: guards.editSessionId
    });

    return res.status(202).json({
      message: 'Đã xếp hàng xuất bản.',
      job_id: String(job._id),
      status: job.status,
      building_id: buildingId,
      floor_number: floorNum
    });
  } catch (e) {
    return res.status(500).json({ message: 'Lỗi enqueue publish: ' + e.message });
  }
}

// GET /api/v1/publish-jobs/:jobId
async function getJobStatus(req, res) {
  try {
    const job = await getPublishJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ message: 'Không tìm thấy job.', code: 'JOB_NOT_FOUND' });
    }

    const isSuper = req.user?.role === 'SUPER_ADMIN';
    const isOwner = job.requested_by && String(job.requested_by) === String(req.user?.userId);
    if (!isSuper && !isOwner) {
      return res.status(403).json({ message: 'Không có quyền xem job này.' });
    }

    return res.status(200).json({
      job_id: String(job._id),
      status: job.status,
      building_id: job.building_id,
      floor_number: job.floor_number,
      version: job.version,
      floor_id: job.floor_id,
      error: job.error || null,
      started_at: job.started_at,
      finished_at: job.finished_at,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
  } catch (e) {
    return res.status(500).json({ message: 'Lỗi lấy job: ' + e.message });
  }
}

module.exports = {
  validatePublish,
  enqueuePublish,
  getJobStatus
};
