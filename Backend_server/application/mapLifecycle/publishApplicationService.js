const lifecycle = require('../../repositories/mapLifecycleRepository');
const drafts = require('../../repositories/draftRepository');
const versions = require('../../repositories/mapVersionRepository');
const jobs = require('../../repositories/publishJobRepository');
const audits = require('../../repositories/activityLogRepository');
const outbox = require('../../repositories/outboxRepository');
const qrCodes = require('../../repositories/qrRepository');
const { runMapLifecycleCommand } = require('./runMapLifecycleCommand');
const { validateMapData } = require('../../services/publishMapValidate');
const { normalizeMapData } = require('../../services/mapContract');
const { buildMapSnapshot, summarizeMapForAudit } = require('../../utils/mapSnapshot');
const { assertFloorInRange } = require('../../services/floorLifecycle');
const { assertOrgCapability } = require('../../utils/orgBillingGates');
const { assertOrgCanPublish } = require('../../services/publishPermit');
const { strictLifecycleFlag } = require('../../utils/mapLifecycleFlags');
const { assertCanPublish, assertLockOwner, getStatus } = require('../../services/floorEditLock');
const { getPersonalPlanLimits } = require('../../utils/planQuota');
const EVENT_TYPES = require('../../shared/events/eventTypes');
const {
  normalizeIdempotencyKey,
  assertFence
} = require('../../domain/mapLifecyclePolicies');

function error(status, message, code, extra = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

async function resolveMapData(buildingId, floorNumber, body = {}) {
  if (body.use_draft === true) {
    const draft = await drafts.findActive(buildingId, floorNumber);
    if (draft?.payload != null) return { ok: true, map_data: draft.payload, source: 'drafts' };
    const legacy = await drafts.findLegacyFloorDraft(buildingId, floorNumber);
    if (legacy?.draft_map_data != null) {
      return { ok: true, map_data: legacy.draft_map_data, source: 'floor_draft' };
    }
    return { ok: false, code: 'DRAFT_EMPTY', message: 'Không có bản nháp để xuất bản.' };
  }
  if (body.map_data != null) return { ok: true, map_data: body.map_data, source: 'body' };
  return { ok: false, code: 'MAP_REQUIRED', message: 'Thiếu map_data (hoặc use_draft=true).' };
}

async function assertPublishAllowed(input) {
  const building = await lifecycle.findBuilding(input.buildingId);
  if (!building || building.is_active === false) throw error(404, 'Không tìm thấy tòa nhà!');
  assertFloorInRange(input.floorNumber, building.total_floors);
  if (building.organization_id) {
    const organization = await lifecycle.findOrganization(building.organization_id);
    const gate = assertOrgCapability(organization, 'canPublish');
    if (!gate.ok) throw error(403, gate.message, gate.code);
    const permit = assertOrgCanPublish(organization);
    if (!permit.ok) throw error(403, permit.message, permit.code);
  }
  const lock = await (strictLifecycleFlag('PUBLISH_REQUIRE_LOCK') ? assertLockOwner : assertCanPublish)(
    input.buildingId,
    input.floorNumber,
    input.actor?.userId,
    input.editSessionId || null
  );
  if (!lock.ok) throw error(409, lock.message, lock.code, { holder: lock.holder });
  return { building, lock: lock.lock || null };
}

async function assertPersonalQuota(building, floorNumber, mapData) {
  if (!building.owner_user_id || building.organization_id) return;
  const owner = await lifecycle.findActor(building.owner_user_id);
  const limits = getPersonalPlanLimits(owner?.plan);
  const usage = await lifecycle.personalQuotaSnapshot(building, floorNumber);
  if (!usage.floorExists && limits.maxMaps != null && usage.publishedMaps >= limits.maxMaps) {
    throw error(403, `Gói ${owner?.plan || 'FREE'} chỉ cho phép tối đa ${limits.maxMaps} bản đồ.`, 'QUOTA_MAPS');
  }
  const adding = (mapData.qr_anchors || []).filter(
    (anchor) => anchor && (anchor.qr_id || anchor.serial || anchor.qr_code)
  ).length;
  if (limits.maxQr != null && usage.qrCount + adding > limits.maxQr) {
    throw error(403, `Gói ${owner?.plan || 'FREE'} chỉ cho phép tối đa ${limits.maxQr} mã QR.`, 'QUOTA_QR');
  }
}

async function validatePublish(input) {
  const resolved = await resolveMapData(input.buildingId, input.floorNumber, input.body);
  if (!resolved.ok) return { ...resolved, errors: [{ code: resolved.code, message: resolved.message }] };
  const validation = validateMapData(resolved.map_data);
  return { ...validation, source: resolved.source };
}

async function requestPublish(input) {
  const { building, lock } = await assertPublishAllowed(input);
  const resolved = await resolveMapData(input.buildingId, input.floorNumber, input.body);
  if (!resolved.ok) throw error(400, resolved.message, resolved.code);
  const normalized = normalizeMapData(resolved.map_data);
  const validation = validateMapData(normalized);
  if (!validation.ok) throw error(400, 'Validate map thất bại.', 'VALIDATE_FAILED', {
    details: validation.errors
  });
  await assertPersonalQuota(building, input.floorNumber, normalized);
  const key = normalizeIdempotencyKey(input.idempotencyKey);
  const replay = await jobs.findIdempotent(input.actor?.userId, key);
  if (replay) return { ...replay, was_idempotent_replay: true };
  try {
    return await runMapLifecycleCommand(async (session) => {
      const result = await jobs.createRequested({
        building_id: input.buildingId,
        floor_number: input.floorNumber,
        status: 'QUEUED',
        requested_by: input.actor?.userId,
        edit_session_id: input.editSessionId || '',
        lock_fencing_token: lock?.fencing_token ?? null,
        idempotency_key: key,
        map_data: normalized,
        queue_backend: 'outbox'
      }, { session });
      await audits.recordActivity({
        user_id: input.actor?.userId,
        action: 'PUBLISH_MAP_REQUESTED',
        target_type: 'floor',
        target_id: String(result.job._id),
        target: `Building ${input.buildingId} - Tầng ${input.floorNumber}`,
        details: { operation: 'publish_requested', idempotency_key: key },
        ip_address: input.ip || '',
        organization_id: building.organization_id || null
      }, { session });
      await outbox.append({
        type: EVENT_TYPES.PUBLISH_REQUESTED,
        event_key: `publish-requested:${result.job._id}`,
        aggregate_type: 'PublishJob',
        aggregate_id: result.job._id,
        organization_id: building.organization_id || null,
        actor_user_id: input.actor?.userId || null,
        payload: { publish_job_id: String(result.job._id) }
      }, { session });
      return { ...result.job, was_idempotent_replay: false };
    });
  } catch (failure) {
    if (failure?.code !== 11000 || !key) throw failure;
    const raced = await jobs.findIdempotent(input.actor?.userId, key);
    if (!raced) throw failure;
    return { ...raced, was_idempotent_replay: true };
  }
}

async function publishInUnitOfWork(input) {
  return runMapLifecycleCommand(async (session) => {
    if (input.job) {
      const lockStatus = await getStatus(input.job.building_id, input.job.floor_number);
      if (input.job.lock_fencing_token != null) {
        assertFence(lockStatus.lock, input.job.lock_fencing_token);
      }
    }
    const normalized = normalizeMapData(input.mapData);
    const result = await lifecycle.publishFloor({
      buildingId: input.buildingId,
      floorNumber: input.floorNumber,
      mapData: normalized,
      publishedAt: new Date(),
      userId: input.userId
    }, { session });
    const building = await lifecycle.markBuildingPublished(input.buildingId, { session });
    const version = await versions.append({
      building_id: input.buildingId,
      floor_number: input.floorNumber,
      version: result.floor.version,
      rooms_count: normalized.rooms.length,
      nodes_count: normalized.nodes.length,
      edges_count: normalized.edges.length,
      graph_snapshot: { nodes: normalized.nodes, edges: normalized.edges },
      map_snapshot: buildMapSnapshot(normalized),
      published_by: input.userId,
      published_at: new Date()
    }, { session });
    await qrCodes.syncFloorAnchors({
      buildingId: input.buildingId,
      floorNumber: input.floorNumber,
      mapData: normalized
    }, { session });
    await audits.recordActivity({
      user_id: input.userId,
      action: 'PUBLISH_MAP',
      target_type: 'floor',
      target_id: String(result.floor._id),
      target: `Building ${input.buildingId} - Tầng ${input.floorNumber}`,
      details: {
        operation: 'publish',
        before: summarizeMapForAudit(result.before?.map_data, result.before?.version || 0),
        after: summarizeMapForAudit(normalized, result.floor.version)
      },
      ip_address: input.ip || '',
      organization_id: building?.organization_id || null
    }, { session });
    if (input.job) {
      const completed = await jobs.complete(
        input.job._id,
        input.job.lease_owner,
        input.job.fencing_token,
        { version: result.floor.version, floorId: result.floor._id },
        { session }
      );
      if (!completed) throw error(409, 'Publish worker mất lease.', 'PUBLISH_LEASE_LOST');
    }
    await outbox.append({
      type: EVENT_TYPES.MAP_PUBLISHED,
      event_key: `map-published:${result.floor._id}:v${result.floor.version}`,
      aggregate_type: 'Floor',
      aggregate_id: result.floor._id,
      organization_id: building?.organization_id || null,
      actor_user_id: input.userId,
      payload: {
        building_id: String(input.buildingId),
        floor_id: String(result.floor._id),
        floor_number: input.floorNumber,
        version: result.floor.version,
        created: result.created
      }
    }, { session });
    await outbox.append({
      type: EVENT_TYPES.MAP_POST_COMMIT,
      event_key: `map-post-commit:${result.floor._id}:v${result.floor.version}`,
      aggregate_type: 'Floor',
      aggregate_id: result.floor._id,
      organization_id: building?.organization_id || null,
      actor_user_id: input.userId,
      payload: {
        building_id: String(input.buildingId),
        floor_number: input.floorNumber,
        version: version.version
      }
    }, { session });
    return { floor: result.floor, version: result.floor.version, created: result.created };
  });
}

async function processPublishJob(jobId, options = {}) {
  const owner = options.owner || `publish-worker:${process.pid}`;
  const leaseMs = Math.max(30_000, Number(process.env.PUBLISH_JOB_LEASE_MS) || 5 * 60_000);
  const job = await jobs.claim(jobId, owner, leaseMs);
  if (!job) return jobs.findById(jobId);
  const validation = validateMapData(job.map_data);
  if (!validation.ok) {
    return jobs.fail(job, error(400, 'Validate map thất bại.', 'VALIDATE_FAILED', {
      details: validation.errors
    }), false);
  }
  try {
    const actor = await lifecycle.findActor(job.requested_by);
    if (!actor || actor.is_active === false) throw error(403, 'Tài khoản không còn hoạt động.', 'USER_INACTIVE');
    await assertPublishAllowed({
      buildingId: job.building_id,
      floorNumber: job.floor_number,
      actor: { ...actor, userId: actor._id },
      editSessionId: job.edit_session_id
    });
    await publishInUnitOfWork({
      job,
      buildingId: job.building_id,
      floorNumber: job.floor_number,
      mapData: job.map_data,
      userId: job.requested_by
    });
    return jobs.findById(jobId);
  } catch (failure) {
    const retryable = options.throwOnFailure &&
      Number(job.attempts || 0) < Number(job.max_attempts || 5);
    await jobs.fail(job, failure, retryable);
    if (retryable) throw failure;
    return jobs.findById(jobId);
  }
}

async function retryPublish(input) {
  const existing = await jobs.findById(input.jobId);
  if (!existing) throw error(404, 'Không tìm thấy job.', 'JOB_NOT_FOUND');
  if (existing.status !== 'FAILED') {
    throw error(400, 'Chỉ retry được job FAILED.', 'JOB_NOT_RETRYABLE');
  }
  if (Number(existing.attempts || 0) >= Number(existing.max_attempts || 5)) {
    throw error(400, 'Đã vượt số lần thử tối đa.', 'JOB_MAX_ATTEMPTS');
  }
  if (input.mapData != null) {
    const validation = validateMapData(input.mapData);
    if (!validation.ok) {
      throw error(400, 'Validate map thất bại.', 'VALIDATE_FAILED', {
        details: validation.errors
      });
    }
  }
  return runMapLifecycleCommand(async (session) => {
    const updated = await jobs.prepareRetry(input.jobId, input.mapData, { session });
    await audits.recordActivity({
      user_id: input.actor?.userId,
      action: 'PUBLISH_MAP_REQUESTED',
      target_type: 'floor',
      target_id: String(updated._id),
      target: `Building ${updated.building_id} - Tầng ${updated.floor_number}`,
      details: { operation: 'publish_retry' },
      ip_address: input.ip || ''
    }, { session });
    await outbox.append({
      type: EVENT_TYPES.PUBLISH_REQUESTED,
      event_key: `publish-retry:${updated._id}:attempt-${Number(updated.attempts) + 1}`,
      aggregate_type: 'PublishJob',
      aggregate_id: updated._id,
      actor_user_id: input.actor?.userId,
      payload: { publish_job_id: String(updated._id) }
    }, { session });
    return updated;
  });
}

async function getPublishedFloor(buildingId, floorNumber) {
  return lifecycle.findPublishedFloor(buildingId, floorNumber);
}

async function syncPublishedFloorQr(floor) {
  return qrCodes.syncFloorAnchors({
    buildingId: floor.building_id,
    floorNumber: floor.floor_number,
    mapData: floor.map_data
  });
}

module.exports = {
  validatePublish,
  resolveMapData,
  requestPublish,
  publishInUnitOfWork,
  processPublishJob,
  retryPublish,
  getPublishedFloor,
  syncPublishedFloorQr,
  normalizeIdempotencyKey
};
