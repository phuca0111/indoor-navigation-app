const lifecycle = require('../../repositories/mapLifecycleRepository');
const versions = require('../../repositories/mapVersionRepository');
const audits = require('../../repositories/activityLogRepository');
const outbox = require('../../repositories/outboxRepository');
const qrCodes = require('../../repositories/qrRepository');
const { runMapLifecycleCommand } = require('./runMapLifecycleCommand');
const { buildMapSnapshot, summarizeMapForAudit } = require('../../utils/mapSnapshot');
const { assertOrgCapability } = require('../../utils/orgBillingGates');
const EVENT_TYPES = require('../../shared/events/eventTypes');

function error(status, message, code, extra = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

async function rollbackVersion(input) {
  const building = await lifecycle.findBuilding(input.buildingId);
  if (!building) throw error(404, 'Không tìm thấy tòa nhà!');
  if (building.organization_id && input.actor?.role !== 'SUPER_ADMIN') {
    const org = await lifecycle.findOrganization(building.organization_id);
    const gate = assertOrgCapability(org, 'canEdit');
    if (!gate.ok) throw error(403, gate.message, gate.code);
  }

  return runMapLifecycleCommand(async (session) => {
    const [snapshot, current] = await Promise.all([
      versions.findSnapshot(input.buildingId, input.floorNumber, input.targetVersion, { session }),
      lifecycle.findPublishedFloor(input.buildingId, input.floorNumber, { session })
    ]);
    if (!snapshot) throw error(404, 'Không tìm thấy phiên bản này!');
    if (!current) throw error(404, 'Chưa có bản đồ cho tầng này!');
    const graphNodes = snapshot.graph_snapshot?.nodes || [];
    const graphEdges = snapshot.graph_snapshot?.edges || [];
    const full = Boolean(snapshot.map_snapshot && Array.isArray(snapshot.map_snapshot.rooms));
    const graphOnly = graphNodes.length > 0 || graphEdges.length > 0;
    if (!full && !graphOnly) {
      throw error(400, `Không thể khôi phục phiên bản v${input.targetVersion}: không có snapshot.`, 'NO_RESTORABLE_SNAPSHOT', {
        reason: 'no_restorable_snapshot'
      });
    }
    const restored = full
      ? { ...snapshot.map_snapshot, background_image: current.map_data?.background_image || '' }
      : { ...current.map_data, nodes: graphNodes, edges: graphEdges };
    const floor = await lifecycle.replacePublishedFloor({
      buildingId: input.buildingId,
      floorNumber: input.floorNumber,
      expectedVersion: current.version,
      mapData: restored,
      publishedAt: new Date(),
      userId: input.actor?.userId
    }, { session });
    if (!floor) throw error(409, 'Bản đồ đã đổi trong lúc rollback.', 'MAP_VERSION_CONFLICT');
    await lifecycle.markBuildingPublished(input.buildingId, { session });
    await versions.append({
      building_id: input.buildingId,
      floor_number: input.floorNumber,
      version: floor.version,
      rooms_count: restored.rooms?.length || 0,
      nodes_count: restored.nodes?.length || 0,
      edges_count: restored.edges?.length || 0,
      graph_snapshot: { nodes: restored.nodes || [], edges: restored.edges || [] },
      map_snapshot: buildMapSnapshot(restored),
      published_by: input.actor?.userId,
      published_at: new Date()
    }, { session });
    await qrCodes.syncFloorAnchors({
      buildingId: input.buildingId,
      floorNumber: input.floorNumber,
      mapData: restored
    }, { session });
    await audits.recordActivity({
      user_id: input.actor?.userId,
      action: 'ROLLBACK_MAP',
      target_type: 'floor',
      target_id: String(floor._id),
      target: `Building ${input.buildingId} - Tầng ${input.floorNumber}`,
      details: {
        operation: 'rollback',
        rollback_from_version: input.targetVersion,
        rollback_mode: full ? 'full' : 'graph_only',
        new_version: floor.version,
        before: summarizeMapForAudit(current.map_data, current.version),
        after: summarizeMapForAudit(restored, floor.version)
      },
      ip_address: input.ip || '',
      organization_id: building.organization_id || null
    }, { session });
    await outbox.append({
      type: EVENT_TYPES.MAP_POST_COMMIT,
      event_key: `map-post-commit:${floor._id}:v${floor.version}`,
      aggregate_type: 'Floor',
      aggregate_id: floor._id,
      organization_id: building.organization_id || null,
      actor_user_id: input.actor?.userId,
      payload: {
        building_id: String(input.buildingId),
        floor_number: input.floorNumber,
        version: floor.version
      }
    }, { session });
    return { floor, rollbackMode: full ? 'full' : 'graph_only' };
  });
}

module.exports = { rollbackVersion };
