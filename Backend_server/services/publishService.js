// ============================================
// FILE: publishService.js
// Phase 2c — Publish sync + async job (in-process worker)
// ============================================

const Floor = require('../models/Floor');
const Building = require('../models/Building');
const MapVersion = require('../models/MapVersion');
const QrCode = require('../models/QrCode');
const ActivityLog = require('../models/ActivityLog');
const PublishJob = require('../models/PublishJob');
const Draft = require('../models/Draft');
const { buildMapSnapshot } = require('../utils/mapSnapshot');
const { applyRetentionForFloor } = require('../utils/mapVersionRetention');
const { validateMapData } = require('./publishMapValidate');

function logActivity(data) {
  return ActivityLog.create(data).catch(() => {});
}

async function syncQrCodes(floorDoc) {
  const anchors = floorDoc.map_data?.qr_anchors || [];
  for (const anchor of anchors) {
    const qrId = anchor.qr_id || anchor.serial || anchor.qr_code;
    if (!qrId) continue;

    const x = Math.round(anchor.x || 0);
    const y = Math.round(anchor.y || 0);
    const qrCode =
      anchor.qr_code || `MAP_NAV|${floorDoc.building_id}|${floorDoc.floor_number}|${x}|${y}|${qrId}`;

    await QrCode.updateOne(
      { qr_code: qrCode },
      {
        $set: {
          building_id: floorDoc.building_id,
          floor_number: floorDoc.floor_number,
          x,
          y,
          node_id: anchor.node_id || '',
          label: anchor.label || anchor.room_name || ''
        }
      },
      { upsert: true }
    );
  }
}

/**
 * Resolve map_data từ body, Floor.draft_map_data, hoặc Draft collection (2a).
 */
async function resolvePublishMapData(buildingId, floorNum, body = {}) {
  if (body.use_draft === true) {
    const draftDoc = await Draft.findOne({
      building_id: buildingId,
      floor_number: floorNum
    }).lean();
    if (draftDoc?.payload != null) {
      return { ok: true, map_data: draftDoc.payload, source: 'drafts' };
    }

    const floor = await Floor.findOne({
      building_id: buildingId,
      floor_number: floorNum
    }).select('draft_map_data').lean();
    if (floor?.draft_map_data != null) {
      return { ok: true, map_data: floor.draft_map_data, source: 'floor_draft' };
    }

    return {
      ok: false,
      code: 'DRAFT_EMPTY',
      message: 'Không có bản nháp để xuất bản.'
    };
  }

  if (body.map_data !== undefined && body.map_data !== null) {
    return { ok: true, map_data: body.map_data, source: 'body' };
  }

  return {
    ok: false,
    code: 'MAP_REQUIRED',
    message: 'Thiếu map_data (hoặc use_draft=true).'
  };
}

/**
 * Ghi Floor + MapVersion + QR + audit. Caller đã validate + check quyền/lock.
 * @returns {{ floor, version, created: boolean }}
 */
async function applyPublish({
  buildingId,
  floorNum,
  map_data,
  userId,
  ip = ''
}) {
  let existingMap = await Floor.findOne({
    building_id: buildingId,
    floor_number: floorNum
  });

  let created = false;
  let floorDoc;

  if (existingMap) {
    existingMap.map_data = map_data;
    existingMap.version = (existingMap.version || 0) + 1;
    existingMap.published_at = new Date();
    existingMap.last_modified_by = userId;
    await existingMap.save();
    floorDoc = existingMap;
  } else {
    floorDoc = await Floor.create({
      building_id: buildingId,
      floor_number: floorNum,
      floor_name: 'Tầng ' + floorNum,
      version: 1,
      map_data,
      published_at: new Date(),
      last_modified_by: userId
    });
    created = true;
  }

  await Building.findByIdAndUpdate(buildingId, { status: 'PUBLISHED' });

  await MapVersion.create({
    building_id: buildingId,
    floor_number: floorNum,
    version: floorDoc.version,
    rooms_count: map_data.rooms?.length || 0,
    nodes_count: map_data.nodes?.length || 0,
    edges_count: map_data.edges?.length || 0,
    graph_snapshot: { nodes: map_data.nodes, edges: map_data.edges },
    map_snapshot: buildMapSnapshot(map_data),
    published_by: userId,
    published_at: new Date()
  });

  await applyRetentionForFloor(buildingId, floorNum, {
    userId,
    ip
  });

  syncQrCodes(floorDoc).catch(() => {});

  logActivity({
    user_id: userId,
    action: 'PUBLISH_MAP',
    target_type: 'floor',
    target_id: String(floorDoc._id),
    target: `Building ${buildingId} - Tầng ${floorNum}`,
    details: created
      ? 'Phiên bản 1 (tạo mới)'
      : `Phiên bản ${floorDoc.version}`,
    ip_address: ip
  });

  return { floor: floorDoc, version: floorDoc.version, created };
}

async function enqueuePublishJob({
  buildingId,
  floorNum,
  map_data,
  userId,
  editSessionId = ''
}) {
  const job = await PublishJob.create({
    building_id: buildingId,
    floor_number: floorNum,
    status: 'QUEUED',
    requested_by: userId,
    edit_session_id: editSessionId || '',
    map_data
  });

  // In-process worker (Bull/Redis queue = phase sau). setImmediate không chặn response 202.
  setImmediate(() => {
    processPublishJob(String(job._id)).catch((e) => {
      console.warn('[publishService] job failed:', job._id, e.message);
    });
  });

  return job;
}

async function processPublishJob(jobId) {
  const claimed = await PublishJob.findOneAndUpdate(
    { _id: jobId, status: 'QUEUED' },
    { $set: { status: 'RUNNING', started_at: new Date() } },
    { new: true }
  );

  if (!claimed) {
    return PublishJob.findById(jobId);
  }

  const job = claimed;

  const validation = validateMapData(job.map_data);
  if (!validation.ok) {
    job.status = 'FAILED';
    job.finished_at = new Date();
    job.error = {
      code: 'VALIDATE_FAILED',
      message: 'Validate map thất bại.',
      details: validation.errors
    };
    await job.save();
    return job;
  }

  try {
    const result = await applyPublish({
      buildingId: job.building_id,
      floorNum: job.floor_number,
      map_data: job.map_data,
      userId: job.requested_by,
      ip: ''
    });
    job.status = 'SUCCESS';
    job.version = result.version;
    job.floor_id = result.floor._id;
    job.finished_at = new Date();
    job.error = { code: null, message: null, details: [] };
    await job.save();
    return job;
  } catch (e) {
    job.status = 'FAILED';
    job.finished_at = new Date();
    job.error = {
      code: 'PUBLISH_ERROR',
      message: e.message || 'Lỗi publish.',
      details: []
    };
    await job.save();
    return job;
  }
}

async function getPublishJob(jobId) {
  return PublishJob.findById(jobId).lean();
}

module.exports = {
  validateMapData,
  resolvePublishMapData,
  applyPublish,
  syncQrCodes,
  enqueuePublishJob,
  processPublishJob,
  getPublishJob
};
