const drafts = require('../../repositories/draftRepository');
const lifecycle = require('../../repositories/mapLifecycleRepository');
const audits = require('../../repositories/activityLogRepository');
const outbox = require('../../repositories/outboxRepository');
const { assertFloorInRange } = require('../../services/floorLifecycle');
const { assertNoBase64Background } = require('../../services/objectStorage');
const { assertOrgCapability } = require('../../utils/orgBillingGates');
const { strictLifecycleFlag } = require('../../utils/mapLifecycleFlags');
const { assertLockOwner } = require('../../services/floorEditLock');
const EVENT_TYPES = require('../../shared/events/eventTypes');
const {
  autosaveFingerprint,
  draftEtag,
  parseExpectedRevision
} = require('../../domain/mapLifecyclePolicies');
const { runMapLifecycleCommand } = require('./runMapLifecycleCommand');

function error(status, message, code, extra = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

async function assertEditable(input) {
  const building = await lifecycle.findBuilding(input.buildingId);
  if (!building) throw error(404, 'Không tìm thấy tòa nhà!');
  assertFloorInRange(input.floorNumber, building.total_floors);
  if (building.organization_id && input.actor?.role !== 'SUPER_ADMIN') {
    const organization = await lifecycle.findOrganization(building.organization_id);
    const gate = assertOrgCapability(organization, 'canEdit');
    if (!gate.ok) throw error(403, gate.message, gate.code);
  }
  return building;
}

async function loadDraft(input) {
  await assertEditable(input);
  const current = await drafts.findActive(input.buildingId, input.floorNumber);
  if (current) return { ...current, source: 'drafts' };
  const legacy = await drafts.findLegacyFloorDraft(input.buildingId, input.floorNumber);
  if (!legacy?.draft_map_data) return null;
  return {
    payload: legacy.draft_map_data,
    version: 0,
    updatedAt: legacy.draft_updated_at,
    updated_by: legacy.draft_updated_by,
    source: 'floor_draft'
  };
}

async function saveDraft(input) {
  const bg = assertNoBase64Background(input.payload);
  if (!bg.ok) throw error(400, bg.message, bg.code);
  const building = await assertEditable(input);
  const expectedRevision = parseExpectedRevision(input.expectedRevision);
  if (Number.isNaN(expectedRevision)) {
    throw error(400, 'expected_version/If-Match không hợp lệ.', 'DRAFT_VERSION_INVALID');
  }
  if (strictLifecycleFlag('DRAFT_REQUIRE_EXPECTED_VERSION') && expectedRevision === null) {
    throw error(428, 'Thiếu If-Match hoặc expected_version.', 'DRAFT_VERSION_REQUIRED');
  }
  let lock = null;
  if (strictLifecycleFlag('DRAFT_REQUIRE_LOCK')) {
    lock = await assertLockOwner(
      input.buildingId,
      input.floorNumber,
      input.actor?.userId,
      input.editSessionId
    );
    if (!lock.ok) throw error(409, lock.message, lock.code, { holder: lock.holder });
  }

  const fingerprint = autosaveFingerprint(input.payload);
  const current = await drafts.findActive(input.buildingId, input.floorNumber);
  if (current?.payload_fingerprint === fingerprint) {
    return { ...current, autosave_replay: true };
  }

  return runMapLifecycleCommand(async (session) => {
    const saved = await drafts.saveRevision({
      buildingId: input.buildingId,
      floorNumber: input.floorNumber,
      payload: input.payload,
      fingerprint,
      expectedRevision,
      userId: input.actor?.userId || null
    }, { session });
    if (!saved) {
      const latest = await drafts.findActive(input.buildingId, input.floorNumber, { session });
      throw error(409, 'Bản nháp đã được cập nhật ở phiên khác.', 'DRAFT_CONFLICT', {
        current: latest && {
          version: latest.version,
          updatedAt: latest.updatedAt,
          updated_by: latest.updated_by
        }
      });
    }
    await drafts.mirrorLegacyDraft({
      buildingId: input.buildingId,
      floorNumber: input.floorNumber,
      payload: input.payload,
      updatedAt: saved.updatedAt,
      userId: input.actor?.userId || null
    }, { session });
    await audits.recordActivity({
      user_id: input.actor?.userId,
      action: 'SAVE_DRAFT',
      target_type: 'floor',
      target_id: String(saved._id),
      target: `Building ${input.buildingId} - Tầng ${input.floorNumber}`,
      details: { revision: saved.version, fingerprint },
      ip_address: input.ip || '',
      organization_id: building.organization_id || null
    }, { session });
    await outbox.append({
      type: EVENT_TYPES.DRAFT_SAVED,
      event_key: `draft-saved:${saved._id}:v${saved.version}`,
      aggregate_type: 'Draft',
      aggregate_id: saved._id,
      organization_id: building.organization_id || null,
      actor_user_id: input.actor?.userId || null,
      payload: {
        building_id: String(input.buildingId),
        floor_number: input.floorNumber,
        version: saved.version,
        fingerprint
      }
    }, { session });
    return saved;
  });
}

module.exports = { loadDraft, saveDraft, draftEtag };
